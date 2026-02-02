import markdownToTxt from "markdown-to-txt";
import Link from "next/link";
import React from "react";
import { ICategoryInfo, IPostData, IProfile } from "../../../lib/types";
import SideProfile from "../../../components/side-profile";
import Layout from "../../../components/layout/layout";
import { getProfileData } from "../../../lib/blog";
import {
  getCategoryInfoById,
  getCategoryInfos,
  getPostsByCategoryId,
} from "../../../lib/category";
import { SUPPORTED_LANGS, DEFAULT_LANG } from "../../../lib/posts";
import { getBlogMeta, getCategoryLabels, getPostLabels, SupportedLang } from "../../../lib/i18n";
import Head from "next/head";
import { GetStaticProps, GetStaticPaths } from "next";

interface IProps {
  categoryInfo: ICategoryInfo;
  postDatas: IPostData[];
  profileData: IProfile;
  lang: string;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths: { params: { lang: string; cid: string } }[] = [];
  
  SUPPORTED_LANGS.forEach((lang) => {
    const categoryInfos = getCategoryInfos(lang) as ICategoryInfo[];
    categoryInfos.forEach((categoryInfo) => {
      if (categoryInfo) {
        paths.push({
          params: { lang, cid: categoryInfo.id },
        });
      }
    });
  });

  return {
    paths,
    fallback: true,
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const lang = (params?.lang as string) || DEFAULT_LANG;
  const cid = params?.cid as string;

  if (!SUPPORTED_LANGS.includes(lang)) {
    return { notFound: true };
  }

  const categoryInfo = getCategoryInfoById(lang, cid);
  const postDatas = getPostsByCategoryId(lang, cid);
  const profileData = getProfileData(lang);

  if (!categoryInfo) {
    return { notFound: true };
  }

  return { props: { categoryInfo, postDatas, profileData, lang } };
};

function CategoryPosts({ categoryInfo, postDatas, profileData, lang }: IProps) {
  const blogMeta = getBlogMeta(lang as SupportedLang);
  const categoryLabels = getCategoryLabels(lang as SupportedLang);
  const postLabels = getPostLabels(lang as SupportedLang);

  if (!categoryInfo) {
    return <div>Category not found</div>;
  }

  return (
    <Layout>
      <Head>
        <title>{`${categoryInfo.name}: ${blogMeta.name}`}</title>
        <meta name="title" content={`${categoryInfo.name}: ${blogMeta.name}`} />
        <meta name="description" content={categoryInfo.description || ""} />
        <meta
          name="keywords"
          content="고산하, 개발, Spring, Spring Boot, 스프링, 스프링부트, 백엔드"
        />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content={lang === "ko" ? "Korean" : "English"} />
        <meta name="author" content="Sanha Ko" />
        <meta
          property="og:title"
          content={`${categoryInfo.name}: ${blogMeta.name}`}
        />
        <meta
          property="og:url"
          content={`https://headf1rst.github.io/log/${lang}/category/${categoryInfo.id}`}
        />
        <meta property="og:type" content="blog" />
        <meta property="og:image" content="https://i.imgur.com/2nHGFTv.png" />
        <meta property="og:description" content={blogMeta.description} />
        
        <link rel="alternate" hrefLang="ko" href={`https://headf1rst.github.io/log/ko/category/${categoryInfo.id}`} />
        <link rel="alternate" hrefLang="en" href={`https://headf1rst.github.io/log/en/category/${categoryInfo.id}`} />
      </Head>
      <div className="m-auto flex flex-col gap-10 w-2/3 pt-10 dark:text-[#c9d1d9] sm:gap-0 sm:flex-col-reverse sm:pt-0 sm:w-full">
        <div className="sm:flex sm:flex-col sm:px-5 sm:gap-5">
          <div className="mb-10">
            <div>{categoryLabels.category}</div>
            <div className="text-3xl font-bold">{categoryInfo.name}</div>
          </div>
          <div className="flex flex-col gap-10 pb-20">
            {postDatas?.map((postData: IPostData) => (
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
                      width={250}
                      height={180}
                      className="object-cover cursor-pointer"
                    />
                  </Link>
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

export default CategoryPosts;
