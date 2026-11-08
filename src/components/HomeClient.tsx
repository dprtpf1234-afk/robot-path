"use client";
import { useEffect, useState } from "react";
import { getEventCode, getSession, handOver, setEventCode } from "@/lib/local";
import { startAutoFlush } from "@/lib/sync";

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

  const big = "flex min-h-24 items-center justify-center gap-3 rounded-3xl px-6 text-3xl font-black shadow-lg active:translate-y-1";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 p-6">
      <div className="text-center">
        <svg width="96" height="96" viewBox="0 0 100 100" className="mx-auto" aria-hidden>
          <rect x="18" y="26" width="64" height="60" rx="16" fill="#e0e7ff" stroke="#312e81" strokeWidth="4" />
          <circle cx="38" cy="54" r="8" fill="#312e81" />
          <circle cx="62" cy="54" r="8" fill="#312e81" />
          <path d="M50 6 L64 24 L36 24 Z" fill="#facc15" stroke="#312e81" strokeWidth="3" />
          <path d="M38 72 Q50 80 62 72" stroke="#312e81" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
        <h1 className="mt-2 text-4xl font-black text-indigo-900">로봇 길찾기</h1>
        <p className="mt-1 text-lg text-slate-600">블록으로 로봇을 목적지까지 보내요!</p>
      </div>
      <a href="/play" className={`${big} w-full bg-indigo-600 text-white`} style={{ borderBottom: "8px solid #3730a3" }} data-testid="home-play">
        🤖 혼자 하기
      </a>
      <a href="/join" className={`${big} w-full bg-rose-500 text-white`} style={{ borderBottom: "8px solid #be123c" }}>
        ⚔️ 대회 참가
      </a>
      <a href={code ? `/ranking/${code}` : "/ranking"} className={`${big} w-full bg-amber-400 text-amber-950`} style={{ borderBottom: "8px solid #b45309" }}>
        🏆 랭킹 보기
      </a>
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
        <a href="/play#register" className="flex h-14 items-center rounded-2xl bg-white px-5 text-lg font-bold shadow">
          랭킹 등록
        </a>
        <button
          className="h-14 rounded-2xl bg-white px-5 text-lg font-bold shadow"
          onClick={() => {
            handOver();
            setToast("다음 친구 차례예요! 👋");
            setTimeout(() => setToast(null), 2500);
          }}
          data-testid="handover"
        >
          👋 다음 친구에게 넘기기
        </button>
      </div>
      {toast ? (
        <p className="pop rounded-2xl bg-green-100 px-5 py-3 text-xl font-bold text-green-800" role="status">
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
