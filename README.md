# glTF progressive

Support for loading of glTF or GLB files with progressive mesh or texture data for three.js based engines.



## Examples

Examples are in the `/examples` directory. Live versions can be found in the links below.  

- [Vanilla three.js](https://engine.needle.tools/demos/gltf-progressive/threejs/)
- [\<model-viewer\>](https://engine.needle.tools/demos/gltf-progressive/modelviewer)
- [React Three Fiber](https://engine.needle.tools/demos/gltf-progressive/r3f/)


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

The full example can be found in `examples/modelviewer.html`

```html
<head>
    <!-- Include the import map and the gltf-progressive package -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three/build/three.module.js",
                "three/": "https://unpkg.com/three/"
            }
        }
    </script>
    <script type="module" src="https://www.unpkg.com/@needle-tools/gltf-progressive@latest"></script>
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
</head>
<body>

    <model-viewer src="https://engine.needle.tools/demos/gltf-progressive/assets/church/model.glb" camera-controls auto-rotate></model-viewer>
    
    ...
```


# Contact ✒️
<b>[🌵 needle — tools for creators](https://needle.tools)</b> • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools)

