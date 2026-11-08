import { expect, test, type Page } from "@playwright/test";
import { buildProgram, solution } from "./helpers";

const STAGES = ["1-1", "1-2", "1-3", "1-4", "1-5", "2-1", "2-2", "2-3", "2-4", "2-5", "3-1", "3-2", "3-3", "3-4", "3-5"];

async function clearStage(page: Page, id: string) {
  await expect(page.getByTestId("run")).toBeVisible();
  const a = await page.evaluate((id) => JSON.parse(localStorage.getItem("robotpath:progress")!).current[id], id);
  await buildProgram(page, solution(a.layoutId, a.variant));
  await page.getByTestId("run").click();
  await expect(page.getByTestId("next-stage")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("next-stage").click();
}

async function playAll(page: Page) {
  await page.goto("/play");
  await page.getByTestId("stage-1-1").click();
  for (const id of STAGES) {
    await clearStage(page, id);
    if (id.endsWith("-5")) {
      await expect(page.getByTestId("chapter-done")).toBeVisible();
      if (id !== "3-5") await page.getByText("다음 챕터 →").click();
    }
  }
}

for (const [name, viewport] of [
  ["phone360", { width: 360, height: 740 }],
  ["tablet", { width: 1180, height: 820 }],
  ["board1920", { width: 1920, height: 1080 }],
] as const) {
  test(`개인 모드 15단계 완주 (${name}, 터치)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: name === "phone360" });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("robotpath:sound", "false"));
    await playAll(page);
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem("robotpath:progress")!));
    expect(Object.keys(p.best)).toHaveLength(15);
    for (const b of Object.values(p.best) as { stars: number }[]) expect(b.stars).toBe(3);
    expect(errors).toEqual([]);
  });
}

test("첫 접속 후 오프라인에서도 단계 이동·새로고침·완주", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("robotpath:sound", "false"));
  await page.goto("/");
  // 서비스 워커가 미리 저장을 마칠 때까지
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.goto("/play");
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("stage-1-1")).toBeVisible();
  await page.getByTestId("stage-1-1").click();
  await clearStage(page, "1-1");
  await page.reload();
  await expect(page.getByTestId("stage-1-2")).toBeEnabled();
  await page.getByTestId("stage-2-1").click();
  await clearStage(page, "2-1");
  await page.reload();
  await page.getByTestId("stage-3-1").click();
  await clearStage(page, "3-1");
  // 대기열에 통계가 쌓여 있다
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem("robotpath:queue") ?? "{}"));
  expect(q.stats.length).toBeGreaterThan(0);
  await ctx.setOffline(false);
});
