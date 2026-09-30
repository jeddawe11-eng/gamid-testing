// Loopback-only static lab. No credentials, account API, database or deployment.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/prototypes/wall-templates-lab/index.html" : decodeURIComponent(url.pathname);
    if (!pathname.startsWith("/dist/") && !pathname.startsWith("/prototypes/wall-templates-lab/")) throw new Error("Not allowed");
    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(resolve(root) + sep)) throw new Error("Not allowed");
    const bytes = await readFile(path);
    res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'" });
    res.end(bytes);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(4179, "127.0.0.1", () => console.log("Local fixture only: http://127.0.0.1:4179"));
