/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// 개인 모드(/play)와 홈만 오프라인 대상. 교사·대회·API 응답은 캐시하지 않는다.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, url }) => request.mode === "navigate" && (url.pathname === "/play" || url.pathname === "/"),
      handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 3 }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/play", matcher: ({ request }) => request.mode === "navigate" && new URL(request.url).pathname.startsWith("/play") }],
  },
});

serwist.addEventListeners();
