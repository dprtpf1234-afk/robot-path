import { RankingBoard } from "@/components/ranking/RankingBoard";
export const metadata = { title: "랭킹 · 로봇 길찾기" };
export default async function Page({ params, searchParams }: { params: Promise<{ eventCode: string }>; searchParams: Promise<{ screen?: string }> }) {
  const { eventCode } = await params;
  const { screen } = await searchParams;
  return <RankingBoard code={eventCode.toUpperCase()} screen={screen === "1"} />;
}
