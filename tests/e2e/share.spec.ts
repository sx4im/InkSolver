import { test, expect } from "@playwright/test";

test("published canvases are readable at their share link", async ({ page }) => {
  const created = await page.request.post("/api/v1/canvases", {
    data: { title: "E2E Shared Board", subject: "physics" },
  });
  expect(created.status()).toBe(201);
  const { canvas_id, share_slug } = (await created.json()) as { canvas_id: string; share_slug: string };

  // Private by default: the share page 404s until published.
  const privateView = await page.request.get(`/s/${share_slug}`);
  expect(privateView.status()).toBe(404);

  const published = await page.request.patch(`/api/v1/canvases/${canvas_id}`, {
    data: { is_public: true },
  });
  expect(published.status()).toBe(200);

  await page.goto(`/s/${share_slug}`);
  await expect(page.getByRole("heading", { name: "E2E Shared Board" })).toBeVisible();
  await expect(page.getByText("Read-only mode")).toBeVisible();

  // The share API and OG preview are public surfaces for crawlers.
  const shareApi = await page.request.get(`/api/v1/share/${share_slug}`);
  expect(shareApi.status()).toBe(200);

  const og = await page.request.get(`/api/v1/share/${share_slug}/og`);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});
