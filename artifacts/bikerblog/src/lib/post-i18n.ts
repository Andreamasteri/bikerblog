import { useTranslation } from "react-i18next";

type PostWithEn = {
  title: string;
  excerpt: string;
  titleEn?: string | null;
  excerptEn?: string | null;
};

export function usePostLocale() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === "en";

  function postTitle(post: PostWithEn): string {
    return (isEn && post.titleEn) ? post.titleEn : post.title;
  }

  function postExcerpt(post: PostWithEn): string {
    return (isEn && post.excerptEn) ? post.excerptEn : post.excerpt;
  }

  return { isEn, postTitle, postExcerpt };
}
