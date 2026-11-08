import { MatchPlay } from "@/components/tournament/MatchPlay";
export const metadata = { title: "대결 · 로봇 길찾기" };
export default async function MatchPage({ params }: { params: Promise<{ code: string; matchId: string }> }) {
  const { code, matchId } = await params;
  return <MatchPlay code={code} matchId={matchId} />;
}
