"use client";
/* 기기 안 기록 (localStorage). 모든 접근은 try/catch로 감싸 저장소가 막혀도 게임은 돌아간다. */
import type { Program, Variant } from "@/engine/types";

const NS = "robotpath:";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* 저장 못 해도 진행 */
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(NS + key);
  } catch {}
}

export function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BestRecord {
  layoutId: string;
  variant: Variant;
  contentVersion: number;
  program: Program;
  stars: number;
  blocks: number;
  target: number;
  at: number;
}

export interface Assignment {
  layoutId: string;
  variant: Variant;
  themeId: string;
}

export interface PlayerSession {
  id: string; // 플레이어 세션 id
  entryKey: string; // 128비트 난수 (랭킹 항목 키)
  nickname: string;
  createdAt: number;
}

export interface Progress {
  sessionId: string;
  best: Record<string, BestRecord>; // stageId → 한 풀이의 묶음
  current: Record<string, Assignment>; // stageId → 지금 배정된 맵
  fails: Record<string, number>;
  lastThemeId: string | null;
  badges: string[];
}

export interface HistoryItem {
  layoutId: string;
  variant: Variant;
  themeId: string;
  at: number;
}

export function newSession(): PlayerSession {
  return { id: randomHex(12), entryKey: randomHex(16), nickname: "", createdAt: Date.now() };
}

export function getSession(): PlayerSession {
  let s = readJson<PlayerSession | null>("session", null);
  if (!s || !s.id || !s.entryKey) {
    s = newSession();
    writeJson("session", s);
  }
  return s;
}

export function saveSession(s: PlayerSession) {
  writeJson("session", s);
}

export function getProgress(): Progress {
  const s = getSession();
  const p = readJson<Progress | null>("progress", null);
  if (!p || p.sessionId !== s.id) return { sessionId: s.id, best: {}, current: {}, fails: {}, lastThemeId: null, badges: [] };
  return { ...p, badges: p.badges ?? [], fails: p.fails ?? {} };
}

export function saveProgress(p: Progress) {
  writeJson("progress", p);
}

export function getHistory(): HistoryItem[] {
  return readJson<HistoryItem[]>("history", []);
}

export function pushHistory(h: HistoryItem) {
  const list = getHistory().filter((x) => !(x.layoutId === h.layoutId && x.variant === h.variant && x.themeId === h.themeId));
  list.push(h);
  writeJson("history", list.slice(-300));
}

/** 다음 친구에게 넘기기: 진행·닉네임을 지우고 새 세션. 대기열과 맵 이력은 남긴다. */
export function handOver(): PlayerSession {
  const s = newSession();
  writeJson("session", s);
  removeKey("progress");
  return s;
}

/** 더 좋은 기록인가: 별점 높은 것, 같으면 목표 대비 초과 블록이 적은 것 */
export function isBetter(a: BestRecord, b: BestRecord | undefined): boolean {
  if (!b) return true;
  if (a.stars !== b.stars) return a.stars > b.stars;
  return Math.max(0, a.blocks - a.target) < Math.max(0, b.blocks - b.target);
}

export function getEventCode(): string | null {
  return readJson<string | null>("eventCode", null);
}
export function setEventCode(code: string | null) {
  if (code) writeJson("eventCode", code);
  else removeKey("eventCode");
}

export function getSoundOn(): boolean {
  return readJson<boolean>("sound", true);
}
export function setSoundOn(v: boolean) {
  writeJson("sound", v);
}
