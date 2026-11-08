"use client";
import { useEffect, useState } from "react";
import { STAGES } from "@/content/stages";
import { getEventCode, getSession, Progress, saveSession, setEventCode } from "@/lib/local";
import { checkNickname } from "@/lib/profanity";
import { enqueueRanking, flush } from "@/lib/sync";

export function RegisterModal({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "sending" | "done" | "queued">("form");
  const [result, setResult] = useState<{ rank?: number; totalStars?: number; eventCode?: string } | null>(null);

  useEffect(() => {
    const s = getSession();
    setNick(s.nickname);
    const c = getEventCode();
    setCode(c ?? "");
    setNeedCode(!c);
  }, []);

  const stages = STAGES.filter((s) => progress.best[s.id]).map((s) => {
    const b = progress.best[s.id];
    return { chapter: s.chapter, stage: s.stage, layoutId: b.layoutId, variant: b.variant, contentVersion: b.contentVersion, program: b.program };
  });

  const submit = async () => {
    const n = nick.trim();
    const e = checkNickname(n);
    if (e) return setError(e);
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(c)) return setError("행사 코드는 영문 5자예요");
    if (stages.length === 0) return setError("먼저 한 단계 이상 깨 봐요!");
    setError(null);
    const s = getSession();
    saveSession({ ...s, nickname: n });
    setEventCode(c);
    const body = { eventCode: c, nickname: n, playerSession: s.id, entryKey: s.entryKey, stages };
    enqueueRanking(s.id, body);
    setState("sending");
    const got = new Promise<CustomEvent | null>((resolve) => {
      const h = (ev: Event) => {
        const ce = ev as CustomEvent;
        if (ce.detail?.session === s.id) {
          window.removeEventListener("ranking-result", h);
          resolve(ce);
        }
      };
      window.addEventListener("ranking-result", h);
      setTimeout(() => {
        window.removeEventListener("ranking-result", h);
        resolve(null);
      }, 10_000);
    });
    void flush();
    const ev = await got;
    if (!ev) return setState("queued");
    if (!ev.detail.ok) {
      setState("form");
      return setError(ev.detail.data?.message ?? "등록하지 못했어요");
    }
    setResult({ ...ev.detail.data, eventCode: c });
    setState("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reg-title">
      <div className="pop w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h2 id="reg-title" className="text-2xl font-black">
          🏆 랭킹에 등록하기
        </h2>
        {state === "done" && result ? (
          <div className="mt-4 text-center">
            <p className="text-xl">등록했어요!</p>
            {result.rank ? (
              <p className="mt-2 text-4xl font-black text-indigo-700" data-testid="my-rank">
                지금 {result.rank}등
              </p>
            ) : null}
            <p className="mt-1 text-lg">★ {result.totalStars ?? 0}</p>
            <a href={`/ranking/${result.eventCode}`} className="mt-4 flex h-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
              랭킹 보러 가기
            </a>
            <button onClick={onClose} className="mt-2 h-12 w-full rounded-2xl bg-slate-100 text-lg font-bold">
              닫기
            </button>
          </div>
        ) : state === "queued" ? (
          <div className="mt-4 text-center">
            <p className="text-xl">인터넷이 연결되면 자동으로 보낼게요 📮</p>
            <button onClick={onClose} className="mt-4 h-14 w-full rounded-2xl bg-indigo-600 text-xl font-bold text-white">
              알겠어요
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 rounded-xl bg-amber-50 p-3 text-base font-bold text-amber-900">⚠️ 진짜 이름은 쓰지 마세요</p>
            <label className="mt-4 block text-lg font-bold" htmlFor="nick">
              닉네임 (2~8자)
            </label>
            <input
              id="nick"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={8}
              autoComplete="off"
              className="mt-1 h-14 w-full rounded-2xl border-2 border-slate-300 px-4 text-2xl"
              placeholder="예: 별빛로봇"
            />
            {needCode ? (
              <>
                <label className="mt-3 block text-lg font-bold" htmlFor="ecode">
                  행사 코드 (영문 5자)
                </label>
                <input
                  id="ecode"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="mt-1 h-14 w-full rounded-2xl border-2 border-slate-300 px-4 text-2xl tracking-widest"
                  placeholder="ROBOT"
                />
              </>
            ) : (
              <p className="mt-3 text-base text-slate-600">
                행사 코드: <b>{code}</b>{" "}
                <button className="underline" onClick={() => setNeedCode(true)}>
                  바꾸기
                </button>
              </p>
            )}
            <p className="mt-3 text-base text-slate-600">깬 단계 {stages.length}개를 보낼게요.</p>
            {error ? (
              <p className="mt-2 text-lg font-bold text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={onClose} className="h-14 rounded-2xl bg-slate-100 text-lg font-bold">
                취소
              </button>
              <button
                onClick={submit}
                disabled={state === "sending"}
                className="h-14 rounded-2xl bg-indigo-600 text-xl font-black text-white disabled:opacity-60"
                data-testid="register-submit"
              >
                {state === "sending" ? "보내는 중…" : "등록"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
