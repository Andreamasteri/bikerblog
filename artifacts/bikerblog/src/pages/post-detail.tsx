import { useGetPost, useLikePost, useListPostComments, useCreatePostComment, getGetPostQueryKey, getListPostCommentsQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { Clock, MapPin, Bike, ThumbsUp, MessageSquare, ChevronLeft, Quote, Languages } from "lucide-react";
import { PodcastPlayer } from "@/components/podcast-player";
import { LanguageSwitch } from "@/components/language-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function usePostMeta(slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    const base = window.location.origin + window.location.pathname;

    let canonicalEl = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.rel = "canonical";
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.href = base;

    const langs: Array<[string, string]> = [
      ["it", `${base}?lang=it`],
      ["en", `${base}?lang=en`],
      ["x-default", base],
    ];
    for (const [hreflang, href] of langs) {
      const id = `hreflang-${hreflang}`;
      let el = document.getElementById(id) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.id = id;
        el.rel = "alternate";
        el.setAttribute("hreflang", hreflang);
        document.head.appendChild(el);
      }
      el.href = href;
    }

    return () => {
      canonicalEl?.remove();
      for (const [hreflang] of langs) {
        document.getElementById(`hreflang-${hreflang}`)?.remove();
      }
    };
  }, [slug]);
}

export function PostDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { slug } = useParams();
  usePostMeta(slug);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: post, isLoading: postLoading, error: postError } = useGetPost(slug || "", { query: { enabled: !!slug, queryKey: ["post", slug] } });
  const { data: comments, isLoading: commentsLoading } = useListPostComments(slug || "", { query: { enabled: !!slug, queryKey: ["post-comments", slug] } });

  const likeMutation = useLikePost();
  const commentMutation = useCreatePostComment();

  const [commentName, setCommentName] = useState("");
  const [commentBody, setCommentBody] = useState("");

  const handleLike = () => {
    if (!slug) return;
    likeMutation.mutate({ slug }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(slug) });
      }
    });
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !commentName.trim() || !commentBody.trim()) return;

    commentMutation.mutate({
      slug,
      data: { authorName: commentName, body: commentBody }
    }, {
      onSuccess: () => {
        toast({ title: t("postDetail.commentPosted"), description: t("postDetail.commentPostedDesc") });
        setCommentName("");
        setCommentBody("");
        queryClient.invalidateQueries({ queryKey: getListPostCommentsQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(slug) });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("postDetail.commentError"), description: t("postDetail.commentErrorDesc") });
      }
    });
  };

  if (postLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-[70vh] bg-muted w-full mb-12"></div>
        <div className="container max-w-4xl mx-auto px-4">
          <div className="h-8 bg-muted w-1/4 mb-4"></div>
          <div className="h-16 bg-muted w-3/4 mb-8"></div>
          <div className="h-4 bg-muted w-full mb-2"></div>
          <div className="h-4 bg-muted w-full mb-2"></div>
          <div className="h-4 bg-muted w-2/3 mb-12"></div>
        </div>
      </div>
    );
  }

  if (postError || !post) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl font-display font-bold uppercase mb-4">{t("postDetail.deadEnd")}</h1>
        <p className="text-muted-foreground mb-8">{t("postDetail.notFound")}</p>
        <Link href="/posts">
          <Button variant="outline" className="rounded-none uppercase tracking-wider font-bold">
            <ChevronLeft className="w-4 h-4 mr-2" /> {t("postDetail.backToArchives")}
          </Button>
        </Link>
      </div>
    );
  }

  const useEn = lang === "en";
  const displayTitle = useEn && post.titleEn ? post.titleEn : post.title;
  const displayExcerpt = useEn && post.excerptEn ? post.excerptEn : post.excerpt;
  const displayBody = useEn && post.bodyEn ? post.bodyEn : post.content;
  const hasTranslation = !!(post.titleEn && post.excerptEn && post.bodyEn);

  return (
    <article className="pb-24">
      {/* Hero Section */}
      <header className="relative h-[70vh] min-h-[500px] w-full mb-16 flex items-end">
        <img src={post.coverImageUrl} alt={displayTitle} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="container max-w-4xl mx-auto px-4 relative z-10 pb-12">
          <div className="flex items-center justify-between mb-8">
            <Link href="/posts" className="inline-flex items-center text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
              <ChevronLeft className="w-4 h-4 mr-1" /> {t("postDetail.back")}
            </Link>
            <LanguageSwitch
              lang={lang as "it" | "en"}
              onChange={(l) => { void i18n.changeLanguage(l); }}
              hasEn={hasTranslation}
            />
          </div>
          <div className="mb-6 flex flex-wrap gap-3">
            <Badge className="bg-primary text-primary-foreground uppercase tracking-widest rounded-none">{post.category.replace('-', ' ')}</Badge>
            {post.tags.map(tag => (
              <Badge key={tag} variant="outline" className="uppercase tracking-widest rounded-none border-primary/50 text-primary-foreground">{tag}</Badge>
            ))}
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold uppercase tracking-tight mb-6 leading-[1.1]">{displayTitle}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl font-serif italic">{displayExcerpt}</p>
        </div>
      </header>

      <div className="container max-w-4xl mx-auto px-4">
        {/* Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-6 py-6 border-y border-border mb-12 bg-muted/10">
          <div className="flex items-center gap-4">
            <img src={post.author.avatarUrl} alt={post.author.name} className="w-12 h-12 rounded-full border-2 border-primary grayscale hover:grayscale-0 transition-all duration-300" />
            <div>
              <Link href={`/authors#${post.author.id}`} className="font-bold uppercase tracking-wider hover:text-primary transition-colors block">{post.author.name}</Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{format(new Date(post.publishedAt), "MMMM d, yyyy")}</span>
                <span>&bull;</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {post.readingMinutes} {t("postDetail.minRead")}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <Button
              variant="outline"
              size="sm"
              className="rounded-none uppercase tracking-wider font-bold"
              onClick={handleLike}
              disabled={likeMutation.isPending}
            >
              <ThumbsUp className={`w-4 h-4 mr-2 ${likeMutation.isPending ? 'animate-bounce' : ''}`} />
              {post.likeCount} {t("postDetail.likes")}
            </Button>
            <Button variant="outline" size="sm" className="rounded-none uppercase tracking-wider font-bold" asChild>
              <a href="#comments">
                <MessageSquare className="w-4 h-4 mr-2" />
                {post.commentCount} {t("postDetail.comments")}
              </a>
            </Button>
          </div>
        </div>

        {/* Translation notice when EN is available */}
        {useEn && hasTranslation && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 border border-border px-4 py-3 mb-8">
            <Languages className="w-4 h-4 text-primary shrink-0" />
            <span>{t("postDetail.translatedNote")}</span>
          </div>
        )}

        {/* EN not yet available notice */}
        {useEn && !hasTranslation && (
          <div className="mb-8 px-4 py-3 border border-border bg-muted/20 text-sm text-muted-foreground">
            {t("postDetail.translationUnavailable")}
          </div>
        )}

        {/* Massima del giorno */}
        {post.dailyMaxim && (
          <aside
            className="relative bg-muted/30 border-l-4 border-primary p-6 md:p-8 mb-12"
            data-testid="daily-maxim"
          >
            <div className="flex items-start gap-4">
              <Quote className="w-8 h-8 text-primary shrink-0 mt-1" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-2">
                  {t("postDetail.dailyMaxim")}
                </div>
                <blockquote className="font-serif italic text-xl md:text-2xl leading-snug text-foreground/90">
                  &ldquo;{post.dailyMaxim}&rdquo;
                </blockquote>
              </div>
            </div>
          </aside>
        )}

        {/* Podcast Player */}
        {post.audioUrl && (
          <PodcastPlayer audioUrl={post.audioUrl} title={displayTitle} />
        )}

        {/* Content */}
        <div className="prose prose-lg dark:prose-invert prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-none max-w-none mb-16">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayBody}
          </ReactMarkdown>
        </div>

        {/* Author Card */}
        <div className="bg-muted p-8 border-l-4 border-primary mb-16">
          <h3 className="font-display text-2xl uppercase font-bold mb-6">{t("postDetail.aboutAuthor")}</h3>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <img src={post.author.avatarUrl} alt={post.author.name} className="w-24 h-24 grayscale object-cover" />
            <div>
              <h4 className="font-bold text-xl uppercase tracking-wider mb-2">{post.author.name}</h4>
              <p className="text-muted-foreground mb-4">{post.author.bio}</p>
              <div className="flex flex-wrap gap-4 text-sm font-mono text-muted-foreground">
                {post.author.location && (
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {post.author.location}</span>
                )}
                {post.author.bike && (
                  <span className="flex items-center gap-1"><Bike className="w-4 h-4 text-primary" /> {post.author.bike}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <section id="comments" className="border-t border-border pt-12">
          <h3 className="font-display text-3xl uppercase font-bold mb-8">{t("postDetail.discuss", { count: post.commentCount })}</h3>

          <form onSubmit={handleCommentSubmit} className="mb-12 bg-muted/20 p-6 border border-border">
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm text-primary">{t("postDetail.leaveComment")}</h4>
            <div className="space-y-4">
              <div>
                <Input
                  placeholder={t("postDetail.yourName")}
                  value={commentName}
                  onChange={e => setCommentName(e.target.value)}
                  className="rounded-none bg-background focus-visible:ring-primary"
                  maxLength={80}
                  required
                />
              </div>
              <div>
                <Textarea
                  placeholder={t("postDetail.yourThoughts")}
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  className="rounded-none bg-background min-h-[100px] focus-visible:ring-primary"
                  maxLength={2000}
                  required
                />
              </div>
              <Button type="submit" disabled={commentMutation.isPending} className="rounded-none uppercase tracking-wider font-bold w-full sm:w-auto">
                {commentMutation.isPending ? t("postDetail.posting") : t("postDetail.postComment")}
              </Button>
            </div>
          </form>

          <div className="space-y-8">
            {commentsLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-24 bg-muted w-full"></div>
                <div className="h-24 bg-muted w-full"></div>
              </div>
            ) : comments?.length === 0 ? (
              <p className="text-muted-foreground italic">{t("postDetail.noComments")}</p>
            ) : (
              comments?.map(comment => (
                <div key={comment.id} className="border-b border-border pb-8 last:border-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold uppercase tracking-wider">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{format(new Date(comment.createdAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                  <p className="text-foreground/90 whitespace-pre-wrap">{comment.body}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
