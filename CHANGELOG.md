# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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