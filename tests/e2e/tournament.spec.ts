import { expect, test, type Browser, type Page } from "@playwright/test";
import { buildProgram, solution } from "./helpers";

async function teacherPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("/teacher/login");
  await p.fill("#em", "teacher@example.com");
  await p.fill("#pw", "teacher1234");
  await p.getByTestId("teacher-login").click();
  await p.waitForURL("**/teacher");
  return p;
}

async function attemptOf(p: Page, matchId: string) {
  return p.evaluate(async (matchId) => {
    const tok = JSON.parse(localStorage.getItem("robotpath:anonToken")!);
    const info = JSON.parse(localStorage.getItem("robotpath:lastJoin")!);
    const r = await fetch(`/api/tournament/match/snapshot?tid=${info.tid}&matchId=${matchId}`, { headers: { authorization: `Bearer ${tok}` } });
    return (await r.json()).match;
  }, matchId);
}

test("4명 대회: 시작 → 판정 → 재경기 → 새로고침 → 우승", async ({ browser }) => {
  const teacher = await teacherPage(browser);
  await teacher.getByTestId("event-name").fill("테스트 행사");
  await teacher.getByTestId("event-create").click();
  await expect(teacher.getByTestId("event-code")).toHaveText(/^[A-Z]{5}$/);
  await teacher.getByTestId("t-name").fill("4명 대회");
  await teacher.getByTestId("t-create").click();
  await teacher.waitForURL("**/teacher/t/**");
  const code = (await teacher.getByTestId("join-code").textContent())!.trim();

  const players: Page[] = [];
  for (const nick of ["하나", "둘둘", "셋셋", "넷넷"]) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`/join?code=${code}`);
    await p.fill("#nick", nick);
    await p.getByTestId("join-submit").click();
    await p.waitForURL(`**/t/${code}`);
    await expect(p.getByTestId("lobby-status")).toContainText(nick);
    players.push(p);
  }
  await expect(teacher.getByText("참가자 4명")).toBeVisible();
  teacher.once("dialog", (d) => d.accept());
  await teacher.getByTestId("close-and-pair").click();
  await expect(teacher.getByTestId("match-card")).toHaveCount(2);

  // 1라운드 모두 시작 → 선수들은 자동으로 경기 화면으로
  await teacher.getByTestId("start-all").click();
  for (const p of players) await p.waitForURL(`**/t/${code}/match/**`, { timeout: 15000 });
  const matchIdOf = (p: Page) => p.url().split("/match/")[1];

  // 경기 1: 한 명만 성공 → 승. 경기 2: 둘 다 실패 → 재경기
  const byMatch = new Map<string, Page[]>();
  for (const p of players) byMatch.set(matchIdOf(p), [...(byMatch.get(matchIdOf(p)) ?? []), p]);
  const [m1, m2] = [...byMatch.keys()];
  const [p1a, p1b] = byMatch.get(m1)!;
  const [p2a, p2b] = byMatch.get(m2)!;

  const att1 = await attemptOf(p1a, m1);
  await p1a.waitForTimeout(4500); // 카운트다운
  await buildProgram(p1a, solution(att1.attempt.layoutId, att1.attempt.variant));
  await p1a.getByTestId("run").click();
  await expect(p1a.getByTestId("done")).toBeEnabled({ timeout: 15000 });
  await p1a.getByTestId("done").click();
  // 상대는 상태만 본다
  await expect(p1b.getByTestId("opp-status")).toContainText(/성공|제출 완료/, { timeout: 10000 });

  // 경기 중 새로고침해도 이어서 한다
  await p2a.reload();
  await expect(p2a.getByTestId("timer")).toBeVisible();

  // 상대도 성공하지만 블록이 하나 더 많다 → 둘 다 제출 완료 → 즉시 판정 (블록 수)
  await buildProgram(p1b, [...solution(att1.attempt.layoutId, att1.attempt.variant), { t: "left" }]);
  await p1b.getByTestId("run").click();
  await expect(p1b.getByTestId("done")).toBeEnabled({ timeout: 15000 });
  await p1b.getByTestId("done").click();
  await expect(p1b.getByTestId("match-wait")).toContainText("아쉬워요", { timeout: 15000 });
  await expect(teacher.getByTestId("confirm").first()).toBeVisible({ timeout: 10000 });
  await teacher.getByTestId("confirm").first().click();

  // 경기 2: 교사가 재경기 만들기 → 재경기 시작
  const card2 = teacher.getByTestId("match-card").filter({ hasNotText: "확정" }).first();
  await card2.getByText("더보기").click();
  teacher.once("dialog", (d) => d.accept());
  await card2.getByText("재경기 만들기").click();
  await expect(card2.getByTestId("start-match")).toContainText("재경기", { timeout: 10000 });
  await card2.getByTestId("start-match").click();
  const att2 = await attemptOf(p2a, m2);
  expect(att2.attempt.attemptNo).toBe(2);
  await p2a.goto(`/t/${code}/match/${m2}`);
  await p2a.waitForTimeout(4500);
  await buildProgram(p2a, solution(att2.attempt.layoutId, att2.attempt.variant));
  await p2a.getByTestId("run").click();
  await expect(p2a.getByTestId("done")).toBeEnabled({ timeout: 15000 });
  await p2a.getByTestId("done").click();
  // 상대도 같은 풀이 + 한 블록 더 (블록 수 비교)
  await p2b.goto(`/t/${code}/match/${m2}`);
  await buildProgram(p2b, [...solution(att2.attempt.layoutId, att2.attempt.variant), { t: "left" }]);
  await p2b.getByTestId("run").click();
  await expect(p2b.getByTestId("done")).toBeEnabled({ timeout: 15000 });
  await p2b.getByTestId("done").click();
  await expect(p2a.getByTestId("match-wait")).toContainText("이겼어요", { timeout: 15000 });
  await expect(teacher.getByTestId("confirm").first()).toBeVisible({ timeout: 10000 });
  await teacher.getByTestId("confirm").first().click();

  // 결승
  teacher.once("dialog", (d) => d.accept());
  await teacher.getByTestId("next-round").click();
  await expect(teacher.getByTestId("match-card")).toHaveCount(1);
  await teacher.getByTestId("start-match").click();
  const finalists = [p1a, p2a];
  for (const p of finalists) await p.goto(`/t/${code}`);
  for (const p of finalists) await p.waitForURL(`**/t/${code}/match/**`, { timeout: 15000 });
  const mf = matchIdOf(p1a);
  const attF = await attemptOf(p1a, mf);
  await p1a.waitForTimeout(4500);
  await buildProgram(p1a, solution(attF.attempt.layoutId, attF.attempt.variant));
  await p1a.getByTestId("run").click();
  await expect(p1a.getByTestId("done")).toBeEnabled({ timeout: 20000 });
  await p1a.getByTestId("done").click();
  // 교사가 승자 지정 (상대 기권)
  const cardF = teacher.getByTestId("match-card").first();
  await cardF.getByText("더보기").click();
  teacher.once("dialog", (d) => d.accept());
  await cardF.getByText("🏅 " + (await p1a.evaluate(() => JSON.parse(localStorage.getItem("robotpath:lastJoin")!).name)) + " 승으로").click();
  await expect(teacher.getByTestId("champion")).toBeVisible({ timeout: 10000 });
  await p1a.goto(`/t/${code}`);
  await expect(p1a.getByTestId("lobby-status")).toContainText("우승");
});
