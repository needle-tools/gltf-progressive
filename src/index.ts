export { version as VERSION } from "./version.js"

export * from "./extension.js"
export * from "./plugins/index.js"
export { LODsManager, type LOD_Results } from "./lods.manager.js"
export { setDracoDecoderLocation, setKTX2TranscoderLocation, createLoaders, addDracoAndKTX2Loaders, configureLoader } from "./loaders.js"
export { getRaycastMesh, registerRaycastMesh, useRaycastMeshes } from "./utils.js"


import { WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { addDracoAndKTX2Loaders, configureLoader, createLoaders, SmartLoadingHints } from "./loaders.js";
import { NEEDLE_progressive } from "./extension.js";
import { LODsManager } from "./lods.manager.js";

declare type UseNeedleGLTFProgressiveOptions = {
    /**
     * When set to true the LODs manager will automatically be enabled
     */
    enableLODsManager?: boolean;
    /**
     * Smart loading hints can be used by needle infrastructure to deliver assets optimized for a specific usecase.
     */
    hints?: Omit<SmartLoadingHints, "progressive">;
}

/** @deprecated Use `useNeedleProgressive(loader, renderer)` - this method will be removed in gltf-progressive 4 */
export function useNeedleProgressive(url: string, renderer: WebGLRenderer, loader: GLTFLoader, opts?: UseNeedleGLTFProgressiveOptions);
export function useNeedleProgressive(loader: GLTFLoader, renderer: WebGLRenderer, opts?: UseNeedleGLTFProgressiveOptions);
/** Use this function to enable progressive loading of gltf models.
 * @param url The url of the gltf model.
 * @param renderer The renderer of the scene.
 * @param loader The gltf loader.
 * @param opts Options.
 * @returns The LODsManager instance.
 *
 * @example Usage with vanilla three.js:
 * ```ts
 * const url = 'https://yourdomain.com/yourmodel.glb'
 * const loader = new GLTFLoader()
 * useNeedleProgressive(url, renderer, loader)
 * ```
 *
 * @example Usage with react-three-fiber:
 * ```ts
 *  const url = 'https://yourdomain.com/yourmodel.glb'
 * const { scene } = useGLTF(url, false, false, (loader) => {
 *   useNeedleGLTFProgressive(url, gl, loader)
 * })
 * return <primitive object={scene} />
 * ```
 */
export function useNeedleProgressive(...args: any[]) {
    let url: string;
    let renderer: WebGLRenderer;
    let loader: GLTFLoader;
    let opts: UseNeedleGLTFProgressiveOptions;
    switch (args.length) {
        case 2:
            [loader, renderer] = args;
            opts = {};
            break;
        case 3:
            [loader, renderer, opts] = args;
            break;
        case 4: // legacy
            [url, renderer, loader, opts] = args;
            break;
        default:
            throw new Error("Invalid arguments");
    }

    createLoaders(renderer);
    addDracoAndKTX2Loaders(loader);
    configureLoader(loader, {
        progressive: true,
        ...opts?.hints,
    });
    loader.register(p => new NEEDLE_progressive(p));

    const lod = LODsManager.get(renderer);
    if (opts?.enableLODsManager !== false) {
        lod.enable();
    }
    return lod;
}



/** Modelviewer */
import { patchModelViewer } from "./plugins/modelviewer.js";
patchModelViewer();


import { getRaycastMesh, isSSR, useRaycastMeshes } from "./utils.js"

if (!isSSR) {
    const global = {
        gltfProgressive: {
            useNeedleProgressive,
            LODsManager,
            configureLoader,
            getRaycastMesh,
            useRaycastMeshes,
        }
    }
    if (!globalThis["Needle"]) {
        globalThis["Needle"] = global;
    } else {
        for (const key in global) {
            globalThis["Needle"][key] = global[key];
        }
    }
}