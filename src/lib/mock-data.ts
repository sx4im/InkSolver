import type { CanvasDetail, ChatMessage, Solution, UserAccount } from "@/lib/types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_CANVAS_ID = "00000000-0000-4000-8000-000000000101";
export const MECHANICS_CANVAS_ID = "00000000-0000-4000-8000-000000000102";
export const ORGANIC_CANVAS_ID = "00000000-0000-4000-8000-000000000103";

export const mockUser: UserAccount = {
  id: DEMO_USER_ID,
  name: "Areeba Khan",
  email: "areeba@example.com",
  plan: "free",
  problemsToday: 3,
  dailyLimit: 10,
  usageRemaining: 7,
  resetAt: "2026-05-27T00:00:00.000Z",
  activeCanvases: 4,
  activeCanvasLimit: 5,
  lemonSqueezyCustomerId: null,
};

export const mockCanvases: CanvasDetail[] = [
  {
    id: DEMO_CANVAS_ID,
    userId: DEMO_USER_ID,
    title: "P3 Calculus Past Paper",
    subject: "math",
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-26T07:30:00.000Z",
    shareSlug: "p3-calculus-demo",
    isPublic: true,
    thumbnailUrl: null,
    thumbnailTone: "peach",
    solutionCount: 5,
    tldrawState: null,
  },
  {
    id: MECHANICS_CANVAS_ID,
    userId: DEMO_USER_ID,
    title: "Projectile Motion Practice",
    subject: "physics",
    createdAt: "2026-05-21T12:15:00.000Z",
    updatedAt: "2026-05-25T19:15:00.000Z",
    shareSlug: "projectile-demo",
    isPublic: false,
    thumbnailUrl: null,
    thumbnailTone: "mint",
    solutionCount: 3,
    tldrawState: null,
  },
  {
    id: ORGANIC_CANVAS_ID,
    userId: DEMO_USER_ID,
    title: "Organic Reaction Notes",
    subject: "chem",
    createdAt: "2026-05-20T08:40:00.000Z",
    updatedAt: "2026-05-24T16:45:00.000Z",
    shareSlug: "organic-demo",
    isPublic: false,
    thumbnailUrl: null,
    thumbnailTone: "cream",
    solutionCount: 2,
    tldrawState: null,
  },
];

export const mockSolutions: Solution[] = [
  {
    id: "solution_integral_power_rule",
    canvasId: DEMO_CANVAS_ID,
    problemText: "Evaluate the indefinite integral of x squared.",
    subject: "math",
    finalAnswer: "\\frac{x^3}{3} + C",
    verificationStatus: "verified",
    createdAt: "2026-05-26T07:31:00.000Z",
    steps: [
      {
        stepNum: 1,
        latex: "\\int x^2\\,dx",
        explanation: "Identify this as a direct power-rule integral.",
        verified: true,
        verificationStatus: "verified",
      },
      {
        stepNum: 2,
        latex: "\\frac{x^{2+1}}{2+1} + C",
        explanation: "Increase the exponent by one and divide by the new exponent.",
        verified: true,
        verificationStatus: "verified",
      },
      {
        stepNum: 3,
        latex: "\\frac{x^3}{3} + C",
        explanation: "Simplify the exponent and keep the constant of integration.",
        verified: true,
        verificationStatus: "verified",
      },
    ],
  },
  {
    id: "solution_projectile_range",
    canvasId: MECHANICS_CANVAS_ID,
    problemText: "A projectile leaves the ground at 20 m/s and 30 degrees. Find the horizontal range.",
    subject: "physics",
    finalAnswer: "R \\approx 35.3\\,\\text{m}",
    verificationStatus: "unverifiable",
    createdAt: "2026-05-25T19:16:00.000Z",
    steps: [
      {
        stepNum: 1,
        latex: "R = \\frac{u^2\\sin(2\\theta)}{g}",
        explanation: "Use the range formula for launch and landing at the same height.",
        verified: false,
        verificationStatus: "unverifiable",
      },
      {
        stepNum: 2,
        latex: "R = \\frac{20^2\\sin(60^\\circ)}{9.8}",
        explanation: "Substitute speed, launch angle, and gravitational acceleration.",
        verified: false,
        verificationStatus: "unverifiable",
      },
      {
        stepNum: 3,
        latex: "R \\approx 35.3\\,\\text{m}",
        explanation: "Evaluate and round to three significant figures.",
        verified: false,
        verificationStatus: "unverifiable",
      },
    ],
  },
  {
    id: "solution_esterification_notes",
    canvasId: ORGANIC_CANVAS_ID,
    problemText: "Name the product formed from ethanol and ethanoic acid with acid catalyst.",
    subject: "chem",
    finalAnswer: "ethyl ethanoate + water",
    verificationStatus: "unverifiable",
    createdAt: "2026-05-24T16:46:00.000Z",
    steps: [
      {
        stepNum: 1,
        latex: "\\text{ethanol} + \\text{ethanoic acid}",
        explanation: "Identify the alcohol and carboxylic acid reactants.",
        verified: false,
        verificationStatus: "unverifiable",
      },
      {
        stepNum: 2,
        latex: "\\text{acid catalyst},\\ \\Delta",
        explanation: "Fischer esterification uses acid catalyst and heat.",
        verified: false,
        verificationStatus: "unverifiable",
      },
      {
        stepNum: 3,
        latex: "\\text{ethyl ethanoate} + H_2O",
        explanation: "The ester takes the alkyl group from the alcohol and the carboxylate from the acid.",
        verified: false,
        verificationStatus: "unverifiable",
      },
    ],
  },
];

export const mockChatMessages: ChatMessage[] = [
  {
    id: "chat_1",
    solutionId: "solution_integral_power_rule",
    role: "assistant",
    content: "Click any verified step and ask for the reason behind it.",
    createdAt: "2026-05-26T07:33:00.000Z",
  },
  {
    id: "chat_projectile_1",
    solutionId: "solution_projectile_range",
    role: "assistant",
    content: "This example demonstrates how InkSolver explains a physics formula substitution.",
    createdAt: "2026-05-25T19:18:00.000Z",
  },
  {
    id: "chat_chem_1",
    solutionId: "solution_esterification_notes",
    role: "assistant",
    content: "This example shows chemistry notes in the same solution card format as math and physics.",
    createdAt: "2026-05-24T16:48:00.000Z",
  },
];

export function getCanvas(id: string) {
  return (
    mockCanvases.find((canvas) => canvas.id === id || canvas.shareSlug === id) ??
    mockCanvases[0]
  );
}

export function getCanvasBySlug(slug: string) {
  return mockCanvases.find((canvas) => canvas.shareSlug === slug) ?? mockCanvases[0];
}

export function getSolutionsForCanvas(canvasId: string) {
  return mockSolutions.filter((solution) => solution.canvasId === canvasId);
}
