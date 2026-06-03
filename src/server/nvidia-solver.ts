import { z } from "zod";

import type { RegionBounds, Solution, SolutionStep, Subject } from "@/lib/types";

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

function toSolution(input: SolveInput, parsed: z.infer<typeof nvidiaSolutionSchema>, model: string): Solution {
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
    "mock-nvidia-local",
  );
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // NVIDIA embedding not implemented yet; fallback to null so local state works
  return null;
}

export async function solveWithNvidia(input: SolveInput) {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL ?? "stepfun-ai/step-3.7-flash";

  if (!apiKey || !input.snapshotBase64) {
    return mockSolve(input);
  }

  try {
    const promptText = [
      input.problemHint || "Solve the STEM problem shown in this selected whiteboard image.",
      input.verificationFeedback
        ? `A previous attempt failed symbolic verification: ${input.verificationFeedback}. Re-solve carefully and return a corrected final answer.`
        : null,
      "Return your answer as a single JSON object with exactly these keys: subject (math/physics/chem/unknown), problem_text (string), steps (array of objects with latex and explanation), final_answer (string). Do not wrap in markdown.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are InkSolver, a STEM tutor. Read the selected whiteboard region. Return concise step-by-step working. Do not invent unreadable symbols; mark the subject unknown if unclear.",
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
        }),
      },
    );

    if (!response.ok) {
      return mockSolve(input);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const text = payload.choices?.[0]?.message?.content;

    if (!text) {
      return mockSolve(input);
    }

    // Extract JSON from possible markdown code fences
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/{[\s\S]*}/);
    const jsonString = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : text;

    const parsed = nvidiaSolutionSchema.safeParse(JSON.parse(jsonString));
    if (!parsed.success) {
      return mockSolve(input);
    }

    return toSolution(input, parsed.data, model);
  } catch {
    return mockSolve(input);
  }
}
