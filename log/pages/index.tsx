import { useEffect } from "react";
import { useRouter } from "next/router";
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
  const router = useRouter();

  useEffect(() => {
    const lang = getPreferredLanguage();
    router.replace(`/${lang}`);
  }, []);

  return (
    <>
      <Head>
        <title>Redirecting...</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex items-center justify-center h-screen dark:bg-[#0d1117] dark:text-[#c9d1d9]">
        <div className="text-lg">Redirecting...</div>
      </div>
    </>
  );
}
