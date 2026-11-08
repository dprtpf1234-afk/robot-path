/** 서버 없이 개인 모드만 도는 체험판 (Artifact 등 정적 페이지). 번들보다 먼저 window.__ROBOT_DEMO__ = true 를 둔다. */
export const DEMO: boolean = typeof window !== "undefined" && (window as unknown as { __ROBOT_DEMO__?: boolean }).__ROBOT_DEMO__ === true;
