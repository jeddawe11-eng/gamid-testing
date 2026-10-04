import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Discover surfaces from their entry-module graph, not a hand-maintained list of
// pages that should have a bell. New authenticated surfaces inherit by default.
export function auditAuthenticatedSurfaces(root) {
  const api = resolve(root, "account/supabase-client.js");
  function usesClient(file, seen = new Set()) {
    if (file === api) return true;
    if (seen.has(file) || !existsSync(file)) return false;
    seen.add(file);
    const js = readFileSync(file, "utf8");
    const imports = [...js.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g), ...js.matchAll(/import\s*\(\s*["']([^"']+)["']/g)];
    return imports.some(([, path]) => path.startsWith(".") && usesClient(resolve(dirname(file), path.split("?")[0]), seen));
  }
  const surfaces = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      const modulePath = relative(root, file).replaceAll("\\", "/");
      if (entry.name.endsWith(".js") && !modulePath.startsWith("app/") && !modulePath.startsWith("notifications/") && !modulePath.startsWith("usage/") && /\b(?:createNotificationCenter|notificationSubscriber|createUsageCenter)\s*\(/.test(readFileSync(file, "utf8"))) {
        throw Error(`${modulePath}: duplicate page notification lifecycle`);
      }
      if (!entry.name.endsWith(".html")) continue;
      const html = readFileSync(file, "utf8"), path = relative(root, file).replaceAll("\\", "/");
      const modules = [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/g)].map(([, src]) => resolve(dirname(file), src.split("?")[0]));
      const authenticatedClient = modules.some(module => usesClient(module));
      const visitor = /data-gamid-surface=["']public["']/.test(html);
      if (authenticatedClient && !visitor) {
        if (!/<header\b/.test(html)) throw Error(`${path}: authenticated surface requires a shared-shell header`);
        if (/notificationsHost|createNotificationCenter|notificationSubscriber|createUsageCenter/.test(html)) throw Error(`${path}: notification mounting belongs to the shared shell`);
        const csp = html.match(/<meta[^>]+Content-Security-Policy[^>]+content="([^"]+)"/i)?.[1];
        if (csp && !csp.includes("wss://upvtrczefcvigxdyuylw.supabase.co")) throw Error(`${path}: CSP blocks private TESTING Realtime`);
      }
      surfaces.push({ path, mode: authenticatedClient ? visitor ? "public" : "authenticated" : "renderer/static", authenticatedClient });
    }
  }
  walk(root);
  return surfaces;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../dist", import.meta.url));
  const surfaces = auditAuthenticatedSurfaces(root);
  const client = readFileSync(resolve(root, "account/supabase-client.js"), "utf8");
  if (!client.includes('import("../app/authenticated-shell.js")')) throw Error("The authenticated client must bootstrap the global shell");
  console.log("Authenticated shell audit:", surfaces.filter(s => s.mode === "authenticated").map(s => s.path).join(", "));
}
