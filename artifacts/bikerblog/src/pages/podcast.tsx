import { useListPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { Headphones, Clock, Rss, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";
import { PodcastPlayer } from "@/components/podcast-player";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

export function Podcast() {
  const { t, i18n } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const { data: allPosts, isLoading } = useListPosts({});
  const podcastPosts = allPosts?.filter((post) => post.audioUrl) ?? [];
  const dateLocale = i18n.language.startsWith("it") ? it : enUS;

  return (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <header className="bb-page-intro bb-page-intro-compact bb-podcast-intro">
        <div className="bb-page-intro-copy">
          <p className="bb-section-kicker"><Headphones className="h-4 w-4" aria-hidden="true" />{t("podcast.eyebrow")}</p>
          <h1>{t("podcast.title")}</h1>
          <p className="bb-page-intro-description">{t("podcast.subtitle")}</p>
          <a href="/api/podcast/rss" target="_blank" rel="noopener noreferrer" className="bb-button bb-button-primary">
            <Rss className="h-4 w-4" aria-hidden="true" />{t("podcast.rss")}
          </a>
        </div>
        <div className="bb-page-intro-media" aria-hidden="true">
          <img src={MEDIA + "/redazione.webp"} alt="" />
          <span>{t("podcast.imageCaption")}</span>
        </div>
      </header>

      {isLoading ? (
        <div className="bb-episode-list" aria-label={t("podcast.loading")}>
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="bb-episode-skeleton" aria-hidden="true" />)}
        </div>
      ) : podcastPosts.length === 0 ? (
        <div className="bb-empty-state">
          <Headphones className="h-10 w-10" aria-hidden="true" />
          <h2>{t("podcast.empty")}</h2>
          <p>{t("podcast.emptyDesc")}</p>
        </div>
      ) : (
        <div className="bb-episode-list">
          {podcastPosts.map((post, index) => (
            <article key={post.id} className="bb-episode-card">
              <div className="bb-episode-number">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span><Headphones className="h-3.5 w-3.5" aria-hidden="true" />{t("podcast.episode")}</span>
              </div>
              <div className="bb-episode-content">
                <div className="bb-post-meta">
                  <Link href={`/categories/${post.category}`}>{post.category.replace(/-/g, " ")}</Link>
                  <span aria-hidden="true">·</span>
                  <span>{format(new Date(post.publishedAt), "d MMM yyyy", { locale: dateLocale })}</span>
                  <span aria-hidden="true">·</span>
                  <span><Clock className="h-3.5 w-3.5" aria-hidden="true" />{post.readingMinutes} {t("postDetail.minRead")}</span>
                </div>
                <h2><Link href={`/posts/${post.slug}`}>{postTitle(post)}</Link></h2>
                <p>{postExcerpt(post)}</p>
                <PodcastPlayer audioUrl={post.audioUrl!} title={postTitle(post)} />
                <Link href={`/posts/${post.slug}`} className="bb-episode-read">
                  {t("podcast.readPost")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
