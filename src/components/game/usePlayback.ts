"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { runProgram } from "@/engine/run";
import type { GameMap, Pos, Program, RunResult } from "@/engine/types";
import { sfx } from "@/lib/sound";
import type { RobotView } from "./MapView";

export const STEP_MS = 400;

/** 결정론적 엔진으로 실행 기록을 만들고 화면에서 한 단계씩 재생한다 (선수 화면·관전 공용) */
export function usePlayback(map: GameMap, opts: { sound?: boolean } = {}) {
  const [robot, setRobot] = useState<RobotView>({ ...map.start });
  const [anim, setAnim] = useState<"idle" | "bump" | "success">("idle");
  const [activePath, setActivePath] = useState<number[] | null>(null);
  const [failPath, setFailPath] = useState<number[] | null>(null);
  const [trail, setTrail] = useState<Pos[]>([]);
  const [stepMs, setStepMs] = useState(STEP_MS);
  const [playing, setPlaying] = useState(false);
  const token = useRef(0);
  const sound = opts.sound ?? true;

  const reset = useCallback(() => {
    token.current++;
    setRobot({ ...map.start });
    setAnim("idle");
    setActivePath(null);
    setFailPath(null);
    setTrail([]);
    setPlaying(false);
  }, [map]);

  useEffect(() => {
    reset();
  }, [reset]);

  const stop = useCallback(() => {
    token.current++;
    setPlaying(false);
    setActivePath(null);
  }, []);

  /** 즉시 결과 위치로 (관전 중간 입장용) */
  const showFinal = useCallback(
    (program: Program) => {
      token.current++;
      const r = runProgram(map, program);
      setRobot({ ...r.final });
      setTrail(r.visited.slice(1));
      setAnim(r.outcome === "success" ? "success" : "idle");
      setFailPath(r.failPath ?? null);
      setActivePath(null);
      setPlaying(false);
      return r;
    },
    [map],
  );

  const play = useCallback(
    (program: Program, speed = 1): Promise<RunResult> => {
      const my = ++token.current;
      const result = runProgram(map, program);
      const ms = STEP_MS / speed;
      setStepMs(ms);
      setRobot({ ...map.start });
      setAnim("idle");
      setFailPath(null);
      setTrail([]);
      setPlaying(true);
      return new Promise((resolve) => {
        let i = 0;
        const steps = result.steps;
        const next = () => {
          if (token.current !== my) return resolve(result);
          if (i >= steps.length) {
            setActivePath(null);
            setPlaying(false);
            if (result.outcome === "success") {
              setAnim("success");
              if (sound) sfx.win();
            } else {
              setFailPath(result.failPath ?? null);
              if (result.outcome !== "crash" && sound) sfx.fail();
            }
            return setTimeout(() => resolve(result), 250);
          }
          const st = steps[i++];
          setActivePath(st.path);
          let delay = ms;
          if (st.kind === "move") {
            setRobot({ x: st.x, y: st.y, dir: st.dir });
            setTrail((t) => [...t, { x: st.x, y: st.y }]);
            if (sound) sfx.step();
          } else if (st.kind === "turn") {
            setRobot({ x: st.x, y: st.y, dir: st.dir });
            if (sound) sfx.turn();
          } else if (st.kind === "bump") {
            setAnim("bump");
            setFailPath(st.path);
            if (sound) sfx.bump();
            delay = 500;
          } else if (st.kind === "check") delay = ms * 0.55;
          else delay = ms * 0.3;
          setTimeout(next, delay);
        };
        setTimeout(next, 120);
      });
    },
    [map, sound],
  );

  return { robot, anim, activePath, failPath, trail, stepMs, playing, play, stop, reset, showFinal };
}
