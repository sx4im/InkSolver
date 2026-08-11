import { promises as fs } from "fs";
import path from "path";

import { DEMO_USER_ID, mockCanvases, mockChatMessages, mockSolutions, mockUser } from "@/lib/mock-data";
import type { CanvasDetail, ChatMessage, Solution, UsageEvent, UserAccount } from "@/lib/types";

export type LocalState = {
  users: UserAccount[];
  canvases: CanvasDetail[];
  solutions: Solution[];
  chatMessages: ChatMessage[];
  usageEvents: UsageEvent[];
};

const dataDir = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDir, "inksolver.json");
const globalForLocalStore = globalThis as typeof globalThis & {
  __inksolverLocalWriteQueue?: Promise<void>;
};

function seedState(): LocalState {
  return {
    users: [mockUser],
    canvases: mockCanvases,
    solutions: mockSolutions,
    chatMessages: mockChatMessages,
    usageEvents: [],
  };
}

function withSolutionCounts(state: LocalState): LocalState {
  return {
    ...state,
    usageEvents: state.usageEvents ?? [],
    users: state.users.length ? state.users : [mockUser],
    canvases: state.canvases.map((canvas) => ({
      ...canvas,
      userId: canvas.userId ?? DEMO_USER_ID,
      solutionCount: state.solutions.filter((solution) => solution.canvasId === canvas.id).length,
    })),
  };
}

async function writeState(state: LocalState) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempFile = path.join(dataDir, `inksolver.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  await fs.writeFile(tempFile, JSON.stringify(withSolutionCounts(state), null, 2));
  await fs.rename(tempFile, dataFile);
}

export async function readLocalState() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return withSolutionCounts(JSON.parse(raw) as LocalState);
  } catch (error) {
    const shouldSeed =
      error instanceof Error &&
      ("code" in error ? (error as NodeJS.ErrnoException).code === "ENOENT" : false);

    if (!shouldSeed) {
      throw error;
    }

    const seeded = seedState();
    await writeState(seeded);
    return withSolutionCounts(seeded);
  }
}

export async function updateLocalState(updater: (state: LocalState) => LocalState) {
  let nextState: LocalState | null = null;
  const previous = globalForLocalStore.__inksolverLocalWriteQueue ?? Promise.resolve();
  const nextWrite = previous.then(async () => {
    const current = await readLocalState();
    const next = withSolutionCounts(updater(current));
    await writeState(next);
    nextState = next;
  });

  globalForLocalStore.__inksolverLocalWriteQueue = nextWrite.catch(() => undefined);
  await nextWrite;

  if (!nextState) {
    throw new Error("Local state update did not produce a state.");
  }

  return nextState;
}
