# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [2.1.3] - 2025-03-19
- Fix: DracoLoader cache busting due to range request

## [2.1.2] - 2025-03-10
- Chore: Update examples

## [2.1.1] - 2025-02-20
- Fix: Handle failed progressive texture loading due to e.g. offline or missing files 
- Fix: Regression causing custom KTX2Transcoder location not working for e.g. offline usage

## [2.1.0] - 2025-02-13
- Bump version

## [2.1.0-alpha.6] - 2025-02-12
- Fix: `?debugprogressive` now also switches texture LODs

## [2.1.0-alpha.5] - 2025-01-30
- Add: initial support for Orthographic cameras

## [2.1.0-alpha.4] - 2025-01-29
- Fix: LOD not loading if the max texture resolution is too small

## [2.1.0-alpha.3] - 2025-01-21
- Change: Load Draco and KTX loaders as soon as possible
- Fix: Make `GET` request to draco endpoint with 1 byte range instead of HEAD request. The HEAD request did return the whole draco loader.

## [2.1.0-alpha.2] - 2025-01-17
- Add: expose methods in globalThis/window at `Needle.gltfProgressive`

## [2.1.0-alpha.1] - 2025-01-15
- Fix: issue where `getMeshLOD` for multi-material meshes would not return the correct index if called multiple times at the same time 

## [2.1.0-alpha] - 2025-01-14
- Bump three types to r169

## [2.0.0-alpha.3] - 2025-01-02
- Change: Load higher texture resolution by default

## [2.0.0-alpha.1] - 2024-12-09
- Add: `Accept` header options for Needle Cloud requests

## [1.2.15] - 2024-10-21
- Fix: internal window parameter access causing issue with SSR

## [1.2.13] - 2024-10-06
- Update README

## [1.2.12] - 2024-09-23
- Add: `assignTextureLOD` now also accepts mesh as parameter
- Change: improved `assignTextureLOD` typing

## [1.2.11] - 2024-09-11
- Fix: draco and KTX decoder path handling when gstatic can not be reached and user set path

## [1.2.10] - 2024-09-10
- Fix: loading and assigning texture LOD for ShaderMaterial and RawShaderMaterial

## [1.2.9] - 2024-07-29
- Fix: server side rendering fixes

## [1.2.8] - 2023-07-19
- Add: repository url

## [1.2.7] - 2023-07-18
- Fix: include `type: module`

## [1.2.5] - 2023-07-16
- Remove: Frustum cull check because we're already operating on the latest renderlist

## [1.2.5-beta] - 2023-07-09
- Change: Update skinned mesh bounding box every 30 frames using the lowres mesh version

## [1.2.4-beta.1] - 2023-07-09
- Add: LODsManager `manual` property which can be used to manually update the LODs in the scene by calling `LODsManager.update(scene, camera)`
- Fix: updating LODs in WebXR

## [1.2.4-beta] - 2023-07-05
- Change: `createLoaders` now returns created loaders and decoders to be re-used

## [1.2.3-beta] - 2023-07-04
- Add: support for transmissive objects

## [1.2.3-alpha.3] - 2023-07-01
- Add: prevent loading highres textures when user has enabled data-save mode

## [1.2.3-alpha.2] - 2023-06-27
- Fix: error caused by parser associations containing `undefined` value

## [1.2.3-alpha.1] - 2023-06-25
- Internal: rename `setRaycastMesh` to `registerRaycastMesh`

## [1.2.3-alpha] - 2023-06-24
- Change: automatically change LOD update interval based on framerate

## [1.2.2-alpha.4] - 2023-06-20
- Add: Register version in global "GLTF_PROGRESSIVE_VERSION" variable
- Add: `<model-viewer>` elements added document at any time are now properly registered 
- Fix: LOD updates for multiple `<model-viewer>` elements
- Fix: Initial render tick for a few frames for `<model-viewer>` to trigger LOD updates when the model-viewer element is not animated or interacted with
- Change: `<model-viewer>` elements will fetch a slightly higher texture LOD

## [1.2.1-alpha.4] - 2023-06-19
- Fix: SkinnedMesh bounds calculation

## [1.2.1-alpha.3] - 2023-06-15
- update the README

## [1.2.1-alpha.2] - 2023-06-15
- fix: Ortographic camera causing LODs being falsely updated
- fix: regression introduced in 1.2.1-alpha
- fix: error when trying to load a LOD glTF directly 
- fix: issues caused by instanceof in local development environments

## [1.2.0-alpha.9] - 2023-06-13
- fix: issue where skinned mesh matrix was falsely applied to calculate screen size
- fix: use bounding box from SkinnedMesh object

## [1.2.0-alpha.6] - 2023-06-12
- fix: minor bug where opened glTF has `NEEDLE_progressive` extension but no lods array because the glTF is a LOD variant

## [1.2.0-alpha.5] - 2023-06-10
- fix: safeguard when `registerMesh` or `registerTexture` are being called with invalid data
- examples: update vanilla threejs example

## [1.2.0-alpha.4] - 2023-06-07
- add: `useRaycastMeshes` method:
  ```ts
    // call to enable raycasting with low poly raycast meshes
    // this can be done once in your project
    useRaycastMeshes(true);
    
    // then use the raycaster as usual
    const raycaster = new Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    // call to disable raycasting with low polwy meshes
    useRaycastMeshes(false);
  ```

## [1.2.0-alpha.3] - 2023-06-06
- add: automatically load the highest LOD first to show a slightly better quality level as soon as possible
- fix: improve Texture LOD selection by taking LOD level height into account
- fix: correctly assign LOD level information to initially loaded texture

## [1.1.0-alpha.2] - 2023-06-05
- fix: register LOD information for meshes that don't have associations

## [1.1.0-alpha] - 2023-06-03
- add: loading of multiple texture LOD levels
- fix: issue where material LODs where not updated when the material was cloned
- change: clamp screen coverage when near plane intersects with the object bounds
- change: skip CubeCamera setup
- change: handle cases where an object has only texture LODs

## [1.0.0-alpha.19] - 2023-05-31
- add `LODsManager.plugins` getter 

## [1.0.0-alpha.18] - 2023-05-30
- update README

## [1.0.0-alpha.16] - 2023-05-29
- fix: LODs manager now clamps to LOD 0 if the near plane is inside the bounds
- change: Ignore certain material in lods update loop 

## [1.0.0-alpha.15] - 2023-05-25
- add: `getRaycastMesh` method
- add: LODsManager does now expose `targetTriangleDensity`. The target triangle density is the desired max amount of triangles on screen when the mesh is filling the screen. 
- change: create LODsManager via `LODsManager.get(renderer)`

## [1.0.0-alpha.13] - 2023-05-24
- fix: modelviewer error when trying to access undefined texture extensions

## [1.0.0-alpha.13] - 2023-05-24
- add: vanilla three.js example
- fix: texture LODs losing filter setting

## [1.0.0-alpha.12] - 2023-05-19
- fix: update LODs when using postprocessing

## [1.0.0-alpha.11] - 2023-05-17
- add: expose `setDracoDecoderLocation` and `setKTX2TranscoderLocation`
- fix: allow using draco decoder and ktx2 transcoder from local filepath

## [1.0.0-alpha.10] - 2023-05-07
- fix: progressive assets are now only updated during the main canvas render call and not e.g. when rendering to a texture

## [1.0.0-alpha.9] - 2023-05-03
- fix: handle loading of ShaderMaterial for VRM progressive textures

## [1.0.0-alpha.8] - 2023-05-03
- fix: handle transparent materials

## [1.0.0-alpha.7] - 2023-05-01
- fix: Handle modelviewer `src` set as property but not as attribute
- change: Remove sourcemap

## [1.0.0-alpha.6] - 2023-05-01
- fix: LOD mesh assignment for multi-material meshes (meshes with multiple primitives)

## [1.0.0-alpha.5] - 2023-04-30
- initial version