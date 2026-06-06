import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  createNeedleConfig,
  createPipelineArgs,
  normalizeSettings,
  parseMultipart,
  redactPipelineArgs,
  sanitizeFilename,
} from "../../tools/sidecar/job-core.mjs";

test("normalizes browser settings into build-pipeline config", () => {
  const settings = normalizeSettings({
    pipeline: { progressive: false, compress: false, cache: "false" },
    gltf: {
      usecase: "world",
      textures: { lods: "false" },
      meshes: { lods: true },
      audio: { enabled: true, bitrate: 999 },
      exr: { enabled: false },
    },
  });

  assert.equal(settings.pipeline.progressive, true);
  assert.equal(settings.pipeline.compress, false);
  assert.equal(settings.pipeline.cache, false);
  assert.equal(settings.gltf.usecase, "world");
  assert.equal(settings.gltf.textures.lods, false);
  assert.equal(settings.gltf.audio.bitrate, 256);
  assert.deepEqual(createNeedleConfig(settings), {
    gltf: {
      usecase: "world",
      textures: { lods: false },
      meshes: { lods: true },
      audio: { enabled: true, bitrate: 256 },
      exr: { enabled: false },
    },
  });
});

test("creates npx args without leaking absent auth token", () => {
  const args = createPipelineArgs({
    inputFile: "/tmp/in.glb",
    outputFile: "/tmp/out.glb",
    configFile: "/tmp/needle.config.json",
    settings: { pipeline: { debug: true }, gltf: { usecase: "product" } },
  });

  assert.deepEqual(args.slice(0, 4), [
    "--yes",
    "@needle-tools/gltf-build-pipeline@3.0.0-alpha.2",
    "transform",
    "/tmp/in.glb",
  ]);
  assert.equal(args.includes("--auth-token"), false);
  assert.equal(args.includes("--debug"), true);
});

test("does not pass needle-cloud access tokens as build-pipeline JWT args", () => {
  const args = createPipelineArgs({
    inputFile: "/tmp/in.glb",
    outputFile: "/tmp/out.glb",
    configFile: "/tmp/needle.config.json",
    settings: {},
    authToken: "nc_access_token",
  });

  assert.equal(args.includes("--auth-token"), false);
  assert.equal(args.join(" ").includes("nc_access_token"), false);
});

test("redacts build-pipeline auth tokens from public command logs", () => {
  const args = createPipelineArgs({
    inputFile: "/tmp/in.glb",
    outputFile: "/tmp/out.glb",
    configFile: "/tmp/needle.config.json",
    settings: {},
    authToken: "jwt.secret.value",
  });
  const publicArgs = redactPipelineArgs(args);

  assert.equal(publicArgs.includes("jwt.secret.value"), false);
  assert.equal(publicArgs.includes("--auth-token=[redacted]"), true);
  assert.equal(publicArgs.includes("--auth-token"), false);
});

test("parses multipart file and fields", () => {
  const boundary = "needle-boundary";
  const body = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="settings"`,
      "",
      `{"gltf":{"usecase":"product"}}`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="asset"; filename="../bad name.glb"`,
      `Content-Type: model/gltf-binary`,
      "",
      "glb-bytes",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
    "utf8",
  );

  const parsed = parseMultipart(body, `multipart/form-data; boundary=${boundary}`);
  assert.equal(parsed.fields.settings, `{"gltf":{"usecase":"product"}}`);
  assert.equal(parsed.files.asset.filename, "bad name.glb");
  assert.equal(parsed.files.asset.contentType, "model/gltf-binary");
  assert.equal(parsed.files.asset.data.toString("utf8"), "glb-bytes");
});

test("sanitizes filenames for local job folders", () => {
  assert.equal(sanitizeFilename("../../hello?.glb"), "hello_.glb");
  assert.equal(sanitizeFilename(""), "asset.glb");
});
