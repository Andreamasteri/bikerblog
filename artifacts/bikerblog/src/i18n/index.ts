import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import it from "../locales/it.json";
import en from "../locales/en.json";

function detectLang(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get("lang");
  if (urlLang === "it" || urlLang === "en") {
    localStorage.setItem("bikerblog_lang", urlLang);
    return urlLang;
  }
  return localStorage.getItem("bikerblog_lang") ?? "it";
}

const initialLang = detectLang();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    lng: initialLang,
    fallbackLng: "it",
    interpolation: { escapeValue: false },
  });

export default i18n;
