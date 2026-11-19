import {
  useGetBlogStats,
  useGetFeaturedPost,
  useListPopularPosts,
  useListPosts,
  useListTags,
  useRecordVisit,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { useEffect } from "react";
import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import {
  ArrowUpRight,
  Bike,
  Calendar,
  ChevronRight,
  Clock,
  Compass,
  Gauge,
  Headphones,
  MessageSquare,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

const PILLARS = [
  {
    key: "road",
    image: MEDIA + "/route.webp",
    icon: Compass,
    label: "home.pillarRoadLabel",
    title: "home.pillarRoadTitle",
    description: "home.pillarRoadDesc",
  },
  {
    key: "tech",
    image: MEDIA + "/telemetry.webp",
    icon: Gauge,
    label: "home.pillarTechLabel",
    title: "home.pillarTechTitle",
    description: "home.pillarTechDesc",
  },
  {
    key: "garage",
    image: MEDIA + "/workshop.webp",
    icon: Wrench,
    label: "home.pillarGarageLabel",
    title: "home.pillarGarageTitle",
    description: "home.pillarGarageDesc",
  },
];

function dateLabel(value: string, language: string) {
  return format(new Date(value), "d MMM yyyy", {
    locale: language.startsWith("it") ? it : enUS,
  });
}

function AuthorMark({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="bb-author-avatar" />;
  }

  return (
    <span className="bb-author-avatar bb-author-initial" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Home() {
  const { t, i18n } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const { data: featuredPost, isLoading: featuredLoading } = useGetFeaturedPost();
  const { data: recentPosts, isLoading: recentLoading } = useListPosts({});
  const { data: popularPosts, isLoading: popularLoading } = useListPopularPosts({ limit: 4 });
  const { data: stats, refetch: refetchStats } = useGetBlogStats();
  const { data: tags } = useListTags();
  const { mutate: recordVisit } = useRecordVisit();

  useEffect(() => {
    if (sessionStorage.getItem("visited")) return;
    sessionStorage.setItem("visited", "1");
    recordVisit(undefined, { onSuccess: () => { void refetchStats(); } });
  }, [recordVisit, refetchStats]);

  const podcastPosts = recentPosts?.filter((post) => post.audioUrl).slice(0, 3) ?? [];

  return (
    <div className="bb-home">
      <div className="container mx-auto px-4">
        <div className="bb-home-mastline">
          <span>{t("home.motto")}</span>
          <span className="bb-mastline-label">{t("home.mastlineLabel")}</span>
        </div>
      </div>

      <section className="bb-hero" aria-labelledby="home-title">
        <img className="bb-hero-image" src={MEDIA + "/road.webp"} alt="" aria-hidden="true" />
        <div className="bb-hero-shade" aria-hidden="true" />
        <div className="container mx-auto px-4 bb-hero-inner">
          <div className="bb-hero-copy">
            <p className="bb-eyebrow">
              <Bike className="h-4 w-4" aria-hidden="true" />
              {t("home.heroTagline")}
            </p>
            <h1 id="home-title" className="bb-hero-title">{t("home.heroTitle")}</h1>
            <p className="bb-hero-description">{t("home.heroDesc")}</p>
            <div className="bb-hero-actions">
              <Link href="/posts" className="bb-button bb-button-primary">
                {t("home.readArticles")}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#ultime-storie" className="bb-text-link">
                {t("home.latestStories")}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className="bb-hero-index" aria-hidden="true">
            <span>01</span>
            <span className="bb-hero-index-line" />
            <span>03</span>
          </div>
          <div className="bb-hero-caption">{t("home.heroCaption")}</div>
        </div>
      </section>

      <section className="container mx-auto px-4 bb-pillars" aria-labelledby="pillars-title">
        <div className="bb-section-heading">
          <div>
            <p className="bb-section-kicker">{t("home.sectionsEyebrow")}</p>
            <h2 id="pillars-title">{t("home.sectionsTitle")}</h2>
          </div>
          <p>{t("home.sectionsDesc")}</p>
        </div>

        <div className="bb-pillar-grid">
          {PILLARS.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <article key={pillar.key} className="bb-pillar-card">
                <Link href="/posts" className="bb-pillar-image-link" aria-label={t(pillar.title)}>
                  <img src={pillar.image} alt="" loading="lazy" />
                  <span className="bb-pillar-number">0{index + 1}</span>
                  <span className="bb-pillar-open" aria-hidden="true">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </Link>
                <div className="bb-pillar-copy">
                  <p className="bb-pillar-label"><Icon className="h-4 w-4" aria-hidden="true" />{t(pillar.label)}</p>
                  <h3><Link href="/posts">{t(pillar.title)}</Link></h3>
                  <p>{t(pillar.description)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {(featuredLoading || featuredPost) && (
        <section className="container mx-auto px-4 bb-featured" aria-labelledby="featured-title">
          <div className="bb-section-heading bb-section-heading-compact">
            <div>
              <p className="bb-section-kicker">{t("home.featuredEyebrow")}</p>
              <h2 id="featured-title">{t("home.featuredTitle")}</h2>
            </div>
            <Link href="/posts" className="bb-text-link">
              {t("home.viewAll")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {featuredLoading ? (
            <div className="bb-featured-skeleton" aria-hidden="true" />
          ) : featuredPost && (
            <article className="bb-featured-card">
              <Link href={`/posts/${featuredPost.slug}`} className="bb-featured-image">
                <img src={featuredPost.coverImageUrl} alt={postTitle(featuredPost)} loading="lazy" />
              </Link>
              <div className="bb-featured-copy">
                <Badge className="bb-category-badge">{featuredPost.category.replace(/-/g, " ")}</Badge>
                <h3><Link href={`/posts/${featuredPost.slug}`}>{postTitle(featuredPost)}</Link></h3>
                <p>{postExcerpt(featuredPost)}</p>
                <div className="bb-post-meta">
                  <span className="bb-author-meta"><AuthorMark name={featuredPost.author.name} avatarUrl={featuredPost.author.avatarUrl} />{featuredPost.author.name}</span>
                  <span><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{dateLabel(featuredPost.publishedAt, i18n.language)}</span>
                  <span><Clock className="h-3.5 w-3.5" aria-hidden="true" />{featuredPost.readingMinutes} {t("postDetail.minRead")}</span>
                </div>
              </div>
            </article>
          )}
        </section>
      )}

      {!recentLoading && podcastPosts.length > 0 && (
        <section className="container mx-auto px-4 bb-podcast-strip" aria-labelledby="podcast-strip-title">
          <div className="bb-section-heading bb-section-heading-compact">
            <div>
              <p className="bb-section-kicker">{t("home.audioEyebrow")}</p>
              <h2 id="podcast-strip-title"><Headphones className="h-6 w-6" aria-hidden="true" />{t("home.listen")}</h2>
            </div>
            <Link href="/podcast" className="bb-text-link">{t("home.allEpisodes")} <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="bb-audio-grid">
            {podcastPosts.map((post) => (
              <Link key={post.id} href={`/posts/${post.slug}`} className="bb-audio-card">
                <span className="bb-audio-icon"><Headphones className="h-4 w-4" aria-hidden="true" /></span>
                <span className="bb-audio-content">
                  <span className="bb-audio-label">{t("home.audioEpisode")}</span>
                  <span className="bb-audio-title">{postTitle(post)}</span>
                  <span className="bb-audio-byline">{post.author.name} <span aria-hidden="true">·</span> {post.readingMinutes} {t("postDetail.minRead")}</span>
                </span>
                <ChevronRight className="h-4 w-4 bb-audio-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="ultime-storie" className="container mx-auto px-4 bb-stories" aria-labelledby="stories-title">
        <div className="bb-section-heading bb-section-heading-compact">
          <div>
            <p className="bb-section-kicker">{t("home.recentEyebrow")}</p>
            <h2 id="stories-title">{t("home.recentDispatches")}</h2>
          </div>
          <Link href="/posts" className="bb-text-link">{t("home.viewAll")} <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>

        <div className="bb-main-grid">
          <div className="bb-story-list">
            {recentLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div key={index} className="bb-story-skeleton" aria-hidden="true" />)
            ) : recentPosts?.slice(0, 5).map((post) => (
              <article key={post.id} className="bb-story-row">
                <Link href={`/posts/${post.slug}`} className="bb-story-image">
                  <img src={post.coverImageUrl} alt={postTitle(post)} loading="lazy" />
                </Link>
                <div className="bb-story-copy">
                  <Link href={`/categories/${post.category}`} className="bb-story-category">{post.category.replace(/-/g, " ")}</Link>
                  <h3><Link href={`/posts/${post.slug}`}>{postTitle(post)}</Link></h3>
                  <p>{postExcerpt(post)}</p>
                  <div className="bb-post-meta">
                    <span>{post.author.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{dateLabel(post.publishedAt, i18n.language)}</span>
                    <span aria-hidden="true">·</span>
                    <span><Clock className="h-3.5 w-3.5" aria-hidden="true" />{post.readingMinutes} {t("postDetail.minRead")}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="bb-sidebar">
            <section className="bb-sidebar-panel" aria-labelledby="popular-title">
              <div className="bb-sidebar-heading">
                <p className="bb-section-kicker">{t("home.readerChoice")}</p>
                <h3 id="popular-title">{t("home.mostRead")}</h3>
              </div>
              <div className="bb-popular-list">
                {popularLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <div key={index} className="bb-popular-skeleton" aria-hidden="true" />)
                ) : popularPosts?.map((post, index) => (
                  <Link key={post.id} href={`/posts/${post.slug}`} className="bb-popular-row">
                    <span className="bb-popular-index">0{index + 1}</span>
                    <span className="bb-popular-copy">
                      <span className="bb-popular-title">{postTitle(post)}</span>
                      <span className="bb-popular-stats">
                        <span><ThumbsUp className="h-3 w-3" aria-hidden="true" />{post.likeCount}</span>
                        <span><MessageSquare className="h-3 w-3" aria-hidden="true" />{post.commentCount}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="bb-sidebar-panel" aria-labelledby="categories-title">
              <div className="bb-sidebar-heading">
                <p className="bb-section-kicker">{t("home.findYourWay")}</p>
                <h3 id="categories-title">{t("home.categories")}</h3>
              </div>
              <ul className="bb-category-list">
                {stats?.categories?.map((category) => (
                  <li key={category.category}>
                    <Link href={`/categories/${category.category}`}>
                      <span>{category.category.replace(/-/g, " ")}</span>
                      <span className="bb-category-count">{category.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bb-sidebar-panel" aria-labelledby="tags-title">
              <div className="bb-sidebar-heading">
                <p className="bb-section-kicker">{t("home.keywordsEyebrow")}</p>
                <h3 id="tags-title">{t("home.tags")}</h3>
              </div>
              <div className="bb-tag-list">
                {tags?.map((tag) => (
                  <Link key={tag.tag} href={`/tags/${tag.tag}`}>
                    {tag.tag}
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>

      <div className="bb-home-signoff">
        <div className="container mx-auto px-4">
          <p><Bike className="h-4 w-4" aria-hidden="true" />{t("home.signoff")}</p>
          <Link href="/posts">{t("home.readArticles")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  );
}
