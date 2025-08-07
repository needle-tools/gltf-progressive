import type { BufferGeometry, Texture, WebGLRenderer } from "three";
import { createLoaders, GET_LOADER_LOCATION_CONFIG } from "../loaders.js";
import type { KTX2LoaderWorkerConfig } from "three/examples/jsm/loaders/KTX2Loader.js";
import { PromiseQueue, SlotReturnValue } from "../utils.internal.js";

type GLTFLoaderWorkerOptions = {};

type WorkerLoadResult = {
    url: string,
    geometries: Array<{ geometry: BufferGeometry, meshIndex: number, primitiveIndex: number }>,
    textures: Array<{ texture: Texture, textureIndex: number }>,
};

export function createGLTFLoaderWorker(opts?: GLTFLoaderWorkerOptions): Promise<GLTFLoaderWorker> {
    return GLTFLoaderWorker.createWorker(opts || {});
}

/** @internal */
export type GLTFLoaderWorker_Message = {
    type: 'load',
    url: string,
    dracoDecoderPath: string,
    ktx2TranscoderPath: string,
    ktx2LoaderConfig: KTX2LoaderWorkerConfig,
    // meshoptDecoderPath?: string,
} | {
    type: "loaded-gltf",
    result: WorkerLoadResult,
}

class GLTFLoaderWorker {

    private _promises: Array<{ url: string, resolve: (value: WorkerLoadResult) => void }> = [];

    static async createWorker(opts: GLTFLoaderWorkerOptions) {
        const url = await import( /* @vite-ignore */ `./loader.worker.js?url`).then(m => {
            return m.default || m
        });
        const worker = new Worker(new URL(url.toString(), import.meta.url), {
            type: 'module',
        });
        const instance = new GLTFLoaderWorker(worker, opts);
        return instance;
    }


    async load(url: string, opts?: { renderer?: WebGLRenderer }): Promise<WorkerLoadResult> {
        const configs = GET_LOADER_LOCATION_CONFIG();
        const loaders = createLoaders(opts?.renderer || new (await import("three")).WebGLRenderer());
        const ktx2Loader = loaders.ktx2Loader;
        const ktx2LoaderConfig = ktx2Loader.workerConfig;

        const options: GLTFLoaderWorker_Message = {
            type: "load",
            url: url,
            dracoDecoderPath: configs.dracoDecoderPath,
            ktx2TranscoderPath: configs.ktx2TranscoderPath,
            ktx2LoaderConfig: ktx2LoaderConfig,
        }
        this.worker.postMessage(options);
        return new Promise<WorkerLoadResult>(resolve => {
            this._promises.push({
                url,
                resolve,
            });
        });
    }

    private constructor(private readonly worker: Worker, _opts: GLTFLoaderWorkerOptions) {
        worker.onmessage = (event) => {
            const data = event.data as GLTFLoaderWorker_Message;
            console.log("[Worker] EVENT", data);
            switch (data.type) {
                case "loaded-gltf": {
                    for (const promise of this._promises) {
                        if (promise.url === data.result.url) {
                            promise.resolve(data.result);
                        }
                    }
                    // const modelObject3DJSON = data.gltf;
                    // const loader = new ObjectLoader();
                    // const finalModelObject = loader.parse(modelObject3DJSON);
                    // console.log("MODEL", finalModelObject);
                }
            }
        };
        worker.onerror = (error) => {
            console.error("[Worker] Error in gltf-progressive worker:", error);
        };
        worker.postMessage({
            type: 'init',
        });
    }
}