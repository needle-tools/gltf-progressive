export const MODEL_URLS = [
    "https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/putti gruppe/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/cyberpunk/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/robot/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/vase/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/jupiter_und_ganymed/model.glb",
];

export const DEFAULT_MODEL_URL = MODEL_URLS[0];

export function createExampleState(label) {
    const state = {
        label,
        done: false,
        ok: false,
        errors: [],
        frames: 0,
        loaded: false,
        renderer: "",
        currentUrl: "",
        sceneIndex: 0,
        sceneLoads: 0,
        progressiveObjects: 0,
        lodChanges: 0,
        lodChangeTypes: [],
    };
    globalThis.__GLTF_PROGRESSIVE_EXAMPLE__ = state;

    globalThis.addEventListener?.("error", event => {
        state.errors.push(event.message || String(event.error || event));
    });
    globalThis.addEventListener?.("unhandledrejection", event => {
        state.errors.push(event.reason?.message || String(event.reason || event));
    });

    return state;
}

export function updateStatus(message) {
    const element = globalThis.document?.getElementById("status");
    if (element) element.textContent = message;
}

export function markReady(state, rendererLabel) {
    state.loaded = true;
    state.ok = true;
    state.done = true;
    state.renderer = rendererLabel;
    updateStatus(rendererLabel);
}

export function markError(state, error) {
    const message = error?.stack || error?.message || String(error);
    state.errors.push(message);
    state.ok = false;
    state.done = true;
    updateStatus(message);
}

export function getModelUrl(params = new URLSearchParams(globalThis.location?.search || ""), sceneIndex = 0) {
    const asset = params.get("asset");
    if (asset === "minimal") return createMinimalGltfUrl();
    if (asset) return new URL(asset, globalThis.location?.href).href;
    return MODEL_URLS[normalizeSceneIndex(sceneIndex)];
}

export function normalizeSceneIndex(sceneIndex) {
    return ((sceneIndex % MODEL_URLS.length) + MODEL_URLS.length) % MODEL_URLS.length;
}

export function getInitialSceneIndex(params = new URLSearchParams(globalThis.location?.search || "")) {
    const scene = Number(params.get("scene"));
    return Number.isFinite(scene) ? normalizeSceneIndex(scene) : 0;
}

export function createSceneChangeButton(onChange) {
    const document = globalThis.document;
    if (!document) return null;

    const toolbar = document.createElement("div");
    toolbar.className = "example-toolbar";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Change scene";
    button.addEventListener("click", () => onChange());
    toolbar.append(button);
    document.body.append(toolbar);
    return button;
}

export function markSceneLoading(state, sceneIndex, url) {
    state.sceneIndex = normalizeSceneIndex(sceneIndex);
    state.currentUrl = url;
    updateStatus("loading");
}

export function markSceneLoaded(state, runtime, root) {
    state.loaded = true;
    state.sceneLoads += 1;
    state.progressiveObjects = countProgressiveObjects(runtime, root);
}

export function trackLODChanges(lodsManager, state, notify) {
    return lodsManager.addEventListener?.("changed", event => {
        state.lodChanges += 1;
        state.lodChangeTypes.push(event.type);
        if (notify) notify(event);
    });
}

export function countProgressiveObjects(runtime, root) {
    const progressive = runtime.NEEDLE_progressive;
    if (!progressive || !root) return 0;

    let count = 0;
    root.traverse?.(object => {
        if (object?.isMesh && progressive.hasLODLevelAvailable(object)) count += 1;
        const material = object?.material;
        if (material && progressive.hasLODLevelAvailable(material)) count += 1;
    });
    return count;
}

export function createMinimalGltfUrl() {
    const positions = new Float32Array([
        -0.8, -0.5, 0,
        0.8, -0.5, 0,
        0, 0.8, 0,
    ]);
    const normals = new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
    ]);
    const indices = new Uint16Array([0, 1, 2]);
    const bytes = concatBytes(
        new Uint8Array(positions.buffer),
        new Uint8Array(normals.buffer),
        new Uint8Array(indices.buffer),
    );
    const gltf = {
        asset: { version: "2.0", generator: "gltf-progressive example" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name: "MinimalTriangle" }],
        meshes: [{
            primitives: [{
                attributes: { POSITION: 0, NORMAL: 1 },
                indices: 2,
                material: 0,
            }],
        }],
        materials: [{
            pbrMetallicRoughness: {
                baseColorFactor: [0.2, 0.55, 1, 1],
                roughnessFactor: 0.55,
                metallicFactor: 0,
            },
        }],
        buffers: [{
            uri: `data:application/octet-stream;base64,${base64(bytes)}`,
            byteLength: bytes.byteLength,
        }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
            { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength, target: 34962 },
            { buffer: 0, byteOffset: positions.byteLength + normals.byteLength, byteLength: indices.byteLength, target: 34963 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.5, 0], max: [0.8, 0.8, 0] },
            { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
            { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
        ],
    };
    return `data:model/gltf+json;charset=utf-8,${encodeURIComponent(JSON.stringify(gltf))}`;
}

export function setupScene(THREE, width, height) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x555555);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 200);
    camera.position.set(0.5, 1.3, 2);

    const grid = new THREE.GridHelper(50, 50, 0x444444, 0x666666);
    scene.add(grid);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(-50, 20, 50);
    scene.add(directionalLight);

    return { scene, camera };
}

export function setupRoomEnvironment(THREE, RoomEnvironment, renderer, scene, options = {}) {
    if (!RoomEnvironment) return () => { };
    const PMREMGenerator = options.PMREMGenerator || THREE.PMREMGenerator;
    const pmremGenerator = new PMREMGenerator(renderer);
    const environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    return () => {
        environment.dispose?.();
        pmremGenerator.dispose();
    };
}

export function createOrbitControls(OrbitControls, camera, domElement) {
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.5, 0);
    controls.update();
    return controls;
}

export function addLoadedScene(THREE, scene, gltf, options = {}) {
    const root = gltf.scene;
    scene.add(root);
    const fit = fitObjectToView(THREE, options.camera, root, options.controls);
    if (options.onFit) options.onFit(fit);
    return root;
}

export function fitObjectToView(THREE, camera, root, controls) {
    if (!camera) return null;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.0001);
    const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.55;
    const direction = new THREE.Vector3(0.45, 0.35, 1).normalize();

    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = Math.max(100, distance * 100);
    camera.updateProjectionMatrix();

    if (controls) {
        controls.target.copy(center);
        controls.minDistance = distance * 0.1;
        controls.maxDistance = distance * 10;
        controls.update();
    }

    return {
        target: center.toArray(),
        minDistance: distance * 0.1,
        maxDistance: distance * 10,
    };
}

export function resizeRenderer(renderer, camera, width, height, pixelRatio = 1) {
    renderer.setPixelRatio?.(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

export function serializeCamera(camera) {
    return {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        near: camera.near,
        far: camera.far,
        fov: camera.fov,
        aspect: camera.aspect,
    };
}

export function applyCameraState(camera, state) {
    if (!state) return;
    camera.position.fromArray(state.position);
    camera.quaternion.fromArray(state.quaternion);
    camera.near = state.near;
    camera.far = state.far;
    camera.fov = state.fov;
    camera.aspect = state.aspect;
    camera.updateProjectionMatrix();
}

function concatBytes(...arrays) {
    const total = arrays.reduce((sum, array) => sum + array.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const array of arrays) {
        result.set(array, offset);
        offset += array.byteLength;
    }
    return result;
}

function base64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
