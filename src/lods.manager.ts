import * as THREE from "three";
import { Box3, BufferGeometry, Camera, Color, Material, Matrix4, Mesh, Object3D, PerspectiveCamera, Scene, SkinnedMesh, Sphere, Texture, Vector3, WebGLRenderer } from "three";
import { NEEDLE_progressive } from "./extension.js";
import { createLoaders } from "./loaders.js"
import { getParam, isDevelopmentServer, isMobileDevice } from "./utils.internal.js"
import { NEEDLE_progressive_plugin, plugins } from "./plugins/plugin.js";
import { getRaycastMesh } from "./utils.js";
import { applyDebugSettings, debug, debug_OverrideLodLevel } from "./lods.debug.js";
import { PromiseGroup, PromiseGroupOptions } from "./lods.promise.js";

const debugProgressiveLoading = getParam("debugprogressive");
const debugProgressiveLODColors = debugProgressiveLoading === "colors";
const suppressProgressiveLoading = getParam("noprogressive");

const $lodsManager = Symbol("Needle:LODSManager");
const $lodstate = Symbol("Needle:LODState");
const $currentLOD = Symbol("Needle:CurrentLOD");

export type LODManagerContext = {
    engine: "three" | "needle-engine" | "model-viewer" | "react-three-fiber" | "unknown";
}

export declare type LOD_Results = { mesh_lod: number, texture_lod: number };

type RenderListLike = {
    opaque?: Array<any>;
    transparent?: Array<any>;
    transmissive?: Array<any>;
    transparentDoublePass?: Array<any>;
};

type LODTimer = {
    update?: () => void;
    getDelta: () => number;
};

const ThreeRuntime = THREE as typeof THREE & {
    Timer?: new () => LODTimer;
    Clock: new () => LODTimer;
};

const levels: LOD_Results = { mesh_lod: -1, texture_lod: -1 };
const debugLODColor = new Color();
export const lodDebugColors = [
    0x35d05f,
    0xa8d83a,
    0xf3d13b,
    0xf29332,
    0xf0523b,
    0xa856f0,
    0x49a7f2,
    0x32d7c4,
    0xff6b9d,
    0x6f7df7,
    0xd66fd2,
    0x35a853,
    0xb7a51f,
    0xe05d2f,
    0x3c78d8,
    0x00a6a6,
    0xd7263d,
    0x7f52ff,
    0x46b450,
    0xf7a531,
    0x2f9be0,
    0xb84592,
    0x8a9a2a,
    0x1f6f8b,
    0xf05a9d,
    0x9b5de5,
    0x00bbf9,
    0x00f5d4,
    0xfee440,
    0xf15bb5,
    0x4d908e,
    0x555555,
];

function createLODTimer(): LODTimer {
    const Timer = ThreeRuntime.Timer || ThreeRuntime.Clock;
    return new Timer();
}

export type MeshLODSelectionOptions = {
    geometry: BufferGeometry;
    matrixWorld: Matrix4;
    camera: Camera;
    projectionScreenMatrix: Matrix4;
    desiredDensity: number;
    canvasHeight?: number;
    currentLevel?: number;
    boundingBox?: Box3 | null;
    xrEnabled?: boolean;
    debugDrawLine?: (a: Vector3, b: Vector3, color: number) => void;
    warnMissingPrimitiveDensities?: boolean;
    target?: MeshLODSelectionResult;
};

export type MeshLODSelectionResult = {
    level: number;
    primitiveIndex: number;
    screenCoverage: number;
    screenspaceVolume: Vector3;
    centrality: number;
};

const _meshLODWorldBox = new Box3();
const _meshLODProjectedBox = new Box3();
const _meshLODCameraSpaceBox = new Box3();
const _meshLODBoxSize = new Vector3();
const _meshLODCameraSpaceBoxSize = new Vector3();
const _meshLODProjectionInverse = new Matrix4();
const _meshLODCorner0 = new Vector3();
const _meshLODCorner1 = new Vector3();
const _meshLODCorner2 = new Vector3();
const _meshLODCorner3 = new Vector3();

function isInsideProjectedBox(box: Box3, projectionScreenMatrix: Matrix4) {
    const min = box.min;
    const max = box.max;
    const centerx = (min.x + max.x) * 0.5;
    const centery = (min.y + max.y) * 0.5;
    const point = _meshLODCorner0.set(centerx, centery, min.z).applyMatrix4(projectionScreenMatrix);
    return point.z < 0;
}

export function calculateMeshLODLevel(options: MeshLODSelectionOptions): MeshLODSelectionResult {
    const {
        geometry,
        matrixWorld,
        camera,
        projectionScreenMatrix,
        desiredDensity,
        canvasHeight = 0,
        currentLevel = -1,
        xrEnabled = false,
        debugDrawLine,
        warnMissingPrimitiveDensities = false,
    } = options;

    const meshLods = NEEDLE_progressive.getMeshLODExtension(geometry)?.lods;
    const primitiveIndex = NEEDLE_progressive.getPrimitiveIndex(geometry);
    const result: MeshLODSelectionResult = options.target ?? {
        level: currentLevel,
        primitiveIndex,
        screenCoverage: 0,
        screenspaceVolume: new Vector3(),
        centrality: 1,
    };
    result.level = currentLevel;
    result.primitiveIndex = primitiveIndex;
    result.screenCoverage = 0;
    result.screenspaceVolume.set(0, 0, 0);
    result.centrality = 1;
    // Note: we intentionally do NOT early-return when there are no mesh LODs.
    // The screen coverage / screenspace volume computed below is also consumed by
    // the texture LOD selection, which must keep working for meshes that only have
    // texture LODs (no mesh LODs). Only the mesh LOD-level selection loop is skipped.

    let boundingBox = options.boundingBox ?? geometry.boundingBox;
    if (!boundingBox) {
        geometry.computeBoundingBox();
        boundingBox = geometry.boundingBox;
    }
    if (!boundingBox) return result;

    _meshLODWorldBox.copy(boundingBox).applyMatrix4(matrixWorld);
    if ((camera as PerspectiveCamera).isPerspectiveCamera && isInsideProjectedBox(_meshLODWorldBox, projectionScreenMatrix)) {
        result.level = 0;
        result.screenCoverage = Infinity;
        result.screenspaceVolume.set(Infinity, Infinity, Infinity);
        return result;
    }

    _meshLODProjectedBox.copy(_meshLODWorldBox).applyMatrix4(projectionScreenMatrix);

    if (xrEnabled && (camera as PerspectiveCamera).isPerspectiveCamera && (camera as PerspectiveCamera).fov > 70) {
        const min = _meshLODProjectedBox.min;
        const max = _meshLODProjectedBox.max;

        let minX = min.x;
        let minY = min.y;
        let maxX = max.x;
        let maxY = max.y;

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
        result.centrality = (centerBoost - centrality) * (centerBoost - centrality) * (centerBoost - centrality);
    }

    const boxSize = _meshLODProjectedBox.getSize(_meshLODBoxSize);
    boxSize.multiplyScalar(0.5);
    if (globalThis.screen?.availHeight > 0 && canvasHeight > 0) {
        boxSize.multiplyScalar(canvasHeight / globalThis.screen.availHeight);
    }
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
        boxSize.x *= (camera as PerspectiveCamera).aspect;
    }

    _meshLODCameraSpaceBox.copy(boundingBox).applyMatrix4(matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const cameraSpaceSize = _meshLODCameraSpaceBox.getSize(_meshLODCameraSpaceBoxSize);
    const screenMax = Math.max(boxSize.x, boxSize.y);
    const cameraSpaceMax = Math.max(cameraSpaceSize.x, cameraSpaceSize.y);
    if (screenMax !== 0 && cameraSpaceMax !== 0) {
        boxSize.z = cameraSpaceSize.z / cameraSpaceMax * screenMax;
    }

    const screenCoverage = Math.max(boxSize.x, boxSize.y, boxSize.z) * result.centrality;
    result.screenCoverage = screenCoverage;
    result.screenspaceVolume.copy(boxSize);
    if (screenCoverage <= 0) return result;

    if (debugDrawLine) {
        const mat = _meshLODProjectionInverse.copy(projectionScreenMatrix);
        mat.invert();

        _meshLODCorner0.copy(_meshLODProjectedBox.min);
        _meshLODCorner1.copy(_meshLODProjectedBox.max);
        _meshLODCorner1.x = _meshLODCorner0.x;
        _meshLODCorner2.copy(_meshLODProjectedBox.max);
        _meshLODCorner2.y = _meshLODCorner0.y;
        _meshLODCorner3.copy(_meshLODProjectedBox.max);
        const z = (_meshLODCorner0.z + _meshLODCorner3.z) * 0.5;
        _meshLODCorner0.z = _meshLODCorner1.z = _meshLODCorner2.z = _meshLODCorner3.z = z;

        _meshLODCorner0.applyMatrix4(mat);
        _meshLODCorner1.applyMatrix4(mat);
        _meshLODCorner2.applyMatrix4(mat);
        _meshLODCorner3.applyMatrix4(mat);

        debugDrawLine(_meshLODCorner0, _meshLODCorner1, 0x0000ff);
        debugDrawLine(_meshLODCorner0, _meshLODCorner2, 0x0000ff);
        debugDrawLine(_meshLODCorner1, _meshLODCorner3, 0x0000ff);
        debugDrawLine(_meshLODCorner2, _meshLODCorner3, 0x0000ff);
    }

    if (meshLods?.length) {
        for (let i = 0; i < meshLods.length; i++) {
            const lod = meshLods[i];
            const density = lod.densities?.[primitiveIndex] || lod.density || .00001;

            if (primitiveIndex > 0 && warnMissingPrimitiveDensities && isDevelopmentServer() && !lod.densities && !globalThis["NEEDLE:MISSING_LOD_PRIMITIVE_DENSITIES"]) {
                globalThis["NEEDLE:MISSING_LOD_PRIMITIVE_DENSITIES"] = true;
                console.warn(`[Needle Progressive] Detected usage of mesh without primitive densities. This might cause incorrect LOD level selection: Consider re-optimizing your model by updating your Needle Integration, Needle glTF Pipeline or running optimization again on Needle Cloud.`);
            }

            if (density / screenCoverage < desiredDensity) {
                result.level = i;
                break;
            }
        }
    }

    return result;
}


declare type LODChangedEventListener = (args: {
    type: "mesh" | "texture";
    level: number;
    object: Object3D | Material | Texture;
}) => void;

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

    /** 
     * Assign a function to draw debug lines for the LODs. This function will be called with the start and end position of the line and the color of the line when the `debugprogressive` query parameter is set.
     */
    static debugDrawLine?: (a: Vector3, b: Vector3, color: number) => void;


    /** @internal */
    static getObjectLODState(object: Object3D): LOD_state | undefined {
        return object[$lodstate] as LOD_state | undefined;
    }

    static addPlugin(plugin: NEEDLE_progressive_plugin) {
        plugins.push(plugin);
    }
    static removePlugin(plugin: NEEDLE_progressive_plugin) {
        const index = plugins.indexOf(plugin);
        if (index >= 0) plugins.splice(index, 1);
    }
    /** Read-only snapshot of the currently registered plugins, for inspection. Use {@link addPlugin} / {@link removePlugin} to modify the registry. */
    static getPlugins(): readonly NEEDLE_progressive_plugin[] {
        return plugins;
    }

    /**
     * Gets the LODsManager for the given renderer. If the LODsManager does not exist yet, it will be created.  
     * @param renderer The renderer to get the LODsManager for.
     * @returns The LODsManager instance.
     */
    static get(renderer: WebGLRenderer, context?: LODManagerContext): LODsManager {
        if (renderer[$lodsManager]) {
            console.debug("[gltf-progressive] LODsManager already exists for this renderer");
            return renderer[$lodsManager] as LODsManager;
        }
        const lodsManager = new LODsManager(renderer, {
            engine: "unknown",
            ...context,
        });
        renderer[$lodsManager] = lodsManager;
        return lodsManager;
    }


    readonly renderer: WebGLRenderer;
    private readonly context: LODManagerContext;
    private readonly projectionScreenMatrix = new Matrix4();

    /** @deprecated use static `LODsManager.addPlugin()` method. This getter will be removed in later versions */
    get plugins() { return plugins; }

    /**
     * Force override the LOD level for all objects (meshes + textures) rendered in the scene
     * @default undefined automatically calculate LOD level
     */
    overrideLodLevel: undefined | number = undefined;

    /**
     * The target triangle density is the desired max amount of triangles on screen when the mesh is filling the screen.  
     * @default 200_000
     */
    targetTriangleDensity: number = 200_000;

    /**
     * The interval in frames to automatically update the bounds of skinned meshes.   
     * Set to 0 or a negative value to disable automatic bounds updates. 
     * @default 30
     */
    skinnedMeshAutoUpdateBoundsInterval = 30;

    /**
     * The update interval in frames. If set to 0, the LODs will be updated every frame. If set to 2, the LODs will be updated every second frame, etc.
     * @default "auto"
     */
    updateInterval: "auto" | number = "auto";
    #updateInterval: number = 1;

    /**
     * If set to true, the LODsManager will not update the LODs.
     * @default false
     */
    pause: boolean = false;

    /**
     * When set to true the LODsManager will not update the LODs. This can be used to manually update the LODs using the `update` method.  
     * Otherwise the LODs will be updated automatically when the renderer renders the scene.
     * @default false
     */
    manual: boolean = false;

    private readonly _newPromiseGroups: PromiseGroup[] = [];
    private _promiseGroupIds: number = 0;

    /**
     * Returns a promise that resolves once all LOD requests initiated during the next render cycles have finished loading.
     * This is useful for hiding low-resolution placeholders (e.g. with a loading overlay or CSS blur) until high-quality assets are ready.
     *
     * By default, the returned promise captures LOD loading requests for 2 frames and resolves when all of them complete.
     * Use `waitForFirstCapture` if no LOD requests may happen immediately (e.g. after a scene switch).
     *
     * @param opts - Optional configuration for how long to capture and what to wait for. See {@link PromiseGroupOptions}.
     * @returns A promise that resolves with `{ cancelled, awaited_count, resolved_count }` once all captured LOD loads complete (or the signal aborts).
     *
     * @example
     * ```ts
     * // Wait for initial LODs to finish loading, then remove a blur overlay
     * const result = await lodsManager.awaitLoading({
     *     frames: 5,
     *     signal: AbortSignal.timeout(10_000),
     * });
     * console.log(`Loaded ${result.resolved_count} of ${result.awaited_count} LODs`);
     * document.querySelector('.blur-overlay')?.remove();
     * ```
     *
     * @example
     * ```ts
     * // Wait until at least one LOD starts loading before resolving
     * await lodsManager.awaitLoading({ waitForFirstCapture: true });
     * ```
     */
    awaitLoading(opts?: PromiseGroupOptions) {
        const id = this._promiseGroupIds++;
        const newGroup = new PromiseGroup(this.#frame, { ...opts, });
        this._newPromiseGroups.push(newGroup);
        const start = performance.now();
        newGroup.ready.finally(() => {
            const index = this._newPromiseGroups.indexOf(newGroup);
            if (index >= 0) {
                this._newPromiseGroups.splice(index, 1);

                if (isDevelopmentServer()) performance.measure("LODsManager:awaitLoading", {
                    start,
                    detail: { id, name: opts?.name, awaited: newGroup.awaitedCount, resolved: newGroup.resolvedCount }
                });
            }

        });
        return newGroup.ready;
    }

    /** Track LOD work started outside this manager so {@link awaitLoading} waits for it too. */
    trackLoadingPromise<T>(type: "mesh" | "texture", object: object, promise: Promise<T>) {
        PromiseGroup.addPromise(type, object, promise, this._newPromiseGroups);
        return promise;
    }

    private _postprocessPromiseGroups() {
        if (this._newPromiseGroups.length === 0) return;
        for (let i = this._newPromiseGroups.length - 1; i >= 0; i--) {
            const group = this._newPromiseGroups[i];
            group.update(this.#frame);
        }
    }


    private readonly _lodchangedlisteners: LODChangedEventListener[] = [];
    /**
     * Register a listener that is called whenever a mesh or texture LOD level has finished loading and has been applied.
     * The listener receives the type of asset (`"mesh"` or `"texture"`), the new LOD level, and the affected object.
     *
     * @param evt - The event type. Currently only `"changed"` is supported.
     * @param listener - Callback invoked after a LOD swap completes.
     * @return A function to unregister the listener.
     *
     * @example
     * ```ts
     * lodsManager.addEventListener("changed", ({ type, level, object }) => {
     *     console.log(`${type} LOD changed to level ${level}`, object);
     * });
     * ```
     */
    addEventListener(evt: "changed", listener: LODChangedEventListener) {
        if (evt === "changed") {
            this._lodchangedlisteners.push(listener);
            return () => {
                this.removeEventListener(evt, listener);
            }
        }
        return () => {};
    }
    /**
     * Remove a previously registered `"changed"` event listener.
     * @param evt - The event type (`"changed"`).
     * @param listener - The listener to remove.
     * @return `true` if the listener was found and removed, `false` otherwise.
     */
    removeEventListener(evt: "changed", listener: LODChangedEventListener) {
        let removed = false;
        if (evt === "changed") {
            const index = this._lodchangedlisteners.indexOf(listener);
            if (index >= 0) {
                this._lodchangedlisteners.splice(index, 1);
                removed = true;
            }
        }
        return removed;
    }

    // readonly plugins: NEEDLE_progressive_plugin[] = [];

    private constructor(renderer: WebGLRenderer, context: LODManagerContext) {
        this.renderer = renderer;
        this.context = { ...context };

        // createGLTFLoaderWorker().then(res => {
        //     res.load("https://cloud.needle.tools/-/assets/Z23hmXBZ20RjNk-Z20RjNk-optimized/file").then(res2 => {
        //         console.log("DONE", res2);
        //     })
        //     res.load("https://cloud.needle.tools/-/assets/Z23hmXBZ20RjNk-Z20RjNk-world/file").then(res2 => {
        //         console.log("DONE2", res2);
        //     })
        // })
    }


    #originalRender?: (scene: Scene, camera: Camera) => void;

    #frame: number = 0;
    #delta: number = 0;
    #time: number = 0;
    #fps: number = 0;
    readonly #clock: LODTimer = createLODTimer();
    private _fpsBuffer: number[] = [60, 60, 60, 60, 60];

    /**
     * Enable the LODsManager. This will replace the render method of the renderer with a method that updates the LODs.
     */
    enable() {
        if (this.#originalRender) return;
        console.debug("[gltf-progressive] Enabling LODsManager for renderer");
        let stack = 0;
        // Save the original render method
        this.#originalRender = this.renderer.render;
        const self = this;
        createLoaders(this.renderer);
        this.renderer.render = function (scene: Scene, camera: Camera) {
            // check if this render call is rendering to a texture or the canvas
            // if it's rendering to a texture we don't want to update the LODs
            // This might need to be loosened later - e.g. we might want to update LODs for a render texture - but then we need to store the last LOD level differently and we also might not want to  perform all the plugin calls?
            const renderTarget = self.renderer.getRenderTarget();
            if (renderTarget == null || ("isXRRenderTarget" in renderTarget && renderTarget.isXRRenderTarget)) {
                stack = 0;
                self.#frame += 1;
                self.#clock.update?.();
                self.#delta = Math.max(self.#clock.getDelta(), 1 / 1000);
                self.#time += self.#delta;
                self._fpsBuffer.shift();
                self._fpsBuffer.push(1 / self.#delta);
                self.#fps = self._fpsBuffer.reduce((a, b) => a + b) / self._fpsBuffer.length;
                if (debugProgressiveLoading && self.#frame % 200 === 0) console.log("FPS", Math.round(self.#fps), "Interval:", self.#updateInterval);
            }
            const stack_level = stack++;
            self.#originalRender!.call(this, scene, camera);
            self.onAfterRender(scene, camera, stack_level);
        };
    }
    disable() {
        if (!this.#originalRender) return;
        console.debug("[gltf-progressive] Disabling LODsManager for renderer");
        this.renderer.render = this.#originalRender;
        this.#originalRender = undefined;
    }

    /**
     * Manually trigger a LOD update for a scene and camera.
     * Only needed when {@link manual} is set to `true` — otherwise LOD updates happen automatically on each render call.
     *
     * @param scene - The scene containing objects with progressive LODs.
     * @param camera - The camera used to determine screen coverage and LOD levels.
     *
     * @example
     * ```ts
     * const lodsManager = LODsManager.get(renderer);
     * lodsManager.manual = true;
     * // ... later, trigger an update at a specific point:
     * lodsManager.update(scene, camera);
     * ```
     */
    update(scene: Scene, camera: Camera) {
        this.internalUpdate(scene, camera);
    }


    private onAfterRender(scene: Scene, camera: Camera, _stack: number) {

        if (this.pause) return;

        const renderList = this.getRenderList(scene, camera, _stack);
        if (!renderList) return;
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
        // don't update LODs for cube map rendering cameras
        if (camera.parent && camera.parent.type === "CubeCamera") {
            updateLODs = false;
        }
        else if (_stack >= 1) {
            // don't update LODs if we're e.g. rendering a shadow map
            if (camera.type === "OrthographicCamera") {
                updateLODs = false;
            }
        }

        if (updateLODs) {
            if (suppressProgressiveLoading) return;

            // If the update interval is set to auto then we check the FPS and adjust the update interval accordingly
            // If performance is low we increase the update interval to reduce the amount of LOD updates
            if (this.updateInterval === "auto") {
                if (this.#fps < 40 && this.#updateInterval < 10) {
                    this.#updateInterval += 1;
                    if (debugProgressiveLoading) console.warn("↓ Reducing LOD updates", this.#updateInterval, this.#fps.toFixed(0));
                }
                else if (this.#fps >= 60 && this.#updateInterval > 1) {
                    this.#updateInterval -= 1;
                    if (debugProgressiveLoading) console.warn("↑ Increasing LOD updates", this.#updateInterval, this.#fps.toFixed(0));
                }
            }
            else {
                this.#updateInterval = this.updateInterval;
            }
            // Check if we should update LODs this frame
            if (this.#updateInterval > 0 && this.#frame % this.#updateInterval != 0) {
                return;
            }

            this.internalUpdate(scene, camera);
            this._postprocessPromiseGroups();
        }
    }

    /**
     * Update LODs in a scene
     */
    private internalUpdate(scene: Scene, camera: Camera) {
        const renderList = this.getRenderList(scene, camera, 0);
        if (!renderList) return;
        const opaque = renderList.opaque;

        this.projectionScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const desiredDensity = this.targetTriangleDensity;

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
        const transmissive = renderList.transmissive;
        for (const entry of transmissive) {
            const object = entry.object as any;
            if (object instanceof Mesh || (object.isMesh)) {
                this.updateLODs(scene, camera, object, desiredDensity);
            }
        }
    }

    private getRenderList(scene: Scene, camera: Camera, stack: number): Required<RenderListLike> | null {
        const renderer = this.renderer as any;
        let renderList: RenderListLike | null = null;
        if (renderer.isWebGPURenderer === true) {
            const renderLists = renderer._renderLists;
            if (!renderLists) return null;
            renderList = renderLists.get(scene, camera);
        }
        else if (renderer.isWebGLRenderer === true) {
            const renderLists = renderer.renderLists;
            if (!renderLists) return null;
            renderList = renderLists.get(scene, stack);
        }
        if (!renderList) return null;
        return {
            opaque: renderList.opaque || [],
            transparent: renderList.transparent || [],
            transmissive: renderList.transmissive || renderList.transparentDoublePass || [],
            transparentDoublePass: renderList.transparentDoublePass || [],
        };
    }

    /** Update the LOD levels for the renderer. */
    private updateLODs(scene: Scene, camera: Camera, object: Mesh, desiredDensity: number) {

        if (!object.userData) {
            object.userData = {};
        }

        let state = object[$lodstate] as LOD_state;
        if (!state) {
            state = new LOD_state();
            object[$lodstate] = state;
        }

        // Wait a few frames before updating the LODs to make sure the object is loaded, matrices are updated, etc.
        if (state.frames++ < 2) {
            return;
        }

        for (const plugin of plugins) {
            plugin.onBeforeUpdateLOD?.(this.renderer, scene, camera, object);
        }

        const debugLodLevel = this.overrideLodLevel !== undefined ? this.overrideLodLevel : debug_OverrideLodLevel;
        if (debugLodLevel >= 0) {
            levels.mesh_lod = debugLodLevel;
            levels.texture_lod = debugLodLevel;
        }
        else {
            this.calculateLodLevel(camera, object, state, desiredDensity, levels);
            levels.mesh_lod = Math.round(levels.mesh_lod);
            levels.texture_lod = Math.round(levels.texture_lod);
        }

        // we currently only support auto LOD changes for meshes
        if (levels.mesh_lod >= 0) {
            this.loadProgressiveMeshes(object, levels.mesh_lod);
        }

        // TODO: we currently can not switch texture lods because we need better caching for the textures internally (see copySettings in progressive + NE-4431)
        if (object.material && levels.texture_lod >= 0) {
            this.loadProgressiveTextures(object.material, levels.texture_lod, debugLodLevel);
        }

        if (debug && object.material && !object["isGizmo"]) {
            applyDebugSettings(object.material);
        }
        if (debugProgressiveLODColors && object.material && !object["isGizmo"] && !object["isBatchedMesh"]) {
            applyLODColor(object.material, levels.mesh_lod);
        }

        for (const plugin of plugins) {
            plugin.onAfterUpdatedLOD?.(this.renderer, scene, camera, object, levels)
        }

        state.lastLodLevel_Mesh = levels.mesh_lod;
        state.lastLodLevel_Texture = levels.texture_lod;
    }


    /** Load progressive textures for the given material
     * @param material the material to load the textures for
     * @param level the LOD level to load. Level 0 is the best quality, higher levels are lower quality
     * @returns Promise with true if the LOD was loaded, false if not
     */
    private loadProgressiveTextures(material: Material | Material[], level: number, overrideLodLevel?:number): void {
        if (!material) return;

        if (Array.isArray(material)) {
            for (const mat of material) {
                this.loadProgressiveTextures(mat, level, overrideLodLevel);
            }
            return;
        }

        // Check if the material LOD was already updated to a certain level
        // We don't use the userData here because we want to re-run assigning textures if the material has been cloned
        let update = false;
        if (material[$currentLOD] === undefined) {
            update = true;
        }
        else if (level < material[$currentLOD]) {
            update = true;
        }

        const forceExactTextureLOD = overrideLodLevel !== undefined && overrideLodLevel >= 0;
        if (forceExactTextureLOD) {
            update = material[$currentLOD] != overrideLodLevel;
            level = overrideLodLevel;
        }

        if (update) {
            material[$currentLOD] = level;
            const options = forceExactTextureLOD ? { force: true } : undefined;
            const promise = NEEDLE_progressive.assignTextureLOD(material, level, options).then(_ => {
                this._lodchangedlisteners.forEach(l => l({ type: "texture", level, object: material }));
            });
            PromiseGroup.addPromise("texture", material, promise, this._newPromiseGroups);
        }
    }

    /** Load progressive meshes for the given mesh
     * @param mesh the mesh to load the LOD for
     * @param index the index of the mesh if it's part of a group
     * @param level the LOD level to load. Level 0 is the best quality, higher levels are lower quality
     * @returns Promise with true if the LOD was loaded, false if not
     */
    private loadProgressiveMeshes(mesh: Mesh, level: number): Promise<BufferGeometry | null> {
        if (!mesh) return Promise.resolve(null);

        let update = mesh[$currentLOD] !== level;

        const debugLevel = mesh["DEBUG:LOD"];
        if (debugLevel != undefined) {
            update = mesh[$currentLOD] != debugLevel;
            level = debugLevel;
        }


        if (update) {
            mesh[$currentLOD] = level;
            const originalGeometry = mesh.geometry;
            const promise = NEEDLE_progressive.assignMeshLOD(mesh, level).then(res => {
                if (res && mesh[$currentLOD] == level && originalGeometry != mesh.geometry) {
                    this._lodchangedlisteners.forEach(l => l({ type: "mesh", level, object: mesh }));
                }
                return res;
            });
            PromiseGroup.addPromise("mesh", mesh, promise, this._newPromiseGroups);
            return promise;
        }
        return Promise.resolve(null);
    }

    // private testIfLODLevelsAreAvailable() {

    private readonly _sphere = new Sphere();
    private readonly _tempWorldPosition = new Vector3();

    private static skinnedMeshBoundsFrameOffsetCounter = 0;
    private static $skinnedMeshBoundsOffset = Symbol("gltf-progressive-skinnedMeshBoundsOffset");

    // #region calculateLodLevel
    private calculateLodLevel(camera: Camera, mesh: Mesh, state: LOD_state, desiredDensity: number, result: LOD_Results): void {


        if (!mesh) {
            result.mesh_lod = -1;
            result.texture_lod = -1;
            return;
        }

        if (!camera) {
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
        let mesh_level_calculated = false;


        if (debugProgressiveLoading && mesh["DEBUG:LOD"] != undefined) {
            return mesh["DEBUG:LOD"];
        }

        // The mesh info contains also the density for all available LOD level so we can use this for selecting which level to show
        const mesh_lods = NEEDLE_progressive.getMeshLODExtension(mesh.geometry)?.lods;
        const primitive_index = NEEDLE_progressive.getPrimitiveIndex(mesh.geometry);
        const has_mesh_lods = mesh_lods && mesh_lods.length > 0;

        const texture_lods_minmax = NEEDLE_progressive.getMaterialMinMaxLODsCount(mesh.material);
        const has_texture_lods = texture_lods_minmax.min_count !== Infinity && texture_lods_minmax.min_count >= 0 && texture_lods_minmax.max_count >= 0;


        // We can skip all this if we dont have any LOD information
        if (!has_mesh_lods && !has_texture_lods) {
            result.mesh_lod = 0;
            result.texture_lod = 0;
            return;
        }

        if (!has_mesh_lods) {
            mesh_level_calculated = true;
            mesh_level = 0;
        }

        const canvasHeight = this.renderer.domElement.clientHeight || this.renderer.domElement.height;

        let boundingBox = mesh.geometry.boundingBox;

        if (mesh.type === "SkinnedMesh") {
            const skinnedMesh = mesh as SkinnedMesh;

            if (!skinnedMesh.boundingBox) {
                skinnedMesh.computeBoundingBox();
            }
            // Fix: https://linear.app/needle/issue/NE-5264
            else if (this.skinnedMeshAutoUpdateBoundsInterval > 0) {

                // Save a frame offset per object to stagger updates of skinned meshes across multiple frames
                // This isn't a perfect solution to improve perf impact of skinned mesh updates (e.g. large skinned meshes would still be costly)
                // But for many smaller meshes it helps to avoid spikes in performance
                if (!skinnedMesh[LODsManager.$skinnedMeshBoundsOffset]) {
                    const offset = LODsManager.skinnedMeshBoundsFrameOffsetCounter++;
                    skinnedMesh[LODsManager.$skinnedMeshBoundsOffset] = offset;
                }
                const frameOffset = skinnedMesh[LODsManager.$skinnedMeshBoundsOffset];

                if ((state.frames + frameOffset) % this.skinnedMeshAutoUpdateBoundsInterval === 0) {
                    // use lowres geometry for bounding box calculation
                    const raycastmesh = getRaycastMesh(skinnedMesh);
                    const originalGeometry = skinnedMesh.geometry;
                    if (raycastmesh) {
                        skinnedMesh.geometry = raycastmesh;
                    }
                    skinnedMesh.computeBoundingBox();
                    skinnedMesh.geometry = originalGeometry;
                }


            }
            boundingBox = skinnedMesh.boundingBox;
        }

        if (boundingBox) {
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

            const selection = calculateMeshLODLevel({
                geometry: mesh.geometry,
                matrixWorld: mesh.matrixWorld,
                camera,
                projectionScreenMatrix: this.projectionScreenMatrix,
                desiredDensity,
                canvasHeight,
                currentLevel: state.lastLodLevel_Mesh,
                boundingBox,
                xrEnabled: this.renderer.xr.enabled,
                debugDrawLine: debugProgressiveLoading ? LODsManager.debugDrawLine : undefined,
                warnMissingPrimitiveDensities: true,
            });

            state.lastCentrality = selection.centrality;
            state.lastScreenCoverage = selection.screenCoverage;
            state.lastScreenspaceVolume.copy(selection.screenspaceVolume);
            if (selection.screenCoverage === Infinity) {
                result.mesh_lod = 0;
                result.texture_lod = 0;
                return;
            }

            const isLowerLod = selection.level >= 0 && selection.level < mesh_level;
            if (isLowerLod) {
                mesh_level = selection.level;
                mesh_level_calculated = true;
            }
        }

        if (mesh_level_calculated) {
            result.mesh_lod = mesh_level;
        }
        else {
            result.mesh_lod = state.lastLodLevel_Mesh;
        }

        if (debugProgressiveLoading) {
            const changed = result.mesh_lod != state.lastLodLevel_Mesh;
            if (changed) {
                const level = mesh_lods?.[result.mesh_lod];
                if (level) {
                    console.log(`Mesh LOD changed: ${state.lastLodLevel_Mesh} → ${result.mesh_lod} (density: ${level.densities?.[primitive_index].toFixed(0)}) | ${mesh.name}`);
                }
            }
        }

        if (has_texture_lods) {

            const saveDataEnabled = "saveData" in globalThis.navigator && globalThis.navigator.saveData === true;

            // If this is the first time a texture LOD is requested we want to get the highest LOD to not display the minimal resolution that the root glTF contains as long while we wait for loading of e.g. the 8k LOD 0 texture
            if (state.lastLodLevel_Texture < 0) {
                result.texture_lod = texture_lods_minmax.max_count - 1;
                if (debugProgressiveLoading) {
                    const level = texture_lods_minmax.lods[texture_lods_minmax.max_count - 1];
                    if (debugProgressiveLoading) console.log(`First Texture LOD ${result.texture_lod} (${level.max_height}px) - ${mesh.name}`);
                }
            }
            else {
                // TODO: should we use the volume as a factor instead?
                const volume = state.lastScreenspaceVolume.x + state.lastScreenspaceVolume.y + state.lastScreenspaceVolume.z;
                let factor = state.lastScreenCoverage * 4;
                if (this.context?.engine === "model-viewer") {
                    factor *= 1.5;
                }
                const devicePixelRatio = this.renderer.getPixelRatio?.() || globalThis.devicePixelRatio || 1;
                const screenSize = canvasHeight / devicePixelRatio;
                const pixelSizeOnScreen = screenSize * factor;
                let foundLod = false;
                for (let i = texture_lods_minmax.lods.length - 1; i >= 0; i--) {
                    const lod = texture_lods_minmax.lods[i];

                    if (saveDataEnabled && lod.max_height >= 2048) {
                        continue; // skip 2k textures when saveData is enabled
                    }
                    if (isMobileDevice() && lod.max_height > 4096)
                        continue; // skip 8k textures on mobile devices (for now)


                    if (lod.max_height > pixelSizeOnScreen || (!foundLod && i === 0)) {
                        foundLod = true;
                        result.texture_lod = i;

                        if (debugProgressiveLoading) {
                            if (result.texture_lod < state.lastLodLevel_Texture) {
                                const lod_pixel_height = lod.max_height;
                                console.log(`Texture LOD changed: ${state.lastLodLevel_Texture} → ${result.texture_lod} = ${lod_pixel_height}px \nScreensize: ${pixelSizeOnScreen.toFixed(0)}px, Coverage: ${(100 * state.lastScreenCoverage).toFixed(2)}%, Volume ${volume.toFixed(1)} \n${mesh.name}`);
                            }
                        }

                        break;
                    }
                }
                // const t = Math.min(1, Math.max(0, state.lastScreenCoverage * 1.1));
                // result.texture_lod = lerp(texture_lods_minmax.max_count, 0, t);
            }
        }
        else {
            result.texture_lod = 0;
        }
    }
}



class LOD_state {
    frames: number = 0;
    lastLodLevel_Mesh: number = -1;
    lastLodLevel_Texture: number = -1;
    lastScreenCoverage: number = 0;
    readonly lastScreenspaceVolume: Vector3 = new Vector3();
    lastCentrality: number = 0;
}

function applyLODColor(material: Material | Material[], level: number) {
    if (level < 0) return;

    if (Array.isArray(material)) {
        for (const mat of material) {
            applyLODColor(mat, level);
        }
        return;
    }

    if ("color" in material && material.color instanceof Color) {
        material.color.copy(getLODColor(level, debugLODColor));
        material.needsUpdate = true;
    }
}

export function getLODColor(level: number, target: Color): Color {
    const index = Math.max(0, Math.min(lodDebugColors.length - 1, Math.floor(level)));
    return target.setHex(lodDebugColors[index]);
}
