export { version as VERSION } from "./version.js"

export * from "./extension.js"
export * from "./plugins/index.js"
export { LODsManager, type LOD_Results } from "./lods_manager.js"
export { setDracoDecoderLocation, setKTX2TranscoderLocation, createLoaders, addDracoAndKTX2Loaders } from "./loaders.js"
export * from "./utils.js"


import { WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { addDracoAndKTX2Loaders, createLoaders } from "./loaders.js";
import { NEEDLE_progressive } from "./extension.js";
import { LODsManager } from "./lods_manager.js";

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



/** Modelviewer */
import { patchModelViewer } from "./plugins/modelviewer.js";
patchModelViewer();




