import { useListPosts } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { Clock, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

export function Tags() {
  const { t, i18n } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const { tag } = useParams();
  const { data: posts, isLoading } = useListPosts({ tag });
  const dateLocale = i18n.language.startsWith("it") ? it : enUS;

  return (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <header className="bb-page-intro bb-page-intro-compact">
        <div className="bb-page-intro-copy">
          <p className="bb-section-kicker">{t("tags.label")}</p>
          <h1>#{tag}</h1>
          <p className="bb-page-intro-description">{t("tags.subtitle")}</p>
        </div>
        <div className="bb-page-intro-media" aria-hidden="true">
          <img src={MEDIA + "/route.webp"} alt="" />
          <span>{t("posts.imageCaption")}</span>
        </div>
      </header>

      {isLoading ? (
        <div className="bb-card-grid" aria-label={t("posts.loading")}>
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="bb-article-skeleton" aria-hidden="true" />)}
        </div>
      ) : posts?.length === 0 ? (
        <div className="bb-empty-state"><p>{t("tags.noResults")}</p></div>
      ) : (
        <div className="bb-card-grid">
          {posts?.map((post) => (
            <article key={post.id} className="bb-article-card">
              <Link href={`/posts/${post.slug}`} className="bb-article-image">
                <img src={post.coverImageUrl} alt={postTitle(post)} loading="lazy" />
                <span className="bb-article-open" aria-hidden="true"><ArrowUpRight className="h-4 w-4" /></span>
              </Link>
              <div className="bb-article-copy">
                <Link href={`/categories/${post.category}`} className="bb-story-category">{post.category.replace(/-/g, " ")}</Link>
                <h2><Link href={`/posts/${post.slug}`}>{postTitle(post)}</Link></h2>
                <p>{postExcerpt(post)}</p>
                <div className="bb-post-meta">
                  <span>{post.author.name}</span><span aria-hidden="true">·</span>
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
