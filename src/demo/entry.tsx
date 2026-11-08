/* 개인 모드 체험판 진입점 (scripts/build-demo.mjs가 정적 페이지 하나로 묶는다) */
import { createRoot } from "react-dom/client";
import { PlayApp } from "@/components/play/PlayApp";

createRoot(document.getElementById("root")!).render(<PlayApp />);
