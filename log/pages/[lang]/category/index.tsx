import React from "react";
import { getCategoryInfos } from "../../../lib/category";
import { SUPPORTED_LANGS, DEFAULT_LANG } from "../../../lib/posts";
import { IProfile } from "../../../lib/types";
import { useRouter } from "next/router";
import { getProfileData } from "../../../lib/blog";
import SideProfile from "../../../components/side-profile";
import Layout from "../../../components/layout/layout";
import { getBlogMeta, getCategoryLabels, getPostLabels, SupportedLang } from "../../../lib/i18n";
import Head from "next/head";
import { GetStaticProps, GetStaticPaths } from "next";

export interface ICategoryInfo {
  id: string;
  name: string;
  thumbnail: string;
  numberOfPosts: number;
  description: string;
  lang: string;
}

interface IProps {
  categoryInfos: ICategoryInfo[];
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

  const categoryInfos = getCategoryInfos(lang);
  const profileData = getProfileData(lang);

  return { props: { categoryInfos, profileData, lang } };
};

function Category({ categoryInfos, profileData, lang }: IProps) {
  const router = useRouter();
  const blogMeta = getBlogMeta(lang as SupportedLang);
  const categoryLabels = getCategoryLabels(lang as SupportedLang);
  const postLabels = getPostLabels(lang as SupportedLang);

  const onCategoryClick = (categoryId: string) => {
    router.push(`/${lang}/category/${categoryId}`);
  };

  return (
    <Layout>
      <Head>
        <title>{`${categoryLabels.category}: ${blogMeta.name}`}</title>
        <meta name="title" content={`${categoryLabels.category}: ${blogMeta.name}`} />
        <meta name="description" content={blogMeta.description} />
        <meta
          name="keywords"
          content="고산하, 개발, Spring, Spring Boot, 스프링, 스프링부트, 백엔드"
        />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content={lang === "ko" ? "Korean" : "English"} />
        <meta name="author" content="Sanha Ko" />

        <meta property="og:title" content={`${categoryLabels.category}: ${blogMeta.name}`} />
        <meta
          property="og:url"
          content={`https://headf1rst.github.io/log/${lang}/category`}
        />
        <meta property="og:type" content="blog" />
        <meta property="og:image" content="https://i.imgur.com/2nHGFTv.png" />
        <meta property="og:description" content={blogMeta.description} />

        <link rel="alternate" hrefLang="ko" href="https://headf1rst.github.io/log/ko/category" />
        <link rel="alternate" hrefLang="en" href="https://headf1rst.github.io/log/en/category" />
      </Head>
      <div className="flex justify-around gap-10 dark:text-[#c9d1d9] sm:gap-0 sm:flex-col-reverse">
        <div className="flex flex-col w-1/2 gap-10 pt-10 pb-20 mr-20 sm:w-full sm:px-5">
          <h1 className="text-3xl font-bold">Category</h1>
          <div className="grid grid-cols-2 gap-8 sm:flex sm:flex-col">
            {categoryInfos.map((categoryInfo) => (
              <div
                className="flex flex-col gap-1 transition duration-150 cursor-pointer hover:-translate-y-1"
                key={categoryInfo.id}
                onClick={() => onCategoryClick(categoryInfo.id)}
              >
                <img
                  src={categoryInfo.thumbnail}
                  alt={postLabels.thumbnailAltCategory}
                  className="object-cover w-[250px] h-[180px] sm:w-full sm:h-[200px]"
                />
                <div className="pt-3 pl-2 text-lg font-semibold">
                  {categoryInfo.name}
                </div>
                <div className="pb-4 pl-2 text-base text-gray-600 dark:text-gray-400">
                  {postLabels.postsCount(categoryInfo.numberOfPosts)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <SideProfile {...profileData} lang={lang} />
      </div>
    </Layout>
  );
}

export default Category;
