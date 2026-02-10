import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IPostData } from "../../lib/types";
import {
  getPostDataById,
  getPostDetailById,
  getSortedPostsData,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  extractFAQs,
} from "../../lib/posts";
import { getPostLabels, SupportedLang } from "../../lib/i18n";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter";
import {
  atomOneLight,
  atomOneDark,
} from "react-syntax-highlighter/dist/cjs/styles/hljs";
import { useRouter } from "next/router";
import "github-markdown-css";
import Utterances from "../../components/utterances";
import ScrollSpy from "../../components/scroll-spy";
import Layout from "../../components/layout/layout";
import Head from "next/head";
import { GetStaticProps, GetStaticPaths } from "next";

interface IParams {
  params: {
    lang: string;
    id: string;
  };
}

interface IProps {
  postData: IPostData;
  detail: string;
  lang: string;
  allPostsInOtherLang?: IPostData[];
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths: { params: { lang: string; id: string } }[] = [];
  
  SUPPORTED_LANGS.forEach((lang) => {
    const allPostData = getSortedPostsData(lang);
    allPostData.forEach((postData) => {
      paths.push({
        params: { lang, id: postData.id },
      });
    });
  });

  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const lang = (params?.lang as string) || DEFAULT_LANG;
  const id = params?.id as string;

  if (!SUPPORTED_LANGS.includes(lang)) {
    return { notFound: true };
  }

  const postData = getPostDataById(lang, id);
  const detail = getPostDetailById(lang, id);

  if (!postData) {
    return { notFound: true };
  }

  const otherLang = lang === 'ko' ? 'en' : 'ko';
  const allPostsInOtherLang = getSortedPostsData(otherLang);

  return { props: { postData, detail, lang, allPostsInOtherLang } };
};

function PostDetail({ postData, detail, lang, allPostsInOtherLang }: IProps) {
  const router = useRouter();
  const postLabels = getPostLabels(lang === 'ko' ? 'ko' : 'en');

  const [isDark, setIsDark] = useState<boolean>();

  useEffect(() => {
    const dark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: Dark)").matches;
    setIsDark(dark);
  }, []);

  const onTagClick = (tag: string) => {
    router.push(`/${lang}?tag=${tag}`);
  };

  const ImageRenderer = ({ ...props }) => {
    return <img {...props} alt="Post image" style={{ maxHeight: "450px", maxWidth: "90%" }} />;
  };

  const otherLang = lang === 'ko' ? 'en' : 'ko';
  const translationPost = allPostsInOtherLang?.find((p) => {
    if (postData && postData.translationSlug) {
      return p.id === postData.translationSlug;
    }
    return false;
  });

  const generateJsonLd = () => {
    if (!postData) return null;

    const tags = postData.tags ? postData.tags.split(", ") : [];
    const faqs = extractFAQs(detail);

    const techArticle = {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "headline": postData.title,
      "datePublished": postData.date,
      "dateModified": postData.date,
      "author": {
        "@type": "Person",
        "name": "Sanha Ko",
        "url": "https://github.com/headF1rst"
      },
      "description": postData.description || "",
      "image": postData.thumbnail || "",
      "url": `https://headf1rst.github.io/log/${lang}/${postData.id}`,
      "keywords": tags.join(", "),
      "inLanguage": lang === "ko" ? "ko-KR" : "en-US",
      "about": tags.map(tag => ({ "@type": "Thing", "name": tag })),
      "programmingLanguage": "Java, Kotlin, JavaScript, TypeScript",
      "publisher": {
        "@type": "Organization",
        "name": "JustAnotherBlog",
        "logo": {
          "@type": "ImageObject",
          "url": "https://i.imgur.com/JtjOEf3.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://headf1rst.github.io/log/${lang}/${postData.id}`
      }
    };

    const breadcrumbList = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": `https://headf1rst.github.io/log/${lang}`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": postData.title,
          "item": `https://headf1rst.github.io/log/${lang}/${postData.id}`
        }
      ]
    };

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticle) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
        {faqs.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": faqs.map(faq => ({
                  "@type": "Question",
                  "name": faq.question,
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq.answer
                  }
                }))
              })
            }}
          />
        )}
      </>
    );
  };

  if (router.isFallback) {
    return <div>{postLabels.loading}</div>;
  }

  if (!postData) {
    return <div>{postLabels.notFound}</div>;
  }

  const tags = postData.tags ? postData.tags.split(", ") : [];

  return (
    <>
      <Head>
        <title>{postData.title}</title>
        <meta name="title" content={postData.title} />
        <meta name="description" content={postData.description || ""} />
        <meta name="keywords" content={postData.searchKeywords || ""} />
        <meta name="robots" content="index, follow" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="language" content={lang === "ko" ? "Korean" : "English"} />
        <meta name="author" content="Sanha Ko" />
        <meta property="og:title" content={postData.title} />
        <meta
          property="og:url"
          content={`https://headf1rst.github.io/log/${lang}/${postData.id}`}
        />
        <meta property="og:type" content="blog" />
        <meta property="og:image" content={postData.thumbnail} />
        <meta property="og:description" content={postData.description} />

        <link rel="alternate" hrefLang="ko" href={`https://headf1rst.github.io/log/ko/${postData.id}`} />
        {translationPost && (
          <link rel="alternate" hrefLang="en" href={`https://headf1rst.github.io/log/en/${translationPost.id}`} />
        )}
        <link rel="alternate" hrefLang="x-default" href={`https://headf1rst.github.io/log/ko/${postData.id}`}/>

        {generateJsonLd()}
      </Head>
      <div className="flex flex-col w-3/5 sm:w-5/6 m-auto pt-20 pb-20 gap-10 dark:bg-[#0d1117] dark:text-[#c9d1d9]">
        <ScrollSpy key={`${lang}-${postData.id}`} />
        <div className="text-5xl font-bold">{postData.title}</div>
        <div className="flex flex-col gap-2">
          <div className="text-base text-gray-600 dark:text-gray-300">
            {postData.date}
          </div>
          <div className="flex flex-wrap gap-2 dark:text-black sm:m-0">
            {tags.map((tag: string) => (
              <span
                className={
                  "p-1 pl-3 pr-3 rounded-md bg-indigo-100 hover:bg-indigo-200 cursor-pointer transition ease-in-out duration-200 text-sm"
                }
                key={tag}
                onClick={() => onTagClick(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {translationPost ? (
            <Link href={`/${otherLang}/${translationPost.id}`} className="text-sm text-indigo-600 hover:underline">
              {postLabels.readIn(otherLang)}
            </Link>
          ) : (
            <span className="text-sm text-gray-400">
              {postLabels.readIn(otherLang)}
            </span>
          )}
        </div>

        <div className="markdown-body" style={{ fontSize: "17px" }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return !inline && match ? (
                  <SyntaxHighlighter
                    language={match[1]}
                    PreTag="div"
                    {...props}
                    style={isDark ? atomOneDark : atomOneLight}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
              img: ImageRenderer,
            }}
          >
            {detail}
          </ReactMarkdown>
        </div>
        <Utterances />
      </div>
    </>
  );
}

export default PostDetail;
