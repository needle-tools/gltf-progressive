import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useNeedleProgressive, } from "@needle-engine/gltf-progressive"

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const orbit = new OrbitControls(camera, renderer.domElement);

orbit.target = new THREE.Vector3(0, 0, 0);
camera.position.x = -30;
camera.position.y = 20;
camera.position.z = 30;

// This is the model we want to load
const url = "https://staging.api.cloud.needle.tools/v1/public/90b5411/1659b019/";

const gltfLoader = new GLTFLoader();

// Integrate @needle-tools/gltf-progressive
useNeedleProgressive(url, renderer, gltfLoader)

// just call the load method as usual
gltfLoader.load(url, gltf => {[
    scene.add(gltf.scene)
]})


// Animate the scene
function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
}
animate();
