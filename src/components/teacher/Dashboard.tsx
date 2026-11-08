"use client";
import { useCallback, useEffect, useState } from "react";
import { PRESETS } from "@/tournament/bracket";
import type { Preset, TournamentRow } from "@/tournament/types";
import { api, ApiError, teacherLogout, teacherToken } from "@/lib/api";
import { QR } from "../ui/QR";

interface Ev {
  id: string;
  name: string;
  code: string;
  createdAt: number;
}
interface Entry {
  id: string;
  rank: number | null;
  no: number;
  nickname: string;
  stars: number;
  cleared: number;
  excess: number;
  hidden: boolean;
  genius: { stage: string; layoutId: string; blocks: number; target: number }[];
}
interface Detail {
  event: Ev;
  entries: Entry[];
  stats: { started11: number; cleared11: number; sessions: number; avgActiveMs: number };
  tournaments: TournamentRow[];
}

export function Dashboard() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ events: Ev[] }>("/api/events", { as: "teacher" });
      setEvents(d.events);
      setSel((s) => s ?? d.events[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) window.location.href = "/teacher/login";
      else setErr("불러오지 못했어요");
    }
  }, []);

  useEffect(() => {
    void teacherToken().then((t) => {
      if (t) void load();
      else window.location.href = "/teacher/login";
    });
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const d = await api<{ event: Ev }>("/api/events", { as: "teacher", body: { name } });
      setName("");
      setSel(d.event.id);
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "만들지 못했어요");
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-3xl font-black">선생님 대시보드</h1>
        <a href="/" className="rounded-xl bg-white px-4 py-3 font-bold shadow">
          학생 화면
        </a>
        <button
          className="rounded-xl bg-white px-4 py-3 font-bold shadow"
          onClick={async () => {
            await teacherLogout();
            window.location.href = "/teacher/login";
          }}
        >
          로그아웃
        </button>
      </header>
      {err ? <p className="mb-3 font-bold text-rose-700">{err}</p> : null}
      <section className="mb-4 flex flex-wrap items-end gap-2 rounded-3xl bg-white p-4 shadow">
        <label className="flex flex-1 flex-col gap-1 font-bold">
          새 행사 이름
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border-2 border-slate-300 px-3 text-lg" placeholder="예: 2026 SW·AI 페스티벌" data-testid="event-name" />
        </label>
        <button onClick={create} className="h-12 rounded-xl bg-indigo-600 px-5 text-lg font-bold text-white" data-testid="event-create">
          행사 만들기
        </button>
      </section>
      <div className="mb-4 flex flex-wrap gap-2">
        {events?.map((e) => (
          <button key={e.id} onClick={() => setSel(e.id)} className={`rounded-xl px-4 py-3 text-lg font-bold shadow ${sel === e.id ? "bg-indigo-600 text-white" : "bg-white"}`}>
            {e.name} <span className="ml-1 font-mono">{e.code}</span>
          </button>
        ))}
        {events && events.length === 0 ? <p className="text-slate-500">아직 행사가 없어요. 먼저 행사를 만들어 주세요.</p> : null}
      </div>
      {sel ? <EventPanel key={sel} id={sel} onDeleted={() => { setSel(null); void load(); }} /> : null}
    </main>
  );
}

function EventPanel({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tName, setTName] = useState("");
  const [preset, setPreset] = useState<Preset>("all");
  const [limit, setLimit] = useState(180);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => setD(await api<Detail>(`/api/events/${id}`, { as: "teacher" })), [id]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);
  if (!d) return <p>불러오는 중…</p>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const eventUrl = `${origin}/?event=${d.event.code}`;

  const createT = async () => {
    try {
      const r = await api<{ tournament: TournamentRow }>("/api/tournament/create", {
        as: "teacher",
        body: { eventId: id, name: tName || "로봇 길찾기 대회", preset, timeLimitSec: limit },
      });
      window.location.href = `/teacher/t/${r.tournament.id}`;
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "만들지 못했어요");
    }
  };

  const rate = d.stats.started11 ? Math.round((d.stats.cleared11 / d.stats.started11) * 100) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-3xl bg-white p-4 shadow">
        <h2 className="text-2xl font-black">{d.event.name}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <QR text={eventUrl} size={150} label="행사 접속 QR" />
          <div>
            <p className="text-lg">
              행사 코드 <b className="font-mono text-3xl tracking-widest" data-testid="event-code">{d.event.code}</b>
            </p>
            <p className="break-all text-sm text-slate-500">{eventUrl}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a className="rounded-lg bg-amber-400 px-3 py-2 font-bold" href={`/ranking/${d.event.code}?screen=1`} target="_blank">
                전자칠판 랭킹
              </a>
              <a className="rounded-lg bg-slate-100 px-3 py-2 font-bold" href={`/ranking/${d.event.code}`} target="_blank">
                랭킹
              </a>
              <button className="rounded-lg bg-slate-100 px-3 py-2 font-bold" onClick={() => window.print()}>
                QR 인쇄
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="1-1 완료율" value={rate === null ? "-" : `${rate}%`} sub={`${d.stats.cleared11}/${d.stats.started11}`} />
          <Stat label="평균 활동 시간" value={`${Math.round(d.stats.avgActiveMs / 60000)}분`} sub={`${d.stats.sessions}명`} />
          <Stat label="랭킹 등록" value={`${d.entries.length}명`} />
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow">
        <h2 className="text-2xl font-black">대회</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {d.tournaments.map((t) => (
            <li key={t.id}>
              <a href={`/teacher/t/${t.id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-lg font-bold hover:bg-slate-100">
                <span>{t.name}</span>
                <span className="text-base text-slate-500">
                  {t.status === "lobby" ? "모집 중" : t.status === "running" ? `${t.currentRound}라운드` : "종료"} · {t.joinCode}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3">
          <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="대회 이름" className="h-12 rounded-xl border-2 border-slate-300 px-3 text-lg" data-testid="t-name" />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button key={p} onClick={() => setPreset(p)} className={`rounded-xl px-3 py-2 font-bold ${preset === p ? "bg-indigo-600 text-white" : "bg-white"}`}>
                {PRESETS[p].label} ({PRESETS[p].min}~{PRESETS[p].max})
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 font-bold">
            제한시간
            <input type="range" min={60} max={300} step={30} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="flex-1" />
            <span className="w-16 text-right">{limit}초</span>
          </label>
          <button onClick={createT} className="h-12 rounded-xl bg-rose-500 text-lg font-black text-white" data-testid="t-create">
            대회 만들기
          </button>
          {msg ? <p className="font-bold text-rose-700">{msg}</p> : null}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow lg:col-span-2">
        <h2 className="text-2xl font-black">랭킹 관리</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="p-2">순위</th>
                <th className="p-2">번호</th>
                <th className="p-2">닉네임</th>
                <th className="p-2">별</th>
                <th className="p-2">단계</th>
                <th className="p-2">초과</th>
                <th className="p-2">참고</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e.id} className={`border-b ${e.hidden ? "opacity-50" : ""}`}>
                  <td className="p-2">{e.rank ?? "숨김"}</td>
                  <td className="p-2">#{e.no}</td>
                  <td className="p-2 font-bold">{e.nickname}</td>
                  <td className="p-2">★{e.stars}</td>
                  <td className="p-2">{e.cleared}</td>
                  <td className="p-2">{e.excess}</td>
                  <td className="p-2 text-sm text-fuchsia-700">{e.genius.map((g) => `${g.stage} ${g.layoutId} ${g.blocks}<${g.target}`).join(", ")}</td>
                  <td className="flex gap-1 p-2">
                    <button
                      className="rounded-lg bg-slate-100 px-3 py-2 font-bold"
                      onClick={async () => {
                        await api(`/api/events/${id}/entries/${e.id}`, { as: "teacher", method: "PATCH", body: { hidden: !e.hidden } });
                        void load();
                      }}
                    >
                      {e.hidden ? "보이기" : "숨기기"}
                    </button>
                    <button
                      className="rounded-lg bg-rose-100 px-3 py-2 font-bold text-rose-800"
                      onClick={async () => {
                        if (!confirm(`${e.nickname} 항목을 삭제할까요?`)) return;
                        await api(`/api/events/${id}/entries/${e.id}`, { as: "teacher", method: "DELETE" });
                        void load();
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-4 lg:col-span-2">
        <h2 className="text-xl font-black text-rose-800">행사 데이터 삭제</h2>
        <p className="mt-1 text-base text-rose-900">
          행사 후 7일 안에 눌러 주세요. 이 행사의 랭킹·통계·대회·경기 기록·관객 링크와 학생 익명 계정을 모두 지웁니다. 되돌릴 수 없어요.
        </p>
        <button
          className="mt-3 rounded-xl bg-rose-600 px-5 py-3 text-lg font-black text-white"
          onClick={async () => {
            if (prompt(`정말 지우려면 행사 코드 ${d.event.code}를 입력하세요`)?.toUpperCase() !== d.event.code) return;
            const r = await api<{ deletedUsers: number }>(`/api/events/${id}`, { as: "teacher", method: "DELETE" });
            alert(`삭제했어요. (익명 계정 ${r.deletedUsers}개 포함)`);
            onDeleted();
          }}
        >
          행사 데이터 삭제
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
