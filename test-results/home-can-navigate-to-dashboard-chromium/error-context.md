# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: home.spec.ts >> can navigate to dashboard
- Location: tests/e2e/home.spec.ts:8:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=InkSolver')
Expected: visible
Error: strict mode violation: locator('text=InkSolver') resolved to 2 elements:
    1) <span class="text-base font-medium">InkSolver</span> aka getByRole('link', { name: 'InkSolver' })
    2) <p class="mt-5 max-w-xl text-base leading-7 text-body">InkSolver now covers the PRD workflow through sol…</p> aka getByText('InkSolver now covers the PRD')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=InkSolver')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - button "Open navigation" [ref=e6] [cursor=pointer]:
          - img [ref=e7]
        - link "InkSolver" [ref=e8] [cursor=pointer]:
          - /url: /
          - img [ref=e10]
          - generic [ref=e15]: InkSolver
      - navigation "Primary" [ref=e16]:
        - link "Onboarding" [ref=e17] [cursor=pointer]:
          - /url: /onboarding
        - link "Feedback" [ref=e18] [cursor=pointer]:
          - /url: /feedback
          - img [ref=e19]
          - text: Feedback
        - link "Readiness" [ref=e21] [cursor=pointer]:
          - /url: /readiness
          - img [ref=e22]
          - text: Readiness
        - link "Settings" [ref=e24] [cursor=pointer]:
          - /url: /settings
          - img [ref=e25]
          - text: Settings
        - button "Account" [ref=e28] [cursor=pointer]:
          - img [ref=e29]
  - main [ref=e33]:
    - generic [ref=e34]:
      - generic [ref=e35]:
        - generic [ref=e36]: Phase 16 local beta
        - heading "Draw the STEM problem. Solve it beside your work." [level=1] [ref=e37]
        - paragraph [ref=e38]: InkSolver now covers the PRD workflow through solving, verification, follow-up chat, quota enforcement, sharing, exports, readiness checks, and beta feedback capture.
        - generic [ref=e39]:
          - button "New canvas" [ref=e41] [cursor=pointer]:
            - img [ref=e42]
            - text: New canvas
          - link "Start onboarding" [ref=e43] [cursor=pointer]:
            - /url: /onboarding
            - text: Start onboarding
            - img [ref=e44]
      - generic [ref=e46]:
        - generic [ref=e47]:
          - generic [ref=e48]:
            - paragraph [ref=e49]: Daily solve quota
            - paragraph [ref=e50]:
              - text: "0"
              - generic [ref=e51]: /10
          - generic [ref=e52]: FREE
        - generic [ref=e54]:
          - generic [ref=e55]:
            - img [ref=e56]
            - paragraph [ref=e61]: 3/5
            - paragraph [ref=e62]: Active canvases
          - generic [ref=e63]:
            - img [ref=e64]
            - paragraph [ref=e67]: 6s
            - paragraph [ref=e68]: Latency target
          - generic [ref=e69]:
            - img [ref=e70]
            - paragraph [ref=e73]: Live
            - paragraph [ref=e74]: Verifier
    - generic [ref=e75]:
      - generic [ref=e76]:
        - generic [ref=e77]:
          - generic [ref=e78]:
            - heading "Recent canvases" [level=2] [ref=e79]
            - paragraph [ref=e80]: The dashboard shape from the PRD is in place.
          - button "Import PDF" [ref=e81] [cursor=pointer]:
            - img [ref=e82]
            - text: Import PDF
        - generic [ref=e85]:
          - link "v² = u² + 2as Projectile Motion Practice Updated May 28, 4:26 PM Physics 1 solutions" [ref=e86] [cursor=pointer]:
            - /url: /c/00000000-0000-4000-8000-000000000102
            - generic [ref=e87]:
              - paragraph [ref=e90]: v² = u² + 2as
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - generic [ref=e95]:
                    - heading "Projectile Motion Practice" [level=3] [ref=e96]
                    - paragraph [ref=e97]: Updated May 28, 4:26 PM
                  - img [ref=e98]
                - generic [ref=e101]:
                  - generic [ref=e102]: Physics
                  - generic [ref=e103]: 1 solutions
          - link "\\int x^2 dx P3 Calculus Past Paper Updated May 28, 4:04 PM Math 9 solutions" [ref=e104] [cursor=pointer]:
            - /url: /c/00000000-0000-4000-8000-000000000101
            - generic [ref=e105]:
              - paragraph [ref=e108]: \int x^2 dx
              - generic [ref=e111]:
                - generic [ref=e112]:
                  - generic [ref=e113]:
                    - heading "P3 Calculus Past Paper" [level=3] [ref=e114]
                    - paragraph [ref=e115]: Updated May 28, 4:04 PM
                  - img [ref=e116]
                - generic [ref=e122]:
                  - generic [ref=e123]: Math
                  - generic [ref=e124]: 9 solutions
          - link "\\int x^2 dx Organic Reaction Notes Updated May 24, 9:45 PM Chemistry 1 solutions" [ref=e125] [cursor=pointer]:
            - /url: /c/00000000-0000-4000-8000-000000000103
            - generic [ref=e126]:
              - paragraph [ref=e129]: \int x^2 dx
              - generic [ref=e132]:
                - generic [ref=e133]:
                  - generic [ref=e134]:
                    - heading "Organic Reaction Notes" [level=3] [ref=e135]
                    - paragraph [ref=e136]: Updated May 24, 9:45 PM
                  - img [ref=e137]
                - generic [ref=e140]:
                  - generic [ref=e141]: Chemistry
                  - generic [ref=e142]: 1 solutions
      - generic [ref=e143]:
        - heading "Verification-first solving" [level=2] [ref=e144]
        - paragraph [ref=e145]: The current build enforces free-plan limits, records solve/chat usage, and keeps billing webhook handling ready for Lemon Squeezy production credentials.
        - link "Open demo canvas" [ref=e146] [cursor=pointer]:
          - /url: /c/00000000-0000-4000-8000-000000000102
          - text: Open demo canvas
          - img [ref=e147]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('has title', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await expect(page).toHaveTitle(/InkSolver/);
  6  | });
  7  | 
  8  | test('can navigate to dashboard', async ({ page }) => {
  9  |   await page.goto('/');
  10 |   // Checking if the basic UI element is loaded
> 11 |   await expect(page.locator('text=InkSolver')).toBeVisible();
     |                                                ^ Error: expect(locator).toBeVisible() failed
  12 | });
  13 | 
```