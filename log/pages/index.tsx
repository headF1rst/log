import { useEffect } from "react";
import Head from "next/head";

const DEFAULT_LANG = "ko";

function getPreferredLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  
  const saved = localStorage.getItem("preferred-lang");
  if (saved && ["ko", "en"].includes(saved)) {
    return saved;
  }
  
  const browserLang = navigator.language?.toLowerCase() || "";
  if (browserLang.startsWith("ko")) {
    return "ko";
  }
  return "en";
}

export default function Home() {
  useEffect(() => {
    const lang = getPreferredLanguage();
    if (lang !== "ko") {
      window.location.href = `/${lang}/`;
    }
  }, []);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const lang = localStorage.getItem('preferred-lang') || 
                (navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en');
              if (lang !== 'ko') {
                window.location.replace('/' + lang + '/');
              }
            })();
          `,
        }}
      />
      <meta httpEquiv="refresh" content={`0; url=/ko/`} />
      <Head>
        <title>산하개발실록</title>
        <meta name="description" content="기술 블로그" />
      </Head>
      <div className="flex items-center justify-center h-screen dark:bg-[#0d1117] dark:text-[#c9d1d9]">
        <div className="text-lg">
          <a href="/ko/">클릭하여 이동하기...</a>
        </div>
      </div>
    </>
  );
}
