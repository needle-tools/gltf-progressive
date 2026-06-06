import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SETTINGS, PIPELINE_PACKAGE, PIPELINE_VERSION } from "./settings-schema.mjs";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sanitizeFilename(name) {
  const basename = path.basename(String(name || "asset.glb"));
  const clean = basename.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return clean || "asset.glb";
}

function readPath(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function writePath(object, dottedPath, value) {
  const parts = dottedPath.split(".");
  let target = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    target[key] ||= {};
    target = target[key];
  }
  target[parts[parts.length - 1]] = value;
}

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function coerceNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizeSettings(input = {}) {
  const defaults = clone(DEFAULT_SETTINGS);
  const settings = clone(DEFAULT_SETTINGS);

  const fields = [
    ["pipeline.progressive", "boolean"],
    ["pipeline.compress", "boolean"],
    ["pipeline.cache", "boolean"],
    ["pipeline.debug", "boolean"],
    ["gltf.usecase", "select"],
    ["gltf.textures.lods", "boolean"],
    ["gltf.meshes.lods", "boolean"],
    ["gltf.audio.enabled", "boolean"],
    ["gltf.audio.bitrate", "number", { min: 32, max: 256 }],
    ["gltf.exr.enabled", "boolean"],
  ];

  for (const [fieldPath, type, options] of fields) {
    const incoming = readPath(input, fieldPath);
    const fallback = readPath(defaults, fieldPath);
    if (incoming === undefined) continue;
    if (type === "boolean") writePath(settings, fieldPath, coerceBoolean(incoming, fallback));
    else if (type === "number") writePath(settings, fieldPath, coerceNumber(incoming, fallback, options));
    else if (fieldPath === "gltf.usecase") {
      writePath(settings, fieldPath, ["default", "product", "world"].includes(incoming) ? incoming : fallback);
    }
  }

  if (!settings.pipeline.progressive && !settings.pipeline.compress) {
    settings.pipeline.progressive = true;
  }
  return settings;
}

export function createNeedleConfig(settings) {
  const normalized = normalizeSettings(settings);
  return { gltf: normalized.gltf };
}

export function createPipelineArgs({ inputFile, outputFile, configFile, settings, authToken }) {
  const normalized = normalizeSettings(settings);
  const args = [
    "--yes",
    `${PIPELINE_PACKAGE}@${PIPELINE_VERSION}`,
    "transform",
    inputFile,
    outputFile,
    "--progressive",
    String(normalized.pipeline.progressive),
    "--compress",
    String(normalized.pipeline.compress),
    "--cache",
    String(normalized.pipeline.cache),
    "--config",
    configFile,
  ];
  if (normalized.pipeline.debug) {
    args.push("--debug", "true");
  }
  if (authToken && !isNeedleCloudAccessToken(authToken)) {
    args.push("--auth-token", authToken);
  }
  return args;
}

export function redactPipelineArgs(args) {
  const publicArgs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--auth-token") {
      publicArgs.push("--auth-token=[redacted]");
      i += 1;
      continue;
    }
    publicArgs.push(args[i]);
  }
  return publicArgs;
}

export function isNeedleCloudAccessToken(token) {
  return typeof token === "string" && token.startsWith("nc_");
}

export function parseMultipart(buffer, contentType = "") {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) throw new Error("Missing multipart boundary.");
  const boundary = match[1] || match[2];
  const body = buffer.toString("binary");
  const chunks = body.split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const rawChunk of chunks) {
    if (!rawChunk || rawChunk === "--\r\n" || rawChunk === "--") continue;
    let part = rawChunk;
    if (part.startsWith("\r\n")) part = part.slice(2);
    if (part.endsWith("\r\n")) part = part.slice(0, -2);
    if (part.endsWith("--")) part = part.slice(0, -2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd);
    let value = part.slice(headerEnd + 4);
    if (value.endsWith("\r\n")) value = value.slice(0, -2);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] || "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    if (!name) continue;
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    const contentTypeHeader = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || "application/octet-stream";
    const data = Buffer.from(value, "binary");
    if (filename !== undefined) {
      files[name] = { filename: sanitizeFilename(filename), contentType: contentTypeHeader, data };
    } else {
      fields[name] = data.toString("utf8");
    }
  }
  return { fields, files };
}

export async function collectArtifacts(rootDir, jobId) {
  const entries = [];

  async function visit(dir) {
    const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const fullPath = path.join(dir, child.name);
      if (child.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      const stat = await fs.stat(fullPath);
      const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
      entries.push({
        name: child.name,
        path: relativePath,
        size: stat.size,
        url: `/api/jobs/${jobId}/files/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
        kind: artifactKind(child.name),
      });
    }
  }

  await visit(rootDir);
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.path.localeCompare(b.path);
  });
}

export function artifactKind(name) {
  const lower = name.toLowerCase();
  if (/\.(glb|gltf|vrm)$/.test(lower)) return "model";
  if (/\.(ktx2|webp|png|jpg|jpeg|exr|hdr)$/.test(lower)) return "texture";
  if (/\.(ogg|mp3|wav)$/.test(lower)) return "audio";
  if (/\.json$/.test(lower)) return "data";
  return "file";
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}
