import { type Lang } from "@/hooks/use-language";

interface LanguageSwitchProps {
  lang: Lang;
  onChange: (l: Lang) => void;
  hasEn?: boolean;
  className?: string;
}

export function LanguageSwitch({ lang, onChange, hasEn = false, className = "" }: LanguageSwitchProps) {
  return (
    <div className={`inline-flex items-center border border-border ${className}`}>
      <button
        onClick={() => onChange("it")}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-colors ${
          lang === "it"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-pressed={lang === "it"}
      >
        IT
      </button>
      <button
        onClick={() => onChange("en")}
        disabled={!hasEn}
        className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          lang === "en"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-pressed={lang === "en"}
        title={!hasEn ? "English translation not yet available" : undefined}
      >
        EN
      </button>
    </div>
  );
}
