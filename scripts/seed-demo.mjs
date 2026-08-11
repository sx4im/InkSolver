import fs from "fs";
import path from "path";

const dataFile = path.join(process.cwd(), ".data", "inksolver.json");
const demoUserId = "00000000-0000-4000-8000-000000000001";
const mechanicsCanvasId = "00000000-0000-4000-8000-000000000102";
const organicCanvasId = "00000000-0000-4000-8000-000000000103";

const demoSolutions = [
  {
    id: "solution_projectile_range",
    canvasId: mechanicsCanvasId,
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
    canvasId: organicCanvasId,
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

const demoChatMessages = [
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

const demoCanvases = [
  {
    id: mechanicsCanvasId,
    userId: demoUserId,
    title: "Projectile Motion Practice",
    subject: "physics",
    createdAt: "2026-05-21T12:15:00.000Z",
    updatedAt: "2026-05-25T19:15:00.000Z",
    shareSlug: "projectile-demo",
    isPublic: false,
    thumbnailUrl: null,
    thumbnailTone: "mint",
    solutionCount: 0,
    tldrawState: null,
  },
  {
    id: organicCanvasId,
    userId: demoUserId,
    title: "Organic Reaction Notes",
    subject: "chem",
    createdAt: "2026-05-20T08:40:00.000Z",
    updatedAt: "2026-05-24T16:45:00.000Z",
    shareSlug: "organic-demo",
    isPublic: false,
    thumbnailUrl: null,
    thumbnailTone: "cream",
    solutionCount: 0,
    tldrawState: null,
  },
];

const state = readState();

state.canvases = upsertById(state.canvases ?? [], demoCanvases);
state.solutions = upsertById(state.solutions ?? [], demoSolutions);
state.chatMessages = upsertById(state.chatMessages ?? [], demoChatMessages);
state.usageEvents = state.usageEvents ?? [];
state.canvases = state.canvases.map((canvas) => ({
  ...canvas,
  solutionCount: state.solutions.filter((solution) => solution.canvasId === canvas.id).length,
}));

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
fs.writeFileSync(dataFile, `${JSON.stringify(state, null, 2)}\n`);

console.log("Demo seed complete: physics and chemistry examples are present.");

function readState() {
  if (!fs.existsSync(dataFile)) {
    return {
      users: [],
      canvases: [],
      solutions: [],
      chatMessages: [],
      usageEvents: [],
    };
  }

  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function upsertById(current, nextItems) {
  const byId = new Map(current.map((item) => [item.id, item]));

  for (const item of nextItems) {
    byId.set(item.id, {
      ...(byId.get(item.id) ?? {}),
      ...item,
    });
  }

  return Array.from(byId.values());
}
