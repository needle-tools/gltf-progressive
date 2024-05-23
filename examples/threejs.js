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

const grid = new THREE.GridHelper(10, 10);
scene.add(grid);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 1, 0);
scene.add(directionalLight);

orbit.target = new THREE.Vector3(0, 0, 0);
// camera.position.x = -30;
// camera.position.y = 20;
camera.position.z = 4;

// This is the model we want to load
const url = "https://engine.needle.tools/demos/gltf-progressive/threejs/assets/model.glb";

const gltfLoader = new GLTFLoader();

// Integrate @needle-tools/gltf-progressive
useNeedleProgressive(url, renderer, gltfLoader)

// just call the load method as usual
gltfLoader.load(url, gltf => {
    console.log(gltf)
    scene.add(gltf.scene)
})


// Animate the scene
function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
}
animate();
