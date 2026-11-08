# 로봇 길찾기 코딩 퍼즐

초등 1~6학년이 명령 블록을 조립해 로봇을 목적지까지 보내며 순차·반복·조건을 체험하는 터치 웹 게임.
개인 모드(15단계·별점·랭킹)와 교사가 운영하는 1:1 실시간 토너먼트(최대 24명·관전·관객 화면)를 제공한다.
요구사항은 [docs/PRD.md](docs/PRD.md).

## 빠르게 실행 (로컬, 계정 없이)

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 — Supabase 환경 변수가 없으면 **메모리 백엔드**로 모든 기능(랭킹·대회·관전·관객 화면)이 동작한다.
교사 로그인: `teacher@example.com` / `teacher1234` (메모리 모드 전용, `DEV_TEACHERS`로 바꿀 수 있음). 서버를 다시 시작하면 데이터가 사라진다.

## 테스트

```bash
npm test
```

```bash
npm run validate
```

```bash
npm run build && npm run test:e2e
```

```bash
npm run sim -- 24 all
```

- `npm test`: 엔진 규칙 1~8 경계 사례, 5절 예시(중첩 1 → 5블록, 중첩 2 → 4블록), 2~24명 전 인원 대회 시뮬레이션(우승자 1명·연속 부전승 없음·25번째 입장 거부), 저학년 24명 전원 재경기 맵 배정.
- `npm run validate`: 47개 레이아웃(T1~T3 + D1 6, D2 10, D3 6, D4 10, D5 6, D6 6)의 풀이·목표·전수 탐색 검증. `prebuild`에 들어 있어 실패하면 빌드(=Vercel 배포)가 멈춘다.
- E2E(Playwright): 360px·태블릿·1920px에서 터치로 15단계 완주, 오프라인 새로고침·완주, 브라우저 5개로 4명 대회(시작→판정→재경기→새로고침→우승). 이 컨테이너처럼 브라우저가 따로 설치된 환경에서는 `PW_CHROMIUM=/opt/pw-browsers/chromium`을 붙인다.
- `npm run sim`: 실행 중인 서버(`SIM_BASE_URL`, 기본 localhost:3000)에 노드 클라이언트 24개로 대회 하나를 끝까지 진행한다.

## 배포 (GitHub + Vercel + Supabase 무료 요금제)

1. **Supabase 프로젝트** 만들기 → SQL Editor에서 `supabase/migrations/0001_init.sql` 실행 (또는 `supabase db push`).
2. Supabase 대시보드 설정
   - Authentication → Sign In / Providers: **Allow anonymous sign-ins 켜기**, **Allow new users to sign up 켜 두기**(끄면 익명 로그인도 거부된다).
   - Authentication → Rate Limits: 익명 로그인 시간당 한도를 **300 정도로** 올리기 (학교 Wi-Fi는 모두 한 IP).
   - Realtime → Settings: **Allow public access 끄기**(비공개 채널만 = Realtime Authorization).
   - Authentication → Users → Add user로 교사 계정(이메일+비밀번호)을 만들고, SQL로 교사 등록:
     ```sql
     insert into public.teachers (user_id, display_name) values ('<교사 user id>', '김선생');
     ```
3. **Vercel**에 GitHub 저장소 연결, 환경 변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENTRY_KEY_PEPPER`(`openssl rand -hex 32`). `.env.example` 참고.
4. GitHub에서 main을 보호 브랜치로 두고 CI(`.github/workflows/ci.yml`)를 필수 체크로 설정.

### 실제 Supabase에서 한 번 확인할 것 (PRD 14절 0단계)

이 저장소에서는 SQL을 로컬 Postgres 16(auth·realtime 스키마는 흉내)으로 검증했다. 실제 프로젝트에서 아래를 직접 확인한다.

- [ ] 교사가 비밀번호로 로그인되고, 일반 가입 사용자·익명 사용자는 `/teacher` API가 403이다.
- [ ] 새 기기에서 익명 사용자가 만들어지고, 재접속 때 같은 세션을 재사용한다.
- [ ] 선수는 자기 `match:{id}:watch:{playerId}`에 보내기만 되고, 상대 watch는 받을 수 없다. 교사·관객은 받기만 된다.
- [ ] 관객 토큰을 회수하면 관객 화면이 닫히고 재구독이 거부된다. **이미 열린 Realtime 연결이 즉시 끊기는지 기록**한다.
- [ ] `npm run sim` 을 배포 주소(`SIM_BASE_URL`)와 Supabase 키로 돌려 24명 대회가 끝까지 완료된다.
- [ ] main 푸시 → 자동 배포, 일부러 틀린 레이아웃을 넣은 PR은 빌드가 실패한다.

## 폴더

```
src/engine/         순수 TS 엔진 (실행기·검사·별점·BFS·변형·전수 탐색)
src/tournament/     순수 TS 대진·부전승·등급·판정·맵 배정·상태 기계
src/content/        레이아웃 JSON, 단계표, 등급, 테마 SVG
src/server/         API 공용: 인증, 저장소(Supabase/메모리), 실시간, 랭킹, 대회 mutate
src/app/            화면과 API (/play, /join, /t, /teacher, /ranking, /screen, /api/*)
src/components/     게임 보드·블록 편집기·맵, 개인 모드, 대회, 교사, 랭킹
scripts/            레이아웃 생성·검증, 24명 시뮬레이션
supabase/migrations 테이블·RLS·commit_tournament·채널 권한
```

## 운영 체크리스트

PRD 15절을 따른다. 특히 **무료 Supabase는 1주일 미사용 시 정지**되므로 행사 전날 대시보드에서 활성 상태를 확인하고, 행사 후 7일 안에 교사 대시보드의 「행사 데이터 삭제」를 누른다.
