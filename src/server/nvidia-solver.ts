import { z } from "zod";

import type { RegionBounds, Solution, SolutionStep, Subject } from "@/lib/types";
import { isProductionRuntime } from "@/server/runtime-guards";

const solutionStepSchema = z.object({
  latex: z.string(),
  explanation: z.string(),
});

const nvidiaSolutionSchema = z.object({
  subject: z.enum(["math", "physics", "chem", "unknown"]).catch("unknown"),
  problem_text: z.string().min(1),
  steps: z.array(solutionStepSchema).min(1),
  final_answer: z.string().min(1),
});

type SolveInput = {
  canvasId: string;
  regionBounds?: RegionBounds | null;
  snapshotBase64?: string | null;
  mimeType?: string | null;
  problemHint?: string | null;
  promptImageUrl?: string | null;
  verificationFeedback?: string | null;
};

export type StreamedStep = {
  stepNum: number;
  latex: string;
  explanation: string;
};

export type SolveHooks = {
  onStep?: (step: StreamedStep) => void;
};

export type SolverErrorCode =
  | "not_configured"
  | "missing_snapshot"
  | "upstream_failed"
  | "upstream_timeout"
  | "invalid_response";

export class SolverError extends Error {
  constructor(
    message: string,
    public code: SolverErrorCode,
    public retryable = false,
  ) {
    super(message);
    this.name = "SolverError";
  }
}

const defaultTimeoutMs = 60_000;
const transientStatusCodes = new Set([408, 429, 500, 502, 503, 504]);

function solverTimeoutMs() {
  const value = Number(process.env.NVIDIA_TIMEOUT_MS ?? defaultTimeoutMs);
  return Number.isFinite(value) && value > 0 ? value : defaultTimeoutMs;
}

function costPerToken(envName: string) {
  const perMillion = Number(process.env[envName] ?? 0);
  return Number.isFinite(perMillion) && perMillion > 0 ? perMillion / 1_000_000 : 0;
}

function toSolution(
  input: SolveInput,
  parsed: z.infer<typeof nvidiaSolutionSchema>,
  model: string,
  usage: { tokensUsed: number; costUsd: number },
): Solution {
  const steps: SolutionStep[] = parsed.steps.map((step, index) => ({
    stepNum: index + 1,
    latex: step.latex,
    explanation: step.explanation,
    verified: false,
    verificationStatus: "unverifiable",
  }));

  return {
    id: crypto.randomUUID(),
    canvasId: input.canvasId,
    regionBounds: input.regionBounds ?? null,
    promptImageUrl: input.promptImageUrl ?? null,
    problemText: parsed.problem_text,
    subject: parsed.subject as Subject,
    finalAnswer: parsed.final_answer,
    verificationStatus: "unverifiable",
    steps,
    model,
    tokensUsed: usage.tokensUsed,
    costUsd: usage.costUsd,
    createdAt: new Date().toISOString(),
  };
}

function mockSolve(input: SolveInput, hooks?: SolveHooks): Solution {
  const problemText = input.problemHint?.trim() || "Evaluate the selected integral.";
  const steps = [
    {
      latex: "\\int x^2\\,dx",
      explanation: "Read the selected expression as a power-rule integral.",
    },
    {
      latex: "\\frac{x^{2+1}}{2+1}+C",
      explanation: "Increase the exponent by one and divide by the new exponent.",
    },
    {
      latex: "\\frac{x^3}{3}+C",
      explanation: "Simplify and keep the constant of integration.",
    },
  ];

  steps.forEach((step, index) => {
    hooks?.onStep?.({ stepNum: index + 1, latex: step.latex, explanation: step.explanation });
  });

  return toSolution(
    input,
    {
      subject: "math",
      problem_text: problemText,
      steps,
      final_answer: "\\frac{x^3}{3}+C",
    },
    "mock-nvidia-local",
    { tokensUsed: 0, costUsd: 0 },
  );
}

function extractJsonPayload(text: string) {
  const fenceMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (fenceMatch?.[1]) return fenceMatch[1];

  const objectMatch = text.match(/{[\s\S]*}/);
  return objectMatch ? objectMatch[0] : text;
}

// Scans the accumulating model output for completed objects inside the
// "steps" array so each step can be surfaced the moment it finishes, long
// before the full JSON document is complete.
function createIncrementalStepEmitter(onStep: (step: StreamedStep) => void) {
  let emittedCount = 0;

  return (fullText: string) => {
    const stepsKey = fullText.indexOf('"steps"');
    if (stepsKey === -1) return;
    const arrayStart = fullText.indexOf("[", stepsKey);
    if (arrayStart === -1) return;

    const objects: string[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let objectStart = -1;

    for (let index = arrayStart + 1; index < fullText.length; index += 1) {
      const char = fullText[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        if (depth === 0) objectStart = index;
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0 && objectStart !== -1) {
          objects.push(fullText.slice(objectStart, index + 1));
          objectStart = -1;
        }
        continue;
      }

      if (char === "]" && depth === 0) break;
    }

    while (emittedCount < objects.length) {
      try {
        const parsed = JSON.parse(objects[emittedCount]) as { latex?: unknown; explanation?: unknown };
        if (typeof parsed.latex === "string" && typeof parsed.explanation === "string") {
          onStep({
            stepNum: emittedCount + 1,
            latex: parsed.latex,
            explanation: parsed.explanation,
          });
        }
        emittedCount += 1;
      } catch {
        // The newest object is still streaming in; try again on the next chunk.
        break;
      }
    }
  };
}

async function requestCompletion(body: string, apiKey: string) {
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    signal: AbortSignal.timeout(solverTimeoutMs()),
  });

  return response;
}

type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

async function consumeCompletionStream(
  body: ReadableStream<Uint8Array>,
  onText: (accumulated: string) => void,
): Promise<{ text: string; usage: StreamUsage | null }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: StreamUsage | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let chunk: {
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: StreamUsage;
      };

      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      if (chunk.usage) usage = chunk.usage;

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onText(text);
      }
    }
  }

  return { text, usage };
}

export async function solveWithNvidia(input: SolveInput, hooks?: SolveHooks): Promise<Solution> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL ?? "stepfun-ai/step-3.7-flash";

  if (!apiKey) {
    // Mock answers are a local-dev convenience only. In production a missing
    // key must fail loudly instead of returning fabricated solutions.
    if (!isProductionRuntime()) return mockSolve(input, hooks);
    throw new SolverError("The AI solver is not configured.", "not_configured");
  }

  if (!input.snapshotBase64) {
    throw new SolverError(
      "No canvas snapshot was provided. Select or draw the problem before solving.",
      "missing_snapshot",
    );
  }

  const promptText = [
    input.problemHint || "Solve the STEM problem shown in this selected whiteboard image.",
    input.verificationFeedback
      ? `A previous attempt failed symbolic verification: ${input.verificationFeedback}. Re-solve carefully and return a corrected final answer.`
      : null,
    "Return your answer as a single JSON object with exactly these keys: subject (math/physics/chem/unknown), problem_text (string), steps (array of objects with latex and explanation), final_answer (string). Do not wrap in markdown.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const requestBody = JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are InkSolver, a STEM tutor. Read the selected whiteboard region. Return concise step-by-step working. Do not invent unreadable symbols; mark the subject unknown if unclear.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          {
            type: "image_url",
            image_url: {
              url: input.snapshotBase64,
            },
          },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
  });

  let response: Response;

  try {
    response = await requestCompletion(requestBody, apiKey);

    if (!response.ok && transientStatusCodes.has(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      response = await requestCompletion(requestBody, apiKey);
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SolverError("The AI solver timed out. Try again.", "upstream_timeout", true);
    }

    throw new SolverError("The AI solver could not be reached.", "upstream_failed", true);
  }

  if (!response.ok) {
    throw new SolverError(
      `The AI solver returned an error (${response.status}).`,
      "upstream_failed",
      transientStatusCodes.has(response.status),
    );
  }

  if (!response.body) {
    throw new SolverError("The AI solver returned an empty response.", "invalid_response", true);
  }

  const emitStepsFrom = createIncrementalStepEmitter((step) => hooks?.onStep?.(step));

  let text: string;
  let usage: StreamUsage | null;

  try {
    ({ text, usage } = await consumeCompletionStream(response.body, emitStepsFrom));
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SolverError("The AI solver timed out mid-response. Try again.", "upstream_timeout", true);
    }

    throw new SolverError("The AI solver connection dropped. Try again.", "upstream_failed", true);
  }

  if (!text) {
    throw new SolverError("The AI solver returned an empty response.", "invalid_response", true);
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonPayload(text));
  } catch {
    throw new SolverError("The AI solver returned an unreadable answer.", "invalid_response", true);
  }

  const parsed = nvidiaSolutionSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new SolverError("The AI solver returned an incomplete answer.", "invalid_response", true);
  }

  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const tokensUsed = usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd =
    promptTokens * costPerToken("NVIDIA_INPUT_COST_PER_MTOK") +
    completionTokens * costPerToken("NVIDIA_OUTPUT_COST_PER_MTOK");

  return toSolution(input, parsed.data, model, {
    tokensUsed,
    costUsd: Number(costUsd.toFixed(6)),
  });
}
