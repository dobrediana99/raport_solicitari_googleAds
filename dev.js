#!/usr/bin/env node
/**
 * Dev runner: starts backend (node index.js) + frontend (Vite) with a single command.
 * No extra dependencies (e.g. concurrently) required.
 */
const { spawn } = require("child_process");
const path = require("path");

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32", // helps Windows resolve npm/node commands
    ...opts,
  });
  return child;
}

const root = __dirname;
const webDir = path.join(root, "web");

// Start backend
const backend = run("node", ["index.js"], { cwd: root });

// Start frontend (Vite)
const frontend = run("npm", ["run", "dev"], { cwd: webDir });

function shutdown(code = 0) {
  // Try graceful shutdown first
  if (backend && !backend.killed) backend.kill("SIGINT");
  if (frontend && !frontend.killed) frontend.kill("SIGINT");

  // Force-kill after a short grace period
  setTimeout(() => {
    if (backend && !backend.killed) backend.kill("SIGKILL");
    if (frontend && !frontend.killed) frontend.kill("SIGKILL");
    process.exit(code);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

backend.on("exit", (code) => {
  // If backend stops, stop everything
  shutdown(code ?? 0);
});
frontend.on("exit", (code) => {
  // If frontend stops, stop everything
  shutdown(code ?? 0);
});
