import { Box3, BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, Texture, WebGLRenderer } from "three";
import { createLoaders, GET_LOADER_LOCATION_CONFIG } from "../loaders.js";
import type { KTX2LoaderWorkerConfig } from "three/examples/jsm/loaders/KTX2Loader.js";
import { PromiseQueue, SlotReturnValue } from "../utils.internal.js";

type GLTFLoaderWorkerOptions = {};

type WorkerLoadResult = {
    url: string,
    geometries: Array<{ geometry: BufferGeometry, meshIndex: number, primitiveIndex: number, extensions: Record<string, any> }>,
    textures: Array<{ texture: Texture, textureIndex: number, extensions: Record<string, any> }>,
};

export function createWorker(opts?: GLTFLoaderWorkerOptions): Promise<GLTFLoaderWorker> {
    return GLTFLoaderWorker.createWorker(opts || {});;
}

export type { GLTFLoaderWorker, GLTFLoaderWorkerOptions, WorkerLoadResult };


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

    private static workerUrl: null | string = null;

    static async createWorker(opts: GLTFLoaderWorkerOptions) {

        if (!GLTFLoaderWorker.workerUrl) {
            GLTFLoaderWorker.workerUrl = await import( /* @vite-ignore */ `./loader.worker.js?url`).then(m => {
                return (m.default || m).toString();
            });
            if (!GLTFLoaderWorker.workerUrl) throw new Error("Failed to load GLTFLoaderWorker worker URL");
        }
        const worker = new Worker(new URL(GLTFLoaderWorker.workerUrl, import.meta.url), {
            type: 'module',
        });
        const instance = new GLTFLoaderWorker(worker, opts);
        return instance;
    }





    private _running: Array<{ url: string, resolve: (value: WorkerLoadResult) => void }> = [];

    async load(url: string | URL, opts?: { renderer?: WebGLRenderer }): Promise<WorkerLoadResult> {
        const configs = GET_LOADER_LOCATION_CONFIG();
        const loaders = createLoaders(opts?.renderer || new (await import("three")).WebGLRenderer());
        const ktx2Loader = loaders.ktx2Loader;
        const ktx2LoaderConfig = ktx2Loader.workerConfig;

        if (url instanceof URL) {
            url = url.toString();
        }
        else if (!url.startsWith("blob:") && !url.startsWith("http:") && !url.startsWith("https:")) {
            url = new URL(url, window.location.href).toString();
        }

        const options: GLTFLoaderWorker_Message = {
            type: "load",
            url: url,
            dracoDecoderPath: configs.dracoDecoderPath,
            ktx2TranscoderPath: configs.ktx2TranscoderPath,
            ktx2LoaderConfig: ktx2LoaderConfig,
        }
        console.debug("[Worker] Sending load request", options);
        this.worker.postMessage(options);
        return new Promise<WorkerLoadResult>(resolve => {
            this._running.push({
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
                    for (const promise of this._running) {
                        if (promise.url === data.result.url) {
                            processReceivedData(data.result);
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

function processReceivedData(data: WorkerLoadResult): WorkerLoadResult {

    for (const res of data.geometries) {
        const worker_geometry = res.geometry;

        console.log(worker_geometry)

        const geo = new BufferGeometry();

        if (worker_geometry.index) {
            const index = worker_geometry.index;
            geo.setIndex(cloneAttribute(index) as BufferAttribute);
        }

        // geo.drawRange = receivedGeometry.drawRange || { start: 0, count: Infinity };

        for (const attrName in worker_geometry.attributes) {
            const attribute = worker_geometry.attributes[attrName];
            const clonedAttribute = cloneAttribute(attribute);
            geo.setAttribute(attrName, clonedAttribute);
        }

        // handle morph attributes
        if (worker_geometry.morphAttributes) {
            for (const morphName in worker_geometry.morphAttributes) {
                const morphAttributes = worker_geometry.morphAttributes[morphName];
                const morphArray = morphAttributes.map(attribute => {
                    return cloneAttribute(attribute);
                });
                geo.morphAttributes[morphName] = morphArray;
            }
        }
        geo.morphTargetsRelative = worker_geometry.morphTargetsRelative ?? false;

        // // handle morph targets relative
        // if (receivedGeometry.morphTargetsRelative) {
        //     geo.morphTargetsRelative = receivedGeometry.morphTargetsRelative;
        // }
        // // handle bounding box and sphere
        if (worker_geometry.boundingBox) {
            geo.boundingBox = null;
            // geo.boundingBox = new Box3().setFromArray(worker_geometry.boundingBox);
        }
        if (worker_geometry.boundingSphere) {
            // geo.boundingSphere = worker_geometry.boundingSphere;
        }

        geo.name = worker_geometry.name || "";
        geo.computeBoundingBox();
        // geo.computeBoundingSphere();
        // // handle groups
        // if (receivedGeometry.groups) {
        //     for (const group of receivedGeometry.groups) {
        //         geo.addGroup(group.start, group.count, group.materialIndex);
        //     }
        // }

        // // handle user data
        // if (receivedGeometry.userData) {
        //     geo.userData = receivedGeometry.userData;
        // }

        res.geometry = geo;

    }

    return data;
}

function cloneAttribute(attribute: BufferAttribute | InterleavedBufferAttribute): BufferAttribute | InterleavedBufferAttribute {

    let res: BufferAttribute | InterleavedBufferAttribute = attribute;

    if ("isInterleavedBufferAttribute" in attribute && attribute.isInterleavedBufferAttribute) {
        const data = attribute.data;
        const array = data.array;
        const interleavedBuffer = new InterleavedBuffer(array, data.stride);
        res = new InterleavedBufferAttribute(interleavedBuffer, attribute.itemSize, array.byteOffset, attribute.normalized);
    }
    else {
        res = new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized);
    }
    return res;
}

// // geo.setAttribute(attrName, clonedAttribute);
// if ("isInterleavedBufferAttribute" in attribute) {
//     const array = attribute.data.array;
//     // Create an InterleavedBuffer from the array and set it as the attribute
//     // Note: The byteOffset is not set in the original code, but it can be set if needed
//     const interleavedBuffer = new InterleavedBuffer(array, attribute.data.stride);
//     geo.setAttribute(attrName, new InterleavedBufferAttribute(interleavedBuffer, attribute.itemSize, array.byteOffset, attribute.normalized));
// }
// else {
//     const array = attribute.array;
//     geo.setAttribute(attrName, new BufferAttribute(array, 3));
// }