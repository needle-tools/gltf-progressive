import { FileLoader, WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';


let DEFAULT_DRACO_DECODER_LOCATION = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
let DEFAULT_KTX2_TRANSCODER_LOCATION = 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/';
const defaultDraco = DEFAULT_DRACO_DECODER_LOCATION;
const defaultKTX2 = DEFAULT_KTX2_TRANSCODER_LOCATION;

const _remoteDracoDecoderUrl = new URL(DEFAULT_DRACO_DECODER_LOCATION + "draco_decoder.js");
// if (typeof window !== "undefined") {
//     if (!window.navigator.onLine) {
//         // check if the default values have been changed by the user. 
//         // If they didnt change / the default paths are not reachable, fall back to local versions
//         if (DEFAULT_DRACO_DECODER_LOCATION === defaultDraco)
//             DEFAULT_DRACO_DECODER_LOCATION = "./include/draco/";
//         if (DEFAULT_KTX2_TRANSCODER_LOCATION === defaultKTX2)
//             DEFAULT_KTX2_TRANSCODER_LOCATION = "./include/ktx2/";
//     }
//     prepareLoaders();
// }
fetch(_remoteDracoDecoderUrl, {
    method: "GET",
    headers: {
        "Range": "bytes=0-1"
    }
})
    .catch(_ => {
        console.debug(`Failed to fetch remote Draco decoder from ${DEFAULT_DRACO_DECODER_LOCATION} (offline: ${(typeof navigator !== "undefined") ? navigator.onLine : "unknown"})`);
        // check if the default values have been changed by the user. 
        // If they didnt change / the default paths are not reachable, fall back to local versions
        if (DEFAULT_DRACO_DECODER_LOCATION === defaultDraco) {
            DEFAULT_DRACO_DECODER_LOCATION = "./include/draco/";
        }
        if (DEFAULT_KTX2_TRANSCODER_LOCATION === defaultKTX2) {
            DEFAULT_KTX2_TRANSCODER_LOCATION = "./include/ktx2/";
        }
    })
    .finally(() => {
        prepareLoaders();
    })

/**
 * Set the location of the Draco decoder. If a draco loader has already been created, it will be updated.
 * @default 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
 */
export function setDracoDecoderLocation(location: string) {
    DEFAULT_DRACO_DECODER_LOCATION = location;

    if (dracoLoader && dracoLoader[$dracoDecoderPath] != DEFAULT_DRACO_DECODER_LOCATION) {
        console.debug("Updating Draco decoder path to " + location);
        dracoLoader[$dracoDecoderPath] = DEFAULT_DRACO_DECODER_LOCATION;
        dracoLoader.setDecoderPath(DEFAULT_DRACO_DECODER_LOCATION);
        dracoLoader.preload();
    }
    else {
        console.debug("Setting Draco decoder path to " + location);
    }
}
/**
 * Set the location of the KTX2 transcoder. If a KTX2 loader has already been created, it will be updated.
 * @default 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/'
 */
export function setKTX2TranscoderLocation(location: string) {
    DEFAULT_KTX2_TRANSCODER_LOCATION = location;
    // if set from <needle-engine> 
    if (ktx2Loader && ktx2Loader.transcoderPath != DEFAULT_KTX2_TRANSCODER_LOCATION) {
        console.debug("Updating KTX2 transcoder path to " + location);
        ktx2Loader.setTranscoderPath(DEFAULT_KTX2_TRANSCODER_LOCATION);
        ktx2Loader.init();
    }
    else {
        console.debug("Setting KTX2 transcoder path to " + location);
    }
}

const $dracoDecoderPath = Symbol("dracoDecoderPath");
let dracoLoader: DRACOLoader;
let meshoptDecoder: typeof MeshoptDecoder;
let ktx2Loader: KTX2Loader;

/** Used to create and load loaders */
function prepareLoaders() {
    if (!dracoLoader) {
        dracoLoader = new DRACOLoader();
        dracoLoader[$dracoDecoderPath] = DEFAULT_DRACO_DECODER_LOCATION;
        dracoLoader.setDecoderPath(DEFAULT_DRACO_DECODER_LOCATION);
        dracoLoader.setDecoderConfig({ type: 'js' });
        dracoLoader.preload();
    }
    if (!ktx2Loader) {
        ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath(DEFAULT_KTX2_TRANSCODER_LOCATION);
        ktx2Loader.init();
    }
    if (!meshoptDecoder) {
        meshoptDecoder = MeshoptDecoder;
    }
}

/**
 * Create loaders/decoders for Draco, KTX2 and Meshopt to be used with GLTFLoader.
 * @param renderer - Provide a renderer to detect KTX2 support.
 * @returns The loaders/decoders.
 */
export function createLoaders(renderer: WebGLRenderer | null) {
    prepareLoaders();

    if (renderer) {
        ktx2Loader.detectSupport(renderer);
    }
    else if (renderer !== null)
        console.warn("No renderer provided to detect ktx2 support - loading KTX2 textures might fail");

    return { dracoLoader, ktx2Loader, meshoptDecoder }
}

export function addDracoAndKTX2Loaders(loader: GLTFLoader) {
    if (!loader.dracoLoader)
        loader.setDRACOLoader(dracoLoader);
    if (!(loader as any).ktx2Loader)
        loader.setKTX2Loader(ktx2Loader);
    if (!(loader as any).meshoptDecoder)
        loader.setMeshoptDecoder(meshoptDecoder);
}







/**
 * Smart loading hints can be used by needle infrastructure to deliver assets optimized for a specific usecase.
 */
export type SmartLoadingHints = {
    progressive?: boolean,
    usecase?: "product",
}

const gltfLoaderConfigurations: WeakMap<GLTFLoader, SmartLoadingHints> = new WeakMap();

export function configureLoader(loader: GLTFLoader, opts: SmartLoadingHints) {
    let config = gltfLoaderConfigurations.get(loader);
    if (config) {
        config = Object.assign(config, opts);
    }
    else {
        config = opts;
    }
    gltfLoaderConfigurations.set(loader, config);

}

const originalLoadFunction = GLTFLoader.prototype.load;
type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;
function onLoad(this: GLTFLoader, ...args: ArgumentTypes<typeof GLTFLoader.prototype.load>) {

    const config = gltfLoaderConfigurations.get(this);
    let url_str = args[0];

    const url = new URL(url_str, window.location.href);

    if (url.hostname.endsWith("needle.tools")) {

        const progressive: boolean = config?.progressive !== undefined ? config.progressive : true;
        const usecase: string = config?.usecase ? config.usecase : "default";

        if (progressive) {
            this.requestHeader["Accept"] = `*/*;progressive=allowed;usecase=${usecase}`;
        }
        else {
            this.requestHeader["Accept"] = `*/*;usecase=${usecase}`;
        }

        url_str = url.toString();
    }

    args[0] = url_str;
    const res = originalLoadFunction?.call(this, ...args);
    return res;
}
GLTFLoader.prototype.load = onLoad;