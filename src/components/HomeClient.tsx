"use client";
import { useEffect, useState } from "react";
import { getEventCode, getSession, handOver, setEventCode } from "@/lib/local";
import { startAutoFlush } from "@/lib/sync";
import { placeLayout } from "@/engine/map";
import { LAYOUTS_BY_ID } from "@/content/layouts";
import { THEMES_BY_ID } from "@/content/themes";
import { MapView } from "./game/MapView";

const HERO = placeLayout(LAYOUTS_BY_ID.t1, "orig");

export function HomeClient() {
  const [code, setCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const ev = url.searchParams.get("event")?.toUpperCase();
    if (ev && /^[A-Z]{5}$/.test(ev)) setEventCode(ev);
    setCode(getEventCode());
    getSession();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return startAutoFlush();
  }, []);

  const big = "blk3d flex min-h-20 items-center justify-center gap-3 rounded-3xl px-6 text-3xl font-black text-[#3d3a5c]";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 p-6">
      <div className="text-center">
        <div className="mx-auto h-48 w-full max-w-sm sm:h-56" aria-hidden>
          <MapView placed={HERO} theme={THEMES_BY_ID.town} robot={{ ...HERO.start }} label="로봇 길찾기" />
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">로봇 길찾기</h1>
        <p className="mt-1 text-lg text-slate-600">블록으로 로봇을 목적지까지 보내요!</p>
      </div>
      <a href="/play" className={`${big} w-full bg-[#c9bdf0]`} style={{ ["--blk-edge" as string]: "#a28fd6" }} data-testid="home-play">
        혼자 하기
      </a>
      <a href="/join" className={`${big} w-full bg-[#f4b9cb]`} style={{ ["--blk-edge" as string]: "#d58ea6" }}>
        대회 참가
      </a>
      <a href={code ? `/ranking/${code}` : "/ranking"} className={`${big} w-full bg-[#f8e2a4]`} style={{ ["--blk-edge" as string]: "#dcbd6c" }}>
        랭킹 보기
      </a>
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <a href="/play#register" className="chip3d flex h-14 items-center rounded-2xl px-5 text-lg font-bold">
          랭킹 등록
        </a>
        <button
          className="chip3d h-14 rounded-2xl px-5 text-lg font-bold"
          onClick={() => {
            handOver();
            setToast("다음 친구 차례예요! 👋");
            setTimeout(() => setToast(null), 2500);
          }}
          data-testid="handover"
        >
          다음 친구에게 넘기기
        </button>
      </div>
      {toast ? (
        <p className="pop chip3d rounded-2xl px-5 py-3 text-xl font-bold" role="status">
          {toast}
        </p>
      ) : null}
      {code ? <p className="text-base text-slate-500">행사 코드 {code}</p> : null}
      <a href="/teacher/login" className="mt-4 text-sm text-slate-500 underline">
        선생님 로그인
      </a>
    </main>
  );
}
