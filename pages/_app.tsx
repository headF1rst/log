import "../styles/globals.css";
import type { AppProps } from "next/app";
import Layout from "../components/layout/layout";
import { LanguageProvider } from "../contexts/LanguageContext";

import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import Head from "next/head";
import { useRouter } from "next/router";
config.autoAddCss = false;

function MyApp({ Component, pageProps }: AppProps) {
  const initialLang = (pageProps as any)?.lang || 'ko';
  const router = useRouter();
  const basePath = router.basePath || '';

  return (
    <>
      <Head>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="https://i.imgur.com/2nHGFTv.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="https://i.imgur.com/2nHGFTv.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="https://i.imgur.com/2nHGFTv.png"
        />
        <link rel="manifest" href={`${basePath}/site.webmanifest`} />
        <link rel="mask-icon" href={`${basePath}/safari-pinned-tab.svg`} color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#da532c" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <LanguageProvider initialLang={initialLang}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </LanguageProvider>
    </>
  );
}

export default MyApp;
