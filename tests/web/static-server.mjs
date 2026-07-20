import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const outputRoot = resolve(import.meta.dirname, "../../apps/web/out");
const port = Number.parseInt(process.env.MERGORA_WEB_TEST_PORT ?? "4184", 10);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function isInsideOutput(path) {
  const relation = relative(outputRoot, path);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..");
}

async function staticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  let candidate = resolve(outputRoot, `.${decoded}`);
  if (!isInsideOutput(candidate)) return null;
  try {
    const details = await stat(candidate);
    if (details.isDirectory()) candidate = resolve(candidate, "index.html");
  } catch {
    if (extname(candidate) === "") candidate = resolve(candidate, "index.html");
  }
  if (!isInsideOutput(candidate)) return null;
  try {
    return (await stat(candidate)).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const path = await staticPath(url.pathname);
  if (path === null) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes.get(extname(path)) ?? "application/octet-stream",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Mergora static test server listening on ${String(port)}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
