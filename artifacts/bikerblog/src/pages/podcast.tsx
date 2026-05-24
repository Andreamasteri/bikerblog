import { useListPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Headphones, Clock, Rss, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";
import { PodcastPlayer } from "@/components/podcast-player";

export function Podcast() {
  const { t } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const { data: allPosts, isLoading } = useListPosts({});

  const podcastPosts = allPosts?.filter(p => p.audioUrl) ?? [];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Headphones className="w-8 h-8 text-primary" />
            <h1 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight leading-none">
              {t("podcast.title")}
            </h1>
          </div>
          <p className="text-muted-foreground max-w-xl">{t("podcast.subtitle")}</p>
        </div>
        <a
          href="/api/podcast/rss"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border border-primary text-primary px-4 py-2 text-sm font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
        >
          <Rss className="w-4 h-4" />
          {t("podcast.rss")}
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse border border-border p-6">
              <div className="h-4 bg-muted w-1/4 mb-3"></div>
              <div className="h-6 bg-muted w-2/3 mb-2"></div>
              <div className="h-4 bg-muted w-full mb-6"></div>
              <div className="h-16 bg-muted w-full"></div>
            </div>
          ))}
        </div>
      ) : podcastPosts.length === 0 ? (
        <div className="text-center py-24 bg-muted/20 border border-dashed">
          <Headphones className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-2xl font-display font-bold uppercase mb-2">{t("podcast.empty")}</h3>
          <p className="text-muted-foreground">{t("podcast.emptyDesc")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {podcastPosts.map((post, i) => (
            <article key={post.id} className="border border-border hover:border-primary/50 transition-colors bg-muted/5 p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="md:w-20 shrink-0 flex flex-row md:flex-col items-center md:items-center gap-3 md:gap-1">
                  <span className="text-4xl font-display font-bold text-muted/30">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary flex items-center gap-1 md:mt-1">
                    <Headphones className="w-3 h-3" />
                    {t("podcast.episode")}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2 text-xs text-muted-foreground font-medium">
                    <Link href={`/categories/${post.category}`} className="uppercase tracking-widest text-primary hover:underline font-bold">
                      {post.category.replace("-", " ")}
                    </Link>
                    <span>&bull;</span>
                    <span>{format(new Date(post.publishedAt), "d MMM yyyy")}</span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {post.readingMinutes} min
                    </span>
                  </div>

                  <Link href={`/posts/${post.slug}`} className="group">
                    <h2 className="text-xl md:text-2xl font-display font-bold mb-2 group-hover:text-primary transition-colors leading-tight">
                      {postTitle(post)}
                    </h2>
                  </Link>

                  <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                    {postExcerpt(post)}
                  </p>

                  <PodcastPlayer audioUrl={post.audioUrl!} title={postTitle(post)} />

                  <Link
                    href={`/posts/${post.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t("podcast.readPost")} <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
