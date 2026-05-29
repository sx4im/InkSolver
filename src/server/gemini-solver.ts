import { z } from "zod";

import type { RegionBounds, Solution, SolutionStep, Subject } from "@/lib/types";

const solutionStepSchema = z.object({
  latex: z.string(),
  explanation: z.string(),
});

const geminiSolutionSchema = z.object({
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

const responseJsonSchema = {
  type: "object",
  properties: {
    subject: {
      type: "string",
      enum: ["math", "physics", "chem", "unknown"],
    },
    problem_text: {
      type: "string",
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          latex: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["latex", "explanation"],
      },
    },
    final_answer: {
      type: "string",
    },
  },
  required: ["subject", "problem_text", "steps", "final_answer"],
};

function stripDataUrl(value?: string | null) {
  if (!value) return null;
  if (!value.startsWith("data:")) return value;
  return value.split(",", 2)[1] ?? null;
}

function toSolution(input: SolveInput, parsed: z.infer<typeof geminiSolutionSchema>, model: string): Solution {
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
    tokensUsed: 0,
    costUsd: 0,
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
    "mock-gemini-local",
  );
}

export async function solveWithGemini(input: SolveInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
  const imageData = stripDataUrl(input.snapshotBase64);

  if (!apiKey || !imageData) {
    return mockSolve(input);
  }

  try {
    const promptText = [
      input.problemHint || "Solve the STEM problem shown in this selected whiteboard image.",
      input.verificationFeedback
        ? `A previous attempt failed symbolic verification: ${input.verificationFeedback}. Re-solve carefully and correct the final answer.`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "You are InkSolver, a STEM tutor. Read the selected whiteboard region. " +
                  "Return concise step-by-step working. Do not invent unreadable symbols; mark the subject unknown if unclear.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: promptText,
                },
                {
                  inlineData: {
                    mimeType: input.mimeType ?? "image/png",
                    data: imageData,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema,
          },
        }),
      },
    );

    if (!response.ok) {
      return mockSolve(input);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;

    if (!text) {
      return mockSolve(input);
    }

    const parsed = geminiSolutionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return mockSolve(input);
    }

    return toSolution(input, parsed.data, model);
  } catch {
    return mockSolve(input);
  }
}
