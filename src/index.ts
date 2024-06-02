

import { WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { addDracoAndKTX2Loaders, createLoaders } from "./loaders.js";
import { NEEDLE_progressive } from "./extension.js";
import { LODsManager } from "./lods_manager.js";
import { loadKTX2Header } from "./ktx_helper.js";

loadKTX2Header("https://raw.githubusercontent.com/donmccurdy/KTX2-Samples/main/ktx2/2d_etc1s.ktx2").catch(console.error);

export * from "./extension.js"
export * from "./plugins/index.js"
export { LODsManager } from "./lods_manager.js"
export { setDracoDecoderLocation, setKTX2TranscoderLocation, createLoaders, addDracoAndKTX2Loaders } from "./loaders.js"
export { getRaycastMesh, setRaycastMesh } from "./utils.js"


declare class UseNeedleGLTFProgressive {
    enableLODsManager?: boolean;
};

/** Use this function to enable progressive loading of gltf models.
 * @param url The url of the gltf model.
 * @param renderer The renderer of the scene.
 * @param loader The gltf loader.
 * @param opts Options.
 * @returns The LODsManager instance.
 * @example In react-three-fiber:
 * ```ts
 *  const url = 'https://yourdomain.com/yourmodel.glb'
 * const { scene } = useGLTF(url, false, false, (loader) => {
 *   useNeedleGLTFProgressive(url, gl, loader)
 * })
 * return <primitive object={scene} />
 * ```
 */
export function useNeedleProgressive(url: string, renderer: WebGLRenderer, loader: GLTFLoader, opts?: UseNeedleGLTFProgressive) {
    createLoaders(renderer);
    addDracoAndKTX2Loaders(loader);
    loader.register(p => new NEEDLE_progressive(p, url));

    const lod = LODsManager.get(renderer);
    if (opts?.enableLODsManager !== false) {
        lod.enable();
    }
    return lod;
}



import { patchModelViewer } from "./plugins/modelviewer.js";

// Query once for model viewer. If a user does not have model-viewer in their page, this will return null.
document.addEventListener("DOMContentLoaded", () => {
    patchModelViewer(document.querySelector("model-viewer") as HTMLElement);
});