import { getAllTags, getSortedPostsData, SUPPORTED_LANGS, DEFAULT_LANG, getPostsBySection, getTagsByPosts } from "../../lib/posts";
import { IPostData, IProfile, ITag } from "../../lib/types";
import { getProfileData } from "../../lib/blog";
import { getBlogMeta, getNavLabels, getPostLabels, langFlags, SupportedLang } from "../../lib/i18n";
import Link from "next/link";
import SideProfile from "../../components/side-profile";
import Layout from "../../components/layout/layout";
import { classNames } from "../../util/class-name";
import markdownToTxt from "markdown-to-txt";
import { useRouter } from "next/router";
import Head from "next/head";
import { GetStaticProps, GetStaticPaths } from "next";

interface IProps {
  allPostsData: IPostData[];
  allTags: ITag[];
  profileData: IProfile;
  lang: string;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = SUPPORTED_LANGS.map((lang) => ({
    params: { lang },
  }));
  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const lang = (params?.lang as string) || DEFAULT_LANG;
  
  if (!SUPPORTED_LANGS.includes(lang)) {
    return { notFound: true };
  }

  const allPostsData = getSortedPostsData(lang);
  const allTags = getAllTags(lang);
  const profileData = getProfileData(lang);

  return {
    props: {
      allPostsData,
      allTags,
      profileData,
      lang,
    },
  };
};

const Home = ({ allPostsData, allTags, profileData, lang }: IProps) => {
  const router = useRouter();
  const {
    query: { tag, section },
  } = router;

  const meta = getBlogMeta(lang as SupportedLang);
  const navLabels = getNavLabels(lang as SupportedLang);
  const postLabels = getPostLabels(lang as SupportedLang);
  const tagName = !tag ? navLabels.allTags : tag;

  const getFilteredPosts = (allPostsData: IPostData[]) => {
    const tagSelect = tag && typeof tag === "string" ? tag : "All";
    if (tagSelect === "All") {
      return allPostsData;
    } else {
      return allPostsData.filter(
        (postData) => postData.tags.split(", ").indexOf(tagSelect) > -1
      );
    }
  };

  const getPostsBySectionFilter = () => {
    if (!section || typeof section !== "string") {
      return allPostsData;
    }
    return allPostsData.filter((postData) => postData.section === section);
  };

  const displayPosts = getFilteredPosts(getPostsBySectionFilter());
  const displayFilteredPosts = getPostsBySectionFilter();
  const displayTags = getTagsByPosts(displayFilteredPosts);

  const onTagClick = (tagName: string) => {
    if (tagName === "All") {
      router.push(`/${lang}${section ? `?section=${section}` : ""}`);
    } else {
      router.push(`/${lang}?tag=${tagName}${section ? `&section=${section}` : ""}`);
    }
  };

  return (
    <>
      <Head>
        <title>{meta.name}</title>
        <meta name="title" content={meta.name} />
        <meta name="description" content={meta.description} />
        <meta
          name="keywords"
          content="고산하, 개발, Spring, Spring Boot, 스프링, 스프링부트, 백엔드"
        />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content={lang === "ko" ? "Korean" : "English"} />
        <meta name="author" content="Sanha Ko" />

        <meta property="og:title" content={meta.name} />
        <meta property="og:url" content={`https://headf1rst.github.io/log/${lang}`} />
        <meta property="og:type" content="blog" />
        <meta property="og:image" content="https://i.imgur.com/JtjOEf3.png" />
        <meta property="og:description" content={meta.description} />

        <link rel="alternate" hrefLang="ko" href="https://headf1rst.github.io/log/ko" />
        <link rel="alternate" hrefLang="en" href="https://headf1rst.github.io/log/en" />
        <link rel="alternate" hrefLang="x-default" href="https://headf1rst.github.io/log/ko" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "JustAnotherBlog",
              "alternateName": ["Sanha's Dev Log", "고산하 기술 블로그"],
              "url": "https://headf1rst.github.io/log/",
              "description": meta.description,
              "inLanguage": ["ko-KR", "en-US"],
              "author": {
                "@type": "Person",
                "name": "Sanha Ko",
                "url": "https://github.com/headF1rst"
              },
              "publisher": {
                "@type": "Person",
                "name": "Sanha Ko"
              }
            })
          }}
        />
      </Head>
      <div className="flex justify-around gap-5 sm:gap-0 sm:flex-col-reverse dark:bg-[#0d1117] dark:text-[#c9d1d9] lg:h-full">
        <div className="flex flex-col w-2/3 gap-10 px-5 pt-10 sm:w-full">
          <div className="flex flex-wrap gap-2 mr-20 sm:m-0">
            {displayTags.map((tagItem: ITag) => (
              <span
                className={classNames(
                  tagName === tagItem.name
                    ? "bg-indigo-200 font-medium"
                    : "bg-indigo-50 font-light",
                  "p-1 pl-3 pr-3 rounded-md hover:bg-indigo-200 cursor-pointer transition ease-in-out duration-200 dark:text-black text-sm"
                )}
                key={tagItem.name}
                onClick={() => onTagClick(tagItem.name)}
              >
                {tagItem.name}({tagItem.count})
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-10 pb-20">
            {displayPosts.map((postData: IPostData) => (
              <div key={postData.id}>
                <div className="flex gap-5 sm:flex-col-reverse">
                  <div className="flex flex-col justify-between w-3/5 sm:w-full">
                    <div className="flex flex-col gap-2">
                      <Link href={`/${lang}/${postData.id}`}>
                        <h1 className="text-2xl cursor-pointer hover:underline">
                          {postData.title}
                        </h1>
                      </Link>
                      <div className="text-base text-gray-500">
                        {markdownToTxt(postData.preview)}⋯
                      </div>
                    </div>
                    <div className="text-gray-500">{postData.date}</div>
                  </div>
                  <Link href={`/${lang}/${postData.id}`}>
                    <img
                      src={postData.thumbnail}
                      alt={postLabels.thumbnailAlt}
                      className="object-cover h-[180px] cursor-pointer w-[250px] sm:w-full sm:h-[200px]"
                    />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          </div>

            <SideProfile {...profileData} lang={lang} />
      </div>
    </>
  );
};

export default Home;
