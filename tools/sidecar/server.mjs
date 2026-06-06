#!/usr/bin/env node
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { SETTINGS_SCHEMA } from "./settings-schema.mjs";
import {
  collectArtifacts,
  createNeedleConfig,
  createPipelineArgs,
  formatBytes,
  isNeedleCloudAccessToken,
  normalizeSettings,
  parseMultipart,
  redactPipelineArgs,
  sanitizeFilename,
} from "./job-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORK_ROOT = path.join(os.tmpdir(), "gltf-progressive-sidecar");
const MAX_BODY_BYTES = Number(process.env.GLTF_PROGRESSIVE_SIDECAR_MAX_MB || 1024) * 1024 * 1024;
const jobs = new Map();

try {
  process.loadEnvFile?.(path.join(ROOT, ".env"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    console.warn(`Could not load .env: ${error?.message || error}`);
  }
}

let needleCloudServerPromise = null;

function ensureNeedleCloudServer(accessToken = process.env.NEEDLE_CLOUD_TOKEN) {
  const token = accessToken || process.env.NEEDLE_CLOUD_TOKEN;
  if (!isNeedleCloudAccessToken(token)) return null;
  needleCloudServerPromise ||= new Promise((resolve) => {
    const child = spawn("npx", ["--yes", "needle-cloud@version-2", "start", "--restart", "true", "--silent"], {
      cwd: ROOT,
      env: {
        ...process.env,
        NEEDLE_CLOUD_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve(child);
    };
    child.stdout.on("data", (data) => {
      const text = String(data);
      if (text.includes("localhost:8424") || text.includes("MCP server available")) finish();
    });
    child.stderr.on("data", (data) => {
      if (String(data).toLowerCase().includes("error")) console.warn(String(data).trim());
    });
    child.on("error", (error) => {
      console.warn(`Could not start needle-cloud local server: ${error?.message || error}`);
      finish();
    });
    child.on("close", finish);
    setTimeout(finish, 4000);
  });
  return needleCloudServerPromise;
}

async function readLocalServerToken() {
  try {
    const data = JSON.parse(await fs.readFile(path.join(os.homedir(), ".needle", "local-server-token"), "utf8"));
    return typeof data.token === "string" && data.token ? data.token : "";
  } catch {
    return "";
  }
}

async function fetchLocalLicenseJwt({ accessToken = "", org = "" } = {}) {
  const serverToken = await readLocalServerToken();
  if (!serverToken) return "";
  const baseUrl = process.env.NEEDLE_LICENSE_SERVER_URL || "http://localhost:8424/api/license";
  const url = new URL(baseUrl);
  if (isNeedleCloudAccessToken(accessToken)) {
    url.searchParams.set("token", accessToken);
    url.searchParams.set("integration", "gltf-progressive-sidecar");
  }
  if (org || process.env.NEEDLE_CLOUD_ORG) {
    url.searchParams.set("org", org || process.env.NEEDLE_CLOUD_ORG);
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serverToken}`,
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return "";
  const license = await response.json();
  return typeof license.needle_license_jwt === "string" ? license.needle_license_jwt : "";
}

async function resolveBuildPipelineAuthToken(authToken, job) {
  if (authToken && !isNeedleCloudAccessToken(authToken)) return authToken;
  const accessToken = isNeedleCloudAccessToken(authToken) ? authToken : process.env.NEEDLE_CLOUD_TOKEN;
  if (!isNeedleCloudAccessToken(accessToken)) return "";

  appendLog(job, "sidecar", "Resolving Needle Cloud access token through the local license server.");
  await ensureNeedleCloudServer(accessToken);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const jwt = await fetchLocalLicenseJwt({ accessToken }).catch(() => "");
    if (jwt) return jwt;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  appendLog(job, "sidecar", "Could not resolve a local Needle Cloud JWT; the build pipeline may report an auth error.");
  return "";
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value, null, 2));
}

function text(res, status, value) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(value);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`Upload exceeds ${formatBytes(MAX_BODY_BYTES)}.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createJobRecord({ inputName, settings }) {
  const now = new Date().toISOString();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    inputName,
    status: "queued",
    progress: 0.03,
    stage: "Queued",
    settings,
    createdAt: now,
    updatedAt: now,
    workDir: path.join(WORK_ROOT, id),
    outputDir: path.join(WORK_ROOT, id, "output"),
    events: [],
    logs: [],
    artifacts: [],
    listeners: new Set(),
  };
  jobs.set(id, job);
  emit(job, { type: "status", status: job.status, progress: job.progress, stage: job.stage });
  return job;
}

function publicJob(job) {
  return {
    id: job.id,
    inputName: job.inputName,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    settings: job.settings,
    artifacts: job.artifacts,
    logs: job.logs.slice(-200),
    error: job.error,
  };
}

function emit(job, event) {
  const payload = {
    ...event,
    time: new Date().toISOString(),
  };
  job.updatedAt = payload.time;
  job.events.push(payload);
  if (job.events.length > 500) job.events.shift();
  for (const listener of job.listeners) {
    listener.write(`event: ${payload.type}\n`);
    listener.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function appendLog(job, source, data) {
  const lines = String(data).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const entry = { source, line, time: new Date().toISOString() };
    job.logs.push(entry);
    if (job.logs.length > 1000) job.logs.shift();
    if (job.status === "running") {
      job.progress = Math.max(job.progress, Math.min(0.9, job.progress + 0.015));
    }
    job.stage = inferStage(line, job.stage);
    emit(job, { type: "log", source, line, progress: job.progress, stage: job.stage });
  }
}

function inferStage(line, fallback) {
  const lower = line.toLowerCase();
  if (lower.includes("progressive")) return "Generating progressive assets";
  if (lower.includes("texture")) return "Processing textures";
  if (lower.includes("mesh")) return "Processing meshes";
  if (lower.includes("compress") || lower.includes("gpu")) return "Compressing";
  if (lower.includes("audio")) return "Processing audio";
  if (lower.includes("pmrem") || lower.includes("exr") || lower.includes("hdr")) return "Processing HDR";
  return fallback;
}

async function startJob({ file, settings, authToken }) {
  const normalized = normalizeSettings(settings);
  const inputName = sanitizeFilename(file.filename);
  const job = createJobRecord({ inputName, settings: normalized });
  await fs.mkdir(job.outputDir, { recursive: true });

  const inputFile = path.join(job.workDir, inputName);
  const outputFile = path.join(job.outputDir, inputName);
  const configFile = path.join(job.workDir, "needle.config.json");
  await fs.writeFile(inputFile, file.data);
  await fs.writeFile(configFile, JSON.stringify(createNeedleConfig(normalized), null, 2));

  runPipeline(job, { inputFile, outputFile, configFile, settings: normalized, authToken }).catch((error) => failJob(job, error));
  return job;
}

async function runPipeline(job, options) {
  job.status = "running";
  job.progress = 0.08;
  job.stage = "Starting local pipeline";
  emit(job, { type: "status", status: job.status, progress: job.progress, stage: job.stage });

  const resolvedAuthToken = await resolveBuildPipelineAuthToken(options.authToken, job);
  const args = createPipelineArgs({ ...options, authToken: resolvedAuthToken });
  appendLog(job, "sidecar", `npx ${redactPipelineArgs(args).join(" ")}`);

  const childEnv = { ...process.env };
  if (isNeedleCloudAccessToken(childEnv.NEEDLE_CLOUD_TOKEN)) {
    delete childEnv.NEEDLE_CLOUD_TOKEN;
  }
  if (resolvedAuthToken) {
    childEnv.NEEDLE_CLOUD_TOKEN = resolvedAuthToken;
  }

  const child = spawn("npx", args, {
    cwd: job.workDir,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  job.child = child;

  child.stdout.on("data", (data) => appendLog(job, "stdout", data));
  child.stderr.on("data", (data) => appendLog(job, "stderr", data));
  child.on("error", (error) => failJob(job, error));
  child.on("close", async (code) => {
    if (code !== 0) {
      failJob(job, new Error(`Pipeline exited with code ${code}.`));
      return;
    }
    job.artifacts = await collectArtifacts(job.outputDir, job.id);
    job.status = "succeeded";
    job.progress = 1;
    job.stage = "Ready";
    emit(job, { type: "artifacts", artifacts: job.artifacts });
    emit(job, { type: "status", status: job.status, progress: job.progress, stage: job.stage });
  });
}

function failJob(job, error) {
  job.status = "failed";
  job.progress = 1;
  job.stage = "Failed";
  job.error = error?.message || String(error);
  appendLog(job, "sidecar", job.error);
  emit(job, { type: "status", status: job.status, progress: job.progress, stage: job.stage, error: job.error });
}

function routeJobFile(req, res, job, relativePath) {
  const safeRelative = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(job.outputDir, safeRelative);
  if (!fullPath.startsWith(job.outputDir)) {
    text(res, 403, "Forbidden");
    return true;
  }
  const file = job.artifacts.find((artifact) => artifact.path === safeRelative.split(path.sep).join("/"));
  if (!file) {
    text(res, 404, "Not found");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentTypeFor(file.name));
  res.setHeader("content-length", String(file.size));
  res.setHeader("cache-control", "no-store");
  createReadStream(fullPath).pipe(res);
  return true;
}

function contentTypeFor(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".ktx2")) return "image/ktx2";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

async function handleApi(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;

  try {
    if (req.method === "GET" && url.pathname === "/api/settings") {
      json(res, 200, {
        ...SETTINGS_SCHEMA,
        auth: {
          envToken: Boolean(process.env.NEEDLE_CLOUD_TOKEN),
          envOrg: Boolean(process.env.NEEDLE_CLOUD_ORG),
        },
      });
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      json(res, 200, [...jobs.values()].map(publicJob).reverse());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const body = await readBody(req);
      const multipart = parseMultipart(body, req.headers["content-type"]);
      const file = multipart.files.asset;
      if (!file?.data?.length) {
        json(res, 400, { error: "Upload a .glb, .gltf, or .vrm asset as the asset field." });
        return true;
      }
      const settings = multipart.fields.settings ? JSON.parse(multipart.fields.settings) : {};
      const authToken = multipart.fields.authToken || req.headers["x-needle-auth-token"] || "";
      const job = await startJob({ file, settings, authToken });
      json(res, 202, publicJob(job));
      return true;
    }

    const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if (jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        json(res, 404, { error: "Job not found." });
        return true;
      }
      const tail = jobMatch[2] || "";
      if (req.method === "GET" && tail === "") {
        json(res, 200, publicJob(job));
        return true;
      }
      if (req.method === "GET" && tail === "events") {
        res.statusCode = 200;
        res.setHeader("content-type", "text/event-stream");
        res.setHeader("cache-control", "no-cache");
        res.setHeader("connection", "keep-alive");
        res.write(`event: snapshot\n`);
        res.write(`data: ${JSON.stringify(publicJob(job))}\n\n`);
        job.listeners.add(res);
        req.on("close", () => job.listeners.delete(res));
        return true;
      }
      if (req.method === "GET" && tail === "files") {
        json(res, 200, { artifacts: job.artifacts });
        return true;
      }
      if (req.method === "GET" && tail.startsWith("files/")) {
        return routeJobFile(req, res, job, decodeURIComponent(tail.slice("files/".length)));
      }
    }

    json(res, 404, { error: "Unknown API route." });
    return true;
  } catch (error) {
    json(res, 500, { error: error?.message || String(error) });
    return true;
  }
}

function sidecarApiPlugin() {
  return {
    name: "needle-gltf-progressive-sidecar-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApi(req, res);
        if (!handled) next();
      });
    },
  };
}

const port = Number(process.env.PORT || 5179);
const host = process.env.HOST || "127.0.0.1";
await fs.mkdir(WORK_ROOT, { recursive: true });
await ensureNeedleCloudServer();

const vite = await createViteServer({
  root: __dirname,
  configFile: path.join(__dirname, "vite.config.mjs"),
  plugins: [sidecarApiPlugin()],
  server: {
    host,
    port,
    fs: {
      allow: [ROOT, __dirname],
    },
  },
});

await vite.listen();
vite.printUrls();
console.log(`Sidecar workspace: ${WORK_ROOT}`);
