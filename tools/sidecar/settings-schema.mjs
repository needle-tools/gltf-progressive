export const PIPELINE_PACKAGE = "@needle-tools/gltf-build-pipeline";
export const PIPELINE_VERSION = "3.0.0-alpha.2";

export const DEFAULT_SETTINGS = {
  pipeline: {
    progressive: true,
    compress: true,
    cache: true,
    debug: false,
  },
  gltf: {
    usecase: "product",
    textures: {
      lods: true,
    },
    meshes: {
      lods: true,
    },
    audio: {
      enabled: false,
      bitrate: 128,
    },
    exr: {
      enabled: true,
    },
  },
};

export const SETTINGS_SCHEMA = {
  version: 1,
  pipeline: {
    package: PIPELINE_PACKAGE,
    version: PIPELINE_VERSION,
    command: "transform",
  },
  defaults: DEFAULT_SETTINGS,
  sections: [
    {
      id: "pipeline",
      label: "Pipeline",
      fields: [
        {
          path: "pipeline.progressive",
          label: "Progressive",
          type: "boolean",
          help: "Generate NEEDLE_progressive mesh and texture LOD artifacts.",
        },
        {
          path: "pipeline.compress",
          label: "Compress",
          type: "boolean",
          help: "Run the pipeline packing and compression pass after progressive generation.",
        },
        {
          path: "pipeline.cache",
          label: "Cache",
          type: "boolean",
          help: "Reuse the build-pipeline cache when supported by the local tooling.",
        },
        {
          path: "pipeline.debug",
          label: "Verbose Logs",
          type: "boolean",
          help: "Forward debug logging from the local build pipeline.",
        },
      ],
    },
    {
      id: "profile",
      label: "Profile",
      fields: [
        {
          path: "gltf.usecase",
          label: "Use Case",
          type: "select",
          options: [
            { value: "default", label: "Default" },
            { value: "product", label: "Product" },
            { value: "world", label: "World" },
          ],
          help: "High-level optimization profile consumed by the build pipeline.",
        },
      ],
    },
    {
      id: "lods",
      label: "LOD Generation",
      fields: [
        {
          path: "gltf.textures.lods",
          label: "Texture LODs",
          type: "boolean",
          help: "Generate progressively loaded texture LOD files.",
        },
        {
          path: "gltf.meshes.lods",
          label: "Mesh LODs",
          type: "boolean",
          help: "Generate progressively loaded mesh LOD files.",
        },
      ],
    },
    {
      id: "media",
      label: "Media",
      fields: [
        {
          path: "gltf.exr.enabled",
          label: "EXR / HDR",
          type: "boolean",
          help: "Convert EXR textures through the pipeline PMREM path when available.",
        },
        {
          path: "gltf.audio.enabled",
          label: "Audio",
          type: "boolean",
          help: "Compress externally referenced lossless audio when ffmpeg is available.",
        },
        {
          path: "gltf.audio.bitrate",
          label: "Audio Bitrate",
          type: "number",
          min: 32,
          max: 256,
          step: 16,
          unit: "kbps",
          help: "Opus bitrate used for external audio compression.",
        },
      ],
    },
  ],
};

