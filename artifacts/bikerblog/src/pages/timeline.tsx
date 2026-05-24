import { useListPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO, getMonth } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { Calendar, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";
import { LanguageSwitch } from "@/components/language-switch";

export function Timeline() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const dateLocale = lang === "en" ? enUS : it;
  const { postTitle, postExcerpt } = usePostLocale();

  const MONTHS = [
    { key: "timeline.all", value: null },
    { key: "timeline.march", value: 2 },
    { key: "timeline.april", value: 3 },
    { key: "timeline.may", value: 4 },
  ];

  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  const { data: posts, isLoading } = useListPosts();

  const anyHasEn = posts?.some(p => !!p.bodyEn) ?? false;

  const sortedPosts = useMemo(() => {
    if (!posts) return [];
    return [...posts].sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (activeMonth === null) return sortedPosts;
    return sortedPosts.filter(
      (p) => getMonth(parseISO(p.publishedAt)) === activeMonth
    );
  }, [sortedPosts, activeMonth]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filteredPosts> = {};
    for (const post of filteredPosts) {
      const key = format(parseISO(post.publishedAt), "MMMM yyyy", {
        locale: dateLocale,
      });
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return Object.entries(map);
  }, [filteredPosts, dateLocale]);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12 border-b border-border pb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-primary">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-widest">
              {t("timeline.days")}
            </span>
          </div>
          <LanguageSwitch
            lang={lang as "it" | "en"}
            onChange={(l) => { void i18n.changeLanguage(l); }}
            hasEn={anyHasEn}
          />
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight leading-none mb-4">
          {t("timeline.title")}
        </h1>
        <p className="text-muted-foreground max-w-xl">
          {t("timeline.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-10">
        {MONTHS.map((m) => (
          <button
            key={String(m.value)}
            onClick={() => setActiveMonth(m.value)}
            className={`px-4 py-1.5 text-sm font-bold uppercase tracking-widest border transition-colors ${
              activeMonth === m.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
          >
            {t(m.key)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse flex gap-6 py-4 border-b border-border/40">
              <div className="h-4 bg-muted w-24 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-muted w-2/3" />
                <div className="h-3 bg-muted w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-24 bg-muted/20 border border-dashed">
          <h3 className="text-2xl font-display font-bold uppercase mb-2">
            {t("timeline.noPost")}
          </h3>
          <p className="text-muted-foreground">
            {t("timeline.noPostDesc")}
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {grouped.map(([month, monthPosts]) => (
            <section key={month}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 pb-2 border-b border-primary/30">
                {month} · {monthPosts.length} {t("timeline.posts_other")}
              </h2>
              <div className="divide-y divide-border/40">
                {monthPosts.map((post) => (
                  <article key={post.id} className="group py-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
                    <time
                      dateTime={post.publishedAt}
                      className="text-xs font-mono text-muted-foreground tabular-nums shrink-0 pt-1 w-24"
                    >
                      {format(parseISO(post.publishedAt), "dd MMM", {
                        locale: dateLocale,
                      })}
                    </time>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link href={`/posts/${post.slug}`}>
                            <h3 className="font-display font-bold text-base leading-snug group-hover:text-primary transition-colors truncate">
              {postTitle(post)}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {postExcerpt(post)}
                          </p>
                        </div>
                        <Link
                          href={`/posts/${post.slug}`}
                          className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-0.5"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wider font-medium text-primary/70">
                          {post.category}
                        </span>
                        {post.location && (
                          <>
                            <span>·</span>
                            <span>{post.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
