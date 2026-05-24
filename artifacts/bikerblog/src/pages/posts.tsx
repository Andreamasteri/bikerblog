import { useListPosts } from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { format } from "date-fns";
import { Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { usePostLocale } from "@/lib/post-i18n";

export function Posts() {
  const { t } = useTranslation();
  const { postTitle, postExcerpt } = usePostLocale();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const q = searchParams.get("q") || "";
  
  const [searchQuery, setSearchQuery] = useState(q);

  const { data: posts, isLoading } = useListPosts({ search: searchQuery || undefined });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
        <div>
          <h1 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight mb-4 leading-none">{t("posts.title")}</h1>
          <p className="text-muted-foreground max-w-xl">{t("posts.subtitle")}</p>
        </div>
        <div className="w-full md:w-80 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            type="search" 
            placeholder={t("posts.searchPlaceholder")}
            className="pl-10 rounded-none border-t-0 border-l-0 border-r-0 border-b-2 bg-transparent focus-visible:ring-0 focus-visible:border-primary text-lg"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-muted aspect-[4/3] w-full mb-4"></div>
              <div className="h-4 bg-muted w-1/4 mb-3"></div>
              <div className="h-8 bg-muted w-3/4 mb-2"></div>
              <div className="h-4 bg-muted w-full mb-4"></div>
              <div className="h-3 bg-muted w-1/2"></div>
            </div>
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <div className="text-center py-24 bg-muted/20 border border-dashed">
          <h3 className="text-2xl font-display font-bold uppercase mb-2">{t("posts.deadEnd")}</h3>
          <p className="text-muted-foreground">{t("posts.noResults")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {posts?.map((post) => (
            <article key={post.id} className="group flex flex-col h-full">
              <Link href={`/posts/${post.slug}`} className="block overflow-hidden bg-muted aspect-[4/3] w-full mb-6">
                <img src={post.coverImageUrl} alt={postTitle(post)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </Link>
              <div className="flex-1 flex flex-col">
                <Link href={`/categories/${post.category}`} className="text-xs font-bold uppercase tracking-widest text-primary mb-3 hover:underline">{post.category.replace('-', ' ')}</Link>
                <Link href={`/posts/${post.slug}`}>
                  <h3 className="text-2xl font-display font-bold mb-3 group-hover:text-primary transition-colors leading-tight">{postTitle(post)}</h3>
                </Link>
                <p className="text-muted-foreground mb-6 line-clamp-3">{postExcerpt(post)}</p>
                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground mt-auto pt-4 border-t border-border/50">
                  <span className="uppercase tracking-wider">{post.author.name}</span>
                  <span>&bull;</span>
                  <span>{format(new Date(post.publishedAt), "MMM d, yyyy")}</span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {post.readingMinutes}m</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
