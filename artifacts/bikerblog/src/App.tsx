import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { Home } from "@/pages/home";
import { Posts } from "@/pages/posts";
import { PostDetail } from "@/pages/post-detail";
import { Tags } from "@/pages/tags";
import { Categories } from "@/pages/categories";
import { Authors } from "@/pages/authors";
import { NewPost } from "@/pages/new-post";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

const queryClient = new QueryClient();

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/posts" component={Posts} />
        <Route path="/posts/:slug" component={PostDetail} />
        <Route path="/tags/:tag" component={Tags} />
        <Route path="/categories/:category" component={Categories} />
        <Route path="/authors" component={Authors} />
        <Route path="/new" component={NewPost} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
