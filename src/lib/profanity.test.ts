import { describe, expect, it } from "vitest";
import { checkNickname, hasProfanity } from "./profanity";

describe("닉네임 검사", () => {
  it("형식: 2~8자 한글·영문·숫자", () => {
    expect(checkNickname("별빛로봇")).toBeNull();
    expect(checkNickname("a")).not.toBeNull();
    expect(checkNickname("가나다라마바사아자")).not.toBeNull();
    expect(checkNickname("로봇!")).not.toBeNull();
  });
  it("금칙어와 변형(띄어쓰기·특수문자·숫자·초성)", () => {
    expect(hasProfanity("시발")).toBe(true);
    expect(hasProfanity("시 발")).toBe(true);
    expect(hasProfanity("시.발.")).toBe(true);
    expect(hasProfanity("ㅅㅂ")).toBe(true);
    expect(hasProfanity("ㅅ발")).toBe(true);
    expect(hasProfanity("f.u.c.k")).toBe(true);
    expect(hasProfanity("5ex")).toBe(true);
    expect(checkNickname("병신123")).not.toBeNull();
    expect(hasProfanity("수박")).toBe(false);
    expect(hasProfanity("코딩왕")).toBe(false);
  });
});
