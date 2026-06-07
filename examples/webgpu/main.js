import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    createOrbitControls,
    createExampleState,
    getModelUrl,
    markError,
    markReady,
    resizeRenderer,
    setupScene,
    setupRoomEnvironment,
    updateStatus,
} from "../shared/example-utils.js";

const state = createExampleState("webgpu");

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

    const loader = new runtime.GLTFLoader();
    runtime.useNeedleProgressive(loader, renderer);

    const root = await new Promise((resolve, reject) => {
        loader.load(getModelUrl(), gltf => resolve(addLoadedScene(THREE, scene, gltf, { camera, controls })), undefined, reject);
    });

    window.addEventListener("resize", () => {
        resizeRenderer(renderer, camera, window.innerWidth, window.innerHeight, window.devicePixelRatio);
    });

    function render() {
        state.frames += 1;
        root.rotation.y += 0.01;
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    const backend = getBackendType(renderer);
    if (backend !== "webgpu") throw new Error(`Expected WebGPU backend, got ${backend}.`);
    markReady(state, backend);
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
