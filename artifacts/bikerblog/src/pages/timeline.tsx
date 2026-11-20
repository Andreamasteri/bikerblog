import { useListPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { Calendar, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";
import { usePageMeta } from "@/lib/use-page-meta";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

export function Timeline() {
  const { t, i18n } = useTranslation();
  usePageMeta(t("timeline.title"), t("timeline.subtitle"), { language: i18n.language });
  const dateLocale = i18n.language.startsWith("it") ? it : enUS;
  const { postTitle, postExcerpt } = usePostLocale();
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const { data: posts, isLoading } = useListPosts();

  const sortedPosts = useMemo(() => {
    if (!posts) return [];
    return [...posts].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );
  }, [posts]);

  const monthOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const post of sortedPosts) {
      const date = parseISO(post.publishedAt);
      const key = format(date, "yyyy-MM");
      if (!unique.has(key)) unique.set(key, format(date, "MMMM yyyy", { locale: dateLocale }));
    }
    return Array.from(unique, ([key, label]) => ({ key, label }));
  }, [sortedPosts, dateLocale]);

  const filteredPosts = useMemo(() => {
    if (activeMonth === null) return sortedPosts;
    return sortedPosts.filter((post) => format(parseISO(post.publishedAt), "yyyy-MM") === activeMonth);
  }, [sortedPosts, activeMonth]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof filteredPosts> = {};
    for (const post of filteredPosts) {
      const key = format(parseISO(post.publishedAt), "MMMM yyyy", { locale: dateLocale });
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return Object.entries(map);
  }, [filteredPosts, dateLocale]);

  return (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <header className="bb-page-intro bb-page-intro-compact">
        <div className="bb-page-intro-copy">
          <p className="bb-section-kicker"><Calendar className="h-4 w-4" aria-hidden="true" />{t("timeline.days")}</p>
          <h1>{t("timeline.title")}</h1>
          <p className="bb-page-intro-description">{t("timeline.subtitle")}</p>
        </div>
        <div className="bb-page-intro-media" aria-hidden="true">
          <img src={MEDIA + "/route.webp"} alt="" />
          <span>{t("posts.imageCaption")}</span>
        </div>
      </header>

      <div className="bb-timeline-filters" role="group" aria-label={t("timeline.filterByMonth")}>
        <button
          type="button"
          onClick={() => setActiveMonth(null)}
          className={activeMonth === null ? "bb-filter-button is-active" : "bb-filter-button"}
          aria-pressed={activeMonth === null}
        >
          {t("timeline.all")}
        </button>
        {monthOptions.map((month) => (
          <button
            type="button"
            key={month.key}
            onClick={() => setActiveMonth(month.key)}
            className={activeMonth === month.key ? "bb-filter-button is-active" : "bb-filter-button"}
            aria-pressed={activeMonth === month.key}
          >
            {month.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bb-timeline-skeletons" aria-label={t("timeline.loading")}>
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="bb-timeline-skeleton" aria-hidden="true" />)}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bb-empty-state">
          <h2>{t("timeline.noPost")}</h2>
          <p>{t("timeline.noPostDesc")}</p>
        </div>
      ) : (
        <div className="bb-timeline">
          {grouped.map(([month, monthPosts]) => (
            <section key={month} className="bb-timeline-group">
              <h2>{month}<span>{monthPosts.length} {t(monthPosts.length === 1 ? "timeline.posts_one" : "timeline.posts_other")}</span></h2>
              <div className="bb-timeline-entries">
                {monthPosts.map((post) => (
                  <article key={post.id} className="bb-timeline-row">
                    <time dateTime={post.publishedAt}>
                      {format(parseISO(post.publishedAt), "dd MMM", { locale: dateLocale })}
                    </time>
                    <div className="bb-timeline-copy">
                      <div className="bb-timeline-title-row">
                        <div>
                          <Link href={`/posts/${post.slug}`} className="bb-timeline-title">{postTitle(post)}</Link>
                          <p>{postExcerpt(post)}</p>
                        </div>
                        <Link href={`/posts/${post.slug}`} className="bb-timeline-open" aria-label={postTitle(post)}>
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                      <div className="bb-timeline-meta">
                        <Link href={`/categories/${post.category}`}>{post.category.replace(/-/g, " ")}</Link>
                        {post.location && <><span aria-hidden="true">·</span><span>{post.location}</span></>}
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
