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
import { InMemoria } from "@/pages/in-memoria";
import { Timeline } from "@/pages/timeline";
import { Podcast } from "@/pages/podcast";
import { HorusChat } from "@/pages/horus-chat";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "@/i18n";

const queryClient = new QueryClient();

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function HtmlLangSync() {
  const { i18n: i18nInst } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18nInst.language;
  }, [i18nInst.language]);
  return null;
}

function Router() {
  return (
    <Layout>
      <HtmlLangSync />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/posts" component={Posts} />
        <Route path="/posts/:slug" component={PostDetail} />
        <Route path="/tags/:tag" component={Tags} />
        <Route path="/categories/:category" component={Categories} />
        <Route path="/authors" component={Authors} />
        <Route path="/in-memoria" component={InMemoria} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/podcast" component={Podcast} />
        <Route path="/horus" component={HorusChat} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <I18nextProvider i18n={i18n}>
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
    </I18nextProvider>
  );
}

export default App;
