import {
    VERSION,
    LODsManager,
    addDracoAndKTX2Loaders,
    configureLoader,
    createLoaders,
    setDracoDecoderLocation,
    setKTX2TranscoderLocation,
    useNeedleProgressive,
} from "../../dist/lib/index.js";
import { getWorker } from "../../dist/lib/worker/loader.mainthread.js";

const status = document.getElementById("status");
const errors = [];

window.__GLTF_PROGRESSIVE_SMOKE__ = {
    done: false,
    ok: false,
    errors,
};

window.addEventListener("error", event => {
    errors.push(event.message || String(event.error || event));
});
window.addEventListener("unhandledrejection", event => {
    errors.push(event.reason?.message || String(event.reason || event));
});

function assert(name, condition) {
    if (!condition) {
        throw new Error(name);
    }
}

async function run() {
    setDracoDecoderLocation("/include/draco/");
    setKTX2TranscoderLocation("/include/ktx2/");

    assert("VERSION export", typeof VERSION === "string");
    assert("LODsManager export", typeof LODsManager === "function");
    assert("addDracoAndKTX2Loaders export", typeof addDracoAndKTX2Loaders === "function");
    assert("configureLoader export", typeof configureLoader === "function");
    assert("createLoaders export", typeof createLoaders === "function");
    assert("useNeedleProgressive export", typeof useNeedleProgressive === "function");

    const worker = await getWorker({ debug: true });
    assert("worker wrapper", worker && typeof worker.load === "function");
    const result = await worker.load(new URL("./minimal.gltf", import.meta.url));
    assert("worker loaded glTF", typeof result.url === "string" && result.url.length > 0);
    assert("worker geometry result", Array.isArray(result.geometries));
    assert("worker texture result", Array.isArray(result.textures));

    await new Promise(resolve => setTimeout(resolve, 500));
    assert("no browser errors", errors.length === 0);

    window.__GLTF_PROGRESSIVE_SMOKE__.ok = true;
    status.textContent = "ok";
}

run()
    .catch(error => {
        errors.push(error.message || String(error));
        status.textContent = errors.join("\n");
    })
    .finally(() => {
        window.__GLTF_PROGRESSIVE_SMOKE__.done = true;
    });
