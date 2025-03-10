# glTF progressive

LODs on steroids for glTF, GLB or VRM files with density based loading for meshes or texture for any three.js based project.

## Features
- One line integration in any three.js based engine/project
- Mesh LOD support
- Texture LOD support
- LOD levels are loaded on demand based on mesh screen density
- Low poly LOD meshes can easily be used for raycasting for smooth interactions with high-poly meshes
- Cloud generation and loading support via [cloud.needle.tools](https://cloud.needle.tools) for glTF, GLB & VRM assets

## Examples

Examples are in the `/examples` directory. Live versions can be found in the links below.  

- [Vanilla three.js](https://engine.needle.tools/demos/gltf-progressive/threejs/) - multiple models and animations
- [React Three Fiber](https://engine.needle.tools/demos/gltf-progressive/r3f/)
- \<model-viewer\> 
  - [single \<model-viewer> element](https://engine.needle.tools/demos/gltf-progressive/modelviewer) 
  - [multiple \<model-viewer> elements](https://engine.needle.tools/demos/gltf-progressive/modelviewer-multiple)
- [Needle Engine](https://stackblitz.com/edit/needle-engine-gltf-progressive?file=src%2Fmain.ts)
- [Progressive VRM 14 MB to 1 MB](https://cloud.needle.tools/view/91b4450/262927895)

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
            "@needle-tools/gltf-progressive": "https://cdn.jsdelivr.net/npm/@needle-tools/gltf-progressive/gltf-progressive.min.js"
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
    <script type="module" src="https://cdn.jsdelivr.net/npm/@needle-tools/gltf-progressive/gltf-progressive.min.js"></script>
    <!-- Include model-viewer -->
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
</head>
<body>

    <model-viewer src="https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb" camera-controls auto-rotate></model-viewer>
    
</body>
```

### Needle Engine

[Needle Engine](https://needle.tools) natively supports progressive loading of these glTF files! See [docs.needle.tools](https://docs.needle.tools) for more information. 


Use [cloud.needle.tools](https://cloud.needle.tools) to generate LODs for your assets now.


# Contact ✒️
<b>[🌵 needle — tools for creators](https://needle.tools)</b> • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools)

