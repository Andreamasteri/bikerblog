import { Link, useLocation } from "wouter";
import { Wrench, Menu, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const NAV_LINKS = [
  { href: "/posts", label: "Posts" },
  { href: "/timeline", label: "Timeline" },
  { href: "/authors", label: "Authors" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors shrink-0">
            <Wrench className="h-6 w-6" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase">BikerBlog</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-primary transition-colors uppercase tracking-wider">{l.label}</Link>
            ))}
            <Link href="/new" className="hover:text-primary transition-colors uppercase tracking-wider bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90">Write</Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 text-foreground hover:text-primary transition-colors"
            aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div ref={drawerRef} className="md:hidden border-t border-border/40 bg-background/98 backdrop-blur px-4 py-4 flex flex-col gap-1">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="block py-3 text-sm font-bold uppercase tracking-wider hover:text-primary transition-colors border-b border-border/30 last:border-0"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/new"
              className="mt-3 block text-center py-3 text-sm font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Write
            </Link>
          </div>
        )}
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
