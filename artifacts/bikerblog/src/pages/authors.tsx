import { useListAuthors } from "@workspace/api-client-react";
import { MapPin, Bike, FileText, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const MEDIA = "https://bikerblog-image-assets.andreamasteri-nadir-radio.workers.dev/assets";

export function Authors() {
  const { t } = useTranslation();
  const { data: authors, isLoading } = useListAuthors();

  return (
    <div className="container mx-auto px-4 py-10 md:py-14">
      <header className="bb-page-intro bb-page-intro-compact bb-authors-intro">
        <div className="bb-page-intro-copy">
          <p className="bb-section-kicker">{t("authors.eyebrow")}</p>
          <h1>{t("authors.title")}</h1>
          <p className="bb-page-intro-description">{t("authors.subtitle")}</p>
        </div>
        <div className="bb-page-intro-media" aria-hidden="true">
          <img src={MEDIA + "/redazione.webp"} alt="" />
          <span>{t("authors.imageCaption")}</span>
        </div>
      </header>

      {isLoading ? (
        <div className="bb-contributor-grid" aria-label={t("authors.loading")}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bb-contributor-skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : (
        <div className="bb-contributor-grid">
          {authors?.map((author) => (
            <article key={author.id} id={author.id.toString()} className="bb-contributor-card">
              <div className="bb-contributor-photo">
                <img src={author.avatarUrl} alt={author.name} loading="lazy" />
              </div>
              <div className="bb-contributor-copy">
                <div className="bb-contributor-heading">
                  <div>
                    <p className="bb-section-kicker">{t("authors.contributor")}</p>
                    <h2>{author.name}</h2>
                  </div>
                  <span className="bb-contributor-count" aria-label={t("authors.postCount", { count: author.postCount })}>
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />{author.postCount}
                  </span>
                </div>
                <p className="bb-contributor-bio">{author.bio}</p>
                <div className="bb-contributor-facts">
                  {author.location && <span><MapPin className="h-4 w-4" aria-hidden="true" />{author.location}</span>}
                  {author.bike && <span><Bike className="h-4 w-4" aria-hidden="true" />{author.bike}</span>}
                </div>
              </div>
              <ArrowUpRight className="bb-contributor-mark h-5 w-5" aria-hidden="true" />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
