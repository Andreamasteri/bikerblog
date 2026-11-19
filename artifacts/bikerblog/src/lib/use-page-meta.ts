import { useEffect } from "react";

type PageMetaOptions = {
  image?: string;
  language?: string;
};

function normalize(value: string) {
  return value.replace(/\\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Keeps page-level metadata in sync with the active React route and language.
 * The static HTML tags remain useful as the crawler's initial fallback.
 */
export function usePageMeta(
  title: string,
  description: string,
  options: PageMetaOptions = {},
) {
  const { image, language } = options;

  useEffect(() => {
    const previousTitle = document.title;
    const lang = (language || document.documentElement.lang || "it").toLowerCase();
    const isEnglish = lang.startsWith("en");

    const normalizedTitle = normalize(title || "BikerBlog");
    const brandSuffix = " | BikerBlog";
    const fullTitle = /bikerblog/i.test(normalizedTitle)
      ? normalizedTitle
      : `${normalizedTitle}${brandSuffix}`;
    const safeTitle = fullTitle.length <= 60
      ? fullTitle
      : `${truncate(normalizedTitle, 60 - brandSuffix.length - 1)}…${brandSuffix}`;

    let safeDescription = normalize(description);
    if (safeDescription.length < 70) {
      safeDescription = `${safeDescription}${safeDescription && !/[.!?]$/.test(safeDescription) ? "." : ""} ${isEnglish
        ? "Read more motorcycle stories and travel ideas on BikerBlog."
        : "Leggi altre storie di moto e idee di viaggio su BikerBlog."}`.trim();
    }
    if (safeDescription.length < 70) {
      safeDescription = `${safeDescription} ${isEnglish
        ? "New routes, voices and practical advice for every ride."
        : "Nuovi percorsi, voci e consigli per ogni uscita."}`.trim();
    }

    document.title = truncate(safeTitle, 60);

    const previousMeta = new Map<HTMLMetaElement, string | null>();
    const createdMeta = new Set<HTMLMetaElement>();
    const setMeta = (attribute: "name" | "property", key: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
        createdMeta.add(element);
      }
      if (!previousMeta.has(element)) previousMeta.set(element, element.getAttribute("content"));
      element.setAttribute("content", truncate(value, 160));
    };

    setMeta("name", "description", safeDescription);
    setMeta("property", "og:title", document.title);
    setMeta("property", "og:description", safeDescription);
    setMeta("name", "twitter:title", document.title);
    setMeta("name", "twitter:description", safeDescription);
    if (image) {
      setMeta("property", "og:image", image);
      setMeta("name", "twitter:image", image);
    }

    const canonicalUrl = new URL(window.location.pathname, window.location.origin).href;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const createdCanonical = !canonical;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const previousCanonical = canonical.getAttribute("href");
    canonical.href = canonicalUrl;

    const previousAlternates = new Map<HTMLLinkElement, string | null>();
    const createdAlternates = new Set<HTMLLinkElement>();
    const italianUrl = new URL(canonicalUrl);
    italianUrl.searchParams.set("lang", "it");
    const englishUrl = new URL(canonicalUrl);
    englishUrl.searchParams.set("lang", "en");
    const alternates: Array<[string, string]> = [
      ["it", italianUrl.href],
      ["en", englishUrl.href],
      ["x-default", canonicalUrl],
    ];
    for (const [locale, href] of alternates) {
      const id = `hreflang-${locale}`;
      let element = document.getElementById(id) as HTMLLinkElement | null;
      const created = !element;
      if (!element) {
        element = document.createElement("link");
        element.id = id;
        element.rel = "alternate";
        element.setAttribute("hreflang", locale);
        document.head.appendChild(element);
        createdAlternates.add(element);
      }
      if (!previousAlternates.has(element)) previousAlternates.set(element, element.getAttribute("href"));
      element.href = href;
      if (created) createdAlternates.add(element);
    }

    return () => {
      document.title = previousTitle;
      for (const [element, previous] of previousMeta) {
        if (createdMeta.has(element)) element.remove();
        else if (previous === null) element.removeAttribute("content");
        else element.setAttribute("content", previous);
      }
      if (createdCanonical) canonical?.remove();
      else if (previousCanonical !== null) canonical?.setAttribute("href", previousCanonical);
      for (const [element, previous] of previousAlternates) {
        if (createdAlternates.has(element)) element.remove();
        else if (previous !== null) element.setAttribute("href", previous);
      }
    };
  }, [title, description, image, language]);
}
