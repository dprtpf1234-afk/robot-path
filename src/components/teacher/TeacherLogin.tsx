"use client";
import { useState } from "react";
import { ApiError, teacherLogin } from "@/lib/api";
import { SUPABASE_ENABLED } from "@/lib/supabase/browser";

export function TeacherLogin() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await teacherLogin(email.trim(), pw);
      window.location.href = "/teacher";
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "로그인하지 못했어요");
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-black">선생님 로그인</h1>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow">
        <label htmlFor="em" className="font-bold">
          이메일
        </label>
        <input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-14 rounded-xl border-2 border-slate-300 px-3 text-xl" />
        <label htmlFor="pw" className="font-bold">
          비밀번호
        </label>
        <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-14 rounded-xl border-2 border-slate-300 px-3 text-xl" />
        {err ? <p role="alert" className="font-bold text-rose-700">{err}</p> : null}
        <button disabled={busy} className="h-14 rounded-2xl bg-indigo-600 text-xl font-black text-white disabled:opacity-60" data-testid="teacher-login">
          로그인
        </button>
      </form>
      <p className="text-sm text-slate-500">
        교사 계정은 운영자가 만들어 드려요. 이 앱에는 가입 화면이 없어요.
        {!SUPABASE_ENABLED ? " (로컬 개발 모드: teacher@example.com / teacher1234)" : ""}
      </p>
    </main>
  );
}
