import { Box3, BufferAttribute, BufferGeometry, CompressedPixelFormat, CompressedTexture, CompressedTextureMipmap, InterleavedBuffer, InterleavedBufferAttribute, Mapping, PixelFormat, Sphere, Texture, Vector3, WebGLRenderer } from "three";
import { createLoaders, GET_LOADER_LOCATION_CONFIG } from "../loaders.js";
import type { KTX2LoaderWorkerConfig } from "three/examples/jsm/loaders/KTX2Loader.js";

type GLTFLoaderWorkerOptions = {
    debug?: boolean;
};

type WorkerLoadResult = {
    url: string,
    geometries: Array<{ geometry: BufferGeometry, meshIndex: number, primitiveIndex: number, extensions: Record<string, any> }>,
    textures: Array<{ texture: Texture, textureIndex: number, extensions: Record<string, any> }>,
};

const workers = new Array<Promise<GLTFLoaderWorker>>();
let getWorkerId = 0;

export function getWorker(opts?: GLTFLoaderWorkerOptions): Promise<GLTFLoaderWorker> {
    if (workers.length < 10) {
        console.warn("[Worker] Creating new GLTFLoaderWorker");
        const worker = GLTFLoaderWorker.createWorker(opts || {});
        workers.push(worker);
        return worker;
    }
    const index = (getWorkerId++) % workers.length;
    const worker = workers[index];
    return worker;
}


export type { GLTFLoaderWorker, GLTFLoaderWorkerOptions, WorkerLoadResult };


/** @internal */
export type GLTFLoaderWorker_Message = {
    type: 'init',

} | {
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
    private _webglRenderer: Promise<WebGLRenderer> | null = null;

    async load(url: string | URL, opts?: { renderer?: WebGLRenderer }): Promise<WorkerLoadResult> {
        const configs = GET_LOADER_LOCATION_CONFIG();

        // Make sure we have a webgl renderer for the KTX transcoder feature detection
        let renderer = opts?.renderer;
        if (!renderer) {
            this._webglRenderer ??= (async () => {
                const { WebGLRenderer } = await import("three");
                return new WebGLRenderer();
            })();
            renderer = await this._webglRenderer;
        }

        const loaders = createLoaders(renderer);
        const ktx2Loader = loaders.ktx2Loader;
        const ktx2LoaderConfig = ktx2Loader.workerConfig;

        if (url instanceof URL) {
            url = url.toString();
        }
        else if (url.startsWith("file:")) {
            // make blob url
            url = URL.createObjectURL(new Blob([url]));
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
        if (this._debug) console.debug("[Worker] Sending load request", options);
        this.worker.postMessage(options);
        return new Promise<WorkerLoadResult>(resolve => {
            this._running.push({
                url: url.toString(),
                resolve,
            });
        });
    }

    private _debug: boolean = false;

    private constructor(private readonly worker: Worker, _opts: GLTFLoaderWorkerOptions) {
        this._debug = _opts.debug ?? false;

        worker.onmessage = (event) => {
            const data = event.data as GLTFLoaderWorker_Message;
            if (this._debug) console.log("[Worker] EVENT", data);
            switch (data.type) {
                case "loaded-gltf": {
                    for (const promise of this._running) {
                        if (promise.url === data.result.url) {
                            // process received data and resolve
                            processReceivedData(data.result);
                            promise.resolve(data.result);

                            // cleanup
                            const url = promise.url;
                            if (url.startsWith("blob:")) {
                                URL.revokeObjectURL(url);
                            }
                        }
                    }
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

        // console.log(worker_geometry)

        const geo = new BufferGeometry();
        geo.name = worker_geometry.name || "";

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

        geo.boundingBox = new Box3();
        geo.boundingBox.min = new Vector3(
            worker_geometry.boundingBox?.min.x, 
            worker_geometry.boundingBox?.min.y, 
            worker_geometry.boundingBox?.min.z,
        );
        geo.boundingBox.max = new Vector3(
            worker_geometry.boundingBox?.max.x,
            worker_geometry.boundingBox?.max.y,
            worker_geometry.boundingBox?.max.z
        );
        geo.boundingSphere = new Sphere(
            new Vector3(
                worker_geometry.boundingSphere?.center.x,
                worker_geometry.boundingSphere?.center.y,
                worker_geometry.boundingSphere?.center.z
            ),
            worker_geometry.boundingSphere?.radius
        )

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

    for (const res of data.textures) {

        const texture = res.texture;

        let newTexture: Texture | null = null;

        if ((texture as CompressedTexture).isCompressedTexture) {
            const mipmaps = texture.mipmaps as CompressedTextureMipmap[];
            const width = texture.image?.width || texture.source?.data?.width || -1;
            const height = texture.image?.height || texture.source?.data?.height || -1;
            newTexture = new CompressedTexture(
                mipmaps,
                width,
                height,
                texture.format as CompressedPixelFormat,
                texture.type,
                texture.mapping as Mapping,
                texture.wrapS,
                texture.wrapT,
                texture.magFilter,
                texture.minFilter,
                texture.anisotropy,
                texture.colorSpace
            );
        }
        else {
            newTexture = new Texture(
                texture.image,
                texture.mapping as Mapping,
                texture.wrapS,
                texture.wrapT,
                texture.magFilter,
                texture.minFilter,
                texture.format as PixelFormat,
                texture.type,
                texture.anisotropy
            );
        }

        if (!newTexture) {
            console.error("[Worker] Failed to create new texture from received data. Texture is not a CompressedTexture or Texture.");
            continue;
        }

        res.texture = newTexture;
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

