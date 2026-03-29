const http = require("http");

const UPSTREAM_PORT = 8317;
const PORT = 8318;
const BIND = "0.0.0.0"; // Allow remote connections from .12

// Throttle settings
const MIN_INTERVAL_MS = 1000;  // Min 1 second between requests to Claude
const MAX_QUEUE = 8;           // Max queued requests before rejecting

let lastRequestTime = 0;
const queue = [];
let processing = false;

function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestTime));

  setTimeout(() => {
    const { req, res, body } = queue.shift();
    lastRequestTime = Date.now();
    processing = false;

    forwardRequest(req, res, body);

    // Process next in queue
    if (queue.length > 0) processQueue();
  }, wait);
}

function forwardRequest(req, res, body) {
  const opts = {
    hostname: "127.0.0.1",
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + UPSTREAM_PORT },
  };

  const upstream = http.request(opts, (upRes) => {
    if (upRes.statusCode === 400 && req.url.includes("/v1/messages")) {
      const respChunks = [];
      upRes.on("data", (c) => respChunks.push(c));
      upRes.on("end", () => {
        const respBody = Buffer.concat(respChunks).toString();
        let rewrite = false;
        try {
          const parsed = JSON.parse(respBody);
          const msg = (parsed.error?.message || "").toLowerCase();
          if (
            parsed.error?.message === "Error" ||
            msg.includes("rate") ||
            msg.includes("throttl") ||
            msg.includes("too many") ||
            msg.includes("overloaded") ||
            msg.includes("capacity")
          ) {
            rewrite = true;
          }
        } catch {}

        if (rewrite) {
          // CLIProxy is rate-limited: apply 60s cooldown (Claude Max requires ~59s)
          lastRequestTime = Date.now() + 57000;
          const newBody = JSON.stringify({
            type: "error",
            error: {
              type: "rate_limit_error",
              message: "Rate limited (rewritten from 400)",
            },
          });
          const headers = {};
          for (const [k, v] of Object.entries(upRes.headers)) {
            if (k !== "content-length") headers[k] = v;
          }
          headers["content-length"] = Buffer.byteLength(newBody);
          res.writeHead(429, headers);
          res.end(newBody);
          console.log(`[${new Date().toISOString()}] 400->429 rewrite (queue: ${queue.length})`);
        } else {
          res.writeHead(400, upRes.headers);
          res.end(respBody);
        }
      });
    } else if (
      req.headers["accept"]?.includes("text/event-stream") ||
      upRes.headers["content-type"]?.includes("text/event-stream")
    ) {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    } else {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    }
  });

  upstream.on("error", (err) => {
    console.error(`[${new Date().toISOString()}] upstream error: ${err.message}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "server_error", message: err.message } }));
  });

  upstream.write(body);
  upstream.end();
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);

    // Non-messages endpoints pass through immediately (models, health, etc.)
    if (!req.url.includes("/v1/messages") || req.method !== "POST") {
      forwardRequest(req, res, body);
      return;
    }

    // Throttle /v1/messages POST requests
    if (queue.length >= MAX_QUEUE) {
      console.log(`[${new Date().toISOString()}] queue full (${queue.length}), rejecting -> 429`);
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({
        type: "error",
        error: { type: "rate_limit_error", message: "Proxy queue full, try fallback" },
      }));
      return;
    }

    const src = req.socket.remoteAddress;
    console.log(`[${new Date().toISOString()}] queued from ${src} (queue: ${queue.length + 1})`);
    queue.push({ req, res, body });
    processQueue();
  });
});

server.listen(PORT, BIND, () => {
  console.log(`[${new Date().toISOString()}] cliproxy-wrapper listening on ${BIND}:${PORT} -> :${UPSTREAM_PORT}`);
  console.log(`  Throttle: ${MIN_INTERVAL_MS}ms between requests, max queue: ${MAX_QUEUE}`);
});
