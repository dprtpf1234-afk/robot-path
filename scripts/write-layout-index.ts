/** src/content/layouts/*.json 목록으로 index.ts를 다시 만든다 (개발자용) */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(__dirname, "../src/content/layouts");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const ident = (f: string) => "L_" + f.replace(".json", "").replace(/-/g, "_");
const src = [
  "// 자동 생성 파일: npx tsx scripts/write-layout-index.ts",
  'import type { LayoutJson } from "@/engine/types";',
  ...files.map((f) => `import ${ident(f)} from "./${f}";`),
  "",
  "export const ALL_LAYOUTS: LayoutJson[] = [",
  ...files.map((f) => `  ${ident(f)} as unknown as LayoutJson,`),
  "];",
  "",
  "export const LAYOUTS_BY_ID: Record<string, LayoutJson> = Object.fromEntries(ALL_LAYOUTS.map((l) => [l.id, l]));",
  "export const LAYOUT_FILES = " + JSON.stringify(files) + ";",
  "",
].join("\n");
fs.writeFileSync(path.join(dir, "index.ts"), src);
console.log(`index.ts: ${files.length} layouts`);
