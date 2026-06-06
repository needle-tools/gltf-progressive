# glTF Progressive Three Compat Matrix

This optional matrix checks `@needle-tools/gltf-progressive` against cached Three.js versions and renderer modes.

Run it with:

```sh
npm run test:compat:three
```

The harness:

- uses `@needle-tools/three-test-matrix`
- caches Three.js packages in the shared machine cache, by default `$(npm config get cache)/_three-test-matrix/three-versions`
- caches the Forgotten Knight root GLBs and referenced progressive GLBs in the shared machine cache, by default `$(npm config get cache)/_three-test-matrix/models/gltf-progressive/forgotten-knight`
- generates import-map pages in `.cache/gltf-progressive-three-compat-pages`
- generates one browser worker bundle per cached Three.js runtime
- runs the generated pages with Vitest browser tests

Default foreign Three.js versions:

- `0.169.0`
- `0.175.0`
- `0.180.0`
- `0.184.0`

The cache step also asks npm for the latest published `three` version and includes it automatically when it is not already listed.

Pass `--cache-root=/path/to/cache` through the cache script to override the shared cache location.

Renderer modes:

- `webgl`
- `webgpu-force-webgl2`
- `webgpu`

The suite verifies package imports, GLTFLoader configuration, LOD manager render-list access, the `THREE.Timer`/`THREE.Clock` compatibility path, all cached Forgotten Knight root fixtures in the page, their referenced progressive GLBs in the local cache, and a real browser worker load where `window` and `document` are absent.
