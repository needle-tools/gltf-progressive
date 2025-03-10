import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useNeedleProgressive, getRaycastMesh, useRaycastMeshes } from "@needle-tools/gltf-progressive";
import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.3/dist/tweakpane.min.js';


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x555555);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);


window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target = new THREE.Vector3(0, .5, 0);
camera.position.x = .5;
camera.position.y = 1.3;
camera.position.z = 2;

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




const modelUrls = [
    "https://engine.needle.tools/demos/gltf-progressive/assets/putti gruppe/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/cyberpunk/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/robot/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/vase/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/jupiter_und_ganymed/model.glb",
    "https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb",
]
let currentUrl = "";
/** @type {null | THREE.Scene} */
let currentScene = null;
let wireframe = false;
/** @type {null | THREE.AnimationMixer} */
let animationMixer = null;

function loadScene() {
    let currentIndex = modelUrls.indexOf(currentUrl);
    currentIndex += 1;
    if (currentIndex >= modelUrls.length) {
        currentIndex = 0;
    }
    const url = modelUrls[currentIndex];
    currentUrl = url;
    wireframe = false;
    if (animationMixer) {
        animationMixer.stopAllAction();
        animationMixer = null;
    }

    // Integrate @needle-tools/gltf-progressive
    // Create a new GLTFLoader instance
    const gltfLoader = new GLTFLoader();
    /** Call this method to register the progressive loader */
    useNeedleProgressive(url, renderer, gltfLoader)

    // just call the load method as usual
    gltfLoader.load(url, gltf => {
        // we're basically just adding our glTF to the scene here
        // the rest of the code is just for the demo
        console.log(gltf)
        if (currentUrl != url) return;
        currentScene?.removeFromParent();
        currentScene = gltf.scene;
        scene.add(gltf.scene)
        gltf.scene.position.y += .01;

        // the church is huge - scaling it down so we don't have a big difference between the models
        if (url.includes("church")) {
            gltf.scene.scale.multiplyScalar(.1);
        }
        else if (url.includes("cyberpunk")) {
            gltf.scene.scale.multiplyScalar(15);
        }

        if (gltf.animations?.length) {
            console.log("Playing animation", gltf.animations)
            animationMixer = new THREE.AnimationMixer(gltf.scene);
            const action = animationMixer.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat);
            action.play();
        }
    })
}
loadScene();


const clock = new THREE.Clock();
function loop() {
    const dt = clock.getDelta();
    if (animationMixer) {
        animationMixer.update(dt);
    }
    window.requestAnimationFrame(loop);
}
window.requestAnimationFrame(loop);


useRaycastMeshes();
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0;
window.addEventListener("click", evt => {
    const mousePos = {
        x: (evt.clientX / window.innerWidth) * 2 - 1,
        y: -(evt.clientY / window.innerHeight) * 2 + 1
    }
    raycaster.setFromCamera(mousePos, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if (hits?.length) {
        const hit = hits[0];
        const obj = hit.object;
        console.log("HIT", obj.name, hit)
        const raycastMesh = getRaycastMesh(obj);
        if (raycastMesh) {
            const newMesh = new THREE.Mesh(raycastMesh, new THREE.MeshBasicMaterial({ color: 0xffddff, wireframe: true, transparent: true, opacity: .5, depthTest: false }));
            newMesh.matrix.copy(obj.matrixWorld);
            newMesh.matrixAutoUpdate = false;
            scene.add(newMesh);
            setTimeout(() => {
                newMesh.removeFromParent();
            }, 1000)
        }
    }
})





const pane = new Pane();
pane.addButton({
    title: 'Change Scene',
}).on('click', loadScene);

pane.addButton({
    title: 'Toggle Wireframe',
}).on('click', () => {
    wireframe = !wireframe;
    scene.traverse(child => {
        if (child instanceof THREE.Mesh) {
            child.material.wireframe = wireframe;
        }
    })
});
