/** 테마 id 목록 (React 없는 모듈에서 쓰기 위해 따로 둔다. themes.tsx와 같아야 한다) */
export const THEME_IDS = ["space", "ocean", "town", "forest", "desert", "snow"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
