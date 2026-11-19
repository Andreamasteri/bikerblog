import { Bike } from "lucide-react";
import { useTranslation } from "react-i18next";

export function InMemoria() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto px-4 py-16 md:py-24">
      <article className="bb-memorial">
        <p className="bb-section-kicker"><Bike className="h-4 w-4" aria-hidden="true" />{t("footer.inMemoria")}</p>
        <h1>
          {t("memorial.title")}
          <span>{t("memorial.nickname")}</span>
        </h1>
        <div className="bb-memorial-rule" aria-hidden="true" />
        <blockquote>{t("memorial.dedication")}</blockquote>
      </article>
    </div>
  );
}
