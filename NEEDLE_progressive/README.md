# NEEDLE Progressive Extensions Schema

This document describes the NEEDLE progressive mesh and texture extensions.

## Base Types

### NEEDLE_progressive_model_LOD

Represents a single Level of Detail (LOD) file reference.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | Relative path to the LOD file |
| `hash` | `string` | No | Optional hash for file verification |

### NEEDLE_progressive_ext

Base extension format for progressive assets.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `guid` | `string` | Yes | Unique identifier of the object (texture, mesh) the LODs belong to |
| `lods` | `Array<NEEDLE_progressive_model_LOD>` | Yes | Array of available LOD levels |

## Extension Types

### NEEDLE_ext_progressive_texture

Texture extension for progressive texture loading, inheriting from `NEEDLE_progressive_ext`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `guid` | `string` | Yes | Inherited from base type |
| `lods` | `Array<TextureLOD>` | Yes | Array of texture LOD levels with dimensions |

**TextureLOD Properties:**
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | Relative path to the texture LOD file |
| `hash` | `string` | No | Optional hash for file verification |
| `width` | `number` | Yes | Texture width in pixels |
| `height` | `number` | Yes | Texture height in pixels |

### NEEDLE_ext_progressive_mesh

Mesh extension for progressive mesh loading, inheriting from `NEEDLE_progressive_ext`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `guid` | `string` | Yes | Inherited from base type |
| `lods` | `Array<MeshLOD>` | Yes | Array of mesh LOD levels with geometry data |

**MeshLOD Properties:**
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string` | Yes | Relative path to the mesh LOD file |
| `hash` | `string` | No | Optional hash for file verification |
| `densities` | `number[]` | Yes | Density values per primitive |
| `indexCount` | `number` | No | Number of indices in LOD0 |
| `vertexCount` | `number` | No | Number of vertices in LOD0 |

## Usage Examples

### Texture Extension Example

```json
{
  "guid": "texture-asset-123",
  "lods": [
    {
      "path": "./textures/image_diffuse_1024.glb",
      "hash": "abc123",
      "width": 1024,
      "height": 1024
    },
    {
      "path": "./textures/image_diffuse_512.glb",
      "width": 512,
      "height": 512
    }
  ]
}
```

### Mesh Extension Example

```json
{
  "guid": "mesh-asset-456",
  "lods": [
    {
      "path": "./meshes/mesh_0_high_detail.glb",
      "hash": "def456",
      "indexCount": 15000,
      "vertexCount": 8000,
      "densities": [100000, 50000]
    },
    {
      "path": "./meshes/mesh_1_low_detail.glb",
      "indexCount": 3000,
      "vertexCount": 1500,
      "densities": [100000, 50000]
    }
  ]
}
```