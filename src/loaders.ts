import { FileLoader, WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';


let DEFAULT_DRACO_DECODER_LOCATION = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
let DEFAULT_KTX2_TRANSCODER_LOCATION = 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/';
const defaultDraco = DEFAULT_DRACO_DECODER_LOCATION;
const defaultKTX2 = DEFAULT_KTX2_TRANSCODER_LOCATION;

fetch(DEFAULT_DRACO_DECODER_LOCATION + "draco_decoder.js", { method: "head" })
    .catch(_ => {
        // check if the default values have been changed by the user. 
        // If they didnt change / the default paths are not reachable, fall back to local versions
        if (DEFAULT_DRACO_DECODER_LOCATION === defaultDraco)
            DEFAULT_DRACO_DECODER_LOCATION = "./include/draco/";
        if (DEFAULT_KTX2_TRANSCODER_LOCATION === defaultKTX2)
            DEFAULT_KTX2_TRANSCODER_LOCATION = "./include/ktx2/";
    });

/**
 * Set the location of the Draco decoder.
 * @default 'https://www.gstatic.com/draco/versioned/decoders/1.4.1/'
 */
export function setDracoDecoderLocation(location: string) {
    DEFAULT_DRACO_DECODER_LOCATION = location;
}
/**
 * Set the location of the KTX2 transcoder.
 * @default 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/'
 */
export function setKTX2TranscoderLocation(location: string) {
    DEFAULT_KTX2_TRANSCODER_LOCATION = location;
}

let dracoLoader: DRACOLoader;
let meshoptDecoder: typeof MeshoptDecoder;
let ktx2Loader: KTX2Loader;

/**
 * Create loaders/decoders for Draco, KTX2 and Meshopt to be used with GLTFLoader.
 * @param renderer - Provide a renderer to detect KTX2 support.
 * @returns The loaders/decoders.
 */
export function createLoaders(renderer: WebGLRenderer | null) {
    if (!dracoLoader) {
        dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(DEFAULT_DRACO_DECODER_LOCATION);
        dracoLoader.setDecoderConfig({ type: 'js' });
    }
    if (!ktx2Loader) {
        ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath(DEFAULT_KTX2_TRANSCODER_LOCATION);
    }
    if (!meshoptDecoder) {
        meshoptDecoder = MeshoptDecoder;
    }
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

        const progressive = config ? config.progressive : true;
        const usecase = config ? config.usecase : "default";

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