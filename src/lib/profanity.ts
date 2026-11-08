/* 닉네임 검사 (클라이언트·서버 공용). 띄어쓰기·특수문자·숫자 끼워넣기·초성만 쓴 변형을 정규화해 검사한다. */

// 금칙어 목록: 초등 행사용 최소 목록. 운영하며 추가한다. (정규화된 형태로 적는다)
const BANNED_WORDS = [
  "시발", "씨발", "씨빨", "시바", "씨바", "ㅅㅂ", "ㅆㅂ", "ㅅㅃ", "병신", "븅신", "ㅂㅅ", "좆", "ㅈㄴ", "존나", "졸라",
  "개새", "개색", "ㄱㅅㄲ", "새끼", "ㅅㄲ", "미친", "ㅁㅊ", "닥쳐", "꺼져", "지랄", "ㅈㄹ", "엠창", "느금", "니애미", "애미",
  "애비", "섹스", "야동", "보지", "자지", "fuck", "shit", "bitch", "sex", "porn", "dick", "pussy", "asshole", "nigger",
  "바보", "멍청이", "찐따", "장애인", "똥꼬", "죽어", "죽여", "살인",
];

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 한글 음절을 초성으로 */
function toChosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

export function normalizeForCheck(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[0-9@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
}

const BANNED_NORM = BANNED_WORDS.map(normalizeForCheck);
const BANNED_CHO = BANNED_WORDS.filter((w) => /^[가-힣]+$/.test(w) && w.length >= 2).map(toChosung);

export function hasProfanity(raw: string): boolean {
  const n = normalizeForCheck(raw);
  if (BANNED_NORM.some((w) => w && n.includes(w))) return true;
  // 초성만 쓰거나 일부만 초성으로 쓴 변형
  const cho = toChosung(n);
  if (BANNED_CHO.some((w) => cho.includes(w) && /[ㄱ-ㅎ]/.test(n))) return true;
  return false;
}

export const NICK_RE = /^[가-힣a-zA-Z0-9]{2,8}$/;

/** 통과하면 null, 아니면 안내 문장 */
export function checkNickname(raw: string): string | null {
  const s = raw.trim().normalize("NFC");
  if (!NICK_RE.test(s)) return "한글·영문·숫자로 2~8자를 써 주세요";
  if (hasProfanity(s)) return "다른 이름을 써 주세요";
  return null;
}
