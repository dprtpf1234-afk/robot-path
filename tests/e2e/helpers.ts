import type { Page } from "@playwright/test";
import { LAYOUTS_BY_ID } from "../../src/content/layouts";
import { solutionFor } from "../../src/engine/map";
import type { Block, Variant } from "../../src/engine/types";

/** 프로그램을 팔레트 탭으로 조립한다 (그릇 선택 → 안에 추가) */
export async function buildProgram(page: Page, program: Block[]) {
  const addList = async (blocks: Block[], parentSelector: string | null) => {
    for (const b of blocks) {
      if (parentSelector) await selectContainer(page, parentSelector);
      else await page.getByTestId("program").click({ position: { x: 5, y: 5 } });
      const key = b.t === "ifColor" ? `ifColor-${b.color}` : b.t;
      await page.getByTestId(`pal-${key}`).click();
      if ("body" in b) {
        const cont = page.locator(`[data-testid="container-${b.t}"]`).last();
        const handle = await cont.elementHandle();
        const id = `c${Math.random().toString(36).slice(2)}`;
        await handle!.evaluate((el, id) => el.setAttribute("data-e2e", id), id);
        if (b.t === "repeat" && b.n > 2) {
          await cont.getByTestId("count").first().click();
          for (let n = 2; n < b.n; n++) await cont.getByTestId("count-plus").first().click();
        }
        await addList(b.body, `[data-e2e="${id}"]`);
      }
    }
  };
  await addList(program, null);
}

async function selectContainer(page: Page, sel: string) {
  const header = page.locator(`${sel} > div`).first();
  const selected = await page.locator(sel).evaluate((el) => (el as HTMLElement).style.borderColor === "rgb(245, 158, 11)");
  if (!selected) await header.click({ position: { x: 20, y: 20 } });
}

export function solution(layoutId: string, variant: Variant) {
  return solutionFor(LAYOUTS_BY_ID[layoutId], variant);
}
