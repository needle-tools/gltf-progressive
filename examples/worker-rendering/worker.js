import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    applyCameraState,
    getInitialSceneIndex,
    getModelUrl,
    markSceneLoaded,
    markSceneLoading,
    normalizeSceneIndex,
    resizeRenderer,
    serializeCamera,
    setupScene,
    setupRoomEnvironment,
    trackLODChanges,
} from "../shared/example-utils.js";

let renderer;
let camera;
let scene;
let root;
let runtime;
let THREE;
let lodsManager;
let rendererMode = "webgl";
let rendererLabel = "worker-webgl";
let frames = 0;
let width = 1;
let height = 1;
let pixelRatio = 1;
let params = new URLSearchParams();
let sceneIndex = 0;
let sceneLoads = 0;
let loadToken = 0;
const workerState = {
    loaded: false,
    currentUrl: "",
    sceneIndex: 0,
    sceneLoads: 0,
    progressiveObjects: 0,
    lodChanges: 0,
    lodChangeTypes: [],
};

self.addEventListener("message", event => {
    const message = event.data || {};
    if (message.type === "init") {
        init(message).catch(error => {
            self.postMessage({ type: "error", message: error?.stack || error?.message || String(error) });
        });
    }
    else if (message.type === "resize") {
        width = message.width || width;
        height = message.height || height;
        pixelRatio = message.pixelRatio || pixelRatio;
        if (renderer && camera) resizeRenderer(renderer, camera, width, height, pixelRatio);
        if (camera && message.camera) applyCameraState(camera, message.camera);
    }
    else if (message.type === "camera") {
        if (camera && message.camera) applyCameraState(camera, message.camera);
    }
    else if (message.type === "change-scene") {
        loadScene(sceneIndex + 1).catch(error => {
            self.postMessage({ type: "error", message: error?.stack || error?.message || String(error) });
        });
    }
});

async function init(message) {
    width = message.width || width;
    height = message.height || height;
    pixelRatio = message.pixelRatio || pixelRatio;
    rendererMode = message.renderer === "webgpu" ? "webgpu" : "webgl";
    rendererLabel = rendererMode === "webgpu" ? "worker-webgpu" : "worker-webgl";

    params = new URLSearchParams(message.search || "");
    sceneIndex = getInitialSceneIndex(params);
    runtime = await loadRuntime({ params });
    THREE = runtime.THREE;

    renderer = await createRenderer(message.canvas);
    const setup = setupScene(THREE, width, height);
    scene = setup.scene;
    camera = setup.camera;
    resizeRenderer(renderer, camera, width, height, pixelRatio);
    if (message.camera) applyCameraState(camera, message.camera);
    setupRoomEnvironment(THREE, runtime.RoomEnvironment, renderer, scene, rendererMode === "webgpu" ? {
        PMREMGenerator: runtime.THREE_WEBGPU.PMREMGenerator,
    } : undefined);

    const firstLoad = await loadScene(sceneIndex);
    self.postMessage({ type: "ready", renderer: rendererLabel, camera: serializeCamera(camera), fit: firstLoad?.fit });

    const requestFrame = self.requestAnimationFrame || (callback => setTimeout(() => callback(performance.now()), 16));
    function render() {
        frames += 1;
        renderer.render(scene, camera);
        if (frames % 10 === 0) self.postMessage({ type: "frame", frames });
        requestFrame(render);
    }
    render();
}

async function createRenderer(canvas) {
    if (rendererMode === "webgpu") {
        if (!self.navigator?.gpu) throw new Error("WebGPU is not available in this worker.");
        const WebGPURenderer = runtime.THREE.WebGPURenderer || runtime.THREE_WEBGPU.WebGPURenderer;
        if (!WebGPURenderer) throw new Error("WebGPURenderer is not available in this Three.js runtime.");
        const webgpuRenderer = new WebGPURenderer({ canvas, antialias: true });
        await webgpuRenderer.init?.();
        const backend = getBackendType(webgpuRenderer);
        if (backend !== "webgpu") throw new Error(`Expected Worker WebGPU backend, got ${backend}.`);
        return webgpuRenderer;
    }
    return new THREE.WebGLRenderer({ canvas, antialias: true });
}

function getBackendType(renderer) {
    const backend = renderer.backend;
    if (backend?.isWebGPUBackend === true) return "webgpu";
    if (backend?.isWebGLBackend === true) return "webgl";
    if (renderer.isWebGPURenderer === true) return "webgpu";
    return backend?.constructor?.name || renderer.constructor?.name || "unknown";
}

async function loadScene(nextIndex) {
    const token = ++loadToken;
    sceneIndex = normalizeSceneIndex(nextIndex);
    const url = getModelUrl(params, sceneIndex);
    markSceneLoading(workerState, sceneIndex, url);

    const loader = new runtime.GLTFLoader();
    lodsManager = runtime.useNeedleProgressive(loader, renderer);
    if (sceneLoads === 0) {
        trackLODChanges(lodsManager, workerState, event => {
            self.postMessage({ type: "lod-change", lodType: event.type, level: event.level });
        });
    }

    let fit = null;
    const nextRoot = await new Promise((resolve, reject) => {
        loader.load(url, gltf => resolve(addLoadedScene(THREE, scene, gltf, {
            camera,
            onFit: result => fit = result,
        })), undefined, reject);
    });

    if (token !== loadToken) {
        nextRoot.removeFromParent();
        return null;
    }

    root?.removeFromParent();
    root = nextRoot;
    sceneLoads += 1;
    markSceneLoaded(workerState, runtime, root);
    workerState.sceneLoads = sceneLoads;

    self.postMessage({
        type: "scene-loaded",
        url,
        sceneIndex,
        sceneLoads,
        progressiveObjects: workerState.progressiveObjects,
    });
    return { fit };
}
