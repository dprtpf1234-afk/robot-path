import { Lobby } from "@/components/tournament/Lobby";
export const metadata = { title: "대기실 · 로봇 길찾기" };
export default async function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Lobby code={code} />;
}
