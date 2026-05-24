import { Link, useLocation } from "wouter";
import { Wrench, Menu, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const NAV_LINK_KEYS = [
  { href: "/posts", key: "nav.posts" },
  { href: "/timeline", key: "nav.timeline" },
  { href: "/authors", key: "nav.authors" },
];

function LanguageSwitcher({ mobile }: { mobile?: boolean }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const toggle = (l: string) => {
    i18n.changeLanguage(l);
    localStorage.setItem("bikerblog_lang", l);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", l);
    window.history.replaceState(null, "", url.toString());
  };

  const base = mobile
    ? "flex items-center gap-3 py-3 text-sm font-bold uppercase tracking-wider border-b border-border/30"
    : "flex items-center gap-1 text-xs font-bold uppercase tracking-widest";

  return (
    <div className={base}>
      <button
        onClick={() => toggle("it")}
        className={`px-2 py-0.5 transition-colors ${lang === "it" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        aria-pressed={lang === "it"}
      >
        IT
      </button>
      <span className="text-border select-none">|</span>
      <button
        onClick={() => toggle("en")}
        className={`px-2 py-0.5 transition-colors ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors shrink-0">
            <Wrench className="h-6 w-6" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase">BikerBlog</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_LINK_KEYS.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-primary transition-colors uppercase tracking-wider">{t(l.key)}</Link>
            ))}
            <LanguageSwitcher />
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 text-foreground hover:text-primary transition-colors"
            aria-label={menuOpen ? t("menu.close") : t("menu.open")}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div ref={drawerRef} className="md:hidden border-t border-border/40 bg-background/98 backdrop-blur px-4 py-4 flex flex-col gap-1">
            {NAV_LINK_KEYS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="block py-3 text-sm font-bold uppercase tracking-wider hover:text-primary transition-colors border-b border-border/30 last:border-0"
              >
                {t(l.key)}
              </Link>
            ))}
            <LanguageSwitcher mobile />
          </div>
        )}
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t py-12 bg-muted/20">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <div className="flex justify-center items-center gap-2 mb-4">
            <Wrench className="h-5 w-5" />
            <span className="font-display font-bold text-xl uppercase tracking-tighter text-foreground">BikerBlog</span>
          </div>
          <p className="max-w-md mx-auto mb-6">{t("footer.tagline")}</p>
          <p className="text-sm">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <p className="text-sm mt-2 flex justify-center gap-6">
            <Link href="/timeline" className="hover:text-primary transition-colors">Timeline</Link>
            <Link href="/in-memoria" className="hover:text-primary transition-colors">{t("footer.inMemoria")}</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
