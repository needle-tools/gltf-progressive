# glTF progressive

Support for loading of glTF or GLB files with progressive mesh or texture data for three.js based engines.

## Features
- Automatic loading of mesh and texture LODs.   
- High quality LOD levels are loaded on demand based on screen density.
- Use low-poly LOD meshes for raycasting which allows the usage of high-poly meshes with smooth interaction
- Use [cloud.needle.tools](https://cloud.needle.tools) for processing glTF, GLB & VRM assets

## Examples

Examples are in the `/examples` directory. Live versions can be found in the links below.  

- [Vanilla three.js](https://engine.needle.tools/demos/gltf-progressive/threejs/) - multiple models and animations
- [React Three Fiber](https://engine.needle.tools/demos/gltf-progressive/r3f/)
- \<model-viewer\> 
  - [single \<model-viewer> element](https://engine.needle.tools/demos/gltf-progressive/modelviewer) 
  - [multiple \<model-viewer> elements](https://engine.needle.tools/demos/gltf-progressive/modelviewer-multiple)
- [Needle Engine](https://stackblitz.com/edit/needle-engine-gltf-progressive?file=src%2Fmain.ts)

**Interactive Examples**:
- [Stackblitz](https://stackblitz.com/@marwie/collections/gltf-progressive)
- [Codesandbox](https://codesandbox.io/dashboard/sandboxes/gltf-progressive)


<br/>
<video width="320" controls autoplay src="https://engine.needle.tools/demos/gltf-progressive/video.mp4">
    <source src="https://engine.needle.tools/demos/gltf-progressive/video.mp4" type="video/mp4">
</video>


## Usage

### react three fiber

Full example in `examples/react-three-fiber`

```ts
function ChurchModel() {
  const { gl } = useThree()
  const url = 'https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb'
  const { scene } = useGLTF(url, false, false, (loader) => {
    useNeedleProgressive(url, gl, loader as any)
  })
  return <primitive object={scene} />
}
```

### threejs (CDN, no bundler)

The full example can be found at `examples/threejs`

```html
<head>
    <!-- Add the threejs import map to your HTML head section -->
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@latest/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@latest/examples/jsm/",
            "three/examples/": "https://cdn.jsdelivr.net/npm/three@latest/examples/",
            "@needle-engine/gltf-progressive": "https://www.unpkg.com/@needle-tools/gltf-progressive@latest"
        }
    }
    </script>
</head>
```

In your script:
```ts
const gltfLoader = new GLTFLoader();

const url = "https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb";

// register the progressive loader
useNeedleProgressive(url, renderer, gltfLoader)

// just call the load method as usual
gltfLoader.load(url, gltf => {
    console.log(gltf)
    scene.add(gltf.scene)
    gltf.scene.position.y += .95;
})
```


### \<model-viewer\>

The example can be found in `examples/modelviewer.html`

```html
<head>
    <!-- Include threejs import map -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three/build/three.module.js",
                "three/": "https://unpkg.com/three/"
            }
        }
    </script>
    <!-- Include gltf-progressive -->
    <script type="module" src="https://www.unpkg.com/@needle-tools/gltf-progressive@latest"></script>
    <!-- Include model-viewer -->
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
</head>
<body>

    <model-viewer src="https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb" camera-controls auto-rotate></model-viewer>
    
</body>
```

### Needle Engine

[Needle Engine](https://needle.tools) natively supports progressive loading of these glTF files! See [docs.needle.tools](https://docs.needle.tools) for more information.


# Contact ✒️
<b>[🌵 needle — tools for creators](https://needle.tools)</b> • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools)

