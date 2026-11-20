import { Link, useLocation } from "wouter";
import { Bike, Menu, X, Download } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const APK_URL = "https://drive.google.com/file/d/15teG0lCIWFi6YuXtcfIMPjuWcctPc5cH/view?usp=drive_link";

const NAV_LINK_KEYS = [
  { href: "/posts", key: "nav.posts" },
  { href: "/podcast", key: "nav.podcast" },
  { href: "/timeline", key: "nav.timeline" },
  { href: "/authors", key: "nav.authors" },
];

function LanguageSwitcher({ mobile }: { mobile?: boolean }) {
  const { i18n, t } = useTranslation();
  const lang = i18n.language.split("-")[0];

  const toggle = (language: "it" | "en") => {
    void i18n.changeLanguage(language);
    localStorage.setItem("bikerblog_lang", language);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div
      className={mobile ? "bb-language-switch bb-language-switch-mobile" : "bb-language-switch"}
      role="group"
      aria-label={t("nav.language")}
    >
      <button
        type="button"
        onClick={() => toggle("it")}
        className={lang === "it" ? "is-active" : ""}
        aria-label={t("nav.switchItalian")}
        aria-pressed={lang === "it"}
      >
        IT
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        onClick={() => toggle("en")}
        className={lang === "en" ? "is-active" : ""}
        aria-label={t("nav.switchEnglish")}
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
    const handleClick = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="bb-site min-h-[100dvh] flex flex-col">
      <a className="bb-skip-link" href="#contenuto">{t("nav.skipToContent")}</a>
      <header className="bb-site-header">
        <div className="container mx-auto px-4 bb-header-inner">
          <Link href="/" className="bb-brand" aria-label="BikerBlog — home">
            <span className="bb-brand-mark" aria-hidden="true"><Bike className="h-5 w-5" /></span>
            <span className="bb-brand-copy">
              <span className="bb-brand-name">Biker<span>Blog</span></span>
              <span className="bb-brand-caption">{t("nav.brandCaption")}</span>
            </span>
          </Link>

          <nav className="bb-desktop-nav" aria-label={t("nav.main")}>
            {NAV_LINK_KEYS.map((link) => (
              <Link key={link.href} href={link.href} className="bb-nav-link">
                {t(link.key)}
              </Link>
            ))}
            <a href={APK_URL} target="_blank" rel="noopener noreferrer" className="bb-app-link">
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("nav.downloadApp")}
            </a>
            <LanguageSwitcher />
          </nav>

          <button
            type="button"
            className="bb-menu-toggle"
            aria-label={menuOpen ? t("menu.close") : t("menu.open")}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div ref={drawerRef} id="mobile-navigation" className="bb-mobile-nav">
            <nav aria-label={t("nav.main")}>
              {NAV_LINK_KEYS.map((link) => (
                <Link key={link.href} href={link.href} className="bb-mobile-nav-link">
                  {t(link.key)}
                </Link>
              ))}
              <a href={APK_URL} target="_blank" rel="noopener noreferrer" className="bb-mobile-app-link">
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("footer.downloadApk")}
              </a>
              <LanguageSwitcher mobile />
            </nav>
          </div>
        )}
      </header>

      <main id="contenuto" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="bb-site-footer">
        <div className="container mx-auto px-4">
          <div className="bb-footer-main">
            <Link href="/" className="bb-footer-brand">
              <span className="bb-brand-mark" aria-hidden="true"><Bike className="h-5 w-5" /></span>
              <span className="bb-brand-name">Biker<span>Blog</span></span>
            </Link>
            <p>{t("footer.tagline")}</p>
            <Link href="/posts" className="bb-footer-cta">
              {t("home.readArticles")} <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="bb-footer-bottom">
            <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
            <nav aria-label={t("footer.moreLinks")}>
              <Link href="/podcast">{t("nav.podcast")}</Link>
              <Link href="/timeline">{t("nav.timeline")}</Link>
              <Link href="/in-memoria">{t("footer.inMemoria")}</Link>
              <a href={APK_URL} target="_blank" rel="noopener noreferrer">{t("footer.downloadApk")}</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
