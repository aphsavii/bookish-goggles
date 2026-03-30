import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HSLIB_PATH = path.join(__dirname, "vendor", "neo-hslib.js");

let loaded = false;

export function ensureNeoHsLibLoaded() {
  if (loaded && globalThis.HSWebSocket) {
    return globalThis.HSWebSocket;
  }

  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
  }

  if (typeof globalThis.self === "undefined") {
    globalThis.self = globalThis;
  }

  if (typeof globalThis.atob === "undefined") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  if (typeof globalThis.btoa === "undefined") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }

  const source = fs.readFileSync(HSLIB_PATH, "utf8");
  vm.runInThisContext(source, { filename: HSLIB_PATH });

  if (!globalThis.HSWebSocket) {
    throw new Error("Failed to load Neo HSWebSocket library");
  }

  loaded = true;
  return globalThis.HSWebSocket;
}
