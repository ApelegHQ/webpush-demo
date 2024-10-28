import { webcrypto } from "node:crypto";

// Fix missing 'crypto' on old Node
if (typeof crypto === "undefined") {
  Object.defineProperty(global, "crypto", {
    enumerable: true,
    configurable: true,
    get: () => webcrypto,
  });
}
