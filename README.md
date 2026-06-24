# glTF progressive

**Blazingly fast loading for glTF, GLB or VRM files** + smart density based LOD selection for meshes or texture for any three.js based project.  

## Installation
`npm i @needle-tools/gltf-progressive`

```ts
import { useNeedleProgressive } from "@needle-tools/gltf-progressive";

// Before loading with GLTFLoader   
// call 'useNeedleProgressive' once to register the loader plugin
useNeedleProgressive(gltf_loader, webgl_renderer)
```

## Features
- [**Single line integration**](#usage) for any three.js project
- Mesh & Texture LOD support
  - LOD levels are loaded lazily on demand based on **mesh screen density** instead of pure distance ensuring consistent and predictable quality
- Mobile [data-saving](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData) support
- Automatically handles KTX2, WebP, Draco, Meshopt... for you 
- Asset generation and loading support via [Needle Cloud](https://cloud.needle.tools) for glTF, GLB & VRM assets
- Faster raycasting thanks to low poly LOD meshes: smooth interactions with high-poly meshes

## Examples

Examples are in the `/examples` directory. Live versions can be found in the links below.  

To view the examples locally with the current checkout's runtime, run `npm run examples:serve` and open the printed examples index URL.

- [Loading comparisons](https://stackblitz.com/edit/gltf-progressive-comparison?file=package.json,index.html)
- [Vanilla three.js](https://engine.needle.tools/demos/gltf-progressive/threejs/) - multiple models and animations
- [React Three Fiber](https://engine.needle.tools/demos/gltf-progressive/r3f/)
- \<model-viewer\> 
  - [single \<model-viewer> element](https://engine.needle.tools/demos/gltf-progressive/modelviewer) 
  - [multiple \<model-viewer> elements](https://engine.needle.tools/demos/gltf-progressive/modelviewer-multiple)
- [Needle Engine](https://stackblitz.com/edit/needle-engine-gltf-progressive?file=src%2Fmain.ts)
- [Needle Cloud](https://cloud.needle.tools/view?file=Z23hmXBZN45qJ-ZN45qJ-world)
- `examples/webgpu` - WebGPU renderer
- `examples/offscreen` - main-thread OffscreenCanvas rendering
- `examples/worker-rendering` - OffscreenCanvas rendering in a Worker

**Interactive Examples**:
- [Stackblitz](https://stackblitz.com/@marwie/collections/gltf-progressive)
- [Codesandbox](https://codesandbox.io/dashboard/sandboxes/gltf-progressive)


<!-- ## Videos
<a href="https://youtu.be/7EjL0BRfIp8" target="_blank">![Progressive glTF — comparison with traditional three.js optimization
](https://engine.needle.tools/demos/gltf-progressive/video-comparison-throttled-thumbnail-1.webp)</a>  
*Progressive glTF — comparison with traditional three.js optimization* 
  
<br/> -->

# Usage

## three.js

**gltf-progressive** works with any three.js project and should also work with any three.js version.  

Full three.js example at: `examples/threejs`

```ts
const gltfLoader = new GLTFLoader();
const url = "https://cloud.needle.tools/-/assets/Z23hmXBZN45qJ-ZN45qJ-world/file";

// register the progressive loader plugin
useNeedleProgressive(gltfLoader, renderer)

// just call the load method as usual
gltfLoader.load(url, gltf => {
    scene.add(gltf.scene)
})
```

```html
<head>
    <!-- Add the threejs import map to your HTML head section -->
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",
            "three/examples/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/",
            "@needle-tools/gltf-progressive": "https://cdn.jsdelivr.net/npm/@needle-tools/gltf-progressive@3.6.0-canary.5401de9/gltf-progressive.min.js"
        }
    }
    </script>
</head>
```


## React Three Fiber

Full react-three-fiber example at: `examples/react-three-fiber`

```ts
function MyModel() {
  const { gl } = useThree()
  const url = 'https://cloud.needle.tools/-/assets/Z23hmXBZN45qJ-ZN45qJ-world/file'
  const { scene } = useGLTF(url, false, false, (loader) => {
    useNeedleProgressive(loader as any, gl as any)
  })
  return <primitive object={scene} />
}
```

## Google \<model-viewer\>

Full model-viewer example at: `examples/modelviewer.html`

```html
<head>
    <!-- Include threejs import map -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
                "three/": "https://unpkg.com/three@0.184.0/"
            }
        }
    </script>
    <!-- Include gltf-progressive -->
    <script type="module" src="https://cdn.jsdelivr.net/npm/@needle-tools/gltf-progressive@3.6.0-canary.5401de9/gltf-progressive.min.js"></script>
    <!-- Include model-viewer -->
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
</head>
<body>

    <model-viewer src="https://cloud.needle.tools/-/assets/Z23hmXBZN45qJ-ZN45qJ-world/file" camera-controls auto-rotate></model-viewer>
    
</body>
```

## Needle Engine

[Needle Engine](https://needle.tools) natively supports progressive loading of these glTF files! See [docs.needle.tools/gltf-progressive](https://engine.needle.tools/docs/gltf-progressive/) for more information. 


# How can I generate assets for progressive loading
Use [Needle Cloud](https://cloud.needle.tools) to generate LODs for your assets (includes hosting, global CDN, password protection, versioning, CLI support...) or use one of the [Needle integrations for Unity or Blender](https://engine.needle.tools/docs/getting-started/#choose-your-workflow).


# Advanced

### Add a LOD Manager plugin to receive callbacks per object
Create a new class extending `NEEDLE_progressive_plugin` and add your plugin by calling the static `LODSManager.addPlugin(<your_plugin_instance>)`

### Wait for LODs being loaded
Call `lodsManager.awaitLoading(<opts?>)` to receive a promise that will resolve when all object LODs that start loading during the next frame have finished to update. Use the optional options parameter to e.g. wait for more frames.

### Worker loading and device pixel ratio
Progressive mesh and texture LOD files can be loaded in a worker by enabling the `gltf-progressive-worker` URL parameter.

```txt
https://example.test/viewer?gltf-progressive-worker
```

LOD selection uses the renderer pixel ratio. For matching results across main-thread, worker, or offscreen rendering, configure the renderer with the same device pixel ratio before calling `useNeedleProgressive` or `LODsManager.get`.

```ts
const renderer = new WebGLRenderer({ canvas });
renderer.setPixelRatio(devicePixelRatio);

useNeedleProgressive(gltfLoader, renderer);
```

In a worker or offscreen renderer, pass the display DPR from the main thread and apply it to the renderer there as well.

```ts
// main thread
worker.postMessage({ type: "init", devicePixelRatio: window.devicePixelRatio });

// worker / offscreen renderer
const renderer = new WebGLRenderer({ canvas: offscreenCanvas });
renderer.setPixelRatio(message.devicePixelRatio);
useNeedleProgressive(gltfLoader, renderer);
```

If the renderer does not expose a pixel ratio, gltf-progressive falls back to `globalThis.devicePixelRatio` and then `1`.

### Global LOD level override

### LOD Manager settings
These settings are available on the LOD manager instance:
- `targetTriangleDensity` -  The target triangle density is the desired max amount of triangles on screen when the mesh is filling the screen.  
- `skinnedMeshAutoUpdateBoundsInterval` - The interval in frames to automatically update the bounds of skinned meshes. 
- `updateInterval` - The update interval in frames. If set to 0, the LODs will be updated every frame. If set to 2, the LODs will be updated every second frame, etc.
- `pause` - If set to true, the LODsManager will not update the LODs.
- `manual` - When set to true the LODsManager will not update the LODs. This can be used to manually update the LODs using the `update` method. Otherwise the LODs will be updated automatically when the renderer renders the scene.
- `overrideLodLevel` - Can be set to any number between 0 and 6 to override the lod level to be loaded. To disable the override again set it to `undefined`.

### Concurrent loading limit
`maxConcurrentLoadingTasks` controls how many LOD resources (meshes and textures) can be loaded simultaneously. When the limit is reached, additional requests are queued and processed as previous ones finish. Default: `50`.

```ts
import { NEEDLE_progressive } from "@needle-tools/gltf-progressive";

NEEDLE_progressive.maxConcurrentLoadingTasks = 20;
```

### Automatically use low-poly meshes for raycasting
Simply call `useRaycastMeshes(true)` to enable faster raycasting when using the the THREE.Raycaster. This can again be disabled by calling `useRaycastMeshes(false)`. Calling this method is only necessary once to enable it.  

### Get LOW poly meshes for physics simulation
Call `getRaycastMesh(<your_mesh_object>)`


# Extension
Read more about the [NEEDLE_progressive extension](./NEEDLE_progressive/README.md)

# Documentation
Read more about Needle Progressive GLTF loading in the [Needle Engine documentation](https://docs.needle.tools/engine/gltf-progressive/)

# Contact ✒️
<b>[🌵 needle — tools for creators](https://needle.tools)</b> • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools)
