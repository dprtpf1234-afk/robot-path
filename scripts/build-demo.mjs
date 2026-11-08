/**
 * 개인 모드 체험판을 HTML 한 장으로 묶는다 (서버 없이 15단계를 해 볼 수 있는 미리보기용).
 *   node scripts/build-demo.mjs <출력.html>
 * React 18은 cdnjs UMD에서 불러오고, 나머지 코드·CSS는 페이지 안에 넣는다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? path.join(root, "demo.html");

const reactGlobals = {
  name: "react-globals",
  setup(b) {
    const map = { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" };
    b.onResolve({ filter: /^(react|react-dom|react-dom\/client)$/ }, (a) => ({ path: a.path, namespace: "g" }));
    b.onLoad({ filter: /.*/, namespace: "g" }, (a) => ({ contents: `module.exports = window.${map[a.path]};`, loader: "js" }));
  },
};

const js = await esbuild.build({
  entryPoints: [path.join(root, "src/demo/entry.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2019",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  inject: [path.join(root, "src/demo/react-shim.js")],
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '""' },
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [reactGlobals],
  external: [],
  logLevel: "warning",
});

const cssSrc = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(cssSrc, { from: path.join(root, "src/app/globals.css") });

const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<title>로봇 길찾기</title>
<style>${css.css}
html,body,#root{height:100%}
.h-dvh{height:100%}
</style>
<div id="root"></div>
<script>window.__ROBOT_DEMO__ = true;</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${code}</script>
`;
fs.writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
