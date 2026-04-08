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

  // Validate file exists before attempting to load
  if (!fs.existsSync(HSLIB_PATH)) {
    throw new Error(`Neo HSLib file not found at: ${HSLIB_PATH}`);
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

  try {
    const source = fs.readFileSync(HSLIB_PATH, "utf8");
    vm.runInThisContext(source, { filename: HSLIB_PATH });
  } catch (error) {
    throw new Error(`Failed to load Neo HSLib: ${error.message}`);
  }

  if (!globalThis.HSWebSocket) {
    throw new Error("Neo HSLib loaded but HSWebSocket not found in global scope");
  }

  loaded = true;
  return globalThis.HSWebSocket;
}
