
import { WebGLRenderer } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let DEFAULT_DRACO_DECODER_LOCATION = 'https://www.gstatic.com/draco/versioned/decoders/1.4.1/';
let DEFAULT_KTX2_TRANSCODER_LOCATION = 'https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/';

fetch(DEFAULT_DRACO_DECODER_LOCATION + "draco_decoder.js", { method: "head" })
    .catch(_ => {
        DEFAULT_DRACO_DECODER_LOCATION = "./include/draco/";
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

export function createLoaders(renderer: WebGLRenderer) {
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
    else
        console.warn("No renderer provided to detect ktx2 support - loading KTX2 textures will probably fail");

}

export function addDracoAndKTX2Loaders(loader: GLTFLoader) {
    if (!loader.dracoLoader)
        loader.setDRACOLoader(dracoLoader);
    if (!(loader as any).ktx2Loader)
        loader.setKTX2Loader(ktx2Loader);
    if (!(loader as any).meshoptDecoder)
        loader.setMeshoptDecoder(meshoptDecoder);
}
