"use client";
/* 2.5D 로봇 (파스텔 미니멀): 테두리 없는 기하학 도형, 왼쪽 위 빛 → 오른쪽이 그늘.
 * 바라보는 방향마다 앞·뒤·옆 모습. 0~100 상자, 발끝이 y≈98. */
import type { Dir } from "@/engine/types";
import type { RobotLook } from "@/content/themes";

function Feature({ look, side }: { look: RobotLook; side: boolean }) {
  switch (look.feature) {
    case "antenna":
      return (
        <g>
          <rect x="48" y="-4" width="4" height="16" rx="2" fill={look.shade} />
          <circle cx="50" cy="-7" r="6" fill={look.trim} />
        </g>
      );
    case "periscope":
      return (
        <g>
          <rect x="46" y="-8" width="9" height="18" rx="3" fill={look.trim} />
          <rect x={side ? 46 : 42} y="-14" width="18" height="9" rx="4.5" fill={look.trim} />
          <circle cx={side ? 60 : 47} cy="-9.5" r="2.5" fill={look.eye} />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M24 20 Q24 0 50 0 Q76 0 76 20 Z" fill={look.trim} />
          {side ? <rect x="58" y="16" width="28" height="6" rx="3" fill={look.trim} /> : <rect x="22" y="16" width="56" height="6" rx="3" fill={look.trim} />}
        </g>
      );
    case "leaf":
      return (
        <g>
          <rect x="48.5" y="-2" width="3" height="12" rx="1.5" fill="#9cc78c" />
          <path d="M51 -2 Q64 -14 74 -6 Q62 2 51 -2 Z" fill="#a9dbb0" />
          <path d="M49 -2 Q38 -12 30 -6 Q40 1 49 -2 Z" fill="#8ccc98" />
        </g>
      );
    case "hat":
      return (
        <g>
          <ellipse cx="50" cy="12" rx="38" ry="7" fill="#f7dfae" />
          <path d="M33 12 Q33 -10 50 -10 Q67 -10 67 12 Z" fill="#f9e7c1" />
          <rect x="33" y="5" width="34" height="5" fill={look.trim} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M24 18 Q24 -4 50 -4 Q76 -4 76 18 Z" fill="#a9cdf0" />
          <rect x="22" y="12" width="56" height="8" rx="4" fill={look.trim} />
          <circle cx="50" cy="-7" r="6.5" fill={look.trim} />
        </g>
      );
  }
}

export function Robot25({ look, dir }: { look: RobotLook; dir: Dir }) {
  const side = dir === "E" || dir === "W";
  const body = side ? <SideView look={look} /> : dir === "S" ? <FrontView look={look} /> : <BackView look={look} />;
  return <g transform={dir === "W" ? "translate(100 0) scale(-1 1)" : undefined}>{body}</g>;
}

function Base({ look }: { look: RobotLook }) {
  return (
    <>
      <rect x="31" y="86" width="14" height="12" rx="6" fill={look.visor} opacity="0.75" />
      <rect x="55" y="86" width="14" height="12" rx="6" fill={look.visor} opacity="0.75" />
      <rect x="16" y="57" width="10" height="22" rx="5" fill={look.trim} />
      <rect x="74" y="57" width="10" height="22" rx="5" fill={look.trim} />
      <rect x="26" y="49" width="48" height="41" rx="16" fill={look.body} />
      <path d="M50 49 H58 A16 16 0 0 1 74 65 V74 A16 16 0 0 1 58 90 H50 Z" fill={look.shade} />
      <rect x="45" y="43" width="10" height="8" rx="2" fill={look.shade} />
    </>
  );
}

function Head({ look, x = 21, w = 58 }: { look: RobotLook; x?: number; w?: number }) {
  const mid = x + w / 2;
  return (
    <>
      <rect x={x} y="8" width={w} height="40" rx="18" fill={look.body} />
      <path d={`M${mid} 8 H${x + w - 18} A18 18 0 0 1 ${x + w} 26 V30 A18 18 0 0 1 ${x + w - 18} 48 H${mid} Z`} fill={look.shade} />
    </>
  );
}

function FrontView({ look }: { look: RobotLook }) {
  return (
    <g>
      <Base look={look} />
      <circle cx="50" cy="69" r="6" fill={look.trim} />
      <Head look={look} />
      <rect x="29" y="18" width="42" height="20" rx="10" fill={look.visor} />
      <circle cx="41" cy="28" r="4.5" fill={look.eye} />
      <circle cx="59" cy="28" r="4.5" fill={look.eye} />
      <Feature look={look} side={false} />
    </g>
  );
}

function BackView({ look }: { look: RobotLook }) {
  return (
    <g>
      <Base look={look} />
      <rect x="37" y="56" width="26" height="24" rx="8" fill={look.trim} />
      <Head look={look} />
      <rect x="33" y="31" width="34" height="5" rx="2.5" fill={look.trim} opacity="0.8" />
      <Feature look={look} side={false} />
    </g>
  );
}

function SideView({ look }: { look: RobotLook }) {
  return (
    <g>
      <rect x="34" y="85" width="32" height="13" rx="6.5" fill={look.visor} opacity="0.75" />
      <rect x="32" y="49" width="36" height="40" rx="15" fill={look.body} />
      <path d="M50 49 H53 A15 15 0 0 1 68 64 V74 A15 15 0 0 1 53 89 H50 Z" fill={look.shade} />
      <rect x="44" y="57" width="10" height="24" rx="5" fill={look.trim} />
      <rect x="45" y="43" width="10" height="8" rx="2" fill={look.shade} />
      <Head look={look} x={25} w={52} />
      <rect x="54" y="18" width="28" height="20" rx="10" fill={look.visor} />
      <circle cx="70" cy="28" r="4.5" fill={look.eye} />
      <circle cx="36" cy="28" r="4" fill={look.trim} />
      <Feature look={look} side />
    </g>
  );
}
