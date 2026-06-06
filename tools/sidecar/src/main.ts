import "./styles.css";
import type { CompareViewer } from "./viewer";

type Field = {
  path: string;
  label: string;
  type: "boolean" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
};

type Artifact = {
  name: string;
  path: string;
  size: number;
  url: string;
  kind: string;
};

const app = document.querySelector<HTMLDivElement>("#app")!;

const state = {
  schema: null as any,
  settings: {} as any,
  file: null as File | null,
  sourceUrl: "",
  resultUrl: "",
  viewerMode: "three",
  splitPosition: 0.5,
  job: null as any,
  artifacts: [] as Artifact[],
  logs: [] as Array<{ source: string; line: string; time?: string }>,
  authToken: "",
};

let compareViewer: CompareViewer | null = null;
let CompareViewerClass: typeof CompareViewer | null = null;
let events: EventSource | null = null;

function getPath(object: any, path: string) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object: any, path: string, value: any) {
  const parts = path.split(".");
  let target = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    target[parts[i]] ||= {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

async function loadSchema() {
  const response = await fetch("/api/settings");
  state.schema = await response.json();
  state.settings = clone(state.schema.defaults);
  render();
}

function render() {
  disposeThreeViewers();
  const status = state.job?.stage || (state.file ? "Ready to optimize" : "Waiting for model");
  const progress = Math.round((state.job?.progress || 0) * 100);
  const modelArtifacts = state.artifacts.filter((artifact) => artifact.kind === "model");
  const selectedResult = state.resultUrl || modelArtifacts[0]?.url || "";

  app.innerHTML = `
    <main class="app-shell">
      <header class="header-tool">
        <div class="header-tool-leading">
          <img src="/brand/logo_needle_black_no_padding.svg" alt="Needle" />
          <div class="header-tool-title-group">
            <strong>glTF Progressive Sidecar</strong>
            <span>Local compression and optimization workbench</span>
          </div>
        </div>
        <div class="segmented-control" role="tablist" aria-label="Viewer mode">
          <button class="${state.viewerMode === "three" ? "active" : ""}" data-mode="three">Vanilla three</button>
          <button class="${state.viewerMode === "needle" ? "active" : ""}" data-mode="needle">Needle Engine</button>
        </div>
        <div class="header-tool-actions">
          <span class="header-tool-status">${status}</span>
          <button class="header-tool-button primary" data-action="run" ${!state.file ? "disabled" : ""}>Run</button>
        </div>
      </header>

      <section class="status-strip">
        <div class="status-strip-item"><span class="status-strip-label">Input</span>${state.file ? state.file.name : "None"}</div>
        <div class="status-strip-item"><span class="status-strip-label">Job</span>${state.job?.status || "Idle"}</div>
        <div class="status-strip-item"><span class="status-strip-label">Progress</span>${progress}%</div>
        <div class="status-strip-item"><span class="status-strip-label">Artifacts</span>${state.artifacts.length}</div>
      </section>

      <section class="workbench-shell">
        <aside class="pane inspector-pane">
          <div class="pane-head">
            <strong>Input</strong>
            <span>${state.schema?.pipeline?.package || ""}@${state.schema?.pipeline?.version || ""}</span>
          </div>
          <div class="pane-body">
            <label class="drop-zone" data-action="pick">
              <input type="file" accept=".glb,.gltf,.vrm,model/gltf-binary,model/gltf+json" />
              <span>${state.file ? state.file.name : "Drop or choose a model"}</span>
              <small>${state.file ? formatBytes(state.file.size) : "GLB, glTF, or VRM"}</small>
            </label>
            <label class="auth-field">
              <span>Auth token</span>
              <input type="password" data-auth-token value="${escapeHtml(state.authToken)}" placeholder="${state.schema?.auth?.envToken ? "Using NEEDLE_CLOUD_TOKEN" : "Optional local token"}" />
            </label>
            <div class="settings-root">
              ${renderSettings()}
            </div>
          </div>
        </aside>

        <section class="stage">
          <div class="stage-toolbar">
            <div class="stage-toolbar-title">
              <strong>Compare</strong>
              <span>${state.viewerMode === "three" ? "Shared orbit split" : "Needle Engine split"}</span>
            </div>
            <label class="split-control">
              <span>Split</span>
              <input type="range" min="8" max="92" step="1" value="${Math.round(state.splitPosition * 100)}" data-split-range />
            </label>
            <button class="header-tool-button" data-action="reset-view" ${state.sourceUrl || selectedResult ? "" : "disabled"}>Fit</button>
            <select data-result-select ${modelArtifacts.length ? "" : "disabled"}>
              ${modelArtifacts.map((artifact) => `<option value="${artifact.url}" ${artifact.url === selectedResult ? "selected" : ""}>${artifact.path}</option>`).join("")}
            </select>
          </div>
          <div id="compare-viewer" class="compare-viewer ${state.viewerMode === "needle" ? "needle-mode" : "three-mode"}">
          </div>
          <div class="stage-footer">
            ${state.viewerMode === "needle" ? "Needle Engine mode lazy-loads @needle-tools/engine when installed; vanilla three remains the fallback preview." : "Vanilla three uses @needle-tools/gltf-progressive for progressive loading."}
          </div>
        </section>

        <aside class="pane output-pane">
          <div class="pane-head">
            <strong>Output</strong>
            <span>${state.job?.id || "No job"}</span>
          </div>
          <div class="pane-body">
            <div class="progress-shell">
              <div class="progress-bar" style="width:${progress}%"></div>
            </div>
            <div class="artifact-list">
              ${state.artifacts.map((artifact) => `
                <a class="list-row" href="${artifact.url}" target="_blank" rel="noreferrer" data-artifact="${artifact.url}">
                  <span>${artifact.path}</span>
                  <small>${artifact.kind} · ${formatBytes(artifact.size)}</small>
                </a>
              `).join("") || `<div class="empty-state">Run the pipeline to see generated files.</div>`}
            </div>
            <pre class="log-view">${escapeHtml(state.logs.slice(-120).map((entry) => `${entry.source}> ${entry.line}`).join("\n"))}</pre>
          </div>
        </aside>
      </section>
    </main>
  `;

  bind();
  queueMicrotask(() => syncViewers(selectedResult));
}

function renderSettings() {
  if (!state.schema) return "";
  return state.schema.sections.map((section: any) => `
    <section class="settings-section">
      <h2>${section.label}</h2>
      <div class="property-list">
        ${section.fields.map((field: Field) => renderField(field)).join("")}
      </div>
    </section>
  `).join("");
}

function renderField(field: Field) {
  const value = getPath(state.settings, field.path);
  if (field.type === "boolean") {
    return `
      <label class="check-row" title="${escapeHtml(field.help || "")}">
        <span>${field.label}</span>
        <input type="checkbox" data-setting="${field.path}" ${value ? "checked" : ""} />
      </label>
    `;
  }
  if (field.type === "select") {
    return `
      <label class="property-row" title="${escapeHtml(field.help || "")}">
        <span class="property-row-head"><span>${field.label}</span><strong>${value}</strong></span>
        <select data-setting="${field.path}">
          ${(field.options || []).map((option) => `<option value="${option.value}" ${option.value === value ? "selected" : ""}>${option.label}</option>`).join("")}
        </select>
      </label>
    `;
  }
  return `
    <label class="property-row" title="${escapeHtml(field.help || "")}">
      <span class="property-row-head"><span>${field.label}</span><strong>${value}${field.unit ? ` ${field.unit}` : ""}</strong></span>
      <input type="number" data-setting="${field.path}" value="${value}" min="${field.min ?? ""}" max="${field.max ?? ""}" step="${field.step ?? 1}" />
    </label>
  `;
}

function bind() {
  app.querySelector<HTMLInputElement>('input[type="file"]')?.addEventListener("change", (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) setFile(file);
  });
  app.querySelector(".drop-zone")?.addEventListener("dragover", (event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add("drag-active");
  });
  app.querySelector(".drop-zone")?.addEventListener("dragleave", (event) => {
    (event.currentTarget as HTMLElement).classList.remove("drag-active");
  });
  app.querySelector(".drop-zone")?.addEventListener("drop", (event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove("drag-active");
    const file = event.dataTransfer?.files?.[0];
    if (file) setFile(file);
  });
  app.querySelector('[data-action="run"]')?.addEventListener("click", runJob);
  app.querySelector('[data-action="reset-view"]')?.addEventListener("click", () => {
    compareViewer?.resetView();
  });
  app.querySelector<HTMLInputElement>("[data-split-range]")?.addEventListener("input", (event) => {
    state.splitPosition = Number((event.currentTarget as HTMLInputElement).value) / 100;
    compareViewer?.setSplitPosition(state.splitPosition);
    const mount = app.querySelector<HTMLElement>("#compare-viewer");
    mount?.style.setProperty("--split-position", `${state.splitPosition * 100}%`);
  });
  app.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.viewerMode = button.dataset.mode || "three";
      render();
    });
  });
  app.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      const path = input.dataset.setting!;
      const value = input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
        : input instanceof HTMLInputElement && input.type === "number"
          ? Number(input.value)
          : input.value;
      setPath(state.settings, path, value);
      render();
    });
  });
  app.querySelector<HTMLInputElement>("[data-auth-token]")?.addEventListener("input", (event) => {
    state.authToken = (event.currentTarget as HTMLInputElement).value;
  });
  app.querySelector<HTMLSelectElement>("[data-result-select]")?.addEventListener("change", (event) => {
    state.resultUrl = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
}

function setFile(file: File) {
  state.file = file;
  if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
  state.sourceUrl = URL.createObjectURL(file);
  state.resultUrl = "";
  state.job = null;
  state.artifacts = [];
  state.logs = [];
  events?.close();
  render();
}

async function runJob() {
  if (!state.file) return;
  state.logs = [];
  const form = new FormData();
  form.append("asset", state.file, state.file.name);
  form.append("settings", JSON.stringify(state.settings));
  if (state.authToken) form.append("authToken", state.authToken);
  const response = await fetch("/api/jobs", { method: "POST", body: form });
  state.job = await response.json();
  if (!response.ok) {
    state.logs.push({ source: "sidecar", line: state.job.error || "Failed to create job." });
    render();
    return;
  }
  connectEvents(state.job.id);
  render();
}

function connectEvents(jobId: string) {
  events?.close();
  events = new EventSource(`/api/jobs/${jobId}/events`);
  events.addEventListener("snapshot", (event) => {
    const snapshot = JSON.parse((event as MessageEvent).data);
    state.job = snapshot;
    state.artifacts = snapshot.artifacts || [];
    state.logs = snapshot.logs || [];
    render();
  });
  events.addEventListener("log", (event) => {
    const log = JSON.parse((event as MessageEvent).data);
    state.logs.push(log);
    state.job = { ...state.job, progress: log.progress, stage: log.stage };
    updateLiveStatus();
  });
  events.addEventListener("artifacts", (event) => {
    state.artifacts = JSON.parse((event as MessageEvent).data).artifacts || [];
    state.resultUrl ||= state.artifacts.find((artifact) => artifact.kind === "model")?.url || "";
    render();
  });
  events.addEventListener("status", (event) => {
    const status = JSON.parse((event as MessageEvent).data);
    state.job = { ...state.job, ...status };
    if (status.status === "succeeded" || status.status === "failed") render();
    else updateLiveStatus();
  });
}

function updateLiveStatus() {
  const progress = Math.round((state.job?.progress || 0) * 100);
  const status = state.job?.stage || "Running";
  const headerStatus = app.querySelector(".header-tool-status");
  if (headerStatus) headerStatus.textContent = status;
  const progressBar = app.querySelector<HTMLElement>(".progress-bar");
  if (progressBar) progressBar.style.width = `${progress}%`;
  const stripItems = app.querySelectorAll(".status-strip-item");
  if (stripItems[1]) stripItems[1].innerHTML = `<span class="status-strip-label">Job</span>${state.job?.status || "Idle"}`;
  if (stripItems[2]) stripItems[2].innerHTML = `<span class="status-strip-label">Progress</span>${progress}%`;
  const logView = app.querySelector(".log-view");
  if (logView) {
    logView.textContent = state.logs.slice(-120).map((entry) => `${entry.source}> ${entry.line}`).join("\n");
    logView.scrollTop = logView.scrollHeight;
  }
}

async function syncViewers(resultUrl: string) {
  const mount = document.querySelector<HTMLElement>("#compare-viewer");
  if (!mount) return;
  mount.style.setProperty("--split-position", `${state.splitPosition * 100}%`);

  if (state.viewerMode === "needle") {
    disposeThreeViewers();
    await renderNeedleEngineComparison(mount, state.sourceUrl, resultUrl);
    return;
  }

  mount.querySelector("needle-engine")?.remove();
  if (!state.sourceUrl && !resultUrl) return;
  const Viewer = await getCompareViewer();
  compareViewer ||= new Viewer(mount);
  compareViewer.setSplitPosition(state.splitPosition);
  setDebugViewer(compareViewer);
  compareViewer.setModels({ sourceUrl: state.sourceUrl, resultUrl }).catch((error) => pushViewerError(error));
}

async function getCompareViewer() {
  CompareViewerClass ||= (await import("./viewer")).CompareViewer;
  return CompareViewerClass;
}

function disposeThreeViewers() {
  compareViewer?.dispose();
  compareViewer = null;
  setDebugViewer(null);
}

async function renderNeedleEngineComparison(mount: HTMLElement, sourceSrc: string, resultSrc: string) {
  mount.innerHTML = "";
  if (!sourceSrc && !resultSrc) return;
  try {
    await import("@needle-tools/engine");
    const source = createNeedlePanel("source", sourceSrc);
    const result = createNeedlePanel("result", resultSrc);
    const divider = document.createElement("div");
    divider.className = "compare-divider passive";
    const labels = document.createElement("div");
    labels.className = "compare-labels";
    labels.innerHTML = `<span class="compare-label source-label">Source</span><span class="compare-label result-label">Optimized</span>`;
    mount.append(source, result, divider, labels);
  } catch (error) {
    const message = document.createElement("div");
    message.className = "viewer-message";
    message.textContent = "Needle Engine package is not installed in this workspace.";
    mount.append(message);
  }
}

function createNeedlePanel(side: "source" | "result", src: string) {
  const panel = document.createElement("div");
  panel.className = `needle-panel ${side}`;
  if (!src) {
    panel.innerHTML = `<div class="viewer-message">${side === "source" ? "Choose a source model." : "Run the pipeline to compare output."}</div>`;
    return panel;
  }
  const element = document.createElement("needle-engine");
  element.setAttribute("src", src);
  element.setAttribute("loading-style", "light");
  panel.append(element);
  return panel;
}

function setDebugViewer(viewer: CompareViewer | null) {
  (window as any).__gltfProgressiveSidecar = {
    get viewer() {
      return viewer;
    },
    getState() {
      return viewer?.getDebugState?.() || null;
    },
  };
}

function pushViewerError(error: unknown) {
  state.logs.push({ source: "viewer", line: error instanceof Error ? error.message : String(error) });
  render();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]!));
}

loadSchema().catch((error) => {
  app.textContent = error instanceof Error ? error.message : String(error);
});
