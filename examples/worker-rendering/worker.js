import { loadRuntime } from "../shared/runtime.js";
import {
    addLoadedScene,
    applyCameraState,
    getModelUrl,
    resizeRenderer,
    serializeCamera,
    setupScene,
    setupRoomEnvironment,
} from "../shared/example-utils.js";

let renderer;
let camera;
let root;
let frames = 0;
let width = 1;
let height = 1;
let pixelRatio = 1;

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
});

async function init(message) {
    width = message.width || width;
    height = message.height || height;
    pixelRatio = message.pixelRatio || pixelRatio;

    const params = new URLSearchParams(message.search || "");
    const runtime = await loadRuntime({ params });
    const THREE = runtime.THREE;

    renderer = new THREE.WebGLRenderer({ canvas: message.canvas, antialias: true });
    const setup = setupScene(THREE, width, height);
    const scene = setup.scene;
    camera = setup.camera;
    resizeRenderer(renderer, camera, width, height, pixelRatio);
    if (message.camera) applyCameraState(camera, message.camera);
    setupRoomEnvironment(THREE, runtime.RoomEnvironment, renderer, scene);

    const loader = new runtime.GLTFLoader();
    runtime.useNeedleProgressive(loader, renderer);
    let fit = null;
    root = await new Promise((resolve, reject) => {
        loader.load(getModelUrl(params), gltf => resolve(addLoadedScene(THREE, scene, gltf, {
            camera,
            onFit: result => fit = result,
        })), undefined, reject);
    });

    self.postMessage({ type: "ready", renderer: "worker-webgl", camera: serializeCamera(camera), fit });

    const requestFrame = self.requestAnimationFrame || (callback => setTimeout(() => callback(performance.now()), 16));
    function render() {
        frames += 1;
        root.rotation.y += 0.01;
        renderer.render(scene, camera);
        if (frames % 10 === 0) self.postMessage({ type: "frame", frames });
        requestFrame(render);
    }
    render();
}
