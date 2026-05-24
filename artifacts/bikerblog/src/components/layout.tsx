import { Link } from "wouter";
import { Wrench } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
            <Wrench className="h-6 w-6" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase">BikerBlog</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/posts" className="hover:text-primary transition-colors uppercase tracking-wider">Posts</Link>
            <Link href="/timeline" className="hover:text-primary transition-colors uppercase tracking-wider">Timeline</Link>
            <Link href="/authors" className="hover:text-primary transition-colors uppercase tracking-wider">Authors</Link>
            <Link href="/new" className="hover:text-primary transition-colors uppercase tracking-wider bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90">Write</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t py-12 bg-muted/20">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <div className="flex justify-center items-center gap-2 mb-4">
            <Wrench className="h-5 w-5" />
            <span className="font-display font-bold text-xl uppercase tracking-tighter text-foreground">BikerBlog</span>
          </div>
          <p className="max-w-md mx-auto mb-6">For those who live for the open road. Ride reports, gear reviews, and technical tips.</p>
          <p className="text-sm">&copy; {new Date().getFullYear()} BikerBlog. All rights reserved.</p>
          <p className="text-sm mt-2 flex justify-center gap-6">
            <Link href="/timeline" className="hover:text-primary transition-colors">Timeline</Link>
            <Link href="/in-memoria" className="hover:text-primary transition-colors">In memoria di Mauri</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
