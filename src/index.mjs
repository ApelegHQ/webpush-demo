import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import vapid from "../config/vapid.json" with { type: "json" };
import { addClient } from "./pushSubscriptionManager.mjs";

const filePath = (fileName) => {
  return fileURLToPath(new URL("../static/", import.meta.url)) + fileName;
};

const port = Number(process.env.PORT) || 5000;

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://invalid./");

    const respond = (contentType, contents) => {
      const etag = `"${
        createHash("sha384").update(contents).digest().toString(
          "base64url",
        )
      }"`;
      if (req.headers["if-none-match"]) {
        const tags = req.headers["if-none-match"].split(",").map((tag) =>
          tag.trim()
        );
        if (tags.includes(etag) || tags.includes("*")) {
          res.writeHead(304, [
            [
              "cache-control",
              "no-cache, must-revalidate, max-age=3600",
            ],
            ["etag", etag],
          ]);
          res.end();
          return;
        }
      }
      if (req.headers["if-match"]) {
        const tags = req.headers["if-match"].split(",").map((tag) =>
          tag.trim()
        );
        if (!tags.includes(etag) && !tags.includes("*")) {
          res.writeHead(412);
          res.end();
          return;
        }
      }
      res.writeHead(200, [
        [
          "cache-control",
          "no-cache, must-revalidate, max-age=3600",
        ],
        ["content-length", contents.byteLength],
        ["content-type", contentType],
        ["cross-origin-embedder-policy", "require-corp"],
        ["cross-origin-opener-policy", " same-origin"],
        ["cross-origin-resource-policy", "same-origin"],
        ["etag", etag],
        [
          "permissions-policy",
          "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=(), clipboard-read=(), clipboard-write=(), gamepad=(), speaker-selection=(), conversion-measurement=(), focus-without-user-activation=(), hid=(), idle-detection=(), interest-cohort=(), serial=(), sync-script=(), trust-token-redemption=(), unload=(), window-placement=(), vertical-scroll=()",
        ],
        ["x-content-type-options", "nosniff"],
        ["x-frame-options", "DENY"],
        ["x-xss-protection", "1; mode=block"],
      ]);
      res.end(contents);
    };

    if (req.method === "GET" && path.pathname === "/") {
      const contents = await readFile(filePath("index.xml"));
      respond("application/xhtml+xml", contents);
      return;
    }

    if (req.method === "GET" && path.pathname === "/main.js") {
      const contents = await readFile(filePath("main.js"));
      respond("text/javascript", contents);
      return;
    }

    if (req.method === "GET" && path.pathname === "/service-worker.js") {
      const contents = await readFile(filePath("service-worker.js"));
      respond("text/javascript", contents);
      return;
    }

    if (req.method === "GET" && path.pathname === "/site.webmanifest") {
      const contents = await readFile(filePath("site.webmanifest"));
      respond("application/manifest+json", contents);
      return;
    }

    if (req.method === "GET" && path.pathname === "/vapid-public-key") {
      const contents = Buffer.from(vapid.VAPID_PUBLIC_KEY, "base64url");
      respond("application/octet-stream", contents);
      return;
    }

    if (req.method === "POST" && path.pathname === "/new-subscription") {
      const contentLength = req.headers["content-length"];
      if (contentLength) {
        if (!/^[0-9]+$/.test(contentLength)) {
          res.writeHead(400);
          res.end();
          return;
        }
        if (Number(contentLength) > 4096) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      const contentType = req.headers["content-type"];
      if (
        !contentType ||
        (contentType !== "application/json" &&
          !contentType.startsWith("application/json;"))
      ) {
        res.writeHead(415);
        res.end();
        return;
      }
      const subscriptionJSON = await new Promise((resolve) => {
        const chunks = [];
        let currentLength = 0;
        req.on("data", (chunk) => {
          currentLength += chunk.byteLength;
          if (currentLength > 4096) {
            res.writeHead(413);
            res.end();
            resolve();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          resolve(Buffer.concat(chunks, currentLength).toString());
        });
      });
      try {
        const subcription = JSON.parse(subscriptionJSON);
        const url = new URL(subcription.endpoint);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Unsupported protocol");
        }
        console.log(
          new Date().toISOString(),
          `New push subscription at ${subcription.endpoint}`,
          subcription,
        );
        addClient(subcription);
        res.writeHead(204);
        res.end();
      } catch {
        res.writeHead(422);
        res.end();
      }

      return;
    }
    res.writeHead(501);
    res.end();
    return;
  } catch (e) {
    console.error(
      new Date().toISOString(),
      "Error serving",
      req.method,
      req.url,
      e,
    );
    const contents = Buffer.from(
      JSON.stringify({ error: { message: String(e?.message || e) } }),
    );
    res.writeHead(500, [
      ["content-length", contents.byteLength],
      ["content-type", "application/json"],
      ["x-content-type-options", "nosniff"],
    ]);
    res.end(contents);
  }
}).listen(port, () => {
  console.log(
    new Date().toISOString(),
    `Server started. Listening on port ${port}.`,
  );
});
