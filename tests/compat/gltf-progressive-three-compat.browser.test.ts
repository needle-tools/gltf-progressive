import { describe, expect, test } from "vitest";

declare const __GLTF_PROGRESSIVE_COMPAT_PAGES_ROOT__: string;

interface CompatPagesManifest {
    pages: Array<{ id: string; version: string; rendererMode: string; pagePath: string }>;
}

interface CompatibilityCase {
    id: string;
    version: string;
    rendererMode: string;
    pageUrl: string;
}

interface CompatibilityResult {
    version: string;
    rendererMode: string;
    rendererClass: string | null;
    backendType: string;
    status: "ready" | "unsupported";
    unsupportedReason?: string;
    loadMs: number;
    suite?: CompatibilitySuiteResult;
}

interface CompatibilitySuiteResult {
    renderer: {
        className: string | null;
        backendType: string;
        renderList: {
            opaque: number;
            transparent: number;
            transmissive: number;
        };
        lodPluginCalls: number;
    };
    package: {
        version: string;
        lodsManagerClass: string | null;
    };
    loader: {
        sceneName: string;
        parserExtensionRegistered: boolean;
    };
    fixtureAssets: Array<{
        id: string;
        url: string;
        sourceUrl: string;
        bytes: number;
        dependencyCount: number;
        sceneChildren: number;
        nodes: number;
        meshes: number;
        materials: number;
        textures: number;
        animations: number;
    }>;
    worker: {
        ok: boolean;
        sceneName?: string;
        assets?: Array<{
            id: string;
            dependencyCount: number;
            status: "loaded" | "unsupported" | "failed";
            sceneChildren?: number;
            animations?: number;
            unsupportedReason?: string;
            message?: string;
            stack?: string;
        }>;
        message?: string;
        stack?: string;
        hasWindow?: boolean;
        hasDocument?: boolean;
    };
    diagnostics: {
        errors: string[];
        warnings: string[];
        clockDeprecationWarnings: string[];
    };
}

interface ForeignCompatWindow extends Window {
    __GLTF_PROGRESSIVE_COMPAT__?: {
        status: "ready" | "unsupported";
        rendererMode: string;
        rendererClass?: string | null;
        backendType?: string;
        unsupportedReason?: string;
        runSuite?: () => Promise<CompatibilitySuiteResult>;
    };
    __GLTF_PROGRESSIVE_COMPAT_ERROR__?: string;
}

describe("glTF Progressive Three compatibility", () => {
    test(
        "loads and renders across cached Three versions and renderer modes",
        { timeout: 900_000 },
        async () => {
            const manifest = await loadPagesManifest();
            const cases = manifest.pages.map(page => ({
                id: page.id,
                version: page.version,
                rendererMode: page.rendererMode,
                pageUrl: toRawFsUrl(page.pagePath),
            }));
            expect(cases.length).toBeGreaterThan(0);

            const results: CompatibilityResult[] = [];
            const failures: string[] = [];

            for (const compatCase of cases) {
                try {
                    const result = await runCompatibilityCase(compatCase);
                    results.push(result);
                    console.info("[gltf-progressive-three-compat]", summarizeResultForLog(result));
                }
                catch (error) {
                    const message = error instanceof Error ? error.stack || error.message : String(error);
                    failures.push(`${compatCase.id}: ${message}`);
                }
            }

            const artifact = {
                generatedAt: new Date().toISOString(),
                totalCases: cases.length,
                results,
                failures,
                summary: {
                    passed: results.filter(result => result.status === "ready").length,
                    unsupported: results.filter(result => result.status === "unsupported").length,
                    failed: failures.length,
                },
            };
            console.info(`[gltf-progressive-three-compat-artifact] ${JSON.stringify(artifact)}`);

            if (failures.length) {
                throw new Error(`glTF Progressive compatibility failures:\n${failures.join("\n\n")}`);
            }

            expect(results).toHaveLength(cases.length);
        },
    );
});

async function runCompatibilityCase(compatCase: CompatibilityCase): Promise<CompatibilityResult> {
    const iframe = await mountCompatPage(compatCase);
    const foreignWindow = iframe.contentWindow as ForeignCompatWindow | null;
    if (!foreignWindow?.__GLTF_PROGRESSIVE_COMPAT__) {
        const error = foreignWindow?.__GLTF_PROGRESSIVE_COMPAT_ERROR__;
        iframe.remove();
        throw new Error(error || `Compat page for ${compatCase.id} did not expose compatibility objects.`);
    }

    const compatibility = foreignWindow.__GLTF_PROGRESSIVE_COMPAT__;
    const loadMs = Number(iframe.dataset.loadMs ?? 0);
    if (compatibility.status === "unsupported") {
        iframe.remove();
        return {
            version: compatCase.version,
            rendererMode: compatCase.rendererMode,
            rendererClass: compatibility.rendererClass ?? null,
            backendType: compatibility.backendType ?? "unsupported",
            status: "unsupported",
            unsupportedReason: compatibility.unsupportedReason ?? "Unknown unsupported renderer mode.",
            loadMs,
        };
    }

    expect(compatibility.runSuite).toBeTypeOf("function");
    if (compatCase.rendererMode === "webgl") expect(compatibility.backendType).toBe("webgl");
    if (compatCase.rendererMode === "webgpu-force-webgl2") expect(compatibility.backendType).toBe("webgl");
    if (compatCase.rendererMode === "webgpu") expect(compatibility.backendType?.startsWith("webgpu")).toBe(true);

    const suite = await compatibility.runSuite!();
    assertSuiteResult(suite);
    iframe.remove();

    return {
        version: compatCase.version,
        rendererMode: compatCase.rendererMode,
        rendererClass: compatibility.rendererClass ?? null,
        backendType: compatibility.backendType ?? "unknown",
        status: "ready",
        loadMs,
        suite,
    };
}

function assertSuiteResult(suite: CompatibilitySuiteResult) {
    const issues: string[] = [];

    captureIssue(issues, "package exports", () => {
        expect(suite.package.version).toBeTypeOf("string");
        expect(suite.package.lodsManagerClass).toBe("LODsManager");
    });
    captureIssue(issues, "LOD manager traversal", () => {
        expect(suite.renderer.lodPluginCalls).toBeGreaterThan(0);
    });
    captureIssue(issues, "loader smoke", () => {
        expect(suite.loader.sceneName).toBe("MatrixSmoke");
        expect(suite.loader.parserExtensionRegistered).toBe(true);
    });
    captureIssue(issues, "cached fixture assets", () => {
        expect(suite.fixtureAssets).toHaveLength(4);
        for (const asset of suite.fixtureAssets) {
            expect(asset.bytes).toBeGreaterThan(0);
            expect(asset.sceneChildren).toBeGreaterThan(0);
            expect(asset.nodes).toBeGreaterThan(0);
        }
        expect(suite.fixtureAssets.find(asset => asset.id === "forgotten-knight-product")?.dependencyCount).toBeGreaterThan(0);
        expect(suite.fixtureAssets.find(asset => asset.id === "forgotten-knight-world")?.dependencyCount).toBeGreaterThan(0);
    });
    captureIssue(issues, "worker smoke", () => {
        expect(suite.worker.ok, suite.worker.stack || suite.worker.message).toBe(true);
        expect(suite.worker.sceneName).toBe("WorkerMatrixSmoke");
        expect(suite.worker.hasWindow).toBe(false);
        expect(suite.worker.hasDocument).toBe(false);
        expect(suite.worker.assets).toBeTruthy();
        const workerAssets = suite.worker.assets || [];
        const failedAssets = workerAssets.filter(asset => asset.status === "failed");
        expect(failedAssets.map(asset => `${asset.id}: ${asset.message || asset.stack || "failed"}`)).toEqual([]);

        const world = workerAssets.find(asset => asset.id === "forgotten-knight-world");
        expect(world?.status).toBe("loaded");
        expect(world?.sceneChildren).toBeGreaterThan(0);

        const product = workerAssets.find(asset => asset.id === "forgotten-knight-product");
        expect(product).toBeTruthy();
        if (product?.status === "loaded") {
            expect(product.sceneChildren).toBeGreaterThan(0);
        }
        else {
            expect(product?.status).toBe("unsupported");
            expect(product?.unsupportedReason).toContain("EXT_texture_webp");
        }
    });
    captureIssue(issues, "diagnostics", () => {
        expect(suite.diagnostics.errors).toEqual([]);
        expect(suite.diagnostics.clockDeprecationWarnings).toEqual([]);
    });

    if (issues.length) {
        throw new Error(issues.join("\n"));
    }
}

function captureIssue(issues: string[], label: string, check: () => void) {
    try {
        check();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`${label}: ${message}`);
    }
}

async function loadPagesManifest(): Promise<CompatPagesManifest> {
    const response = await fetch(toRawFsUrl(`${__GLTF_PROGRESSIVE_COMPAT_PAGES_ROOT__}/manifest.json`));
    if (!response.ok) {
        throw new Error(`Failed to load gltf-progressive compat manifest. Run npm run compat:cache first. ${response.status} ${response.statusText}`);
    }
    return await response.json();
}

function mountCompatPage(compatCase: CompatibilityCase): Promise<HTMLIFrameElement> {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe");
        iframe.dataset.caseId = compatCase.id;
        iframe.style.width = "512px";
        iframe.style.height = "512px";
        iframe.style.border = "0";

        const start = performance.now();
        const timeout = setTimeout(() => {
            iframe.remove();
            reject(new Error(`Timed out waiting for ${compatCase.id}`));
        }, 60_000);

        iframe.addEventListener("load", async () => {
            try {
                await waitForCompatObjects(iframe);
                iframe.dataset.loadMs = String(performance.now() - start);
                clearTimeout(timeout);
                resolve(iframe);
            }
            catch (error) {
                clearTimeout(timeout);
                iframe.remove();
                reject(error);
            }
        }, { once: true });

        iframe.src = compatCase.pageUrl;
        document.body.appendChild(iframe);
    });
}

async function waitForCompatObjects(iframe: HTMLIFrameElement) {
    const start = performance.now();
    while (performance.now() - start < 60_000) {
        const foreignWindow = iframe.contentWindow as ForeignCompatWindow | null;
        if (foreignWindow?.__GLTF_PROGRESSIVE_COMPAT__ || foreignWindow?.__GLTF_PROGRESSIVE_COMPAT_ERROR__) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Compat page ${iframe.dataset.caseId} did not finish initializing.`);
}

function toRawFsUrl(filePath: string) {
    return `/__rawfs${filePath}`;
}

function summarizeResultForLog(result: CompatibilityResult | null) {
    if (!result) return null;
    return {
        version: result.version,
        rendererMode: result.rendererMode,
        backendType: result.backendType,
        status: result.status,
        unsupportedReason: result.unsupportedReason,
        loadMs: Math.round(result.loadMs),
        packageVersion: result.suite?.package.version,
        renderList: result.suite?.renderer.renderList,
        workerAssets: result.suite?.worker.assets?.map(asset => ({
            id: asset.id,
            status: asset.status,
            unsupportedReason: asset.unsupportedReason,
        })),
    };
}
