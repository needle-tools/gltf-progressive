import { Box3, BufferGeometry, Camera, Frustum, Material, Matrix4, Mesh, Object3D, PerspectiveCamera, Scene, Sphere, Texture, Vector3, WebGLRenderer } from "three";
import { NEEDLE_progressive, ProgressiveMaterialTextureLoadingResult } from "./extension.js";
import { createLoaders } from "./loaders.js"
import { getParam } from "./utils.js"
import { NEEDLE_progressive_plugin, plugins } from "./plugins/plugin.js";

const debugProgressiveLoading = getParam("debugprogressive");
const suppressProgressiveLoading = getParam("noprogressive");

const $lodsManager = Symbol("Needle:LODSManager");

export declare type LOD_Results = { mesh_lod: number, texture_lod: number };

const levels: LOD_Results = { mesh_lod: -1, texture_lod: -1 };

/**
 * The LODsManager class is responsible for managing the LODs and progressive assets in the scene. It will automatically update the LODs based on the camera position, screen coverage and mesh density of the objects.   
 * It must be enabled by calling the `enable` method.     
 * 
 * Instead of using the LODs manager directly you can also call `useNeedleProgressive` to enable progressive loading for a GLTFLoader   
 * 
 * ### Plugins
 * Use {@link LODsManager.addPlugin} to add a plugin to the LODsManager. A plugin can be used to hook into the LOD update process and modify the LOD levels or perform other actions.
 * 
 * @example Adding a LODsManager to a Three.js scene:
 * ```ts
 * import { LODsManager } from "@needle-tools/gltf-progressive";
 * import { WebGLRenderer, Scene, Camera, Mesh } from "three";
 * 
 * const renderer = new WebGLRenderer();
 * const lodsManager = LODsManager.get(renderer);
 * lodsManager.enable();
 * ```
 * 
 * @example Using the LODsManager with a GLTFLoader:
 * ```ts
 * import { useNeedleProgressive } from "@needle-tools/gltf-progressive";
 * import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
 * 
 * const url = 'https://yourdomain.com/yourmodel.glb';
 * const loader = new GLTFLoader();
 * const lodsManager = useNeedleProgressive(url, renderer, loader);
 * ```
 */
export class LODsManager {

    /** Assign a function to draw debug lines for the LODs. This function will be called with the start and end position of the line and the color of the line when the `debugprogressive` query parameter is set.
     */
    static debugDrawLine?: (a: Vector3, b: Vector3, color: number) => void;

    /** @internal */
    static getObjectLODState(object: Object3D): LOD_state | undefined {
        return object.userData?.LOD_state;
    }

    static addPlugin(plugin: NEEDLE_progressive_plugin) {
        plugins.push(plugin);
    }
    static removePlugin(plugin: NEEDLE_progressive_plugin) {
        const index = plugins.indexOf(plugin);
        if (index >= 0) plugins.splice(index, 1);
    }

    /**
     * Gets the LODsManager for the given renderer. If the LODsManager does not exist yet, it will be created.  
     * @param renderer The renderer to get the LODsManager for.
     * @returns The LODsManager instance.
     */
    static get(renderer: WebGLRenderer): LODsManager {
        if (renderer[$lodsManager]) {
            return renderer[$lodsManager] as LODsManager;
        }
        const lodsManager = new LODsManager(renderer);
        return lodsManager;
    }

    readonly renderer: WebGLRenderer;
    readonly projectionScreenMatrix = new Matrix4();
    readonly cameraFrustrum = new Frustum();

    /** @deprecated use static `LODsManager.addPlugin()` method. This getter will be removed in later versions */
    get plugins() { return plugins; }

    /**
     * The target triangle density is the desired max amount of triangles on screen when the mesh is filling the screen.  
     * @default 200_000
     */
    targetTriangleDensity: number = 200_000;

    /**
     * The update interval in frames. If set to 0, the LODs will be updated every frame. If set to 1, the LODs will be updated every second frame, etc.
     */
    updateInterval: number = 0;
    /**
     * If set to true, the LODsManager will not update the LODs.
     */
    pause: boolean = false;

    // readonly plugins: NEEDLE_progressive_plugin[] = [];

    private constructor(renderer: WebGLRenderer) {
        this.renderer = renderer;
    }

    private _frame: number = 0;
    private _originalRender?: (scene: Scene, camera: Camera) => void;

    /**
     * Enable the LODsManager. This will replace the render method of the renderer with a method that updates the LODs.
     */
    enable() {
        if (this._originalRender) return;
        let stack = 0;
        // Save the original render method
        this._originalRender = this.renderer.render;
        const self = this;
        createLoaders(this.renderer);
        this.renderer.render = function (scene: Scene, camera: Camera) {

            // check if this render call is rendering to a texture or the canvas
            // if it's rendering to a texture we don't want to update the LODs
            // This might need to be loosened later - e.g. we might want to update LODs for a render texture - but then we need to store the last LOD level differently and we also might not want to  perform all the plugin calls?
            const renderTarget = self.renderer.getRenderTarget();
            if (renderTarget == null) {
                stack = 0;
                self._frame += 1;
            }
            const frame = self._frame;
            const stack_level = stack++;
            self.onBeforeRender(scene, camera, stack_level, frame);
            self._originalRender!.call(this, scene, camera);
            self.onAfterRender(scene, camera, stack_level, frame);
        };
    }
    disable() {
        if (!this._originalRender) return;
        this.renderer.render = this._originalRender;
        this._originalRender = undefined;
    }


    private onBeforeRender(_scene: Scene, _camera: Camera, _stack: number, _frame: number) {
    }

    private onAfterRender(scene: Scene, camera: Camera, _stack: number, frame: number) {

        if (this.pause) return;

        const renderList = this.renderer.renderLists.get(scene, 0);
        const opaque = renderList.opaque;
        let updateLODs = true;

        // check if we're rendering a postprocessing pass
        if (opaque.length === 1) {
            const material = opaque[0].material;
            // pmndrs postprocessing
            if (material.name === "EffectMaterial") {
                updateLODs = false;
            }
            // builtin three postprocessing
            else if (material.name === "CopyShader") {
                updateLODs = false;
            }
        }

        if (updateLODs) {
            if (suppressProgressiveLoading) return;
            if (this.updateInterval > 0 && frame % this.updateInterval != 0) return;
            this.projectionScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.cameraFrustrum.setFromProjectionMatrix(this.projectionScreenMatrix, this.renderer.coordinateSystem);
            const desiredDensity = this.targetTriangleDensity;

            // const isLowPerformanceDevice = false;// isMobileDevice();

            // Experiment: quick & dirty performance-adaptive LODs
            /* 
            if (this.context.time.smoothedFps < 59) {
                currentAllowedDensity *= 0.5;
            }
            else if (this.context.time.smoothedFps >= 59) {
                currentAllowedDensity *= 1.25;
            }
            */
            for (const entry of opaque) {
                if (entry.material && (entry.geometry?.type === "BoxGeometry" || entry.geometry?.type === "BufferGeometry")) {
                    // Ignore the skybox
                    if (entry.material.name === "SphericalGaussianBlur" || entry.material.name == "BackgroundCubeMaterial" || entry.material.name === "CubemapFromEquirect" || entry.material.name === "EquirectangularToCubeUV") {
                        if (debugProgressiveLoading) {
                            if (!entry.material["NEEDLE_PROGRESSIVE:IGNORE-WARNING"]) {
                                entry.material["NEEDLE_PROGRESSIVE:IGNORE-WARNING"] = true;
                                console.warn("Ignoring skybox or BLIT object", entry, entry.material.name, entry.material.type);
                            }
                        }
                        continue;
                    }
                }

                switch (entry.material.type) {
                    case "LineBasicMaterial":
                    case "LineDashedMaterial":
                    case "PointsMaterial":
                    case "ShadowMaterial":
                    case "MeshDistanceMaterial":
                    case "MeshDepthMaterial":
                        continue;
                }

                const object = entry.object as any;
                if (object instanceof Mesh || (object.isMesh)) {
                    this.updateLODs(scene, camera, object, desiredDensity);
                }
            }
            const transparent = renderList.transparent;
            for (const entry of transparent) {
                const object = entry.object as any;
                if (object instanceof Mesh || (object.isMesh)) {
                    this.updateLODs(scene, camera, object, desiredDensity);
                }
            }
        }
    }

    /** Update the LOD levels for the renderer. */
    private updateLODs(scene: Scene, camera: Camera, object: Mesh, desiredDensity: number) {


        for (const plugin of plugins) {
            plugin.onBeforeUpdateLOD?.(this.renderer, scene, camera, object);
        }

        let state = object.userData.LOD_state as LOD_state;
        if (!state) {
            state = new LOD_state();
            object.userData.LOD_state = state;
        }

        this.calculateLodLevel(camera, object, state, desiredDensity, levels);
        levels.mesh_lod = Math.round(levels.mesh_lod);
        levels.texture_lod = Math.round(levels.texture_lod);


        // we currently only support auto LOD changes for meshes
        if (levels.mesh_lod >= 0) {
            this.loadProgressiveMeshes(object, levels.mesh_lod);
        }

        // TODO: we currently can not switch texture lods because we need better caching for the textures internally (see copySettings in progressive + NE-4431)
        let textureLOD = levels.texture_lod;

        if (object.material && textureLOD >= 0) {
            const debugLevel = object["DEBUG:LOD"];
            if (debugLevel != undefined) textureLOD = debugLevel;

            if (Array.isArray(object.material)) {
                for (const mat of object.material) {
                    this.loadProgressiveTextures(mat, textureLOD);
                }
            }
            else {
                this.loadProgressiveTextures(object.material, textureLOD);
            }
        }

        for (const plugin of plugins) {
            plugin.onAfterUpdatedLOD?.(this.renderer, scene, camera, object, levels)
        }

        state.lastLodLevel_Mesh = levels.mesh_lod;
        state.lasLodLevel_Texture = levels.texture_lod;
    }


    /** Load progressive textures for the given material
     * @param material the material to load the textures for
     * @param level the LOD level to load. Level 0 is the best quality, higher levels are lower quality
     * @returns Promise with true if the LOD was loaded, false if not
     */
    private loadProgressiveTextures(material: Material, level: number): Promise<ProgressiveMaterialTextureLoadingResult[] | Texture | null> {
        if (!material) return Promise.resolve(null);
        if (material.userData && (material.userData.LOD == undefined || material.userData.LOD > level)) {
            material.userData.LOD = level;
            return NEEDLE_progressive.assignTextureLOD(material, level);
        }
        return Promise.resolve(null);
    }

    /** Load progressive meshes for the given mesh
     * @param mesh the mesh to load the LOD for
     * @param index the index of the mesh if it's part of a group
     * @param level the LOD level to load. Level 0 is the best quality, higher levels are lower quality
     * @returns Promise with true if the LOD was loaded, false if not
     */
    private loadProgressiveMeshes(mesh: Mesh, level: number): Promise<BufferGeometry | null> {
        if (!mesh) return Promise.resolve(null);
        if (!mesh.userData) mesh.userData = {};
        if (mesh.userData.LOD !== level) {
            mesh.userData.LOD = level;
            const originalGeometry = mesh.geometry;
            return NEEDLE_progressive.assignMeshLOD(mesh, level).then(res => {
                if (res && mesh.userData.LOD == level && originalGeometry != mesh.geometry) {
                    // update the lightmap
                    // this.applyLightmapping();

                    // if (this.handles) {
                    //     for (const inst of this.handles) {
                    //         // if (inst["LOD"] < level) continue;
                    //         // inst["LOD"] = level;
                    //         inst.setGeometry(mesh.geometry);
                    //     }
                    // }
                }
                return res;
            })
        }
        return Promise.resolve(null);
    }

    // private testIfLODLevelsAreAvailable() {

    private readonly _sphere = new Sphere();
    private readonly _tempBox = new Box3();
    private readonly _tempBox2 = new Box3();
    private readonly tempMatrix = new Matrix4();
    private readonly _tempWorldPosition = new Vector3();
    private readonly _tempBoxSize = new Vector3();
    private readonly _tempBox2Size = new Vector3();

    private static corner0 = new Vector3();
    private static corner1 = new Vector3();
    private static corner2 = new Vector3();
    private static corner3 = new Vector3();

    private static readonly _tempPtInside = new Vector3();
    private static isInside(box: Box3, matrix: Matrix4) {
        const min = box.min;
        const max = box.max;
        const centerx = (min.x + max.x) * 0.5;
        const centery = (min.y + max.y) * 0.5;
        const pt1 = this._tempPtInside.set(centerx, centery, min.z).applyMatrix4(matrix);
        return pt1.z < 0;
    }

    private calculateLodLevel(camera: Camera, mesh: Mesh, state: LOD_state, desiredDensity: number, result: LOD_Results): void {
        if (!mesh) {
            result.mesh_lod = -1;
            result.texture_lod = -1;
            return;
        }

        // if this is using instancing we always load level 0
        // if (this.isInstancingActive) return 0;

        /** rough measure of "triangles on quadratic screen" – we're switching LODs based on this metric. */
        /** highest LOD level we'd ever expect to be generated */
        const maxLevel = 10;
        let mesh_level = maxLevel + 1;

        if (camera) {
            if (debugProgressiveLoading && mesh["DEBUG:LOD"] != undefined) {
                return mesh["DEBUG:LOD"];
            }

            // The mesh info contains also the density for all available LOD level so we can use this for selecting which level to show
            const mesh_lods_info = NEEDLE_progressive.getMeshLODInformation(mesh.geometry);
            const mesh_lods = mesh_lods_info?.lods;

            // We can skip all this if we dont have any LOD information - we can ask the progressive extension for that
            // But if the MESH has no LODs we might still have materials that do - we would need to check that
            // Until we properly check if an object has *any* LODs we do return the best quality for now
            if (!mesh_lods || mesh_lods.length <= 0) {
                result.mesh_lod = 0;
                result.texture_lod = 0;
                return;
            }

            if (!this.cameraFrustrum?.intersectsObject(mesh)) {
                // console.log("Mesh not visible");
                // if (debugProgressiveLoading && mesh.geometry.boundingSphere) {
                //     const bounds = mesh.geometry.boundingSphere;
                //     this._sphere.copy(bounds);
                //     this._sphere.applyMatrix4(mesh.matrixWorld);
                //     Gizmos.DrawWireSphere(this._sphere.center, this._sphere.radius * 1.01, 0xff5555, .5);
                // }
                // the object is not visible by the camera
                result.mesh_lod = 99;
                result.texture_lod = 99;
                return;
            }

            const boundingBox = mesh.geometry.boundingBox;
            if (boundingBox && (camera as PerspectiveCamera).isPerspectiveCamera) {
                const cam = camera as PerspectiveCamera;

                // hack: if the mesh has vertex colors, has less than 100 vertices we always select the highest LOD
                if (mesh.geometry.attributes.color && mesh.geometry.attributes.color.count < 100) {
                    if (mesh.geometry.boundingSphere) {
                        this._sphere.copy(mesh.geometry.boundingSphere);
                        this._sphere.applyMatrix4(mesh.matrixWorld);
                        const worldPosition = camera.getWorldPosition(this._tempWorldPosition)
                        if (this._sphere.containsPoint(worldPosition)) {
                            result.mesh_lod = 0;
                            result.texture_lod = 0;
                            return;
                        }
                    }
                }

                // calculate size on screen
                this._tempBox.copy(boundingBox);
                this._tempBox.applyMatrix4(mesh.matrixWorld);

                // Converting into projection space has the disadvantage that objects further to the side
                // will have a much larger coverage, especially with high-field-of-view situations like in VR.
                // Alternatively, we could attempt to calculate angular coverage (some kind of polar coordinates maybe?)
                // or introduce a correction factor based on "expected distortion" of the object.
                // High distortions would lead to lower LOD levels.
                // "Centrality" of the calculated screen-space bounding box could be a factor here –
                // what's the distance of the bounding box to the center of the screen?
                if (LODsManager.isInside(this._tempBox, this.projectionScreenMatrix)) {
                    result.mesh_lod = 0;
                    result.texture_lod = 0;
                    return;
                }
                this._tempBox.applyMatrix4(this.projectionScreenMatrix);

                // TODO might need to be adjusted for cameras that are rendered during an XR session but are 
                // actually not XR cameras (e.g. a render texture)
                if (this.renderer.xr.enabled && cam.fov > 70) {
                    // calculate centrality of the bounding box - how close is it to the screen center
                    const min = this._tempBox.min;
                    const max = this._tempBox.max;

                    let minX = min.x;
                    let minY = min.y;
                    let maxX = max.x;
                    let maxY = max.y;

                    // enlarge
                    const enlargementFactor = 2.0;
                    const centerBoost = 1.5;
                    const centerX = (min.x + max.x) * 0.5;
                    const centerY = (min.y + max.y) * 0.5;
                    minX = (minX - centerX) * enlargementFactor + centerX;
                    minY = (minY - centerY) * enlargementFactor + centerY;
                    maxX = (maxX - centerX) * enlargementFactor + centerX;
                    maxY = (maxY - centerY) * enlargementFactor + centerY;

                    const xCentrality = minX < 0 && maxX > 0 ? 0 : Math.min(Math.abs(min.x), Math.abs(max.x));
                    const yCentrality = minY < 0 && maxY > 0 ? 0 : Math.min(Math.abs(min.y), Math.abs(max.y));
                    const centrality = Math.max(xCentrality, yCentrality);

                    // heuristically determined to lower quality for objects at the edges of vision
                    state.lastCentrality = (centerBoost - centrality) * (centerBoost - centrality) * (centerBoost - centrality);
                }
                else {
                    state.lastCentrality = 1;
                }

                const boxSize = this._tempBox.getSize(this._tempBoxSize);
                boxSize.multiplyScalar(0.5); // goes from -1..1, we want -0.5..0.5 for coverage in percent
                if (screen.availHeight > 0)
                    boxSize.multiplyScalar(this.renderer.domElement.clientHeight / screen.availHeight); // correct for size of context on screen
                boxSize.x *= cam.aspect;

                const matView = camera.matrixWorldInverse;
                const box2 = this._tempBox2;
                box2.copy(boundingBox);
                box2.applyMatrix4(mesh.matrixWorld);
                box2.applyMatrix4(matView);
                const boxSize2 = box2.getSize(this._tempBox2Size);

                // approximate depth coverage in relation to screenspace size
                const max2 = Math.max(boxSize2.x, boxSize2.y);
                const max1 = Math.max(boxSize.x, boxSize.y);
                if (max1 != 0 && max2 != 0)
                    boxSize.z = boxSize2.z / Math.max(boxSize2.x, boxSize2.y) * Math.max(boxSize.x, boxSize.y);

                state.lastScreenCoverage = Math.max(boxSize.x, boxSize.y, boxSize.z);
                state.lastScreenspaceVolume.copy(boxSize);
                state.lastScreenCoverage *= state.lastCentrality;

                // draw screen size box
                if (debugProgressiveLoading && LODsManager.debugDrawLine) {
                    const mat = this.tempMatrix.copy(this.projectionScreenMatrix);
                    mat.invert();

                    const corner0 = LODsManager.corner0;
                    const corner1 = LODsManager.corner1;
                    const corner2 = LODsManager.corner2;
                    const corner3 = LODsManager.corner3;

                    // get box corners, transform with camera space, and draw as quad lines
                    corner0.copy(this._tempBox.min);
                    corner1.copy(this._tempBox.max);
                    corner1.x = corner0.x;
                    corner2.copy(this._tempBox.max);
                    corner2.y = corner0.y;
                    corner3.copy(this._tempBox.max);
                    // draw outlines at the center of the box
                    const z = (corner0.z + corner3.z) * 0.5;
                    // all outlines should have the same depth in screen space
                    corner0.z = corner1.z = corner2.z = corner3.z = z;

                    corner0.applyMatrix4(mat);
                    corner1.applyMatrix4(mat);
                    corner2.applyMatrix4(mat);
                    corner3.applyMatrix4(mat);

                    LODsManager.debugDrawLine(corner0, corner1, 0x0000ff);
                    LODsManager.debugDrawLine(corner0, corner2, 0x0000ff);
                    LODsManager.debugDrawLine(corner1, corner3, 0x0000ff);
                    LODsManager.debugDrawLine(corner2, corner3, 0x0000ff);
                }

                let expectedLevel = 999;
                // const framerate = this.context.time.smoothedFps;
                if (mesh_lods && state.lastScreenCoverage > 0) {
                    for (let l = 0; l < mesh_lods.length; l++) {
                        const densityForThisLevel = mesh_lods[l].density;
                        const resultingDensity = densityForThisLevel / state.lastScreenCoverage;
                        if (resultingDensity < desiredDensity) {
                            expectedLevel = l;
                            break;
                        }
                    }
                }

                const isLowerLod = expectedLevel < mesh_level;
                if (isLowerLod) {
                    mesh_level = expectedLevel;
                }
            }
        }


        // if (this._lastLodLevel != level) {
        //     this._nextLodTestTime = this.context.time.realtimeSinceStartup + .5;
        //     if (debugProgressiveLoading) {
        //         if (debugProgressiveLoading == "verbose") console.warn(`LOD Level changed from ${this._lastLodLevel} to ${level} for ${this.name}`);
        //         this.drawGizmoLodLevel(true);
        //     }
        // }

        result.mesh_lod = mesh_level;

        const maxTextureLOD = 4;
        result.texture_lod = lerp(maxTextureLOD, 0, state.lastScreenCoverage * 2);
    }
}


function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}



class LOD_state {
    lastLodLevel_Mesh: number = 0;
    lasLodLevel_Texture: number = 0;
    lastScreenCoverage: number = 0;
    readonly lastScreenspaceVolume: Vector3 = new Vector3();
    lastCentrality: number = 0;
}