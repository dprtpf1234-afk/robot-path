import { describe, expect, it } from "vitest";
import {
  buildMap,
  checkProgram,
  countBlocks,
  fromCompact,
  LayoutJson,
  minDistance,
  nestingDepth,
  parseProgram,
  placeLayout,
  Program,
  runProgram,
  solutionFor,
  starsFor,
  startDistance,
  toCompact,
  VARIANTS,
} from "./index";
import { findShortest, searchProgram } from "./search";

const base = (over: Partial<LayoutJson> = {}): LayoutJson => ({
  id: "test",
  contentVersion: 1,
  grade: "D1",
  size: [5, 5],
  start: { x: 0, y: 2, dir: "E" },
  goal: { x: 3, y: 2 },
  walls: [],
  colors: { red: [], blue: [] },
  allowedBlocks: ["forward", "left", "right", "repeat", "ifWall", "ifColor", "untilGoal"],
  maxNesting: 2,
  target: 3,
  targetVerified: true,
  solution: ["forward", "forward", "forward"],
  ...over,
});

const F = { t: "forward" } as const;
const L = { t: "left" } as const;
const R = { t: "right" } as const;

describe("규칙 1: 도착", () => {
  it("목적지에 들어가는 순간 성공하고 남은 명령은 실행하지 않는다", () => {
    const m = buildMap(base());
    const r = runProgram(m, [F, F, F, F, F, L]);
    expect(r.outcome).toBe("success");
    expect(r.final).toEqual({ x: 3, y: 2, dir: "E" });
    expect(r.execCount).toBe(3);
    expect(countBlocks([F, F, F, F, F, L])).toBe(6);
  });
  it("반복 안에서 목적지를 지나치지 않고 그 자리에서 끝난다", () => {
    const m = buildMap(base());
    const r = runProgram(m, [{ t: "repeat", n: 9, body: [F] }]);
    expect(r.outcome).toBe("success");
    expect(r.final.x).toBe(3);
  });
});

describe("규칙 2: 충돌", () => {
  it("벽으로 이동하면 제자리에서 멈추고 실패", () => {
    const m = buildMap(base({ walls: [[2, 2]] }));
    const r = runProgram(m, [F, F, F]);
    expect(r.outcome).toBe("crash");
    expect(r.final).toEqual({ x: 1, y: 2, dir: "E" });
    expect(r.failPath).toEqual([1]);
    expect(r.steps.at(-1)?.kind).toBe("bump");
  });
  it("맵 밖으로 이동도 충돌로 같게 처리", () => {
    const m = buildMap(base());
    const r = runProgram(m, [R, R, F]);
    expect(r.outcome).toBe("crash");
    expect(r.final).toEqual({ x: 0, y: 2, dir: "W" });
  });
  it("그릇 안에서 충돌하면 그 안쪽 블록 위치를 알려준다", () => {
    const m = buildMap(base({ walls: [[1, 2]] }));
    const r = runProgram(m, [L, { t: "repeat", n: 2, body: [R, F] }]);
    expect(r.outcome).toBe("crash");
    expect(r.failPath).toEqual([1, 1]);
  });
});

describe("규칙 3: 실행 횟수 제한", () => {
  // 회전만 하는 프로그램으로 실행 횟수를 정확히 맞춘다.
  // repeat 9 { repeat 9 { L L L L } } = 바깥 9 + 안쪽 81 + 회전 324 = 414
  it("500회까지는 실행한다", () => {
    const m = buildMap(base());
    // 414 + repeat 9 {L L L L L L L L} 의 9+72 = 81 → 495, 그리고 회전 5개 = 500
    const p: Program = [
      { t: "repeat", n: 9, body: [{ t: "repeat", n: 9, body: [L, L, L, L] }] },
      { t: "repeat", n: 9, body: [L, L, L, L, L, L, L, L] },
      L, L, L, L, L,
    ];
    const r = runProgram(m, p);
    expect(r.execCount).toBe(500);
    expect(r.outcome).toBe("notArrived");
  });
  it("501번째를 시작하려는 순간 지친다", () => {
    const m = buildMap(base());
    const p: Program = [
      { t: "repeat", n: 9, body: [{ t: "repeat", n: 9, body: [L, L, L, L] }] },
      { t: "repeat", n: 9, body: [L, L, L, L, L, L, L, L] },
      L, L, L, L, L, F,
    ];
    const r = runProgram(m, p);
    expect(r.execCount).toBe(500);
    expect(r.outcome).toBe("tired");
    expect(r.final.x).toBe(0);
    expect(r.failPath).toEqual([7]);
  });
  it("도착할 때까지 반복이 도착하지 못하면 지친다", () => {
    const m = buildMap(base({ walls: [[2, 2]] }));
    const r = runProgram(m, [{ t: "untilGoal", body: [{ t: "ifWall", body: [L, L] }, F] }]);
    expect(r.outcome).toBe("tired");
    expect(r.execCount).toBe(500);
  });
  it("조건 검사와 반복 한 바퀴 시작을 1회로 센다", () => {
    const m = buildMap(base());
    const r = runProgram(m, [{ t: "repeat", n: 2, body: [{ t: "ifWall", body: [L] }] }]);
    // 바퀴 2 + 검사 2 = 4
    expect(r.execCount).toBe(4);
  });
});

describe("규칙 4: 끝까지 실행했는데 목적지가 아니면 실패", () => {
  it("notArrived", () => {
    const r = runProgram(buildMap(base()), [F, F]);
    expect(r.outcome).toBe("notArrived");
  });
});

describe("규칙 5·6: 빈 그릇·크기·허용 블록", () => {
  const rules = { allowedBlocks: ["forward", "left", "right", "repeat"] as const, maxNesting: 1 };
  it("빈 그릇은 거부하고 위치를 알려준다", () => {
    const e = checkProgram([F, { t: "repeat", n: 2, body: [] }], { ...rules, allowedBlocks: [...rules.allowedBlocks] });
    expect(e?.code).toBe("emptyContainer");
    expect(e && "path" in e && e.path).toEqual([1]);
  });
  it("안쪽 빈 그릇도 찾는다", () => {
    const e = checkProgram([{ t: "repeat", n: 2, body: [F, { t: "repeat", n: 3, body: [] }] }], {
      allowedBlocks: ["forward", "repeat"],
      maxNesting: 2,
    });
    expect(e && "path" in e && e.path).toEqual([0, 1]);
  });
  it("블록 40개 초과 거부", () => {
    const p = Array.from({ length: 41 }, () => F);
    expect(checkProgram(p, { allowedBlocks: ["forward"], maxNesting: 0 })?.code).toBe("tooManyBlocks");
    expect(checkProgram(p.slice(1), { allowedBlocks: ["forward"], maxNesting: 0 })).toBeNull();
  });
  it("최대 중첩 초과 거부", () => {
    const p: Program = [{ t: "repeat", n: 2, body: [{ t: "repeat", n: 2, body: [F] }] }];
    expect(nestingDepth(p)).toBe(2);
    expect(checkProgram(p, { allowedBlocks: ["forward", "repeat"], maxNesting: 1 })?.code).toBe("tooDeep");
    expect(checkProgram(p, { allowedBlocks: ["forward", "repeat"], maxNesting: 2 })).toBeNull();
  });
  it("허용되지 않은 블록 거부", () => {
    expect(checkProgram([{ t: "ifWall", body: [F] }], { allowedBlocks: ["forward", "repeat"], maxNesting: 2 })?.code).toBe(
      "notAllowed",
    );
  });
  it("parseProgram은 이상한 모양을 거부한다", () => {
    expect(parseProgram([{ t: "forward" }])).toEqual([F]);
    expect(parseProgram([{ t: "repeat", n: 10, body: [F] }])).toBeNull();
    expect(parseProgram([{ t: "repeat", n: 1, body: [F] }])).toBeNull();
    expect(parseProgram([{ t: "jump" }])).toBeNull();
    expect(parseProgram([{ t: "forward", extra: 1 }])).toBeNull();
    expect(parseProgram([{ t: "ifColor", color: "green", body: [F] }])).toBeNull();
    expect(parseProgram({})).toBeNull();
    const deep = [{ t: "repeat", n: 2, body: [{ t: "repeat", n: 2, body: [{ t: "repeat", n: 2, body: [F] }] }] }];
    expect(parseProgram(deep)).toBeNull();
  });
});

describe("조건 블록", () => {
  it("앞이 막혔다면 (벽·맵 밖)", () => {
    const m = buildMap(base({ start: { x: 0, y: 0, dir: "N" }, goal: { x: 2, y: 0 } }));
    const r = runProgram(m, [{ t: "repeat", n: 3, body: [{ t: "ifWall", body: [R] }, F] }]);
    expect(r.outcome).toBe("success");
  });
  it("바닥이 색이라면", () => {
    const m = buildMap(
      base({ start: { x: 0, y: 0, dir: "E" }, goal: { x: 2, y: 2 }, colors: { red: [[2, 0]], blue: [] } }),
    );
    const r = runProgram(m, [{ t: "untilGoal", body: [F, { t: "ifColor", color: "red", body: [R] }] }]);
    expect(r.outcome).toBe("success");
  });
});

describe("규칙 8: min_distance", () => {
  it("시작 칸 포함, 벽을 피한 최단 거리의 최솟값", () => {
    const m = buildMap(base({ walls: [[2, 2]] }));
    expect(startDistance(m)).toBe(5); // 벽을 돌아가야 함
    const r = runProgram(m, [L, F, R, F]);
    expect(minDistance(m, r.visited)).toBe(3);
  });
});

describe("별점", () => {
  it("성공·목표+2·목표", () => {
    expect(starsFor(false, 1, 5)).toBe(0);
    expect(starsFor(true, 8, 5)).toBe(1);
    expect(starsFor(true, 7, 5)).toBe(2);
    expect(starsFor(true, 5, 5)).toBe(3);
    expect(starsFor(true, 4, 5)).toBe(3);
  });
});

const example: LayoutJson = {
  id: "d3-corner-01",
  contentVersion: 1,
  grade: "D3",
  size: [6, 6],
  start: { x: 0, y: 5, dir: "E" },
  goal: { x: 5, y: 0 },
  walls: [
    [1, 4],
    [2, 4],
  ],
  colors: { red: [], blue: [] },
  allowedBlocks: ["forward", "left", "right", "repeat"],
  maxNesting: 1,
  target: 5,
  targetVerified: true,
  solution: [{ repeat: 5, body: ["forward"] }, "left", { repeat: 5, body: ["forward"] }],
};

describe("5절 예시 레이아웃", () => {
  it("모든 변형에서 풀이가 성공한다", () => {
    for (const v of VARIANTS) {
      const r = runProgram(buildMap(example, v), solutionFor(example, v));
      expect(r.outcome, v).toBe("success");
    }
  });
  it("변형 좌표가 PRD 표와 같다", () => {
    const p = placeLayout(example, "flipX");
    expect(p.start).toEqual({ x: 5, y: 5, dir: "W" });
    const q = placeLayout(example, "rot180");
    expect(q.start).toEqual({ x: 5, y: 0, dir: "W" });
    expect(q.goal).toEqual({ x: 0, y: 5 });
    const s = placeLayout(example, "flipY");
    expect(s.start).toEqual({ x: 0, y: 0, dir: "E" });
  });
  it("중첩 1이면 최소 5블록", () => {
    const m = buildMap(example);
    const r = findShortest(m, { allowedBlocks: example.allowedBlocks, maxNesting: 1, limit: 6 });
    expect(r.size).toBe(5);
    expect(r.complete).toBe(true);
  });
  it("중첩 2면 최소 4블록", () => {
    const m = buildMap(example);
    const r = findShortest(m, { allowedBlocks: example.allowedBlocks, maxNesting: 2, limit: 6 });
    expect(r.size).toBe(4);
    expect(runProgram(m, r.program!).outcome).toBe("success");
  });
  it("전수 탐색은 4블록 이하 풀이가 없음을 확인한다 (중첩 1)", () => {
    const r = searchProgram(buildMap(example), { allowedBlocks: example.allowedBlocks, maxNesting: 1, maxBlocks: 4 });
    expect(r.complete).toBe(true);
    expect(r.found).toBeNull();
  });
  it("compact 변환 왕복", () => {
    expect(toCompact(fromCompact(example.solution))).toEqual(example.solution);
  });
});
