import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";

import {
  evaluatePerformanceSamples,
  maximumPerformanceSamples,
  samplingPolicy,
  sitePerformanceThresholds,
} from "./site-performance-policy.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(workspaceRoot, "apps/web/out");
const evidenceRoot = resolve(workspaceRoot, "artifacts/performance/lighthouse");
const basePath = (process.env.MERGORA_BASE_PATH ?? "").replace(/\/$/u, "");
const lighthouseCli = resolve(workspaceRoot, "node_modules/lighthouse/cli/index.js");

const routes = [
  { id: "home", path: "/", routeBudgetGzip: 80 * 1024 },
  { id: "quick-start", path: "/docs/quick-start/", routeBudgetGzip: 35 * 1024 },
  { id: "button", path: "/components/button/", routeBudgetGzip: 80 * 1024 },
  { id: "data-grid", path: "/systems/data-grid/", routeBudgetGzip: 180 * 1024 },
  { id: "quality-button", path: "/quality/button/", routeBudgetGzip: 80 * 1024 },
  { id: "studio", path: "/studio/", routeBudgetGzip: 180 * 1024 },
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function fail(message) {
  throw new Error(`site performance verification failed: ${message}`);
}

function localOutputPath(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (basePath !== "" && (path === basePath || path.startsWith(`${basePath}/`))) {
    path = path.slice(basePath.length) || "/";
  }
  if (path.endsWith("/")) path += "index.html";
  const candidate = resolve(outputRoot, `.${path}`);
  const rel = relative(outputRoot, candidate);
  if (
    rel.startsWith(`..${sep}`) ||
    rel === ".." ||
    normalize(candidate) === normalize(outputRoot)
  ) {
    fail(`request escaped static output: ${urlPath}`);
  }
  return candidate;
}

async function serve(request, response) {
  try {
    let path = localOutputPath(request.url ?? "/");
    let details;
    try {
      details = await stat(path);
    } catch {
      details = undefined;
    }
    if (details?.isDirectory()) path = join(path, "index.html");
    if (details === undefined && extname(path) === "") path = join(path, "index.html");
    const bytes = await readFile(path);
    const contentType = mimeTypes.get(extname(path)) ?? "application/octet-stream";
    const compressible = /^(?:application\/(?:javascript|json|xml)|image\/svg\+xml|text\/)/u.test(
      contentType,
    );
    const body = compressible ? gzipSync(bytes, { level: 9 }) : bytes;
    response.writeHead(200, {
      "cache-control": "public, max-age=31536000, immutable",
      ...(compressible ? { "content-encoding": "gzip" } : {}),
      "content-length": String(body.byteLength),
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch {
    try {
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(join(outputRoot, "404.html")));
    } catch {
      response.writeHead(404).end("Not found");
    }
  }
}

function scriptsIn(html) {
  return new Set(
    [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gu)].map(
      ([, source]) => source.split("?")[0],
    ),
  );
}

function assetPath(source) {
  const parsed = new URL(source, "http://127.0.0.1");
  if (parsed.origin !== "http://127.0.0.1") fail(`route loads third-party script ${source}`);
  let path = parsed.pathname;
  if (basePath !== "" && path.startsWith(`${basePath}/`)) path = path.slice(basePath.length);
  const candidate = resolve(outputRoot, `.${path}`);
  const rel = relative(outputRoot, candidate);
  if (rel.startsWith(`..${sep}`) || rel === "..") fail(`script path escapes output: ${source}`);
  return candidate;
}

async function routeBudgetEvidence() {
  const routeScripts = [];
  for (const route of routes) {
    const html = await readFile(join(outputRoot, route.path.slice(1), "index.html"), "utf8");
    routeScripts.push({ route, scripts: scriptsIn(html) });
  }
  const shared = new Set(routeScripts[0]?.scripts ?? []);
  for (const { scripts } of routeScripts.slice(1)) {
    for (const script of shared) if (!scripts.has(script)) shared.delete(script);
  }

  const gzipSizes = new Map();
  async function gzipSize(source) {
    const current = gzipSizes.get(source);
    if (current !== undefined) return current;
    const size = gzipSync(await readFile(assetPath(source)), { level: 9 }).byteLength;
    gzipSizes.set(source, size);
    return size;
  }

  const measurements = [];
  for (const { route, scripts } of routeScripts) {
    let totalGzip = 0;
    let routeOwnedGzip = 0;
    for (const script of scripts) {
      const size = await gzipSize(script);
      totalGzip += size;
      if (!shared.has(script)) routeOwnedGzip += size;
    }
    if (routeOwnedGzip > route.routeBudgetGzip) {
      fail(
        `${route.id} owns ${routeOwnedGzip} gzip bytes after shared runtime; budget is ${route.routeBudgetGzip}`,
      );
    }
    measurements.push({
      id: route.id,
      path: route.path,
      routeBudgetGzip: route.routeBudgetGzip,
      routeOwnedGzip,
      totalGzip,
      scriptCount: scripts.size,
    });
  }
  return { sharedScripts: [...shared].sort(), measurements };
}

function runLighthouseOnce(url, outputPath) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        lighthouseCli,
        url,
        "--quiet",
        "--output=json",
        `--output-path=${outputPath}`,
        `--chrome-path=${chromium.executablePath()}`,
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        "--enable-error-reporting=false",
        "--throttling-method=devtools",
        "--only-categories=performance,accessibility,best-practices,seo",
      ],
      { cwd: workspaceRoot, env: { ...process.env, NO_COLOR: "1" }, shell: false },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else if (
        process.platform === "win32" &&
        /Runtime error encountered: EPERM[\s\S]*\\Temp\\lighthouse\./u.test(stderr)
      ) {
        void readFile(outputPath, "utf8")
          .then((rawReport) => {
            JSON.parse(rawReport);
            process.stderr.write(
              "Lighthouse produced a valid report; Windows denied its temporary-profile cleanup.\n",
            );
            resolveRun();
          })
          .catch(() => rejectRun(new Error(`Lighthouse exited ${String(code)}: ${stderr.trim()}`)));
      } else rejectRun(new Error(`Lighthouse exited ${String(code)}: ${stderr.trim()}`));
    });
  });
}

async function runLighthouse(url, outputPath) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await runLighthouseOnce(url, outputPath);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 2 || !/Unable to connect to Chrome/u.test(message)) throw error;
      process.stderr.write(
        "Lighthouse could not connect to Chrome; retrying the isolated launch once.\n",
      );
    }
  }
}

function score(report, category) {
  const value = report.categories?.[category]?.score;
  if (typeof value !== "number") fail(`Lighthouse omitted ${category} score`);
  return value;
}

function metric(report, id) {
  const value = report.audits?.[id]?.numericValue;
  if (typeof value !== "number") fail(`Lighthouse omitted ${id}`);
  return value;
}

function measurement(report) {
  return {
    scores: {
      accessibility: score(report, "accessibility"),
      bestPractices: score(report, "best-practices"),
      performance: score(report, "performance"),
      seo: score(report, "seo"),
    },
    metrics: {
      cls: metric(report, "cumulative-layout-shift"),
      lcpMs: metric(report, "largest-contentful-paint"),
      inpProxyBlockingMs: metric(report, "total-blocking-time"),
    },
  };
}

await stat(join(outputRoot, "index.html")).catch(() =>
  fail("apps/web/out is missing; run a production build before this gate"),
);
await mkdir(evidenceRoot, { recursive: true });
const routeBudgets = await routeBudgetEvidence();

const server = createServer((request, response) => void serve(request, response));
await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (address === null || typeof address === "string") fail("static server did not bind a TCP port");

const lighthouse = [];
try {
  for (const route of routes) {
    const url = `http://127.0.0.1:${String(address.port)}${basePath}${route.path}`;
    const samples = [];
    let result;
    for (let attempt = 1; attempt <= maximumPerformanceSamples; attempt += 1) {
      const reportPath = join(
        evidenceRoot,
        `${route.id}${attempt === 1 ? "" : `-attempt-${String(attempt)}`}.json`,
      );
      await runLighthouse(url, reportPath);
      const sample = measurement(JSON.parse(await readFile(reportPath, "utf8")));
      samples.push(sample);

      const decision = evaluatePerformanceSamples(samples);
      if (decision.kind === "fail-invariant") {
        fail(`${route.id} ${decision.failures.join("; ")}`);
      }
      if (decision.kind === "fail-performance") {
        fail(
          `${route.id} adaptive median failed: ${decision.failures.join("; ")}; samples ${samples
            .map(
              ({ metrics, scores }) =>
                `${String(scores.performance * 100)}/${String(metrics.inpProxyBlockingMs)}ms`,
            )
            .join(", ")}`,
        );
      }
      if (decision.kind === "pass") {
        result = decision.result;
        break;
      }
    }
    if (result === undefined) fail(`${route.id} sampling ended without a result`);
    const { metrics, scores } = result;
    lighthouse.push({ id: route.id, url, scores, metrics, samples });
    process.stdout.write(
      `${route.id}: perf ${String(scores.performance * 100)}, a11y ${String(scores.accessibility * 100)}, best ${String(scores.bestPractices * 100)}, seo ${String(scores.seo * 100)}${samples.length === 1 ? "" : " (adaptive median of 3)"}\n`,
    );
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

await writeFile(
  resolve(workspaceRoot, "artifacts/performance/summary.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "mergora-site-performance-evidence",
      profile: "Lighthouse DevTools-throttled mobile with pinned Playwright Chromium",
      samplingPolicy,
      thresholds: {
        lighthouse: {
          accessibility: sitePerformanceThresholds.accessibility,
          bestPractices: sitePerformanceThresholds.bestPractices,
          performance: sitePerformanceThresholds.performance,
          seo: sitePerformanceThresholds.seo,
        },
        lcpMs: sitePerformanceThresholds.lcpMs,
        cls: sitePerformanceThresholds.cls,
        inpProxyBlockingMs: sitePerformanceThresholds.inpProxyBlockingMs,
      },
      routeBudgets,
      lighthouse,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(`site performance verification passed for ${String(routes.length)} routes\n`);
