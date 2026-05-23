import { useListPosts } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { ListPostsCategory } from "@workspace/api-client-react";

export function Categories() {
  const { category } = useParams();
  const validCategory = category as ListPostsCategory;
  const { data: posts, isLoading } = useListPosts({ category: validCategory });

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12 border-b border-border pb-8">
        <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Category</p>
        <h1 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight leading-none">{category?.replace('-', ' ')}</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-muted aspect-[4/3] w-full mb-4"></div>
              <div className="h-4 bg-muted w-1/4 mb-3"></div>
              <div className="h-8 bg-muted w-3/4 mb-2"></div>
            </div>
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <div className="text-center py-24 bg-muted/20 border border-dashed">
          <p className="text-muted-foreground">No posts found in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {posts?.map((post) => (
            <article key={post.id} className="group flex flex-col h-full">
              <Link href={`/posts/${post.slug}`} className="block overflow-hidden bg-muted aspect-[4/3] w-full mb-6">
                <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </Link>
              <div className="flex-1 flex flex-col">
                <Link href={`/posts/${post.slug}`}>
                  <h3 className="text-2xl font-display font-bold mb-3 group-hover:text-primary transition-colors leading-tight">{post.title}</h3>
                </Link>
                <p className="text-muted-foreground mb-6 line-clamp-3">{post.excerpt}</p>
                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground mt-auto pt-4 border-t border-border/50">
                  <span className="uppercase tracking-wider">{post.author.name}</span>
                  <span>&bull;</span>
                  <span>{format(new Date(post.publishedAt), "MMM d, yyyy")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
