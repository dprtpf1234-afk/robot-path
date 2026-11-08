"use client";
import { getSoundOn } from "./local";

let ctx: AudioContext | null = null;

function tone(freq: number, ms: number, type: OscillatorType = "sine", gain = 0.08, delay = 0) {
  if (!getSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime + delay / 1000;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + ms / 1000 + 0.02);
  } catch {
    /* 소리를 못 내도 진행 */
  }
}

export const sfx = {
  tap: () => tone(660, 60, "triangle", 0.05),
  step: () => tone(440, 70, "sine", 0.04),
  turn: () => tone(520, 60, "triangle", 0.035),
  bump: () => tone(140, 220, "sawtooth", 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 160, "triangle", 0.07, i * 110)),
  fail: () => [392, 330].forEach((f, i) => tone(f, 160, "sine", 0.05, i * 140)),
};
