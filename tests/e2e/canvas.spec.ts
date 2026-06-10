import { test, expect, type Page } from "@playwright/test";

// These flows run against the local-first dev stack: no Clerk keys means the
// demo identity is used, and no NVIDIA key means the mock solver streams the
// power-rule integral — which the local verifier marks as verified.

async function createCanvasViaApi(page: Page, title: string) {
  const response = await page.request.post("/api/v1/canvases", {
    data: { title, subject: "math" },
  });
  expect(response.status()).toBe(201);
  const payload = (await response.json()) as { canvas_id: string; share_slug: string };
  return payload;
}

async function drawStroke(page: Page) {
  await page.getByTestId("tools.draw").click();

  const canvas = page.locator(".tl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("tldraw canvas not visible");

  const startX = box.x + box.width * 0.35;
  const startY = box.y + box.height * 0.45;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(startX + i * 24, startY + Math.sin(i) * 18, { steps: 4 });
  }
  await page.mouse.up();
}

test("solve with an empty board explains what to do", async ({ page }) => {
  const { canvas_id } = await createCanvasViaApi(page, "E2E Empty Board");
  await page.goto(`/c/${canvas_id}`);

  await page.getByRole("button", { name: "Solve" }).click();

  await expect(page.getByRole("status")).toContainText("Draw or select a problem first");
});

test("draw, solve, and receive a verified streamed solution", async ({ page }) => {
  const { canvas_id } = await createCanvasViaApi(page, "E2E Golden Path");
  await page.goto(`/c/${canvas_id}`);

  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 });
  await drawStroke(page);

  await page.getByRole("button", { name: "Solve" }).click();

  // The mock solver streams three steps; the local verifier confirms them.
  await expect(page.getByText("Step 1:")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Step 3:")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".katex").first()).toBeVisible();

  // The solved answer is also placed on the canvas, which marks the board
  // dirty and autosaves it.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("drawing marks the board unsaved and autosave settles back to saved", async ({ page }) => {
  const { canvas_id } = await createCanvasViaApi(page, "E2E Autosave");
  await page.goto(`/c/${canvas_id}`);

  await expect(page.locator(".tl-canvas")).toBeVisible({ timeout: 20_000 });
  await drawStroke(page);

  // Autosave debounces for ~1.2s, then persists.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 20_000 });

  const detail = await page.request.get(`/api/v1/canvases/${canvas_id}`);
  expect(detail.status()).toBe(200);
  const payload = (await detail.json()) as { canvas: { tldrawState: unknown } };
  expect(payload.canvas.tldrawState).toBeTruthy();
});
