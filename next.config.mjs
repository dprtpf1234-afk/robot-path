import withSerwistInit from "@serwist/next";
import { execSync } from "node:child_process";

let revision = String(Date.now());
try {
  revision = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || revision;
} catch {}

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // 개인 모드 페이지 HTML을 미리 저장한다 (코드·레이아웃·테마는 _next/static 번들에 포함)
  additionalPrecacheEntries: [
    { url: "/play", revision },
    { url: "/", revision },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withSerwist(nextConfig);
