import { useListPosts } from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { Clock, Search, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

export function Posts() {
  const { t, i18n } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const query = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(query);
  const { data: posts, isLoading } = useListPosts({ search: searchQuery || undefined });
  const dateLocale = i18n.language.startsWith("it") ? it : enUS;

  return (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <header className="bb-page-intro bb-posts-intro">
        <div className="bb-page-intro-copy">
          <p className="bb-section-kicker">{t("posts.eyebrow")}</p>
          <h1>{t("posts.title")}</h1>
          <p className="bb-page-intro-description">{t("posts.subtitle")}</p>
        </div>
        <div className="bb-page-intro-media" aria-hidden="true">
          <img src={MEDIA + "/route.webp"} alt="" />
          <span>{t("posts.imageCaption")}</span>
        </div>
      </header>

      <div className="bb-archive-tools">
        <label className="bb-search-field">
          <Search className="h-5 w-5" aria-hidden="true" />
          <Input
            type="search"
            aria-label={t("posts.searchPlaceholder")}
            placeholder={t("posts.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <p>{t("posts.archiveNote")}</p>
      </div>

      {isLoading ? (
        <div className="bb-card-grid" aria-label={t("posts.loading")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bb-article-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <div className="bb-empty-state">
          <h2>{t("posts.deadEnd")}</h2>
          <p>{t("posts.noResults")}</p>
        </div>
      ) : (
        <div className="bb-card-grid">
          {posts?.map((post) => (
            <article key={post.id} className="bb-article-card">
              <Link href={`/posts/${post.slug}`} className="bb-article-image">
                <img src={post.coverImageUrl} alt={postTitle(post)} loading="lazy" />
                <span className="bb-article-open" aria-hidden="true"><ArrowUpRight className="h-4 w-4" /></span>
              </Link>
              <div className="bb-article-copy">
                <Link href={`/categories/${post.category}`} className="bb-story-category">
                  {post.category.replace(/-/g, " ")}
                </Link>
                <h2><Link href={`/posts/${post.slug}`}>{postTitle(post)}</Link></h2>
                <p>{postExcerpt(post)}</p>
                <div className="bb-post-meta">
                  <span>{post.author.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{format(new Date(post.publishedAt), "d MMM yyyy", { locale: dateLocale })}</span>
                  <span aria-hidden="true">·</span>
                  <span><Clock className="h-3.5 w-3.5" aria-hidden="true" />{post.readingMinutes} {t("postDetail.minRead")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
