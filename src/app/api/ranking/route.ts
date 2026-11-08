import { clientIp, fail, handle, ok, readJsonBody } from "@/server/http";
import { RankingBody, submitRanking } from "@/server/ranking";
import { store } from "@/server/store";

export const POST = handle(async (req) => {
  // 학교 Wi-Fi는 모든 기기가 같은 IP → IP 제한은 넉넉히
  if (!(await store.hit(`ip:rank:${clientIp(req)}`, 60, 100))) return fail(429, "slow_down", "잠시 후 다시 해 주세요");
  const body = await readJsonBody<RankingBody>(req);
  return ok(await submitRanking(body));
});
