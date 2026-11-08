"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSession } from "@/lib/local";

interface Row {
  rank: number;
  no: number;
  nickname: string;
  stars: number;
  cleared: number;
}

/** 랭킹판: Realtime 대신 5초 간격 조회 (무료 요금제 동시 연결은 토너먼트에 남겨둔다) */
export function RankingBoard({ code, screen }: { code: string; screen: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [me, setMe] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const known = useRef<Map<number, number> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ranking/${code}?limit=${screen ? 10 : 20}`);
      const d = await r.json();
      if (!r.ok) return setErr(d.message ?? "랭킹을 불러오지 못했어요");
      setErr(null);
      setName(d.event.name);
      const list: Row[] = d.top;
      // 새로 들어오거나 별이 늘어난 항목을 강조
      const prev = known.current;
      if (prev) setFresh(new Set(list.filter((x) => prev.get(x.no) !== x.stars).map((x) => x.no)));
      known.current = new Map(list.map((x) => [x.no, x.stars]));
      setRows(list);
      if (!screen) {
        const key = getSession().entryKey;
        const m = await fetch(`/api/ranking/${code}/me`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entryKey: key }) });
        if (m.ok) setMe((await m.json()).me);
      }
    } catch {
      setErr("연결을 다시 시도하는 중…");
    }
  }, [code, screen]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : String(r));

  if (screen) {
    return (
      <main className="flex h-dvh flex-col bg-gradient-to-b from-indigo-950 to-indigo-800 p-8 text-white" data-testid="ranking-screen">
        <h1 className="mb-6 text-center text-6xl font-black">🏆 {name || code} 랭킹</h1>
        {err ? <p className="text-center text-3xl text-rose-300">{err}</p> : null}
        <ol className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3">
          {rows?.map((r) => (
            <li key={r.no} className={`flex items-center gap-6 rounded-3xl bg-white/10 px-8 py-3 text-5xl ${fresh.has(r.no) ? "flash-in pop" : ""}`}>
              <span className="w-24 text-center font-black">{medal(r.rank)}</span>
              <span className="flex-1 truncate font-black">{r.nickname}</span>
              <span className="text-3xl text-indigo-200">#{r.no}</span>
              <span className="w-40 text-right font-black text-yellow-300">★ {r.stars}</span>
              <span className="w-40 text-right text-3xl">{r.cleared}단계</span>
            </li>
          ))}
          {rows && rows.length === 0 ? <li className="text-center text-4xl text-indigo-200">첫 번째 주인공을 기다려요!</li> : null}
        </ol>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-4 flex items-center gap-2">
        <a href="/" className="rounded-xl bg-white px-4 py-3 text-lg font-bold shadow">
          ← 홈
        </a>
        <h1 className="flex-1 text-center text-3xl font-black">🏆 {name || code}</h1>
      </header>
      {me ? (
        <p className="mb-3 rounded-2xl bg-indigo-600 p-4 text-center text-2xl font-black text-white" data-testid="my-rank-row">
          내 순위: {me.rank}등 · ★ {me.stars}
        </p>
      ) : null}
      {err ? <p className="text-center text-xl font-bold text-rose-700">{err}</p> : null}
      <ol className="flex flex-col gap-2" data-testid="ranking-list">
        {rows?.map((r) => (
          <li key={r.no} className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-xl shadow ${me?.no === r.no ? "ring-4 ring-indigo-400" : ""} ${fresh.has(r.no) ? "flash-in" : ""}`}>
            <span className="w-10 text-center font-black">{medal(r.rank)}</span>
            <span className="flex-1 truncate font-bold">
              {r.nickname} <span className="text-base text-slate-400">#{r.no}</span>
            </span>
            <span className="font-black text-amber-600">★ {r.stars}</span>
            <span className="w-16 text-right text-base text-slate-600">{r.cleared}단계</span>
          </li>
        ))}
        {rows && rows.length === 0 ? <li className="p-6 text-center text-xl text-slate-500">아직 등록한 친구가 없어요</li> : null}
      </ol>
    </main>
  );
}

export function RankingCodeForm() {
  const [code, setCode] = useState("");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <a href="/" className="self-start rounded-xl bg-white px-4 py-3 text-lg font-bold shadow">
        ← 홈
      </a>
      <h1 className="text-3xl font-black">🏆 랭킹 보기</h1>
      <form
        className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^[A-Z]{5}$/.test(code)) window.location.href = `/ranking/${code}`;
        }}
      >
        <label htmlFor="rc" className="text-lg font-bold">
          행사 코드 (영문 5자)
        </label>
        <input id="rc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))} className="h-16 rounded-2xl border-2 border-slate-300 text-center text-4xl font-black tracking-widest" />
        <button className="h-14 rounded-2xl bg-amber-400 text-xl font-black">보기</button>
      </form>
    </main>
  );
}
