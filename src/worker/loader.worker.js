// import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/loaders/GLTFLoader.js";

/** @ts-ignore */
import { GLTFLoader } from "https://esm.sh/three@0.168.0/examples/jsm/loaders/GLTFLoader.js";
/** @ts-ignore */
import { MeshoptDecoder } from 'https://esm.sh/three@0.168.0/examples/jsm/libs/meshopt_decoder.module.js';
/** @ts-ignore */
import { DRACOLoader } from 'https://esm.sh/three@0.168.0/examples/jsm/loaders/DRACOLoader.js';
/** @ts-ignore */
import { KTX2Loader } from 'https://esm.sh/three@0.168.0/examples/jsm/loaders/KTX2Loader.js';

console.debug("[Worker] GLTFLoader worker loaded");

/** 
 * @typedef {import("./loader.mainthread").GLTFLoaderWorker_Message} GLTFLoaderWorker_Message 
 **/

self.onmessage = (msg) => {
    /** @type {GLTFLoaderWorker_Message} */
    const request = msg.data;

    console.debug("[Worker] Message event received:", request);

    switch (request.type) {
        case "load":
            loadGLTF(request);
            break;
    }
};

self.onerror = (error) => {
    console.error("[Worker] Error:", error);
};

/**
 * @param {GLTFLoaderWorker_Message} data
 */
function postMessage(data) {
    self.postMessage(data);
}

/**
 * @param {GLTFLoaderWorker_Message & { type: "load"}} req
 */
async function loadGLTF(req) {
    console.debug("[Worker] Loading GLTF from URL:", req.dracoDecoderPath);

    const loader = new GLTFLoader();

    loader.setMeshoptDecoder(MeshoptDecoder);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderConfig({ type: 'js' });
    dracoLoader.setDecoderPath(req.dracoDecoderPath);
    loader.setDRACOLoader(dracoLoader);

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.workerConfig = req.ktx2LoaderConfig;
    ktx2Loader.setTranscoderPath(req.ktx2TranscoderPath);
    loader.setKTX2Loader(ktx2Loader);


    loader.load(req.url, gltf => {
        console.log("WORKER", gltf);

        /** @type {GLTFLoaderWorker_Message & { type: "loaded-gltf"}} */
        const data = {
            type: "loaded-gltf",
            result: {
                url: req.url,
                geometries: [],
                textures: [],
            }
        }
        collectData(gltf, data);
        postMessage(data);
    });
}


/** 
 * @param {import("three/examples/jsm/loaders/GLTFLoader").GLTF} gltf 
 * @param {GLTFLoaderWorker_Message & { type: "loaded-gltf"}} data
 **/
function collectData(gltf, data) {

    const { result } = data;

    for (const key of gltf.parser.associations.keys()) {
        const cache = gltf.parser.associations.get(key);

        if (!cache) {
            console.warn("[Worker] No cache found for key:", key);
            continue;
        }

        if ("isTexture" in key && key.isTexture) {
            const texture = /** @type {import("three").Texture} */ ( /** @type {unknown} */ (key));
            const gltf_texture = gltf.parser.json.textures[cache.textures ?? -1];
            result.textures.push({
                texture: texture,
                textureIndex: cache.textures ?? -1,
                extensions: gltf_texture?.extensions ?? {},
            })
        }
        else if ("isMesh" in key && key.isMesh) {
            const mesh = /** @type {import("three").Mesh} */ ( /** @type {unknown} */ (key));
            const meshIndex = cache.meshes ?? -1;
            const primitiveIndex = cache.primitives ?? -1;
            const gltf_mesh = gltf.parser.json.meshes[meshIndex];
            result.geometries.push({
                geometry: mesh.geometry,
                meshIndex: meshIndex,
                primitiveIndex: primitiveIndex,
                extensions: gltf_mesh?.extensions ?? {},
            });
        }
        else if ("isMaterial" in key && key.isMaterial) {
            // Nothing we need to do here
        }
    }
}

// function traverseAndDeleteFunctions(gltf) {
//     const textures = [];
//     gltf.traverse((child) => {
//         if (child.isMesh) {
//             geometries.push(child.geometry);
//             if (child.material) {
//                 if (child.material.map) {
//                     textures.push(child.material.map);
//                 }
//             }
//         }
//     });
//     return {
//         geometries: geometries,
//         textures: textures,
//     }
// }

// function traverseAndDeleteFunctions(obj, seen = new WeakSet()) {
//     if (seen.has(obj)) return;
//     seen.add(obj);

//     for (const key in obj) {
//         if (typeof obj[key] === "function") {
//             delete obj[key];
//         } else if (typeof obj[key] === "object" && obj[key] !== null) {
//             traverseAndDeleteFunctions(obj[key], seen);
//         }
//     }
//     return obj;
// }