import { TeacherWatch } from "@/components/teacher/TeacherWatch";
export const metadata = { title: "관전 · 로봇 길찾기" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeacherWatch tid={id} />;
}
