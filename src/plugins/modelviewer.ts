import { Scene, Camera, Object3D, Object3DEventMap, WebGLRenderer, Mesh, Texture, Material } from "three";
import { LODsManager } from "../lods_manager.js";
import { NEEDLE_progressive_plugin } from "./plugin.js";
import { EXTENSION_NAME, NEEDLE_progressive, NEEDLE_progressive_mesh_model } from "../extension.js";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const $meshLODSymbol = Symbol("NEEDLE_mesh_lod");
const $textureLODSymbol = Symbol("NEEDLE_texture_lod");

/** Patch modelviewer to support NEEDLE progressive system
 * @returns a function to remove the patch
 */
export function patchModelViewer(modelviewer: HTMLElement) {
    if (!modelviewer)
        return null;
    let renderer: WebGLRenderer | null = null;
    let scene: Scene | null = null;
    for (let p = modelviewer; p != null; p = Object.getPrototypeOf(p)) {
        const privateAPI = Object.getOwnPropertySymbols(p);
        const rendererSymbol = privateAPI.find((value) => value.toString() == 'Symbol(renderer)');
        const sceneSymbol = privateAPI.find((value) => value.toString() == 'Symbol(scene)');
        if (!renderer && rendererSymbol != null) {
            renderer = modelviewer[rendererSymbol].threeRenderer;
        }
        if (!scene && sceneSymbol != null) {
            scene = modelviewer[sceneSymbol];
        }
    }
    if (renderer) {
        console.log("Adding Needle LODs to modelviewer");
        const lod = new LODsManager(renderer);
        lod.plugins.push(new RegisterModelviewerDataPlugin(modelviewer))
        lod.enable();

        if (scene) {
            const camera = scene["camera"] || scene.traverse((o) => o.type == "PerspectiveCamera")[0];
            if (camera) {
                renderer.render(scene, camera);
                // setTimeout(() => {
                //     renderer.render(scene, camera);
                // }, 100)
                // setTimeout(() => {
                //     renderer.render(scene, camera);
                // }, 1200)
            }
        }

        return () => {
            lod.disable();
        };
    }

    return null;
}



/**
 * LODs manager plugin that registers LOD data to the NEEDLE progressive system
 */
class RegisterModelviewerDataPlugin implements NEEDLE_progressive_plugin {
    readonly modelviewer: HTMLElement;

    constructor(modelviewer: HTMLElement) {
        this.modelviewer = modelviewer;
    }

    onBeforeUpdateLOD(_renderer: WebGLRenderer, scene: Scene, _camera: Camera, object: Object3D<Object3DEventMap>): void {
        this.tryParseMeshLOD(scene, object);
        this.tryParseTextureLOD(scene, object);
    }

    private getUrl() {
        return this.modelviewer.getAttribute("src");
    }

    private tryGetCurrentGLTF(scene: Scene): GLTF | undefined {
        return (scene as any)._currentGLTF;
    }

    private tryParseTextureLOD(scene: Scene, object: Object3D<Object3DEventMap>) {
        if (object[$textureLODSymbol] == true) return;
        object[$textureLODSymbol] = true;
        const currentGLTF = this.tryGetCurrentGLTF(scene);
        const url = this.getUrl();
        if (!url) {
            console.error("No url found in modelviewer");
            return;
        }
        if (currentGLTF) {
            if ((object as Mesh).material) {
                const mat = (object as Mesh).material;
                if (Array.isArray(mat)) for (const m of mat) handleMaterial(m);
                else handleMaterial(mat);

                function handleMaterial(mat: Material) {
                    if (mat[$textureLODSymbol] == true) return;
                    mat[$textureLODSymbol] = true;

                    // make sure to force the material to be updated
                    if (mat.userData) mat.userData.LOD = -1;


                    const keys = Object.keys(mat);
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        const value = mat[key] as Texture & { userData: { associations: { textures: number } } };
                        if (value?.isTexture === true) {
                            const textureIndex = value.userData?.associations?.textures;
                            const textureData = currentGLTF!.parser.json.textures[textureIndex];
                            if (textureData.extensions?.[EXTENSION_NAME]) {
                                const ext = textureData.extensions[EXTENSION_NAME] as NEEDLE_progressive_mesh_model;
                                if (ext && url) {
                                    NEEDLE_progressive.registerTexture(url, value, ext.lods.length, ext);
                                }
                            }
                        }
                    }
                }

            }
        }
    }

    private tryParseMeshLOD(_scene: Scene, object: Object3D<Object3DEventMap>) {
        if (object[$meshLODSymbol] == true) return;
        object[$meshLODSymbol] = true;
        const url = this.getUrl();
        if (!url) {
            console.error("No url found in modelviewer");
            return;
        }
        // modelviewer has all the information we need in the userData (associations + gltfExtensions)
        const ext = object.userData?.["gltfExtensions"]?.[EXTENSION_NAME] as NEEDLE_progressive_mesh_model;
        if (ext && url) {
            const lodKey = object.uuid;
            NEEDLE_progressive.registerMesh(url, lodKey, object as Mesh, 0, ext.lods.length, ext);
        }
    }
}