import { Console } from "@/components/teacher/Console";
export const metadata = { title: "대회 운영 · 로봇 길찾기" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Console tid={id} />;
}
