import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useNeedleProgressive, } from "@needle-engine/gltf-progressive"

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x555555);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);


window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target = new THREE.Vector3(0, 14, 0);
camera.position.x = 20;
camera.position.y = 20.5;
camera.position.z = 20.8;

const grid = new THREE.GridHelper(50, 50, 0x444444, 0x666666);
scene.add(grid);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(-50, 20, 50);
scene.add(directionalLight);


// Animate the scene
function animate() {
    requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
}
animate();

const environmentTextureUrl = "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/1k/studio_small_09_1k.exr";
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
new EXRLoader().load(environmentTextureUrl, texture => {
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    texture.dispose();
    pmremGenerator.dispose();
});




// Integrate @needle-tools/gltf-progressive
// This is the model we want to load
const url = "https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb";

const gltfLoader = new GLTFLoader();

/**
 * Call this method to register the progressive loader
 */
useNeedleProgressive(url, renderer, gltfLoader)

// just call the load method as usual
gltfLoader.load(url, gltf => {
    console.log(gltf)
    scene.add(gltf.scene)
    gltf.scene.position.y += .95;
})



