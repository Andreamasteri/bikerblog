import { useListAuthors } from "@workspace/api-client-react";
import { MapPin, Bike, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Authors() {
  const { t } = useTranslation();
  const { data: authors, isLoading } = useListAuthors();

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-16">
        <h1 className="text-4xl md:text-6xl font-display font-bold uppercase tracking-tight mb-4 leading-none">{t("authors.title")}</h1>
        <p className="text-muted-foreground max-w-xl text-lg">{t("authors.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted p-8 animate-pulse h-64"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {authors?.map(author => (
            <div key={author.id} id={author.id.toString()} className="bg-card border border-border p-6 md:p-8 flex flex-col sm:flex-row gap-6 hover:border-primary transition-colors group">
              <img src={author.avatarUrl} alt={author.name} className="w-24 h-24 sm:w-32 sm:h-32 rounded-none object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-2xl font-display font-bold uppercase tracking-wider">{author.name}</h2>
                  <span className="text-xs font-mono bg-primary text-primary-foreground px-2 py-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {author.postCount}
                  </span>
                </div>
                
                <p className="text-muted-foreground mb-4 text-sm leading-relaxed">{author.bio}</p>
                
                <div className="flex flex-col gap-2 text-xs font-mono text-muted-foreground border-t border-border/50 pt-4">
                  {author.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> 
                      <span className="uppercase">{author.location}</span>
                    </div>
                  )}
                  {author.bike && (
                    <div className="flex items-center gap-2">
                      <Bike className="w-4 h-4 text-primary" /> 
                      <span className="uppercase">{author.bike}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
