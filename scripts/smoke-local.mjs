import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

const tinyPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const baseUrl = process.env.INKSOLVER_SMOKE_BASE_URL || process.argv[2] || "http://127.0.0.1:3000";
const cwd = process.cwd();
const dataDir = path.join(cwd, ".data");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inksolver-smoke-"));
const backupDir = path.join(tempDir, "data");
const hadData = fs.existsSync(dataDir);
const stamp = Date.now();
const results = [];

if (hadData) {
  fs.cpSync(dataDir, backupDir, { recursive: true });
}

function identity(label, ipTail) {
  return {
    "x-inksolver-user-id": `smoke-${label}-${stamp}`,
    "x-inksolver-user-email": `smoke-${label}-${stamp}@example.test`,
    "x-inksolver-user-name": `Smoke ${label}`,
    "x-forwarded-for": `198.51.100.${ipTail}`,
  };
}

function remember(label, detail = "ok") {
  results.push({ label, detail });
  console.log(`ok - ${label}${detail === "ok" ? "" : ` (${detail})`}`);
}

async function request(method, pathname, options = {}) {
  const {
    body,
    headers = {},
    expect,
    json = true,
    rawBody,
  } = options;
  const requestHeaders = { ...headers };
  let requestBody;

  if (rawBody !== undefined) {
    requestBody = rawBody;
  } else if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  const text = await response.text();

  if (expect !== undefined && response.status !== expect) {
    throw new Error(`${method} ${pathname} expected ${expect}, got ${response.status}: ${text.slice(0, 700)}`);
  }

  if (!json) return { response, text };
  if (!text) return { response, data: null };

  try {
    return { response, data: JSON.parse(text), text };
  } catch {
    throw new Error(`${method} ${pathname} returned non-JSON ${response.status}: ${text.slice(0, 700)}`);
  }
}

async function solve(canvasId, headers, problemHint = "Evaluate the integral of x squared.") {
  const { response, text } = await request("POST", `/api/v1/canvases/${canvasId}/solve`, {
    headers,
    expect: 200,
    json: false,
    body: {
      region_bounds: { x: 8, y: 12, w: 220, h: 120 },
      problem_hint: problemHint,
    },
  });

  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("Solve did not return an SSE response.");
  }

  return parseSseDone(text, "solve");
}

async function chat(solutionId, headers, message, stepNum = null) {
  const { response, text } = await request("POST", `/api/v1/solutions/${solutionId}/chat`, {
    headers,
    expect: 200,
    json: false,
    body: {
      message,
      step_num: stepNum,
    },
  });

  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("Chat did not return an SSE response.");
  }

  return parseSseDone(text, "chat");
}

function parseSseDone(text, label) {
  const payload = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .at(-1);

  if (!payload) throw new Error(`${label} SSE response did not contain a final payload.`);
  return JSON.parse(payload);
}

async function createCanvas(headers, title, subject = "math", expect = 201) {
  return request("POST", "/api/v1/canvases", {
    headers,
    expect,
    body: { title, subject },
  });
}

async function expectExport(canvasId, headers, format, contentType) {
  const { response } = await request("POST", `/api/v1/canvases/${canvasId}/export`, {
    headers,
    expect: 200,
    json: false,
    body: { format },
  });
  const actual = response.headers.get("content-type") ?? "";
  if (!actual.includes(contentType)) {
    throw new Error(`Export ${format} expected ${contentType}, got ${actual}`);
  }
  if (!response.headers.get("content-disposition")?.includes("attachment")) {
    throw new Error(`Export ${format} did not return an attachment.`);
  }
}

function restoreData() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (hadData) {
    fs.cpSync(backupDir, dataDir, { recursive: true });
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function main() {
  const userA = identity("alpha", 10);
  const userB = identity("bravo", 11);
  const feedbackUser = identity("feedback", 12);

  await request("GET", "/", { expect: 200, json: false });
  remember("dashboard responds");

  const readiness = await request("GET", "/api/v1/readiness", { expect: 200 });
  if (!Array.isArray(readiness.data.checks) || readiness.data.checks.length < 5) {
    throw new Error("Readiness report is missing checks.");
  }
  remember("readiness API responds", `${readiness.data.summary.blocked} blocked gates`);

  await request("POST", "/api/v1/feedback", {
    headers: feedbackUser,
    expect: 200,
    body: {
      subject: "math",
      device: "local smoke",
      notes: "Smoke feedback event",
      expected_answer: "x^3/3 + C",
      actual_answer: "x^3/3 + C",
    },
  });
  remember("feedback telemetry records");

  const created = await createCanvas(userA, "Smoke Calculus Canvas", "math");
  const canvasId = created.data.canvas_id;
  const shareSlug = created.data.share_slug;
  if (!canvasId || !shareSlug) throw new Error("Canvas create did not return ids.");
  remember("canvas create works");

  const solved = await solve(canvasId, userA);
  const solutionId = solved.solution_id;
  if (!solutionId || solved.final_answer !== "\\frac{x^3}{3}+C") {
    throw new Error(`Unexpected solve payload: ${JSON.stringify(solved)}`);
  }
  remember("solve SSE persists a solution");

  await chat(solutionId, userA, "Why does step 1 use the power rule?", 1);
  await chat(solutionId, userA, "Summarize the solution.");
  remember("follow-up chat streams twice");

  const chatHistory = await request("GET", `/api/v1/solutions/${solutionId}/chat`, {
    headers: userA,
    expect: 200,
  });
  if (!Array.isArray(chatHistory.data.messages) || chatHistory.data.messages.length < 4) {
    throw new Error(`Chat history did not persist: ${JSON.stringify(chatHistory.data)}`);
  }
  remember("chat history endpoint returns persisted messages");

  const gzipState = {
    tldraw_state: {
      smoke: "gzip",
      marks: Array.from({ length: 200 }, (_, index) => ({ id: `mark-${index}`, x: index, y: index * 2 })),
    },
  };
  await request("PATCH", `/api/v1/canvases/${canvasId}`, {
    headers: {
      ...userA,
      "content-type": "application/json",
      "x-inksolver-encoding": "gzip",
    },
    expect: 200,
    json: false,
    rawBody: zlib.gzipSync(JSON.stringify(gzipState)),
  });
  const afterGzip = await request("GET", `/api/v1/canvases/${canvasId}`, {
    headers: userA,
    expect: 200,
  });
  if (afterGzip.data.canvas?.tldrawState?.smoke !== "gzip") {
    throw new Error("Gzipped canvas save did not round-trip.");
  }
  remember("gzip-compressed autosave round-trips");

  await request("GET", `/api/v1/canvases/${canvasId}`, {
    headers: userB,
    expect: 404,
  });
  remember("private canvas isolation works");

  await request("GET", `/s/${shareSlug}`, { expect: 404, json: false });
  await request("PATCH", `/api/v1/canvases/${canvasId}`, {
    headers: userA,
    expect: 200,
    body: {
      is_public: true,
      tldraw_state: {
        smoke: true,
        marks: [{ id: "integral", text: "integral x^2 dx", x: 20, y: 40 }],
      },
    },
  });
  await request("GET", `/s/${shareSlug}`, { expect: 200, json: false });
  const shared = await request("GET", `/api/v1/share/${shareSlug}`, { expect: 200 });
  if (!shared.data.canvas?.isPublic || shared.data.solutions?.length !== 1) {
    throw new Error("Published share did not expose the expected public solution.");
  }
  remember("publish and public share read work");

  const og = await request("GET", `/api/v1/share/${shareSlug}/og`, { expect: 200, json: false });
  if (!og.response.headers.get("content-type")?.includes("image/png")) {
    throw new Error("OG preview did not return image/png.");
  }
  remember("share preview image renders");

  const remix = await request("POST", `/api/v1/share/${shareSlug}/remix`, {
    headers: userB,
    expect: 201,
    body: {},
  });
  if (remix.data.source_canvas_id !== canvasId || remix.data.copied_solution_count !== 1) {
    throw new Error(`Unexpected remix payload: ${JSON.stringify(remix.data)}`);
  }
  await request("GET", `/api/v1/canvases/${remix.data.canvas_id}`, {
    headers: userB,
    expect: 200,
  });
  await request("GET", `/api/v1/canvases/${remix.data.canvas_id}`, {
    headers: userA,
    expect: 404,
  });
  remember("public remix creates a private copied canvas");

  await expectExport(canvasId, userA, "pdf", "application/pdf");
  await expectExport(canvasId, userA, "png", "image/png");
  remember("PDF and PNG exports download");

  const accountExport = await request("GET", "/api/v1/account/export", {
    headers: userA,
    expect: 200,
  });
  const exportedOtherUserData = accountExport.data.canvases.some((canvas) => canvas.userId !== accountExport.data.user.id);
  if (exportedOtherUserData) throw new Error("Account export leaked another user's canvas.");
  remember("account export is current-user scoped");

  await request("POST", "/api/v1/canvases", {
    headers: identity("invalid-json", 13),
    expect: 400,
    json: false,
    rawBody: "{",
  });

  await request("PATCH", `/api/v1/canvases/${canvasId}`, {
    headers: userA,
    expect: 413,
    json: false,
    rawBody: JSON.stringify({ title: "x".repeat(4 * 1024 * 1024 + 32) }),
  });

  await request("POST", `/api/v1/canvases/${canvasId}/solve`, {
    headers: userA,
    expect: 415,
    body: {
      snapshot_b64: "AAAA",
      mime_type: "image/svg+xml",
    },
  });
  remember("invalid JSON, oversized body, and bad snapshot MIME are rejected");

  const limitUser = identity("limit", 14);
  for (let index = 0; index < 5; index += 1) {
    await createCanvas(limitUser, `Limit Canvas ${index + 1}`, "math");
  }
  await createCanvas(limitUser, "Limit Canvas 6", "math", 402);
  remember("free active canvas limit blocks the sixth canvas");

  const proUser = identity("pro", 15);
  await request("POST", "/api/v1/billing/checkout", {
    headers: proUser,
    expect: 200,
    body: {
      plan: "pro_monthly",
      local_upgrade: true,
    },
  });
  for (let index = 0; index < 6; index += 1) {
    await createCanvas(proUser, `Pro Canvas ${index + 1}`, "physics");
  }
  remember("local Pro upgrade bypasses free canvas limit");

  const quotaUser = identity("quota", 16);
  const quotaCanvas = await createCanvas(quotaUser, "Quota Canvas", "math");
  for (let index = 0; index < 10; index += 1) {
    await solve(quotaCanvas.data.canvas_id, quotaUser, `Quota solve ${index + 1}`);
  }
  const { text: quotaText } = await request("POST", `/api/v1/canvases/${quotaCanvas.data.canvas_id}/solve`, {
    headers: quotaUser,
    expect: 200,
    json: false,
    body: {
      problem_hint: "This should hit quota.",
    },
  });
  const quotaPayload = parseSseDone(quotaText, "quota solve");
  if (quotaPayload.code !== "quota_exceeded") {
    throw new Error(`Expected quota_exceeded SSE error, got: ${JSON.stringify(quotaPayload)}`);
  }
  remember("free solve quota returns upgrade-shaped block");

  const cacheUser = identity("cache", 18);
  const cacheCanvas = await createCanvas(cacheUser, "Cache Canvas", "math");
  const cacheBody = {
    region_bounds: { x: 0, y: 0, w: 100, h: 80 },
    snapshot_b64: tinyPngDataUrl,
    problem_hint: "Cache me",
  };
  const firstCachedSolve = await (async () => {
    const { text } = await request("POST", `/api/v1/canvases/${cacheCanvas.data.canvas_id}/solve`, {
      headers: cacheUser,
      expect: 200,
      json: false,
      body: cacheBody,
    });
    return parseSseDone(text, "cache solve 1");
  })();
  const meAfterFirst = await request("GET", "/api/v1/me", { headers: cacheUser, expect: 200 });
  const secondCachedSolve = await (async () => {
    const { text } = await request("POST", `/api/v1/canvases/${cacheCanvas.data.canvas_id}/solve`, {
      headers: cacheUser,
      expect: 200,
      json: false,
      body: cacheBody,
    });
    return parseSseDone(text, "cache solve 2");
  })();
  const meAfterSecond = await request("GET", "/api/v1/me", { headers: cacheUser, expect: 200 });
  if (firstCachedSolve.solution_id !== secondCachedSolve.solution_id) {
    throw new Error("Identical re-solve did not return the cached verified solution.");
  }
  if (meAfterSecond.data.user.problemsToday !== meAfterFirst.data.user.problemsToday) {
    throw new Error("Cached solve consumed quota.");
  }
  remember("identical verified re-solve is cached and quota-free");

  const rateUser = identity("rate", 17);
  let rateLimited = false;
  for (let index = 0; index < 122; index += 1) {
    const { response } = await request("POST", "/api/v1/telemetry", {
      headers: rateUser,
      json: false,
      body: {
        event_type: "telemetry",
        name: "smoke_rate_limit",
        metadata: { index },
      },
    });
    if (response.status === 429) {
      rateLimited = true;
      break;
    }
  }
  if (!rateLimited) throw new Error("Telemetry rate limit did not return 429.");
  remember("rate limit eventually returns 429");

  const observability = await request("GET", "/api/v1/observability/summary", { expect: 200 });
  if (observability.data.eventCount < 1) throw new Error("Observability summary did not include events.");
  remember("observability summary includes smoke telemetry");

  await request("PATCH", `/api/v1/canvases/${canvasId}`, {
    headers: userA,
    expect: 200,
    body: { is_public: false },
  });
  await request("GET", `/api/v1/share/${shareSlug}`, { expect: 404 });
  remember("unpublish hides public share again");

  console.log(`\nInkSolver local smoke passed: ${results.length} checks against ${baseUrl}`);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    restoreData();
  });
