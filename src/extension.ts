import { BufferGeometry, Group, Material, Mesh, Object3D, RawShaderMaterial, ShaderMaterial, Texture, TextureLoader } from "three";
import { type GLTF, GLTFLoader, type GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

import { addDracoAndKTX2Loaders } from "./loaders.js";
import { PromiseQueue, resolveUrl } from "./utils.internal.js";
import { getRaycastMesh, registerRaycastMesh } from "./utils.js";

// All of this has to be removed
// import { getRaycastMesh, setRaycastMesh } from "../../engine_physics.js";
// import { PromiseAllWithErrors, resolveUrl } from "../../engine_utils.js";
import { plugins } from "./plugins/plugin.js";
import { debug } from "./lods.debug.js";


export const EXTENSION_NAME = "NEEDLE_progressive";

const $progressiveTextureExtension = Symbol("needle-progressive-texture");

/** Removes the readonly attribute from all properties of an object */
type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };



declare type NEEDLE_progressive_model_LOD = {
    path: string,
    hash?: string
}

/** This is the data structure we have in the NEEDLE_progressive extension */
declare type NEEDLE_progressive_ext = {
    guid: string,
    lods: Array<NEEDLE_progressive_model_LOD>
}

export declare type NEEDLE_ext_progressive_texture = NEEDLE_progressive_ext & {
    lods: Array<NEEDLE_progressive_model_LOD & {
        width: number,
        height: number,
    }>
}
export declare type NEEDLE_ext_progressive_mesh = NEEDLE_progressive_ext & {
    /** @deprecated Removed */
    density: number;
    lods: Array<NEEDLE_progressive_model_LOD & {
        /** @deprecated Use densities with the primitive index */
        density: number,
        indexCount: number;
        vertexCount: number;
        // The undefined flag can be removed after a few versions
        densities: number[] | undefined,
    }>
}

/** 
 * This is the result of a progressive texture loading event for a material's texture slot in {@link NEEDLE_progressive.assignTextureLOD}
 * @internal
 */
export declare type ProgressiveMaterialTextureLoadingResult = {
    /** the material the progressive texture was loaded for */
    material: Material,
    /** the slot in the material where the texture was loaded */
    slot: string,
    /** the texture that was loaded (if any) */
    texture: Texture | null;
    /** the level of detail that was loaded */
    level: number;
}

declare type TextureLODsMinMaxInfo = {
    min_count: number;
    max_count: number;
    lods: Array<{ min_height: number, max_height: number }>,
}

/**
 * The NEEDLE_progressive extension for the GLTFLoader is responsible for loading progressive LODs for meshes and textures.  
 * This extension can be used to load different resolutions of a mesh or texture at runtime (e.g. for LODs or progressive textures).  
 * @example
 * ```javascript
 * const loader = new GLTFLoader();
 * loader.register(new NEEDLE_progressive());
 * loader.load("model.glb", (gltf) => {
 *    const mesh = gltf.scene.children[0] as Mesh;
 *   NEEDLE_progressive.assignMeshLOD(context, sourceId, mesh, 1).then(mesh => {
 *     console.log("Mesh with LOD level 1 loaded", mesh);
 *  });
 * });
 * ```
 */
export class NEEDLE_progressive implements GLTFLoaderPlugin {

    /** The name of the extension */
    get name(): string {
        return EXTENSION_NAME;
    }

    static getMeshLODExtension(geo: BufferGeometry): NEEDLE_ext_progressive_mesh | null {
        const info = this.getAssignedLODInformation(geo);
        if (info?.key) {
            return this.lodInfos.get(info.key) as NEEDLE_ext_progressive_mesh;
        }
        return null;
    }

    static getPrimitiveIndex(geo: BufferGeometry) {
        const index = this.getAssignedLODInformation(geo)?.index;
        if (index === undefined || index === null) return -1;
        return index;
    }

    static getMaterialMinMaxLODsCount(material: Material | Material[], minmax?: TextureLODsMinMaxInfo): TextureLODsMinMaxInfo {
        const self = this;

        // we can cache this material min max data because it wont change at runtime
        const cacheKey = "LODS:minmax"
        const cached = material[cacheKey];
        if (cached != undefined) return cached;

        if (!minmax) {
            minmax = {
                min_count: Infinity,
                max_count: 0,
                lods: [],
            };
        }


        if (Array.isArray(material)) {
            for (const mat of material) {
                this.getMaterialMinMaxLODsCount(mat, minmax);
            }
            material[cacheKey] = minmax;
            return minmax;
        }

        if (debug === "verbose") console.log("getMaterialMinMaxLODsCount", material);

        if (material.type === "ShaderMaterial" || material.type === "RawShaderMaterial") {
            const mat = material as ShaderMaterial;
            for (const slot of Object.keys(mat.uniforms)) {
                const val = mat.uniforms[slot].value as Texture;
                if (val?.isTexture === true) {
                    processTexture(val, minmax);
                }
            }
        }
        else if (material.isMaterial) {
            for (const slot of Object.keys(material)) {
                const val = material[slot] as Texture;
                if (val?.isTexture === true) {
                    processTexture(val, minmax);
                }
            }
        }


        material[cacheKey] = minmax;
        return minmax;

        function processTexture(tex: Texture, minmax: TextureLODsMinMaxInfo) {
            const info = self.getAssignedLODInformation(tex)
            if (info) {
                const model = self.lodInfos.get(info.key) as NEEDLE_ext_progressive_texture;
                if (model && model.lods) {
                    minmax.min_count = Math.min(minmax.min_count, model.lods.length);
                    minmax.max_count = Math.max(minmax.max_count, model.lods.length);
                    for (let i = 0; i < model.lods.length; i++) {
                        const lod = model.lods[i];
                        if (lod.width) {
                            minmax.lods[i] = minmax.lods[i] || { min_height: Infinity, max_height: 0 };
                            minmax.lods[i].min_height = Math.min(minmax.lods[i].min_height, lod.height);
                            minmax.lods[i].max_height = Math.max(minmax.lods[i].max_height, lod.height);
                        }
                    }
                }
            }
        }
    }

    /** Check if a LOD level is available for a mesh or a texture
     * @param obj the mesh or texture to check
     * @param level the level of detail to check for (0 is the highest resolution). If undefined, the function checks if any LOD level is available
     * @returns true if the LOD level is available (or if any LOD level is available if level is undefined)
     */
    static hasLODLevelAvailable(obj: Mesh | BufferGeometry | Texture | Material | Material[], level?: number): boolean {

        if (Array.isArray(obj)) {
            for (const mat of obj) {
                if (this.hasLODLevelAvailable(mat, level)) return true;
            }
            return false;
        }

        if ((obj as Material).isMaterial === true) {
            for (const slot of Object.keys(obj)) {
                const val = obj[slot];
                if (val && (val as Texture).isTexture) {
                    if (this.hasLODLevelAvailable(val, level)) return true;
                }
            }
            return false;
        }
        else if ((obj as unknown as Group).isGroup === true) {
            for (const child of (obj as Object3D).children) {
                if ((child as Mesh).isMesh === true) {
                    if (this.hasLODLevelAvailable(child as Mesh, level)) return true;
                }
            }
        }


        let lodObject: ObjectThatMightHaveLODs | undefined;
        let lodInformation: NEEDLE_progressive_ext | undefined;

        if ((obj as Mesh).isMesh) {
            lodObject = (obj as Mesh).geometry as BufferGeometry;
        }
        else if ((obj as BufferGeometry).isBufferGeometry) {
            lodObject = obj;
        }
        else if ((obj as Texture).isTexture) {
            lodObject = obj;
        }
        if (lodObject) {
            if (lodObject?.userData?.LODS) {
                const lods = lodObject.userData.LODS;
                lodInformation = this.lodInfos.get(lods.key);
                if (level === undefined) return lodInformation != undefined;
                if (lodInformation) {
                    if (Array.isArray(lodInformation.lods)) {
                        return level < lodInformation.lods.length;
                    }
                    return level === 0;
                }
            }
        }

        return false;
    }

    /** Load a different resolution of a mesh (if available)
     * @param context the context
     * @param source the sourceid of the file from which the mesh is loaded (this is usually the component's sourceId)
     * @param mesh the mesh to load the LOD for
     * @param level the level of detail to load (0 is the highest resolution)
     * @returns a promise that resolves to the mesh with the requested LOD level
     * @example
     * ```javascript
     * const mesh = this.gameObject as Mesh;
     * NEEDLE_progressive.assignMeshLOD(context, sourceId, mesh, 1).then(mesh => {
     *    console.log("Mesh with LOD level 1 loaded", mesh);
     * });
     * ```
     */
    static assignMeshLOD(mesh: Mesh, level: number): Promise<BufferGeometry | null> {

        if (!mesh) return Promise.resolve(null);

        if (mesh instanceof Mesh || (mesh as any).isMesh === true) {

            const currentGeometry = mesh.geometry;
            const lodinfo = this.getAssignedLODInformation(currentGeometry);
            if (!lodinfo) {
                return Promise.resolve(null);
            }

            for (const plugin of plugins) {
                plugin.onBeforeGetLODMesh?.(mesh, level);
            }

            // const info = this.onProgressiveLoadStart(context, source, mesh, null);
            mesh["LOD:requested level"] = level;
            return NEEDLE_progressive.getOrLoadLOD<BufferGeometry>(currentGeometry, level).then(geo => {
                if (Array.isArray(geo)) {
                    const index = lodinfo.index || 0;
                    geo = geo[index];
                }
                if (mesh["LOD:requested level"] === level) {
                    delete mesh["LOD:requested level"];

                    if (geo && currentGeometry != geo) {
                        const isGeometry = (geo as BufferGeometry)?.isBufferGeometry;
                        // if (debug == "verbose") console.log("Progressive Mesh " + mesh.name + " loaded", currentGeometry, "→", geo, "\n", mesh)
                        if (isGeometry) {
                            mesh.geometry = geo;
                        }
                        else if (debug) {
                            console.error("Invalid LOD geometry", geo);
                        }
                    }
                }
                // this.onProgressiveLoadEnd(info);
                return geo;

            }).catch(err => {
                // this.onProgressiveLoadEnd(info);
                console.error("Error loading mesh LOD", mesh, err);
                return null;
            });
        }
        else if (debug) {
            console.error("Invalid call to assignMeshLOD: Request mesh LOD but the object is not a mesh", mesh);
        }

        return Promise.resolve(null);
    }

    /** Load a different resolution of a texture (if available)  
     * @param context the context
     * @param source the sourceid of the file from which the texture is loaded (this is usually the component's sourceId)
     * @param materialOrTexture the material or texture to load the LOD for (if passing in a material all textures in the material will be loaded)
     * @param level the level of detail to load (0 is the highest resolution) - currently only 0 is supported
     * @returns a promise that resolves to the material or texture with the requested LOD level
     */
    static assignTextureLOD(materialOrTexture: Material, level: number): Promise<Array<ProgressiveMaterialTextureLoadingResult> | null>;
    static assignTextureLOD(materialOrTexture: Mesh, level: number): Promise<Array<ProgressiveMaterialTextureLoadingResult> | null>;
    static assignTextureLOD(materialOrTexture: Texture, level: number): Promise<Texture | null>;
    static assignTextureLOD(materialOrTexture: Material | Texture | Mesh, level: number = 0)
        : Promise<Array<ProgressiveMaterialTextureLoadingResult> | Texture | null> {

        if (!materialOrTexture) return Promise.resolve(null);

        if ((materialOrTexture as unknown as Mesh).isMesh === true) {
            const mesh = materialOrTexture as Mesh;
            if (Array.isArray(mesh.material)) {
                const arr = new Array<Promise<Array<ProgressiveMaterialTextureLoadingResult> | null>>();
                for (const mat of mesh.material) {
                    const promise = this.assignTextureLOD(mat, level);
                    arr.push(promise);
                }
                return Promise.all(arr).then(res => {
                    const textures = new Array<ProgressiveMaterialTextureLoadingResult>();
                    for (const tex of res) {
                        if (Array.isArray(tex)) {
                            textures.push(...tex);
                        }
                    }
                    return textures;
                });
            }
            else {
                return this.assignTextureLOD(mesh.material, level);
            }
        }

        if ((materialOrTexture as unknown as Material).isMaterial === true) {
            const material = materialOrTexture as Material;
            const promises: Array<Promise<Texture | null>> = [];
            const slots = new Array<string>();

            // Handle custom shaders / uniforms progressive textures. This includes support for VRM shaders
            if ((material as ShaderMaterial).uniforms && ((material as RawShaderMaterial).isRawShaderMaterial || (material as ShaderMaterial).isShaderMaterial === true)) {
                // iterate uniforms of custom shaders
                const shaderMaterial = material as ShaderMaterial;
                for (const slot of Object.keys(shaderMaterial.uniforms)) {
                    const val = shaderMaterial.uniforms[slot].value as Texture;
                    if (val?.isTexture === true) {
                        const task = this.assignTextureLODForSlot(val, level, material, slot).then(res => {
                            if (res && shaderMaterial.uniforms[slot].value != res) {
                                shaderMaterial.uniforms[slot].value = res;
                                shaderMaterial.uniformsNeedUpdate = true;
                            }
                            return res;
                        })
                        promises.push(task);
                        slots.push(slot);
                    }
                }
            }
            else {
                for (const slot of Object.keys(material)) {
                    const val = material[slot] as Texture;
                    if (val?.isTexture === true) {
                        const task = this.assignTextureLODForSlot(val, level, material, slot);
                        promises.push(task);
                        slots.push(slot);
                    }
                }
            }
            return Promise.all(promises).then(res => {
                const textures = new Array<ProgressiveMaterialTextureLoadingResult>();
                for (let i = 0; i < res.length; i++) {
                    const tex = res[i] as Texture;
                    const slot = slots[i];
                    if (tex && tex.isTexture === true) {
                        textures.push({ material, slot, texture: tex, level });
                    }
                    else {
                        textures.push({ material, slot, texture: null, level });
                    }
                }
                return textures;
            });
        }

        if (materialOrTexture instanceof Texture || (materialOrTexture as unknown as Texture).isTexture === true) {
            const texture = materialOrTexture as Texture;
            return this.assignTextureLODForSlot(texture, level, null, null);
        }

        return Promise.resolve(null);
    }

    private static assignTextureLODForSlot(current: Texture, level: number, material: Material | null, slot: string | null): Promise<Texture | null> {
        if (current?.isTexture !== true) {
            return Promise.resolve(null);
        }

        if (slot === "glyphMap") {
            return Promise.resolve(current);
        }

        return NEEDLE_progressive.getOrLoadLOD<Texture>(current, level).then(tex => {

            // this can currently not happen
            if (Array.isArray(tex)) return null;

            if (tex?.isTexture === true) {
                if (tex != current) {

                    if (material && slot) {
                        const assigned = material[slot] as Texture;
                        // Check if the assigned texture LOD is higher quality than the current LOD
                        // This is necessary for cases where e.g. a texture is updated via an explicit call to assignTextureLOD
                        if (assigned && !debug) {
                            const assignedLOD = this.getAssignedLODInformation(assigned);
                            if (assignedLOD && assignedLOD?.level < level) {
                                if (debug === "verbose")
                                    console.warn("Assigned texture level is already higher: ", assignedLOD.level, level, material, assigned, tex);
                                return null;
                            }
                            // assigned.dispose();
                        }
                        material[slot] = tex;
                    }

                    // check if the old texture is still used by other objects
                    // if not we dispose it...
                    // this could also be handled elsewhere and not be done immediately
                    // const users = getResourceUserCount(current);
                    // if (!users) {
                    //     if (debug) console.log("Progressive: Dispose texture", current.name, current.source.data, current.uuid);
                    //     current?.dispose();
                    // }
                }

                // this.onProgressiveLoadEnd(info);
                return tex;
            }
            else if (debug == "verbose") {
                console.warn("No LOD found for", current, level);
            }

            // this.onProgressiveLoadEnd(info);
            return null;

        }).catch(err => {
            // this.onProgressiveLoadEnd(info);
            console.error("Error loading LOD", current, err);
            return null;
        });
    }




    private readonly parser: GLTFParser;
    private readonly url: string;

    constructor(parser: GLTFParser, url: string) {
        if (debug) console.log("Progressive extension registered for", url);
        this.parser = parser;
        this.url = url;
    }


    private _isLoadingMesh;
    loadMesh = (meshIndex: number) => {
        if (this._isLoadingMesh) return null;
        const ext = this.parser.json.meshes[meshIndex]?.extensions?.[EXTENSION_NAME] as NEEDLE_ext_progressive_mesh;
        if (!ext) return null;
        this._isLoadingMesh = true;
        return this.parser.getDependency("mesh", meshIndex).then(mesh => {
            this._isLoadingMesh = false;
            if (mesh) {
                NEEDLE_progressive.registerMesh(this.url, ext.guid, mesh as Mesh, ext.lods?.length, 0, ext);
            }
            return mesh;
        });
    }

    afterRoot(gltf: GLTF): null {
        if (debug)
            console.log("AFTER", this.url, gltf);

        this.parser.json.textures?.forEach((textureInfo, index) => {
            if (textureInfo?.extensions) {
                const ext: NEEDLE_ext_progressive_texture = textureInfo?.extensions[EXTENSION_NAME];
                if (ext) {
                    if (!ext.lods) {
                        if (debug) console.warn("Texture has no LODs", ext);
                        return;
                    }
                    let found = false;
                    for (const key of this.parser.associations.keys()) {
                        if ((key as Texture).isTexture === true) {
                            const val = this.parser.associations.get(key) as { textures: number };
                            if (val?.textures === index) {
                                found = true;
                                NEEDLE_progressive.registerTexture(this.url, key as Texture, ext.lods?.length, index, ext);
                            }
                        }
                    }
                    // If textures aren't used there are no associations - we still want to register the LOD info so we create one instance
                    if (!found) {
                        this.parser.getDependency("texture", index).then(tex => {
                            if (tex) {
                                NEEDLE_progressive.registerTexture(this.url, tex as Texture, ext.lods?.length, index, ext);
                            }
                        });
                    }
                }
            }
        });
        this.parser.json.meshes?.forEach((meshInfo, index: number) => {
            if (meshInfo?.extensions) {
                const ext = meshInfo?.extensions[EXTENSION_NAME] as NEEDLE_ext_progressive_mesh;
                if (ext && ext.lods) {
                    let found = false;
                    for (const entry of this.parser.associations.keys()) {
                        if ((entry as Mesh).isMesh) {
                            const val = this.parser.associations.get(entry) as { meshes: number, primitives: number };
                            if (val?.meshes === index) {
                                found = true;
                                NEEDLE_progressive.registerMesh(this.url, ext.guid, entry as Mesh, ext.lods.length, val.primitives, ext);
                            }
                        }
                    }
                    // Note: we use loadMesh rather than this method so the mesh is surely registered at the right time when the mesh is created
                    // // If meshes aren't used there are no associations - we still want to register the LOD info so we create one instance
                    // if (!found) {
                    //     this.parser.getDependency("mesh", index).then(mesh => {
                    //         if (mesh) {
                    //             NEEDLE_progressive.registerMesh(this.url, ext.guid, mesh as Mesh, ext.lods.length, undefined, ext);
                    //         }
                    //     });
                    // }

                }
            }
        });

        return null;
    }

    /**
     * Register a texture with LOD information
     */
    static registerTexture = (url: string, tex: Texture, level: number, index: number, ext: NEEDLE_ext_progressive_texture) => {
        if (debug) console.log("> Progressive: register texture", index, tex.name, tex.uuid, tex, ext);
        if (!tex) {
            if (debug) console.error("gltf-progressive: Register texture without texture");
            return;
        }
        // Put the extension info into the source (seems like tiled textures are cloned and the userdata etc is not properly copied BUT the source of course is not cloned)
        // see https://github.com/needle-tools/needle-engine-support/issues/133
        if (tex.source)
            tex.source[$progressiveTextureExtension] = ext;
        const LODKEY = ext.guid;
        NEEDLE_progressive.assignLODInformation(url, tex, LODKEY, level, index);
        NEEDLE_progressive.lodInfos.set(LODKEY, ext);
        NEEDLE_progressive.lowresCache.set(LODKEY, tex);
    };

    /**
     * Register a mesh with LOD information
     */
    static registerMesh = (url: string, key: string, mesh: Mesh, level: number, index: number, ext: NEEDLE_ext_progressive_mesh) => {
        const geometry = mesh.geometry as BufferGeometry;
        if (!geometry) {
            if (debug) console.warn("gltf-progressive: Register mesh without geometry");
            return;
        }
        if (!geometry.userData) geometry.userData = {};

        if (debug) console.log("> Progressive: register mesh " + mesh.name, { index, uuid: mesh.uuid }, ext, mesh);

        NEEDLE_progressive.assignLODInformation(url, geometry, key, level, index);

        NEEDLE_progressive.lodInfos.set(key, ext);

        let existing = NEEDLE_progressive.lowresCache.get(key) as unknown as BufferGeometry[] | undefined;
        if (existing) existing.push(mesh.geometry as BufferGeometry);
        else existing = [mesh.geometry as BufferGeometry];
        NEEDLE_progressive.lowresCache.set(key, existing);

        if (level > 0 && !getRaycastMesh(mesh)) {
            registerRaycastMesh(mesh, geometry);
        }


        for (const plugin of plugins) {
            plugin.onRegisteredNewMesh?.(mesh, ext);
        }
    };


    /** A map of key = asset uuid and value = LOD information */
    private static readonly lodInfos = new Map<string, NEEDLE_progressive_ext>();
    /** cache of already loaded mesh lods */
    private static readonly previouslyLoaded: Map<string, Promise<null | Texture | BufferGeometry | BufferGeometry[]>> = new Map();
    /** this contains the geometry/textures that were originally loaded */
    private static readonly lowresCache: Map<string, Texture | BufferGeometry[]> = new Map();

    private static async getOrLoadLOD<T extends Texture | BufferGeometry>(current: T & ObjectThatMightHaveLODs, level: number): Promise<T | null> {

        const debugverbose = debug == "verbose";

        /** this key is used to lookup the LOD information */
        const LOD: LODInformation | undefined = current.userData.LODS;

        if (!LOD) {
            return null;
        }

        const LODKEY = LOD?.key;

        let lodInfo: NEEDLE_progressive_ext | undefined;

        // See https://github.com/needle-tools/needle-engine-support/issues/133
        if ((current as Texture).isTexture === true) {
            const tex = current as Texture;
            if (tex.source && tex.source[$progressiveTextureExtension])
                lodInfo = tex.source[$progressiveTextureExtension];
        }


        if (!lodInfo) lodInfo = NEEDLE_progressive.lodInfos.get(LODKEY);

        if (lodInfo) {

            if (level > 0) {
                let useLowRes = false;
                const hasMultipleLevels = Array.isArray(lodInfo.lods);
                if (hasMultipleLevels && level >= lodInfo.lods.length) {
                    useLowRes = true;
                }
                else if (!hasMultipleLevels) {
                    useLowRes = true;
                }
                if (useLowRes) {
                    const lowres = this.lowresCache.get(LODKEY) as T;
                    return lowres;
                }
            }

            /** the unresolved LOD url */
            const unresolved_lod_url = Array.isArray(lodInfo.lods) ? lodInfo.lods[level]?.path : lodInfo.lods;

            // check if we have a uri
            if (!unresolved_lod_url) {
                if (debug && !lodInfo["missing:uri"]) {
                    lodInfo["missing:uri"] = true;
                    console.warn("Missing uri for progressive asset for LOD " + level, lodInfo);
                }
                return null;
            }

            /** the resolved LOD url */
            const lod_url = resolveUrl(LOD.url, unresolved_lod_url);

            // check if the requested file needs to be loaded via a GLTFLoader
            if (lod_url.endsWith(".glb") || lod_url.endsWith(".gltf")) {
                if (!lodInfo.guid) {
                    console.warn("missing pointer for glb/gltf texture", lodInfo);
                    return null;
                }
                // check if the requested file has already been loaded
                const KEY = lod_url + "_" + lodInfo.guid;

                // check if the requested file is currently being loaded
                const existing = this.previouslyLoaded.get(KEY);
                if (existing !== undefined) {
                    if (debugverbose) console.log(`LOD ${level} was already loading/loaded: ${KEY}`);
                    let res = await existing.catch(err => {
                        console.error(`Error loading LOD ${level} from ${lod_url}\n`, err);
                        return null;
                    });
                    let resouceIsDisposed = false;
                    if (res == null) {
                        // if the resource is null the last loading result didnt succeed (maybe because the url doesnt exist)
                        // in which case we don't attempt to load it again
                    }
                    else if (res instanceof Texture && current instanceof Texture) {
                        // check if the texture has been disposed or not
                        if (res.image?.data || res.source?.data) {
                            res = this.copySettings(current, res);
                        }
                        // if it has been disposed we need to load it again
                        else {
                            resouceIsDisposed = true;
                            this.previouslyLoaded.delete(KEY);
                        }
                    }
                    else if (res instanceof BufferGeometry && current instanceof BufferGeometry) {
                        if (res.attributes.position?.array) {
                            // the geometry is OK
                        }
                        else {
                            resouceIsDisposed = true;
                            this.previouslyLoaded.delete(KEY);
                        }
                    }
                    if (!resouceIsDisposed) {
                        return res as T;
                    }
                }

                const slot = await this.queue.slot(lod_url);
                if (!slot.use) {
                    if (debug) console.log(`LOD ${level} was aborted: ${lod_url}`);
                    return null; // the request was aborted, we don't load it again
                }
                const ext = lodInfo;
                const request = new Promise<null | Texture | BufferGeometry | BufferGeometry[]>(async (resolve, _) => {

                    const loader = new GLTFLoader();
                    addDracoAndKTX2Loaders(loader);

                    if (debug) {
                        await new Promise<void>(resolve => setTimeout(resolve, 1000));
                        if (debugverbose) console.warn("Start loading (delayed) " + lod_url, ext.guid);
                    }

                    let url = lod_url;
                    if (ext && Array.isArray(ext.lods)) {
                        const lodinfo = ext.lods[level];
                        if (lodinfo.hash) {
                            url += "?v=" + lodinfo.hash;
                        }
                    }
                    const gltf = await loader.loadAsync(url).catch(err => {
                        console.error(`Error loading LOD ${level} from ${lod_url}\n`, err);
                        return resolve(null);
                    });
                    if (!gltf) {
                        return resolve(null);
                    }

                    const parser = gltf.parser;
                    if (debugverbose) console.log("Loading finished " + lod_url, ext.guid);
                    let index = 0;

                    if (gltf.parser.json.textures) {
                        let found = false;
                        for (const tex of gltf.parser.json.textures) {
                            // find the texture index
                            if (tex?.extensions) {
                                const other: NEEDLE_progressive_ext = tex?.extensions[EXTENSION_NAME];
                                if (other?.guid) {
                                    if (other.guid === ext.guid) {
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            index++;
                        }
                        if (found) {
                            let tex = await parser.getDependency("texture", index) as Texture;
                            if (tex) {
                                NEEDLE_progressive.assignLODInformation(LOD.url, tex, LODKEY, level, undefined);
                            }
                            if (debugverbose) console.log("change \"" + current.name + "\" → \"" + tex.name + "\"", lod_url, index, tex, KEY);
                            if (current instanceof Texture)
                                tex = this.copySettings(current, tex);
                            if (tex) {
                                (tex as any).guid = ext.guid;
                            }
                            return resolve(tex);
                        }
                        else if (debug) {
                            console.warn("Could not find texture with guid", ext.guid, gltf.parser.json);
                        }
                    }

                    index = 0;

                    if (gltf.parser.json.meshes) {
                        let found = false;
                        for (const mesh of gltf.parser.json.meshes) {
                            // find the mesh index
                            if (mesh?.extensions) {
                                const other: NEEDLE_progressive_ext = mesh?.extensions[EXTENSION_NAME];
                                if (other?.guid) {
                                    if (other.guid === ext.guid) {
                                        found = true;
                                        break;
                                    }
                                }
                            }
                            index++;
                        }
                        if (found) {
                            const mesh = await parser.getDependency("mesh", index) as Mesh | Group;

                            const meshExt = ext as NEEDLE_ext_progressive_mesh;

                            if (debugverbose) console.log(`Loaded Mesh \"${mesh.name}\"`, lod_url, index, mesh, KEY);

                            if ((mesh as Mesh).isMesh === true) {
                                const geo = (mesh as Mesh).geometry as BufferGeometry;
                                NEEDLE_progressive.assignLODInformation(LOD.url, geo, LODKEY, level, 0);
                                return resolve(geo);
                            }
                            else {
                                const geometries = new Array<BufferGeometry>();
                                for (let i = 0; i < mesh.children.length; i++) {
                                    const child = mesh.children[i];
                                    if ((child as Mesh).isMesh === true) {
                                        const geo = (child as Mesh).geometry as BufferGeometry;
                                        NEEDLE_progressive.assignLODInformation(LOD.url, geo, LODKEY, level, i);
                                        geometries.push(geo);
                                    }
                                }
                                return resolve(geometries);
                            }
                        }
                        else if (debug) {
                            console.warn("Could not find mesh with guid", ext.guid, gltf.parser.json);
                        }
                    }

                    // we could not find a texture or mesh with the given guid
                    return resolve(null);
                });
                this.previouslyLoaded.set(KEY, request);
                slot.use(request);
                const res = await request;
                return res as T;
            }
            else {
                if (current instanceof Texture) {
                    if (debugverbose) console.log("Load texture from uri: " + lod_url);
                    const loader = new TextureLoader();
                    const tex = await loader.loadAsync(lod_url);
                    if (tex) {
                        (tex as any).guid = lodInfo.guid;
                        tex.flipY = false;
                        tex.needsUpdate = true;
                        tex.colorSpace = current.colorSpace;
                        if (debugverbose)
                            console.log(lodInfo, tex);
                    }
                    else if (debug) console.warn("failed loading", lod_url);
                    return tex as T;
                }
            }
        }
        else {
            if (debug)
                console.warn(`Can not load LOD ${level}: no LOD info found for \"${LODKEY}\" ${current.name}`, current.type);
        }
        return null;
    }

    private static queue: PromiseQueue = new PromiseQueue(100, { debug: debug != false });

    private static assignLODInformation(url: string, res: DeepWriteable<ObjectThatMightHaveLODs>, key: string, level: number, index?: number) {
        if (!res) return;
        if (!res.userData) res.userData = {};
        const info: LODInformation = new LODInformation(url, key, level, index);
        res.userData.LODS = info;
    }
    private static getAssignedLODInformation(res: ObjectThatMightHaveLODs | null | undefined): null | LODInformation {
        return res?.userData?.LODS || null;
    }

    // private static readonly _copiedTextures: WeakMap<Texture, Texture> = new Map();

    private static copySettings(source: Texture, target: Texture): Texture {
        if (!target) {
            return source;
        }
        // const existingCopy = source["LODS:COPY"];
        // don't copy again if the texture was processed before
        // we clone the source if it's animated
        // const existingClone = this._copiedTextures.get(source);
        // if (existingClone) {
        //     return existingClone;
        // }
        // We need to clone e.g. when the same texture is used multiple times (but with e.g. different wrap settings)
        // This is relatively cheap since it only stores settings
        // This should only happen once ever for every texture
        // const original = target;
        {
            if (debug) console.warn("Copy texture settings\n", source.uuid, "\n", target.uuid);
            target = target.clone();
        }
        // else {
        //     source = existingCopy;
        // }
        // this._copiedTextures.set(original, target);
        // we re-use the offset and repeat settings because it might be animated
        target.offset = source.offset;
        target.repeat = source.repeat;
        target.colorSpace = source.colorSpace;
        target.magFilter = source.magFilter;
        target.minFilter = source.minFilter;
        target.wrapS = source.wrapS;
        target.wrapT = source.wrapT;
        target.flipY = source.flipY;
        target.anisotropy = source.anisotropy;
        if (!target.mipmaps)
            target.generateMipmaps = source.generateMipmaps;
        // if (!target.userData) target.userData = {};
        // target["LODS:COPY"] = source;
        // related: NE-4937
        return target;

    }
}

declare type ObjectThatMightHaveLODs = { name: string, userData?: { LODS?: LODInformation } };

// declare type GetLODInformation = () => LODInformation | null;

class LODInformation {
    readonly url: string;
    /** the key to lookup the LOD information */
    readonly key: string;
    readonly level: number;
    /** For multi objects (e.g. a group of meshes) this is the index of the object */
    readonly index?: number;

    constructor(url: string, key: string, level: number, index?: number) {
        this.url = url;
        this.key = key;
        this.level = level;
        if (index != undefined)
            this.index = index;
    }
};

