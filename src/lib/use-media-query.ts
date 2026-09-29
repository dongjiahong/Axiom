"use client";

import { useSyncExternalStore } from "react";

/** 订阅 CSS 媒体查询；服务端渲染与首次水合时按 false 处理。 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
