import { Screen } from "@/components/tournament/Screen";
export const metadata = { title: "관객 화면 · 로봇 길찾기" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Screen token={token} />;
}
