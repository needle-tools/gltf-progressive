import { Scene, Camera, Object3D, Object3DEventMap, WebGLRenderer, Mesh, Texture, Material } from "three";
import { LODsManager } from "../lods.manager.js";
import { NEEDLE_progressive_plugin } from "./plugin.js";
import { EXTENSION_NAME, NEEDLE_progressive, NEEDLE_ext_progressive_mesh, NEEDLE_ext_progressive_texture } from "../extension.js";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const $meshLODSymbol = Symbol("NEEDLE_mesh_lod");
const $textureLODSymbol = Symbol("NEEDLE_texture_lod");

let documentObserver: MutationObserver | null = null;

export function patchModelViewer() {
    const ModelViewerElement = tryGetModelViewerConstructor();
    if (!ModelViewerElement) {
        return;
    }
    ModelViewerElement.mapURLs(function (url) {
        searchModelViewers();
        return url;
    });
    searchModelViewers();

    // observe the document for new model-viewers
    documentObserver?.disconnect();
    documentObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.tagName.toLowerCase() === "model-viewer") {
                    _patchModelViewer(node);
                }
            });
        });
    });
    documentObserver.observe(document, { childList: true, subtree: true });
}

declare type ModelViewerConstructor = CustomElementConstructor & { mapURLs: Function };

/**
 * Tries to get the mode-viewer constructor from the custom element registry. If it doesnt exist yet we will wait for it to be loaded in case it's added to the document at a later point
 */
function tryGetModelViewerConstructor(): ModelViewerConstructor | null {
    if (typeof customElements === 'undefined') return null;
    // If model-viewer is already registered we can ignore this
    const ModelViewerElement = customElements.get('model-viewer')
    if (ModelViewerElement) return ModelViewerElement as ModelViewerConstructor;
    // wait for model-viewer to be defined
    customElements.whenDefined('model-viewer').then(() => {
        console.debug("[gltf-progressive] model-viewer defined");
        patchModelViewer();
    });
    return null;
}


function searchModelViewers() {
    if (typeof document === 'undefined') return;
    // Query once for model viewer. If a user does not have model-viewer in their page, this will return null.
    const modelviewers = document.querySelectorAll("model-viewer");
    modelviewers.forEach((modelviewer) => {
        _patchModelViewer(modelviewer as HTMLElement);
    });
}

const foundModelViewers = new WeakSet();
let modelViewerCount = 0;

/** Patch modelviewer to support NEEDLE progressive system
 * @returns a function to remove the patch
 */
function _patchModelViewer(modelviewer: HTMLElement) {
    if (!modelviewer)
        return null;
    if (foundModelViewers.has(modelviewer))
        return null;
    foundModelViewers.add(modelviewer);
    console.debug("[gltf-progressive] found new model-viewer..." + (++modelViewerCount) + "\n", modelviewer.getAttribute("src"));

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
        // Trigger a render when a LOD has changed
        lod.addEventListener("changed", () => {
            needsRender?.call(modelviewer);
        });
        // Trigger a render when the model viewer visibility changes
        modelviewer.addEventListener("model-visibility", (evt) => {
            const visible = (evt as CustomEvent).detail.visible;
            if (visible)
                needsRender?.call(modelviewer);
        });
        modelviewer.addEventListener("load", () => {
            renderFrames();
        });

        /**
         * For model viewer to immediately update without interaction we need to trigger a few renders
         * We do this so that the LODs are loaded
         */
        function renderFrames() {
            if (needsRender) {
                let forcedFrames = 0;
                let interval = setInterval(() => {
                    if (forcedFrames++ > 5) {
                        clearInterval(interval);
                        return;
                    }
                    needsRender?.call(modelviewer);
                }, 300)
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
                                const ext = textureData.extensions[EXTENSION_NAME] as NEEDLE_ext_progressive_texture;
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
        const ext = object.userData?.["gltfExtensions"]?.[EXTENSION_NAME] as NEEDLE_ext_progressive_mesh;
        if (ext && url) {
            const lodKey = object.uuid;
            NEEDLE_progressive.registerMesh(url, lodKey, object as Mesh, 0, ext.lods.length, ext);
        }
    }
}