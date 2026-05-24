import { useGetBlogStats, useGetFeaturedPost, useListPopularPosts, useListPosts, useListTags } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Calendar, Clock, MessageSquare, ThumbsUp, Headphones, ChevronRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";
import { LanguageSwitch } from "@/components/language-switch";

function StaticHero() {
  const { t } = useTranslation();
  return (
    <section className="mb-16">
      <div className="relative h-[60vh] overflow-hidden bg-black flex items-end">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.15) 39px,rgba(255,255,255,.15) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.15) 39px,rgba(255,255,255,.15) 40px)"
        }} />
        <div className="relative z-10 p-8 md:p-12 w-full max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <Wrench className="h-6 w-6 text-primary" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{t("home.heroTagline")}</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-4 leading-tight uppercase tracking-tighter">
            BikerBlog
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl font-serif italic">
            {t("home.heroDesc")}
          </p>
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors"
          >
            {t("home.readArticles")} <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const { t, i18n } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const { data: featuredPost, isLoading: featuredLoading } = useGetFeaturedPost();
  const { data: recentPosts, isLoading: recentLoading } = useListPosts({});
  const { data: popularPosts, isLoading: popularLoading } = useListPopularPosts({ limit: 4 });
  const { data: stats } = useGetBlogStats();
  const { data: tags } = useListTags();

  const podcastPosts = recentPosts?.filter(p => p.audioUrl).slice(0, 3) ?? [];
  const anyHasEn = recentPosts?.some(p => !!p.bodyEn) ?? false;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm md:text-base italic text-muted-foreground/70 tracking-widest font-serif select-none">
          {t("home.motto")}
        </p>
        <LanguageSwitch
          lang={i18n.language as "it" | "en"}
          onChange={(l) => { void i18n.changeLanguage(l); }}
          hasEn={anyHasEn}
        />
      </div>

      {featuredLoading ? (
        <div className="h-[60vh] bg-muted animate-pulse mb-12"></div>
      ) : featuredPost ? (
        <section className="mb-16">
          <Link href={`/posts/${featuredPost.slug}`} className="group relative block h-[60vh] overflow-hidden bg-black">
            <img src={featuredPost.coverImageUrl} alt={postTitle(featuredPost)} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full max-w-4xl">
              <Badge className="mb-4 bg-primary text-primary-foreground uppercase tracking-widest">{featuredPost.category.replace('-', ' ')}</Badge>
              <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4 leading-tight group-hover:text-primary transition-colors">{postTitle(featuredPost)}</h1>
              <p className="text-lg md:text-xl text-gray-300 mb-6 line-clamp-2 max-w-2xl">{postExcerpt(featuredPost)}</p>
              <div className="flex items-center gap-6 text-gray-400 text-sm font-medium">
                <div className="flex items-center gap-2">
                  <img src={featuredPost.author.avatarUrl} alt={featuredPost.author.name} className="w-8 h-8 rounded-full" />
                  <span>{featuredPost.author.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(featuredPost.publishedAt), "MMM d, yyyy")}</span>
                </div>
              </div>
            </div>
          </Link>
        </section>
      ) : (
        <StaticHero />
      )}

      {/* Podcast section */}
      {!recentLoading && podcastPosts.length > 0 && (
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8 border-b pb-4">
            <h2 className="text-3xl font-display font-bold uppercase tracking-tight flex items-center gap-3">
              <Headphones className="w-7 h-7 text-primary" />
              {t("home.listen")}
            </h2>
            <Link href="/podcast" className="text-primary hover:underline font-bold uppercase text-sm tracking-wider">{t("home.allPosts")}</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {podcastPosts.map(post => (
              <Link key={post.id} href={`/posts/${post.slug}`} className="group flex flex-col border border-border hover:border-primary transition-colors bg-muted/10 hover:bg-muted/30 p-5">
                <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                  <Headphones className="w-3.5 h-3.5" />
                  <span>{t("home.audioEpisode")}</span>
                </div>
                <h3 className="font-display font-bold text-base leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">{postTitle(post)}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1">{postExcerpt(post)}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mt-auto">
                  <span className="uppercase tracking-wider">{post.author.name}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readingMinutes} min</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-8 border-b pb-4">
            <h2 className="text-3xl font-display font-bold uppercase tracking-tight">{t("home.recentDispatches")}</h2>
            <Link href="/posts" className="text-primary hover:underline font-bold uppercase text-sm tracking-wider">{t("home.viewAll")}</Link>
          </div>

          <div className="space-y-12">
            {recentLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-64 bg-muted animate-pulse"></div>)
            ) : recentPosts?.slice(0, 5).map(post => (
              <article key={post.id} className="grid md:grid-cols-5 gap-6 group">
                <Link href={`/posts/${post.slug}`} className="md:col-span-2 block overflow-hidden bg-muted aspect-[4/3] md:aspect-auto h-full">
                  <img src={post.coverImageUrl} alt={postTitle(post)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </Link>
                <div className="md:col-span-3 flex flex-col justify-center">
                  <Link href={`/categories/${post.category}`} className="text-xs font-bold uppercase tracking-widest text-primary mb-2 hover:underline">{post.category.replace('-', ' ')}</Link>
                  <Link href={`/posts/${post.slug}`}>
                    <h3 className="text-2xl font-display font-bold mb-3 group-hover:text-primary transition-colors leading-tight">{postTitle(post)}</h3>
                  </Link>
                  <p className="text-muted-foreground mb-4 line-clamp-2">{postExcerpt(post)}</p>
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground mt-auto">
                    <span className="uppercase tracking-wider">{post.author.name}</span>
                    <span>&bull;</span>
                    <span>{format(new Date(post.publishedAt), "MMM d")}</span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {post.readingMinutes} min</span>
                    {post.audioUrl && (
                      <>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 text-primary"><Headphones className="w-3 h-3" /> audio</span>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-12">
          <div>
            <h3 className="text-xl font-display font-bold uppercase tracking-tight mb-6 border-b pb-2">{t("home.mostRead")}</h3>
            <div className="space-y-6">
              {popularLoading ? (
                 Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse"></div>)
              ) : popularPosts?.map((post, i) => (
                <Link key={post.id} href={`/posts/${post.slug}`} className="flex gap-4 group">
                  <span className="text-4xl font-display font-bold text-muted/30 group-hover:text-primary/20 transition-colors">0{i + 1}</span>
                  <div>
                    <h4 className="font-display font-bold group-hover:text-primary transition-colors leading-tight mb-1">{postTitle(post)}</h4>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3"/> {post.likeCount}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3"/> {post.commentCount}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-display font-bold uppercase tracking-tight mb-6 border-b pb-2">{t("home.categories")}</h3>
            <ul className="space-y-2">
              {stats?.categories.map(cat => (
                <li key={cat.category}>
                  <Link href={`/categories/${cat.category}`} className="flex items-center justify-between group py-2">
                    <span className="font-medium uppercase tracking-wider text-sm group-hover:text-primary transition-colors">{cat.category.replace('-', ' ')}</span>
                    <span className="text-xs bg-muted px-2 py-1 text-muted-foreground font-mono">{cat.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-display font-bold uppercase tracking-tight mb-6 border-b pb-2">{t("home.tags")}</h3>
            <div className="flex flex-wrap gap-2">
              {tags?.map(tag => (
                <Link key={tag.tag} href={`/tags/${tag.tag}`}>
                  <Badge variant="outline" className="uppercase text-xs tracking-wider hover:border-primary hover:text-primary transition-colors cursor-pointer rounded-none">
                    {tag.tag}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
