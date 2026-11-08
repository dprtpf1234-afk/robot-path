"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { readJson, writeJson } from "@/lib/local";
import { checkNickname } from "@/lib/profanity";

export interface JoinedInfo {
  tid: string;
  code: string;
  name: string;
  nickname: string;
}

export function JoinForm() {
  const [code, setCode] = useState("");
  const [nick, setNick] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URL(window.location.href).searchParams.get("code");
    if (q && /^\d{6}$/.test(q)) setCode(q);
    const last = readJson<JoinedInfo | null>("lastJoin", null);
    if (last) setNick(last.nickname);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr("참가 코드는 숫자 6자리예요");
    const ne = checkNickname(nick.trim());
    if (ne) return setErr(ne);
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ tid: string; name: string }>("/api/tournament/join", { body: { code, nickname: nick.trim() } });
      const info: JoinedInfo = { tid: r.tid, code, name: r.name, nickname: nick.trim() };
      writeJson(`join:${code}`, info);
      writeJson("lastJoin", info);
      window.location.href = `/t/${code}`;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "연결이 안 돼요. 다시 해 주세요");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <a href="/" className="self-start rounded-xl bg-white px-4 py-3 text-lg font-bold shadow">
        ← 홈
      </a>
      <h1 className="text-3xl font-black">⚔️ 대회 참가</h1>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow">
        <label className="text-lg font-bold" htmlFor="code">
          참가 코드 (숫자 6자리)
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-16 rounded-2xl border-2 border-slate-300 px-4 text-center text-4xl font-black tracking-[0.3em]"
          placeholder="000000"
        />
        <label className="text-lg font-bold" htmlFor="nick">
          닉네임 (2~8자)
        </label>
        <input
          id="nick"
          value={nick}
          maxLength={8}
          autoComplete="off"
          onChange={(e) => setNick(e.target.value)}
          className="h-14 rounded-2xl border-2 border-slate-300 px-4 text-2xl"
          placeholder="예: 번개로봇"
        />
        <p className="rounded-xl bg-amber-50 p-2 text-base font-bold text-amber-900">⚠️ 진짜 이름은 쓰지 마세요</p>
        {err ? (
          <p role="alert" className="text-lg font-bold text-rose-700">
            {err}
          </p>
        ) : null}
        <button disabled={busy} className="h-16 rounded-2xl bg-rose-500 text-2xl font-black text-white shadow disabled:opacity-60" data-testid="join-submit">
          {busy ? "들어가는 중…" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
