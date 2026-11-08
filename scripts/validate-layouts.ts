/**
 * 레이아웃 검증 (5절). package.json prebuild에서 실행되며 실패하면 빌드가 멈춘다.
 * 1. 모든 레이아웃·변형에서 solution이 성공하고, 블록 수 = target, allowedBlocks·maxNesting을 지킨다.
 * 2. target−1 이하로 성공하는 프로그램이 없는지 전수 탐색한다. 레이아웃당 60초를 넘기면
 *    targetVerified=false여야 한다(화면에 「목표」로 표시). true인데 확인 못 하면 실패.
 * 3. 튜토리얼을 뺀 id 중복 없음, 등급별 레이아웃 수가 표 이상.
 * 그리고 각 단계(4절 단계표)에 후보 레이아웃이 1개 이상 있는지 확인한다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { buildMap, checkProgram, countBlocks, LayoutJson, runProgram, solutionFor, VARIANTS } from "../src/engine/index";
import { searchProgram } from "../src/engine/search";

const LAYOUT_DIR = path.join(__dirname, "../src/content/layouts");
const TIME_LIMIT_MS = Number(process.env.LAYOUT_SEARCH_MS ?? 60000);

function staticChecks(l: LayoutJson): string[] {
  const errs: string[] = [];
  const [w, h] = l.size;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inb(l.start.x, l.start.y)) errs.push("start 밖");
  if (!inb(l.goal.x, l.goal.y)) errs.push("goal 밖");
  const wallSet = new Set(l.walls.map(([x, y]) => `${x},${y}`));
  if (wallSet.has(`${l.start.x},${l.start.y}`) || wallSet.has(`${l.goal.x},${l.goal.y}`)) errs.push("시작·목적지에 벽");
  if (l.start.x === l.goal.x && l.start.y === l.goal.y) errs.push("시작 = 목적지");
  for (const [x, y] of [...l.walls, ...l.colors.red, ...l.colors.blue]) if (!inb(x, y)) errs.push(`칸 (${x},${y}) 밖`);
  if (l.maxNesting > 2) errs.push("maxNesting > 2");
  for (const v of VARIANTS) {
    const sol = solutionFor(l, v);
    const r = runProgram(buildMap(l, v), sol);
    if (r.outcome !== "success") errs.push(`${v}: solution 실패 (${r.outcome})`);
    if (countBlocks(sol) !== l.target) errs.push(`${v}: solution 블록 수 ${countBlocks(sol)} ≠ target ${l.target}`);
    const e = checkProgram(sol, l);
    if (e) errs.push(`${v}: solution 규칙 위반 (${e.code})`);
  }
  return errs;
}

function exhaustive(l: LayoutJson): { ok: boolean; complete: boolean; shorter?: unknown; ms: number } {
  const t = Date.now();
  // 변형은 좌표·돌기를 1:1로 바꾸므로 원본에서 더 짧은 풀이가 없으면 모든 변형에서 없다.
  const r = searchProgram(buildMap(l), {
    allowedBlocks: l.allowedBlocks,
    maxNesting: l.maxNesting,
    maxBlocks: l.target - 1,
    deadline: Date.now() + TIME_LIMIT_MS,
  });
  return { ok: !r.found, complete: r.complete, shorter: r.found ?? undefined, ms: Date.now() - t };
}

const MIN_COUNTS: Record<string, number> = { D1: 6, D2: 10, D3: 6, D4: 10, D5: 6, D6: 6 };

async function main() {
  const files = fs.readdirSync(LAYOUT_DIR).filter((f) => f.endsWith(".json")).sort();
  const layouts: LayoutJson[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(LAYOUT_DIR, f), "utf8")));
  const errors: string[] = [];

  // index.ts가 모든 파일을 포함하는지
  const index = fs.readFileSync(path.join(LAYOUT_DIR, "index.ts"), "utf8");
  for (const f of files) if (!index.includes(`"./${f}"`)) errors.push(`index.ts에 ${f} 없음 (npx tsx scripts/write-layout-index.ts)`);

  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  for (const [i, l] of layouts.entries()) {
    if (`${l.id}.json` !== files[i]) errors.push(`${files[i]}: 파일 이름과 id(${l.id})가 다름`);
    if (ids.has(l.id)) errors.push(`id 중복: ${l.id}`);
    ids.add(l.id);
    if (l.grade !== "T") counts[l.grade] = (counts[l.grade] ?? 0) + 1;
    for (const e of staticChecks(l)) errors.push(`${l.id}: ${e}`);
  }
  for (const [g, n] of Object.entries(MIN_COUNTS)) if ((counts[g] ?? 0) < n) errors.push(`${g} 레이아웃 ${counts[g] ?? 0}개 < ${n}개`);

  // 단계마다 후보가 있는지 (stages.ts는 @/ 별칭을 쓰므로 tsx가 tsconfig paths로 해석한다)
  const { STAGES, candidatesFor } = await import("../src/content/stages");
  for (const s of STAGES) if (candidatesFor(s).length === 0) errors.push(`단계 ${s.id}: 후보 레이아웃 없음`);

  // 전수 탐색 (병렬)
  const results = await runParallel(layouts);
  for (const [i, r] of results.entries()) {
    const l = layouts[i];
    if (!r.ok) errors.push(`${l.id}: target ${l.target}보다 짧은 풀이가 있음 ${JSON.stringify(r.shorter)}`);
    else if (!r.complete && l.targetVerified) errors.push(`${l.id}: ${TIME_LIMIT_MS / 1000}초 안에 확인 못 함 → targetVerified를 false로`);
    else if (r.complete && !l.targetVerified) console.warn(`  참고: ${l.id}는 확인 가능하므로 targetVerified를 true로 바꿀 수 있음`);
  }
  const slow = results.map((r, i) => [layouts[i].id, r.ms] as const).filter(([, ms]) => ms > 3000);
  if (slow.length) console.log("  오래 걸린 탐색:", slow.map(([id, ms]) => `${id} ${(ms / 1000).toFixed(1)}s`).join(", "));

  if (errors.length) {
    console.error(`\n레이아웃 검증 실패 (${errors.length}건):`);
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log(`레이아웃 검증 통과: ${layouts.length}개 (${Object.entries(counts).map(([g, n]) => `${g}:${n}`).join(" ")})`);
}

function runParallel(layouts: LayoutJson[]): Promise<ReturnType<typeof exhaustive>[]> {
  const n = Math.max(1, Math.min(os.cpus().length, 4, layouts.length));
  const results: ReturnType<typeof exhaustive>[] = new Array(layouts.length);
  // 오래 걸릴 것 같은 것(목표 큰 것)부터
  const order = layouts.map((_, i) => i).sort((a, b) => layouts[b].target - layouts[a].target);
  let next = 0;
  return new Promise((resolve, reject) => {
    let alive = n;
    for (let k = 0; k < n; k++) {
      const w = new Worker(`require("tsx/cjs/api").register(); require(${JSON.stringify(__filename)});`, {
        eval: true,
        workerData: { worker: true },
      });
      const feed = () => {
        if (next >= order.length) {
          w.terminate();
          if (--alive === 0) resolve(results);
          return;
        }
        const i = order[next++];
        w.postMessage({ i, layout: layouts[i] });
      };
      w.on("message", (m: { i: number; r: ReturnType<typeof exhaustive> }) => {
        results[m.i] = m.r;
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (workerData?.worker) {
  parentPort!.on("message", (m: { i: number; layout: LayoutJson }) => {
    parentPort!.postMessage({ i: m.i, r: exhaustive(m.layout) });
  });
}
