import { useCallback, useState } from "react";

// 「文字を大きく」設定。localStorageに保存し、<html>のclassで全体に適用する。
// CSS側（index.css）の html.text-large が実際の拡大を担う。
const STORAGE_KEY = "fontScale";
export type FontScale = "normal" | "large";

export function getStoredFontScale(): FontScale {
  try {
    return localStorage.getItem(STORAGE_KEY) === "large" ? "large" : "normal";
  } catch {
    return "normal";
  }
}

export function applyFontScale(scale: FontScale) {
  const root = document.documentElement;
  if (scale === "large") root.classList.add("text-large");
  else root.classList.remove("text-large");
}

export function useFontScale() {
  const [scale, setScale] = useState<FontScale>(() => getStoredFontScale());

  const setFontScale = useCallback((next: FontScale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorageが使えない環境でも表示適用は行う
    }
    applyFontScale(next);
    setScale(next);
  }, []);

  return { scale, isLarge: scale === "large", setFontScale };
}
