import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const options = {
  host: "127.0.0.1",
  port: 4173,
};

for (let index = 0; index < args.length; index += 2) {
  const flag = args[index];
  const value = args[index + 1];
  if (flag === "--host" && value) {
    options.host = value;
  } else if (flag === "--port" && /^\d+$/.test(value ?? "")) {
    options.port = Number(value);
  } else {
    console.error(`Invalid static-server argument: ${flag ?? ""}`);
    process.exit(2);
  }
}

if (options.port < 1 || options.port > 65535) {
  console.error("Port must be between 1 and 65535");
  process.exit(2);
}

const allowedFiles = new Set([
  "admin.html",
  "admin.js",
  "firebase-messaging-sw.js",
  "index.html",
  "index.js",
  "manifest.json",
    "push-config.js",
    "theme-bootstrap.js",
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://qdnpeliqtxdglqewbvgg.supabase.co",
  "media-src 'self' blob: https://qdnpeliqtxdglqewbvgg.supabase.co",
  "connect-src 'self' https://qdnpeliqtxdglqewbvgg.supabase.co wss://qdnpeliqtxdglqewbvgg.supabase.co https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://www.googleapis.com",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

function resolveRequestPath(url) {
  let normalized;
  try {
    const requestPath = decodeURIComponent(
      new URL(url, "http://localhost").pathname,
    );
    const appShellRoutes = new Set([
      "/",
      "/account-delete",
      "/auth/callback",
      "/support",
      "/privacy-policy",
      "/community-standards",
    ]);
    normalized = appShellRoutes.has(requestPath)
      ? "index.html"
      : requestPath.slice(1);
  } catch {
    return null;
  }
  if (
    normalized.includes("..") ||
    (!allowedFiles.has(normalized) &&
      !normalized.startsWith("image/") &&
      !normalized.startsWith("assets/fonts/"))
  ) {
    return null;
  }
  return path.resolve(process.cwd(), normalized);
}

const server = createServer(async (request, response) => {
  const file = resolveRequestPath(request.url ?? "/");
  if (!file || !file.startsWith(process.cwd())) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": info.size,
      "Content-Type":
        contentTypes.get(path.extname(file)) ?? "application/octet-stream",
      "Content-Security-Policy": contentSecurityPolicy,
      "Permissions-Policy":
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(options.port, options.host, () => {
  console.log(`STATIC_SERVER_READY http://${options.host}:${options.port}`);
});

let stopping = false;
function stopServer() {
  if (stopping) {
    return;
  }
  stopping = true;
  server.close(() => process.exit(0));
}

const cancellationFile = process.env.GLIM_PROCESS_CANCEL_FILE;
if (cancellationFile) {
  const cancellationPoll = setInterval(async () => {
    try {
      await access(cancellationFile);
      clearInterval(cancellationPoll);
      stopServer();
    } catch (error) {
      if (error?.code !== "ENOENT") {
        clearInterval(cancellationPoll);
        throw error;
      }
    }
  }, 100);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, stopServer);
}
