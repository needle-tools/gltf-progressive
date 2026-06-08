import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    createOrbitControls,
    createExampleState,
    createSceneChangeButton,
    getInitialSceneIndex,
    getModelUrl,
    markError,
    markReady,
    markSceneLoaded,
    markSceneLoading,
    normalizeSceneIndex,
    resizeRenderer,
    setupScene,
    setupRoomEnvironment,
    trackLODChanges,
    updateStatus,
} from "../shared/example-utils.js";

const state = createExampleState("webgpu");
const params = new URLSearchParams(location.search);

try {
    const runtime = await loadRuntime();
    const THREE = runtime.THREE;
    const WebGPURenderer = runtime.THREE.WebGPURenderer || runtime.THREE_WEBGPU.WebGPURenderer;
    if (!WebGPURenderer) throw new Error("WebGPURenderer is not available in this Three.js runtime.");
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.");

    const canvas = document.getElementById("view");
    const renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init?.();

    const { scene, camera } = setupScene(THREE, window.innerWidth, window.innerHeight);
    resizeRenderer(renderer, camera, window.innerWidth, window.innerHeight, window.devicePixelRatio);
    setupRoomEnvironment(THREE, runtime.RoomEnvironment, renderer, scene, {
        PMREMGenerator: runtime.THREE_WEBGPU.PMREMGenerator,
    });
    const controls = createOrbitControls(runtime.OrbitControls, camera, canvas);

    let root = null;
    let sceneIndex = getInitialSceneIndex(params);
    let loadToken = 0;
    let rendererLabel = "";

    const firstLoader = new runtime.GLTFLoader();
    const lodsManager = runtime.useNeedleProgressive(firstLoader, renderer);
    trackLODChanges(lodsManager, state);

    window.addEventListener("resize", () => {
        resizeRenderer(renderer, camera, window.innerWidth, window.innerHeight, window.devicePixelRatio);
    });

    async function loadScene(nextIndex) {
        const token = ++loadToken;
        sceneIndex = normalizeSceneIndex(nextIndex);
        const url = getModelUrl(params, sceneIndex);
        markSceneLoading(state, sceneIndex, url);

        const loader = token === 1 ? firstLoader : new runtime.GLTFLoader();
        if (token !== 1) runtime.useNeedleProgressive(loader, renderer);

        const nextRoot = await new Promise((resolve, reject) => {
            loader.load(url, gltf => resolve(addLoadedScene(THREE, scene, gltf, { camera, controls })), undefined, reject);
        });

        if (token !== loadToken) {
            nextRoot.removeFromParent();
            return;
        }

        root?.removeFromParent();
        root = nextRoot;
        markSceneLoaded(state, runtime, root);
        if (rendererLabel) markReady(state, rendererLabel);
    }

    function render() {
        state.frames += 1;
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    const backend = getBackendType(renderer);
    if (backend !== "webgpu") throw new Error(`Expected WebGPU backend, got ${backend}.`);
    rendererLabel = backend;
    createSceneChangeButton(() => loadScene(sceneIndex + 1).catch(error => markError(state, error)));
    await loadScene(sceneIndex);
    markReady(state, rendererLabel);
    render();
}
catch (error) {
    updateStatus("webgpu unavailable");
    markError(state, error);
}

function getBackendType(renderer) {
    const backend = renderer.backend;
    if (backend?.isWebGPUBackend === true) return "webgpu";
    if (backend?.isWebGLBackend === true) return "webgl";
    if (renderer.isWebGPURenderer === true) return "webgpu";
    return backend?.constructor?.name || renderer.constructor?.name || "unknown";
}
