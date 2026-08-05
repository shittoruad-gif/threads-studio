import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { dict } from "./dict";

// 審査用の英語UIモード。Meta App Reviewのスクリーンキャストを英語で撮れるように、
// 主要画面（ログイン / Threads連携 / 投稿生成・公開 / コメント管理 / 投稿分析 / ナビ）を
// 日本語⇄英語で切り替える軽量な仕組み。
//
// 使い方:
//   const { t, lang, setLang } = useLang();
//   <span>{t("Threads連携")}</span>
//
// t() は日本語の原文をキーにして辞書(dict)から英訳を返す。英訳が無い場合は原文をそのまま返すので、
// 未翻訳でも表示は壊れない（段階的に翻訳を追加できる）。

export type Lang = "ja" | "en";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (ja: string) => string;
}

const LangContext = createContext<LangContextValue | undefined>(undefined);

const STORAGE_KEY = "appLang";

function getInitialLang(): Lang {
  try {
    // ① URLに ?lang=en があれば最優先（審査用リンクをそのまま英語で開ける）
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q === "en" || q === "ja") return q;
    // ② ユーザーが設定画面で選んだ言語
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ja") return stored;
    // ③ ブラウザの言語設定に従う。
    //    日本語以外のブラウザ（Meta審査担当者の環境を含む）では英語UIで表示する。
    //    日本のユーザーは navigator.language が ja-JP のため、これまで通り日本語のまま。
    const nav = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    if (nav.length > 0 && !nav.some((l) => String(l).toLowerCase().startsWith("ja"))) {
      return "en";
    }
  } catch {
    // ignore
  }
  return "ja";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getInitialLang());

  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
    setLangState(l);
  }, []);

  const t = useCallback(
    (ja: string) => {
      if (lang === "ja") return ja;
      return dict[ja] ?? ja;
    },
    [lang],
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    // Provider外で呼ばれても落ちないようにフォールバック（日本語のまま）
    return { lang: "ja", setLang: () => {}, t: (ja: string) => ja };
  }
  return ctx;
}
