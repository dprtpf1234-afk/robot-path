# CLAUDE.md

**구현 전 docs/PRD.md를 읽을 것.** PRD와 다르게 구현해야 하면 PR 설명에 적고 docs/PRD.md 맨 아래 「구현 메모」도 같이 고친다.

## 구조 요약
- `src/engine/` — 순수 TS 게임 엔진(결정론적). React·Supabase import 금지. 규칙 1~8은 `engine.test.ts`로 고정.
- `src/tournament/` — 순수 TS 대진·부전승·등급·판정·맵 배정·상태 기계. 테스트 먼저.
- `src/content/` — 레이아웃 JSON(`layouts/`), 단계표(`stages.ts`), 등급(`grades.ts`), 테마(`themes.tsx`, id는 `themeIds.ts`).
- `src/server/` — API 공용 코드. 저장소는 `store/` (Supabase 또는 로컬 메모리), 대회 저장은 `tournament.ts`의 `mutate()`(버전 검사 + 재시도).
- `supabase/migrations/` — 테이블·RLS·`commit_tournament`·Realtime 채널 권한.

## 명령
- `npm run dev` — 로컬 개발 (Supabase 변수가 없으면 메모리 백엔드, 교사 teacher@example.com / teacher1234)
- `npm test` — Vitest (엔진·대진)
- `npm run validate` — 레이아웃 검증 (prebuild에 포함, 실패 시 빌드 중단)
- `npm run gen:layouts -- D4 10 [seed]` → `npx tsx scripts/write-layout-index.ts` — 레이아웃 생성 후 index 갱신
- `npm run build && PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e` — E2E
- `npm run sim -- 24 all` — 24명 부하 시뮬레이션 (서버 실행 중이어야 함)

## 규칙
- 점수·승패는 항상 서버가 엔진으로 다시 계산한다. 클라이언트 숫자를 믿지 않는다.
- 교사 권한은 teachers 테이블의 user_id로만 판단한다.
- 레이아웃을 바꾸면 contentVersion을 올린다 (랭킹 검증이 버전을 확인).
