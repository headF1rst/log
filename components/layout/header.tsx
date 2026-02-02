import Link from "next/link";
import { useRouter } from "next/router";
import React, { Fragment, useState } from "react";
import { classNames } from "../../util/class-name";
import { GiHamburgerMenu } from "react-icons/gi";
import { MdClose } from "react-icons/md";
import { BiLinkExternal } from "react-icons/bi";
import { getBlogMeta, getNavLabels, langFlags, langNames, SupportedLang } from "../../lib/i18n";



function Header() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  
  const pathLang = router.asPath.split('/')[1];
  const lang = (pathLang && ['ko', 'en'].includes(pathLang) ? pathLang : 'ko') as SupportedLang;
  const blogMeta = getBlogMeta(lang);
  const navLabels = getNavLabels(lang);
  const availableLangs: readonly SupportedLang[] = ['ko', 'en'];

  const onMenuClick = (menu: string) => {
    setShowMenu(false);
    router.push(menu);
  };

  const onLangChange = (newLang: SupportedLang) => {
    setShowLangMenu(false);
    
    const currentPath = router.asPath;
    const pathParts = currentPath.split('/').filter(Boolean);
    
    if (pathParts.length > 0 && ['ko', 'en'].includes(pathParts[0])) {
      pathParts[0] = newLang;
    } else {
      pathParts.unshift(newLang);
    }

    const newPath = '/' + pathParts.join('/');
    router.push(newPath);
    
    localStorage.setItem('preferred-lang', newLang);
  };

  return (
    <nav className="flex bg-white sticky top-0 left-0 z-50 justify-between items-center border-b-2 border-gray-100 py-3 md:justify-start md:space-x-10 px-10 sm:px-5 dark:bg-[#0d1117] dark:text-[#c9d1d9] dark:border-gray-600">
      <div className="flex justify-start">
        <Link href={`/${lang}`}>
          <div className="flex items-center gap-2 cursor-pointer">
            <h1 className="text-lg ">{blogMeta.name}</h1>
          </div>
        </Link>
      </div>
      <div className="flex justify-between gap-10 sm:hidden items-center">
        <Link href={`/${lang}`}>
          <button
            className={classNames(
              router.pathname === "/[lang]" || router.pathname === "/" 
                ? "font-bold " 
                : "font-light",
              "hover:text-indigo-300 text-base"
            )}
          >
            {navLabels.home}
          </button>
        </Link>
        <Link href={`/${lang}/category`}>
          <button
            className={classNames(
              router.pathname === "/[lang]/category" ||
                router.pathname === "/[lang]/category/[cid]"
                ? "font-bold "
                : "font-light",
              "hover:text-indigo-300 text-base"
            )}
          >
            {navLabels.category}
          </button>
        </Link>
        <a
          href={
            "https://plain-composer-c65.notion.site/29c7640fdf054059b6ea28ed61189bfb"
          }
          target={"_blank"}
          rel="noreferrer"
          className={"hover:text-indigo-300 text-base font-light flex gap-1"}
        >
          {navLabels.about}
          <span
            className={"flex justify-center"}
            style={{ alignItems: "center" }}
          >
            <BiLinkExternal />
          </span>
        </a>
        
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1 hover:text-indigo-300 text-base font-light"
          >
            {langFlags[lang]} {langNames[lang]}
          </button>
          {showLangMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white dark:bg-[#1f2937] rounded-md shadow-lg border border-gray-200 dark:border-gray-600 py-1 min-w-[120px]">
              {availableLangs.map((langOption) => (
                <button
                  key={langOption}
                  onClick={() => onLangChange(langOption)}
                  className="w-full px-4 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900 flex items-center gap-2 text-sm"
                >
                  {langFlags[langOption]} {langNames[langOption]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {showMenu ? (
        <div className="flex flex-col fixed left-0 top-0 bg-white w-full h-screen dark:bg-[#0d1117] dark:bg-opacity-90 p-4 gap-5">
          <MdClose
            onClick={() => setShowMenu(false)}
            className="lg:hidden"
            size={25}
          />

          <button
            onClick={() => onMenuClick(`/${lang}`)}
            className={classNames(
              router.pathname === "/[lang]" || router.pathname === "/" 
                ? "font-bold " 
                : "font-light",
              "hover:text-indigo-300 text-base"
            )}
          >
            {navLabels.home}
          </button>
          <button
            onClick={() => onMenuClick(`/${lang}/category`)}
            className={classNames(
              router.pathname === "/[lang]/category" ||
                router.pathname === "/[lang]/category/[cid]"
                ? "font-bold "
                : "font-light",
              "hover:text-indigo-300 text-base"
            )}
          >
            {navLabels.category}
          </button>
          <a
            href={
              "https://plain-composer-c65.notion.site/29c7640fdf054059b6ea28ed61189bfb"
            }
            target={"_blank"}
            rel="noreferrer"
            className={
              "hover:text-indigo-300 text-base font-light flex gap-1 align-center justify-center"
            }
          >
            {navLabels.about}
            <span
              className={"flex justify-center"}
              style={{ alignItems: "center" }}
            >
              <BiLinkExternal />
            </span>
          </a>
          
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Language</div>
            {availableLangs.map((langOption) => (
              <button
                key={langOption}
                onClick={() => onLangChange(langOption)}
                className="w-full text-left py-2 hover:text-indigo-300 text-base flex items-center gap-2"
              >
                {langFlags[langOption]} {langNames[langOption]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <GiHamburgerMenu
          onClick={() => setShowMenu((prev) => !prev)}
          className="lg:hidden"
          size={25}
        />
      )}
    </nav>
  );
}

export default Header;
