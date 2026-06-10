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

function mockSolve(input: SolveInput): Solution {
  const problemText = input.problemHint?.trim() || "Evaluate the selected integral.";

  return toSolution(
    input,
    {
      subject: "math",
      problem_text: problemText,
      steps: [
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
      ],
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

export async function solveWithNvidia(input: SolveInput): Promise<Solution> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL ?? "stepfun-ai/step-3.7-flash";

  if (!apiKey) {
    // Mock answers are a local-dev convenience only. In production a missing
    // key must fail loudly instead of returning fabricated solutions.
    if (!isProductionRuntime()) return mockSolve(input);
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

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | null;

  const text = payload?.choices?.[0]?.message?.content;

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

  const promptTokens = payload?.usage?.prompt_tokens ?? 0;
  const completionTokens = payload?.usage?.completion_tokens ?? 0;
  const tokensUsed = payload?.usage?.total_tokens ?? promptTokens + completionTokens;
  const costUsd =
    promptTokens * costPerToken("NVIDIA_INPUT_COST_PER_MTOK") +
    completionTokens * costPerToken("NVIDIA_OUTPUT_COST_PER_MTOK");

  return toSolution(input, parsed.data, model, {
    tokensUsed,
    costUsd: Number(costUsd.toFixed(6)),
  });
}
