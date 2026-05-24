import { useState } from "react";

export type Lang = "it" | "en";

export function useLanguage(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("blog-lang");
      return stored === "en" ? "en" : "it";
    } catch {
      return "it";
    }
  });

  const setLang = (l: Lang) => {
    try {
      localStorage.setItem("blog-lang", l);
    } catch {}
    setLangState(l);
  };

  return [lang, setLang];
}
