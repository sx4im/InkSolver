import type { ChatMessage, Solution, SolutionStep } from "@/lib/types";
import { appendChatMessage, getChatMessagesForSolution, getCurrentUser, getSolution, recordUsageEvent } from "@/server/canvas-repository";

type FollowUpInput = {
  solutionId: string;
  message: string;
  stepNum?: number | null;
};

type FollowUpContext = {
  solution: Solution;
  history: ChatMessage[];
  step: SolutionStep | null;
};

export type FollowUpResult = {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  answer: string;
};

export async function resolveFollowUpContext(input: FollowUpInput): Promise<FollowUpContext | null> {
  const solution = await getSolution(input.solutionId);
  if (!solution) return null;

  const history = await getChatMessagesForSolution(solution.id);
  const step = resolveStep(solution, input.stepNum, input.message);

  return {
    solution,
    history,
    step,
  };
}

export async function createFollowUpResponse(input: FollowUpInput, context: FollowUpContext): Promise<FollowUpResult> {
  const userMessage = await appendChatMessage({
    solutionId: context.solution.id,
    role: "user",
    content: input.message,
  });

  if (!userMessage) {
    throw new Error("Unable to persist user chat message");
  }

  const answer = await generateAnswer({
    message: input.message,
    solution: context.solution,
    history: context.history,
    step: context.step,
  });

  const assistantMessage = await appendChatMessage({
    solutionId: context.solution.id,
    role: "assistant",
    content: answer,
  });

  if (!assistantMessage) {
    throw new Error("Unable to persist assistant chat message");
  }

  const user = await getCurrentUser();
  await recordUsageEvent({
    userId: user.id,
    eventType: "chat",
    metadata: {
      solutionId: context.solution.id,
      stepNum: context.step?.stepNum ?? null,
    },
  });

  return {
    userMessage,
    assistantMessage,
    answer,
  };
}

export function chunkAnswer(answer: string) {
  const chunks = answer.match(/\S+\s*/g) ?? [answer];
  const packed: string[] = [];
  let current = "";

  for (const chunk of chunks) {
    current += chunk;
    if (current.length >= 24 || /[.!?]\s*$/.test(current)) {
      packed.push(current);
      current = "";
    }
  }

  if (current) packed.push(current);
  return packed;
}

async function generateAnswer(input: {
  message: string;
  solution: Solution;
  history: ChatMessage[];
  step: SolutionStep | null;
}) {
  const remote = await generateWithGemini(input);
  if (remote) return remote;

  return generateLocalAnswer(input);
}

async function generateWithGemini(input: {
  message: string;
  solution: Solution;
  history: ChatMessage[];
  step: SolutionStep | null;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash";
  if (!apiKey) return null;

  try {
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
                  "You are InkSolver's follow-up tutor. Answer concisely using the provided solution context. " +
                  "Do not redo unrelated work. If a step is mismatched, say so and explain the issue. " +
                  "Wrap any mathematical expressions in single dollar signs (for example $x^2$) so they render correctly.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt(input),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 360,
          },
        }),
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    return payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text?.trim() || null;
  } catch {
    return null;
  }
}

function generateLocalAnswer(input: {
  message: string;
  solution: Solution;
  step: SolutionStep | null;
}) {
  const step = input.step ?? input.solution.steps[0] ?? null;
  const lower = input.message.toLowerCase();

  if (step && (lower.includes("why") || lower.includes("step"))) {
    return [
      `Step ${step.stepNum} says $${step.latex}$.`,
      step.explanation,
      verificationSentence(step),
    ].join(" ");
  }

  if (lower.includes("verify") || lower.includes("correct")) {
    return [
      `The current final answer is $${input.solution.finalAnswer}$.`,
      input.solution.verificationStatus === "verified"
        ? "The verifier marked it correct for the supported symbolic rule."
        : `The verifier marked it ${input.solution.verificationStatus}.`,
      input.solution.verificationReason ?? "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `This solution reads the problem as: ${input.solution.problemText}`,
    `The final answer is $${input.solution.finalAnswer}$.`,
    step ? `For more detail, ask about step ${step.stepNum}.` : "Ask about a numbered step for more detail.",
  ].join(" ");
}

function verificationSentence(step: SolutionStep) {
  if (step.verificationStatus === "verified") {
    return step.verificationReason ?? "This step is verified for the supported symbolic rule.";
  }

  if (step.verificationStatus === "mismatch") {
    return step.verificationReason ?? "This step does not match the verifier's symbolic check.";
  }

  return step.verificationReason ?? "This step is not symbolically verified yet.";
}

function resolveStep(solution: Solution, explicitStepNum: number | null | undefined, message: string) {
  const inferredStep = explicitStepNum ?? Number(message.toLowerCase().match(/step\s*(\d+)/)?.[1]);

  if (Number.isFinite(inferredStep)) {
    const step = solution.steps.find((item) => item.stepNum === inferredStep);
    if (step) return step;
  }

  return null;
}

function buildPrompt(input: {
  message: string;
  solution: Solution;
  history: ChatMessage[];
  step: SolutionStep | null;
}) {
  const stepContext = input.step
    ? `Focused step: ${input.step.stepNum}\nLatex: ${input.step.latex}\nExplanation: ${input.step.explanation}\nVerification: ${input.step.verificationStatus}\nVerifier note: ${input.step.verificationReason ?? "none"}`
    : "Focused step: none";

  const history = input.history
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  return [
    `Problem: ${input.solution.problemText}`,
    `Subject: ${input.solution.subject}`,
    `Final answer: ${input.solution.finalAnswer}`,
    `Solution verification: ${input.solution.verificationStatus}`,
    `Verifier note: ${input.solution.verificationReason ?? "none"}`,
    `Steps:\n${input.solution.steps
      .map((step) => `${step.stepNum}. ${step.latex} - ${step.explanation} [${step.verificationStatus}]`)
      .join("\n")}`,
    stepContext,
    history ? `Recent chat:\n${history}` : "Recent chat: none",
    `Student question: ${input.message}`,
  ].join("\n\n");
}
