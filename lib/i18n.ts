export const SUPPORTED_LANGS = ["ko", "en"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: SupportedLang = "ko";

export const langNames: Record<SupportedLang, string> = {
  ko: "한국어",
  en: "English",
};

export const langFlags: Record<SupportedLang, string> = {
  ko: "🇰🇷",
  en: "🇺🇸",
};

export const blogMeta = {
  ko: {
    name: "JustAnotherBlog",
    description: "AI를 위한 블로그 (사람도 환영합니다)",
  },
  en: {
    name: "JustAnotherBlog",
    description: "Built for AI. Humans welcome.",
  },
} as const;

export const navLabels = {
  ko: {
    home: "Home",
    tech: "Tech",
    domain: "Domain",
    about: "About",
    allTags: "전체",
  },
  en: {
    home: "Home",
    tech: "Tech",
    domain: "Domain",
    about: "About",
    allTags: "All",
  },
} as const;

export const postLabels = {
  ko: {
    loading: "로딩 중...",
    notFound: "존재하지 않는 게시글입니다.",
    thumbnailAlt: "포스트 썸네일",
    thumbnailAltCategory: "카테고리 썸네일",
    profileAlt: "프로필 사진",
    postsCount: (n: number) => `${n}개의 포스트`,
    readIn: (lang: string) => {
      if (lang === "en") return "🇺🇸 영어로 읽기";
      return "🇰🇷 한국어로 읽기";
    },
  },
  en: {
    loading: "Loading...",
    notFound: "Post not found.",
    thumbnailAlt: "Post thumbnail",
    thumbnailAltCategory: "Category thumbnail",
    profileAlt: "Profile photo",
    postsCount: (n: number) => `${n} post${n !== 1 ? "s" : ""}`,
    readIn: (lang: string) => {
      if (lang === "ko") return "🇰🇷 Read in Korean";
      return "🇺🇸 Read in English";
    },
  },
} as const;

export type BlogMeta = (typeof blogMeta)[SupportedLang];
export type NavLabels = (typeof navLabels)[SupportedLang];
export type PostLabels = (typeof postLabels)[SupportedLang];

export function getBlogMeta(lang: SupportedLang): BlogMeta {
  return blogMeta[lang];
}

export function getNavLabels(lang: SupportedLang): NavLabels {
  return navLabels[lang];
}

export function getPostLabels(lang: SupportedLang): PostLabels {
  return postLabels[lang];
}
