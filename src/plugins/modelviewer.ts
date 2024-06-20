import { Scene, Camera, Object3D, Object3DEventMap, WebGLRenderer, Mesh, Texture, Material } from "three";
import { LODsManager } from "../lods_manager.js";
import { NEEDLE_progressive_plugin } from "./plugin.js";
import { EXTENSION_NAME, NEEDLE_progressive, NEEDLE_progressive_mesh_model, NEEDLE_progressive_texture_model } from "../extension.js";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const $meshLODSymbol = Symbol("NEEDLE_mesh_lod");
const $textureLODSymbol = Symbol("NEEDLE_texture_lod");


export function patchModelViewer() {
    document.removeEventListener("DOMContentLoaded", searchModelViewers);
    document.addEventListener("DOMContentLoaded", searchModelViewers);
    searchModelViewers();
}

function searchModelViewers() {
    // Query once for model viewer. If a user does not have model-viewer in their page, this will return null.
    const modelviewers = document.querySelectorAll("model-viewer");
    modelviewers.forEach((modelviewer, index) => {
        _patchModelViewer(modelviewer as HTMLElement, index);
    });
}

const foundModelViewers = new WeakSet();

/** Patch modelviewer to support NEEDLE progressive system
 * @returns a function to remove the patch
 */
function _patchModelViewer(modelviewer: HTMLElement, index: number) {
    if (!modelviewer)
        return null;
    if (foundModelViewers.has(modelviewer))
        return null;
    foundModelViewers.add(modelviewer);
    console.debug("[gltf-progressive] found model-viewer..." + index)

    // Find the necessary internal methods and properties. We need access to the scene, renderer
    
    let renderer: WebGLRenderer | null = null;
    let scene: Scene | null = null;
    let needsRender: Function | null = null; // < used to force render updates for a few frames

    for (let p = modelviewer; p != null; p = Object.getPrototypeOf(p)) {
        const privateAPI = Object.getOwnPropertySymbols(p);
        const rendererSymbol = privateAPI.find((value) => value.toString() == 'Symbol(renderer)');
        const sceneSymbol = privateAPI.find((value) => value.toString() == 'Symbol(scene)');
        const needsRenderSymbol = privateAPI.find((value) => value.toString() == 'Symbol(needsRender)');
        if (!renderer && rendererSymbol != null) {
            renderer = modelviewer[rendererSymbol].threeRenderer;
        }
        if (!scene && sceneSymbol != null) {
            scene = modelviewer[sceneSymbol];
        }
        if (!needsRender && needsRenderSymbol != null) {
            needsRender = modelviewer[needsRenderSymbol];
        }
    }
    if (renderer && scene) {

        console.debug("[gltf-progressive] setup model-viewer");
        const lod = LODsManager.get(renderer, { engine: "model-viewer" });
        LODsManager.addPlugin(new RegisterModelviewerDataPlugin())
        lod.enable();

        if (scene) {
            /**
             * For model viewer to immediately update without interaction we need to trigger a few renders
             * We do this so that the LODs are loaded
             */
            if (needsRender) {
                let forcedFrames = 0;
                let interval = setInterval(() => {
                    if (forcedFrames++ > 10) {
                        clearInterval(interval);
                        return;
                    }
                    needsRender?.call(modelviewer);
                }, 150)
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

    private _didWarnAboutMissingUrl = false;

    onBeforeUpdateLOD(_renderer: WebGLRenderer, scene: Scene, _camera: Camera, object: Object3D<Object3DEventMap>): void {
        this.tryParseMeshLOD(scene, object);
        this.tryParseTextureLOD(scene, object);
    }

    private getUrl(element: HTMLElement | null | undefined): string | null {
        if (!element) {
            return null;
        }
        let url = element.getAttribute("src");
        // fallback in case the attribute is not set but the src property is
        if (!url) {
            url = element["src"];
        }
        if (!url) {
            if (!this._didWarnAboutMissingUrl)
                console.warn("No url found in modelviewer", element);
            this._didWarnAboutMissingUrl = true;
        }
        return url;
    }

    private tryGetCurrentGLTF(scene: Scene): GLTF | undefined {
        return (scene as any)._currentGLTF;
    }

    private tryGetCurrentModelViewer(scene: Scene): HTMLElement | undefined {
        return (scene as any).element;
    }

    private tryParseTextureLOD(scene: Scene, object: Object3D<Object3DEventMap>) {
        if (object[$textureLODSymbol] == true) return;
        object[$textureLODSymbol] = true;
        const currentGLTF = this.tryGetCurrentGLTF(scene);
        const element = this.tryGetCurrentModelViewer(scene);
        const url = this.getUrl(element!);
        if (!url) {
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
                            if (textureIndex == null) continue;
                            const textureData = currentGLTF!.parser.json.textures[textureIndex];
                            if (!textureData) {
                                console.warn("Texture data not found for texture index " + textureIndex);
                                continue;
                            }
                            if (textureData?.extensions?.[EXTENSION_NAME]) {
                                const ext = textureData.extensions[EXTENSION_NAME] as NEEDLE_progressive_texture_model;
                                if (ext && url) {
                                    NEEDLE_progressive.registerTexture(url, value, ext.lods.length, textureIndex, ext);
                                }
                            }
                        }
                    }
                }

            }
        }
    }

    private tryParseMeshLOD(scene: Scene, object: Object3D<Object3DEventMap>) {
        if (object[$meshLODSymbol] == true) return;
        object[$meshLODSymbol] = true;
        const element = this.tryGetCurrentModelViewer(scene);
        const url = this.getUrl(element);
        if (!url) {
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