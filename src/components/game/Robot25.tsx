"use client";
/* 2.5D 로봇: 바라보는 방향마다 앞·뒤·옆 모습을 그린다. 0~100 상자, 발끝이 y=100. 테마는 색과 머리 장식만 바꾼다. */
import type { Dir } from "@/engine/types";
import type { RobotLook } from "@/content/themes";

const OUT = "rgba(15,23,42,0.55)";

function Feature({ look, side }: { look: RobotLook; side: boolean }) {
  switch (look.feature) {
    case "antenna":
      return (
        <g>
          <path d="M50 10 L50 -4" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="-7" r="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
          <circle cx="48" cy="-9" r="2" fill="#fff" opacity="0.8" />
        </g>
      );
    case "periscope":
      return (
        <g>
          <rect x="45" y="-8" width="10" height="18" rx="3" fill={look.trim} stroke={OUT} strokeWidth="2" />
          <rect x={side ? 45 : 40} y="-14" width={side ? 20 : 20} height="9" rx="3" fill={look.trim} stroke={OUT} strokeWidth="2" />
          <rect x={side ? 59 : 44} y="-12" width="5" height="5" rx="1.5" fill={look.eye} />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M23 20 Q50 -6 77 20 Z" fill={look.trim} stroke={OUT} strokeWidth="2" />
          {side ? (
            <path d="M60 18 L86 20 Q86 24 80 24 L58 22 Z" fill={look.trim} stroke={OUT} strokeWidth="2" />
          ) : (
            <ellipse cx="50" cy="20" rx="30" ry="4.5" fill={look.trim} stroke={OUT} strokeWidth="2" />
          )}
          <rect x="44" y="4" width="12" height="7" rx="2" fill="#fff" opacity="0.85" />
        </g>
      );
    case "leaf":
      return (
        <g>
          <path d="M50 10 Q49 2 52 -3" stroke="#3f6212" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M52 -3 Q66 -14 74 -4 Q62 4 52 -3 Z" fill="#4ade80" stroke="#166534" strokeWidth="2" />
          <path d="M52 -3 Q40 -12 32 -5 Q42 2 52 -3 Z" fill="#22c55e" stroke="#166534" strokeWidth="2" />
        </g>
      );
    case "hat":
      return (
        <g>
          <ellipse cx="50" cy="12" rx="40" ry="8" fill="#fde68a" stroke="#92400e" strokeWidth="2" />
          <path d="M32 12 Q34 -12 50 -12 Q66 -12 68 12 Z" fill="#fcd34d" stroke="#92400e" strokeWidth="2" />
          <rect x="32" y="5" width="36" height="5" fill="#dc2626" />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M23 18 Q24 -6 50 -6 Q76 -6 77 18 Z" fill="#38bdf8" stroke={OUT} strokeWidth="2" />
          <rect x="22" y="12" width="56" height="8" rx="4" fill={look.trim} stroke={OUT} strokeWidth="2" />
          <circle cx="50" cy="-8" r="7" fill={look.trim} stroke={OUT} strokeWidth="2" />
        </g>
      );
  }
}

export function Robot25({ look, dir }: { look: RobotLook; dir: Dir }) {
  const side = dir === "E" || dir === "W";
  const body = side ? <SideView look={look} /> : dir === "S" ? <FrontView look={look} /> : <BackView look={look} />;
  return <g transform={dir === "W" ? "translate(100 0) scale(-1 1)" : undefined}>{body}</g>;
}

function FrontView({ look }: { look: RobotLook }) {
  return (
    <g>
      <rect x="29" y="86" width="16" height="13" rx="5" fill="#334155" />
      <rect x="55" y="86" width="16" height="13" rx="5" fill="#334155" />
      <rect x="14" y="56" width="12" height="24" rx="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <rect x="74" y="56" width="12" height="24" rx="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <rect x="25" y="49" width="50" height="41" rx="13" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <rect x="30" y="53" width="11" height="30" rx="5.5" fill="#fff" opacity="0.32" />
      <rect x="41" y="61" width="20" height="16" rx="5" fill={look.trim} stroke={OUT} strokeWidth="1.5" />
      <circle cx="51" cy="69" r="3.5" fill={look.eye} />
      <rect x="44" y="42" width="12" height="9" fill="#475569" />
      <rect x="21" y="8" width="58" height="40" rx="15" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="34" cy="16" rx="8" ry="4" fill="#fff" opacity="0.45" />
      <rect x="28" y="17" width="44" height="21" rx="10" fill={look.visor} />
      <circle cx="41" cy="27.5" r="5" fill={look.eye} />
      <circle cx="59" cy="27.5" r="5" fill={look.eye} />
      <circle cx="39.5" cy="26" r="1.6" fill="#fff" />
      <circle cx="57.5" cy="26" r="1.6" fill="#fff" />
      <Feature look={look} side={false} />
    </g>
  );
}

function BackView({ look }: { look: RobotLook }) {
  return (
    <g>
      <rect x="29" y="86" width="16" height="13" rx="5" fill="#334155" />
      <rect x="55" y="86" width="16" height="13" rx="5" fill="#334155" />
      <rect x="14" y="56" width="12" height="24" rx="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <rect x="74" y="56" width="12" height="24" rx="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <rect x="25" y="49" width="50" height="41" rx="13" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <rect x="35" y="55" width="30" height="27" rx="6" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <path d="M40 62 H60 M40 68 H60 M40 74 H60" stroke={OUT} strokeWidth="2" strokeLinecap="round" />
      <rect x="44" y="42" width="12" height="9" fill="#475569" />
      <rect x="21" y="8" width="58" height="40" rx="15" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="66" cy="16" rx="8" ry="4" fill="#fff" opacity="0.35" />
      <rect x="32" y="30" width="36" height="5" rx="2.5" fill={look.trim} opacity="0.9" />
      <Feature look={look} side={false} />
    </g>
  );
}

function SideView({ look }: { look: RobotLook }) {
  return (
    <g>
      <rect x="33" y="84" width="34" height="15" rx="7" fill="#334155" />
      <circle cx="41" cy="91.5" r="4" fill="#64748b" />
      <circle cx="59" cy="91.5" r="4" fill="#64748b" />
      <rect x="31" y="49" width="38" height="40" rx="12" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <rect x="35" y="53" width="9" height="30" rx="4.5" fill="#fff" opacity="0.3" />
      <rect x="45" y="56" width="11" height="25" rx="5.5" fill={look.trim} stroke={OUT} strokeWidth="2" />
      <rect x="44" y="42" width="12" height="9" fill="#475569" />
      <rect x="25" y="8" width="52" height="40" rx="15" fill={look.body} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="36" cy="16" rx="7" ry="4" fill="#fff" opacity="0.45" />
      <rect x="52" y="17" width="30" height="21" rx="10" fill={look.visor} />
      <circle cx="70" cy="27.5" r="5" fill={look.eye} />
      <circle cx="71.5" cy="26" r="1.6" fill="#fff" />
      <circle cx="35" cy="28" r="4" fill={look.trim} stroke={OUT} strokeWidth="1.5" />
      <Feature look={look} side />
    </g>
  );
}
