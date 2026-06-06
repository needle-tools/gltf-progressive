import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  setDracoDecoderLocation,
  setKTX2TranscoderLocation,
  useNeedleProgressive,
} from "@needle-tools/gltf-progressive";

setDracoDecoderLocation("/include/draco/");
setKTX2TranscoderLocation("/include/ktx2/");

type CompareSide = "source" | "result";

export type CompareViewerModels = {
  sourceUrl?: string;
  resultUrl?: string;
};

export class CompareViewer {
  private mount: HTMLElement;
  private renderer: WebGLRenderer;
  private scenes: Record<CompareSide, Scene>;
  private models: Record<CompareSide, Group | null> = { source: null, result: null };
  private loadTokens: Record<CompareSide, number> = { source: 0, result: 0 };
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private splitPosition = 0.5;
  private isDividerDragging = false;
  private divider = document.createElement("button");
  private labels = document.createElement("div");
  private sourceLabel = document.createElement("span");
  private resultLabel = document.createElement("span");
  private width = 1;
  private height = 1;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.mount.classList.add("compare-canvas-mount");

    this.scenes = {
      source: this.createScene(),
      result: this.createScene(),
    };

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.setClearColor(new Color("#20251f"));
    this.renderer.domElement.className = "compare-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("role", "application");
    this.renderer.domElement.setAttribute("aria-label", "3D source and optimized comparison viewer");
    this.mount.append(this.renderer.domElement);

    this.camera = new PerspectiveCamera(45, 1, 0.01, 500);
    this.camera.position.set(2.2, 1.4, 2.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;

    this.labels.className = "compare-labels";
    this.sourceLabel.className = "compare-label source-label";
    this.sourceLabel.textContent = "Source";
    this.resultLabel.className = "compare-label result-label";
    this.resultLabel.textContent = "Optimized";
    this.labels.append(this.sourceLabel, this.resultLabel);
    this.mount.append(this.labels);

    this.divider.className = "compare-divider";
    this.divider.type = "button";
    this.divider.title = "Drag comparison split";
    this.divider.setAttribute("aria-label", "Drag comparison split");
    this.divider.addEventListener("pointerdown", this.beginDividerDrag);
    this.mount.append(this.divider);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    this.resize();
    this.render();
  }

  async setModels(models: CompareViewerModels) {
    await Promise.all([
      this.setModel("source", models.sourceUrl || ""),
      this.setModel("result", models.resultUrl || ""),
    ]);
  }

  setSplitPosition(value: number) {
    this.splitPosition = Math.min(0.92, Math.max(0.08, value));
    this.mount.style.setProperty("--split-position", `${this.splitPosition * 100}%`);
  }

  resetView() {
    this.frameLoadedModels();
  }

  getDebugState() {
    return {
      cameraPosition: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      splitPosition: this.splitPosition,
      canvasSize: [this.width, this.height],
      sourceLoaded: Boolean(this.models.source),
      resultLoaded: Boolean(this.models.result),
    };
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.divider.removeEventListener("pointerdown", this.beginDividerDrag);
    window.removeEventListener("pointermove", this.dragDivider);
    window.removeEventListener("pointerup", this.endDividerDrag);
    window.removeEventListener("pointercancel", this.endDividerDrag);
    this.clear("source");
    this.clear("result");
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
    this.divider.remove();
  }

  private createScene() {
    const scene = new Scene();
    const ambient = new AmbientLight(0xffffff, 1.4);
    const key = new DirectionalLight(0xffffff, 2.6);
    key.position.set(3, 5, 2);
    const fill = new DirectionalLight(0xbcd7ff, 1.2);
    fill.position.set(-4, 2, -3);
    scene.add(ambient, key, fill);
    return scene;
  }

  private async setModel(side: CompareSide, url: string) {
    const token = ++this.loadTokens[side];
    this.clear(side);
    if (!url) return;

    const loader = new GLTFLoader();
    useNeedleProgressive(loader, this.renderer, { enableLODsManager: true });
    const gltf = await loader.loadAsync(url);
    if (this.loadTokens[side] !== token) {
      this.disposeObject(gltf.scene);
      return;
    }

    this.models[side] = gltf.scene;
    this.scenes[side].add(gltf.scene);
    this.frameLoadedModels();
  }

  private clear(side: CompareSide) {
    const model = this.models[side];
    if (!model) return;
    this.scenes[side].remove(model);
    this.disposeObject(model);
    this.models[side] = null;
  }

  private disposeObject(object: Group) {
    object.traverse((child: any) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if ((value as any)?.isTexture) (value as any).dispose();
        }
        material.dispose?.();
      }
    });
  }

  private resize() {
    const rect = this.mount.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.setSplitPosition(this.splitPosition);
  }

  private frameLoadedModels() {
    const box = new Box3();
    let hasModel = false;

    for (const model of Object.values(this.models)) {
      if (!model) continue;
      const modelBox = new Box3().setFromObject(model);
      if (modelBox.isEmpty()) continue;
      if (!hasModel) box.copy(modelBox);
      else box.union(modelBox);
      hasModel = true;
    }

    if (!hasModel) return;

    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.01);
    const distance = maxSize / (2 * Math.tan((Math.PI * this.camera.fov) / 360));
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new Vector3(distance * 0.75, distance * 0.45, distance * 1.2));
    this.camera.near = Math.max(distance / 100, 0.001);
    this.camera.far = Math.max(distance * 100, 10);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private beginDividerDrag = (event: PointerEvent) => {
    event.preventDefault();
    this.isDividerDragging = true;
    this.controls.enabled = false;
    this.divider.setPointerCapture?.(event.pointerId);
    this.updateSplitFromPointer(event.clientX);
    window.addEventListener("pointermove", this.dragDivider);
    window.addEventListener("pointerup", this.endDividerDrag);
    window.addEventListener("pointercancel", this.endDividerDrag);
  };

  private dragDivider = (event: PointerEvent) => {
    if (!this.isDividerDragging) return;
    event.preventDefault();
    this.updateSplitFromPointer(event.clientX);
  };

  private endDividerDrag = () => {
    this.isDividerDragging = false;
    this.controls.enabled = true;
    window.removeEventListener("pointermove", this.dragDivider);
    window.removeEventListener("pointerup", this.endDividerDrag);
    window.removeEventListener("pointercancel", this.endDividerDrag);
  };

  private updateSplitFromPointer(clientX: number) {
    const rect = this.mount.getBoundingClientRect();
    this.setSplitPosition((clientX - rect.left) / Math.max(1, rect.width));
  }

  private renderScene(side: CompareSide, x: number, width: number) {
    if (width <= 0) return;
    this.renderer.setViewport(x, 0, width, this.height);
    this.renderer.setScissor(x, 0, width, this.height);
    this.renderer.clear(true, true, true);
    this.camera.aspect = width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scenes[side], this.camera);
  }

  private render = () => {
    this.animationFrame = requestAnimationFrame(this.render);
    this.controls.update();

    const split = Math.round(this.width * this.splitPosition);
    this.renderer.setScissorTest(true);
    this.renderScene("source", 0, split);
    this.renderScene("result", split, this.width - split);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  };
}
