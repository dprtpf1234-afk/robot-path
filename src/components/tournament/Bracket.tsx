"use client";
import { roundsFor } from "@/tournament/bracket";

export interface BracketMatch {
  id: string;
  round: number;
  slot: number;
  playerA: string;
  playerB: string | null;
  nameA: string | null;
  nameB: string | null;
  winnerId: string | null;
  reason: string | null;
  confirmed: boolean;
  status: "waiting" | "live" | "done";
}

const STATUS: Record<BracketMatch["status"], string> = { waiting: "대기", live: "진행 중", done: "종료" };

export function roundName(round: number, total: number) {
  if (round === total) return "결승";
  if (round === total - 1) return "준결승";
  return `${round}라운드`;
}

/** 라운드별 열. 아직 만들지 않은 다음 라운드는 「생존자 N명」 */
export function Bracket({
  matches,
  plannedRounds,
  survivors,
  currentRound,
  highlight,
  big = false,
  onPick,
}: {
  matches: BracketMatch[];
  plannedRounds: number;
  survivors: number;
  currentRound: number;
  highlight?: string | null;
  big?: boolean;
  onPick?: (matchId: string) => void;
}) {
  // 이번 라운드 참가 인원으로 남은 라운드 수를 다시 계산한다 (기권·내보내기로 줄 수 있음)
  const cur = matches.filter((m) => m.round === currentRound);
  const entrants = cur.reduce((n, m) => n + (m.playerB ? 2 : 1), 0);
  const totalRounds = currentRound && entrants ? currentRound - 1 + roundsFor(entrants) : plannedRounds || roundsFor(survivors);
  const cols = Array.from({ length: Math.max(1, totalRounds) }, (_, i) => i + 1);
  let futureN = cur.length || survivors;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" data-testid="bracket">
      {cols.map((r) => {
        const ms = matches.filter((m) => m.round === r);
        let future: number | null = null;
        if (ms.length === 0 && r > currentRound) {
          if (r > currentRound + 1) futureN = Math.ceil(futureN / 2);
          future = currentRound === 0 ? null : futureN;
        }
        return (
          <div key={r} className={`flex shrink-0 flex-col gap-2 ${big ? "w-72" : "w-52"}`}>
            <h3 className={`text-center font-black ${big ? "text-2xl" : "text-lg"} ${r === currentRound ? "text-indigo-700" : "text-slate-600"}`}>
              {roundName(r, totalRounds)}
            </h3>
            {future !== null ? (
              <div className={`rounded-2xl border-2 border-dashed border-slate-300 p-3 text-center text-slate-500 ${big ? "text-2xl" : "text-base"}`}>
                생존자 {future}명
              </div>
            ) : null}
            {ms.map((m) => (
              <button
                key={m.id}
                onClick={onPick ? () => onPick(m.id) : undefined}
                disabled={!onPick}
                className={`rounded-2xl border-2 bg-white p-2 text-left shadow-sm ${highlight === m.id ? "border-amber-400 ring-4 ring-amber-200" : m.status === "live" ? "border-rose-400" : "border-slate-200"}`}
              >
                <Line name={m.nameA} win={m.winnerId === m.playerA} big={big} />
                {m.playerB ? <Line name={m.nameB} win={m.winnerId === m.playerB} big={big} /> : <p className="px-2 text-sm font-bold text-emerald-700">부전승</p>}
                <p className={`mt-1 px-2 text-xs font-bold ${m.status === "live" ? "text-rose-600" : "text-slate-500"}`}>
                  {m.playerB ? STATUS[m.status] : ""}
                  {m.status === "live" ? " ●" : ""}
                </p>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Line({ name, win, big }: { name: string | null; win: boolean; big: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1 ${win ? "bg-amber-100 font-black" : ""} ${big ? "text-2xl" : "text-base"}`}>
      <span className="truncate">{name ?? "?"}</span>
      {win ? <span aria-label="승">🏅</span> : null}
    </div>
  );
}
