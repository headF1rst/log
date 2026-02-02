import fs from "fs";
import path from "path";
import matter from "gray-matter";

const postsDirectory = path.join(process.cwd(), "_posts");

const SUPPORTED_LANGS = ['ko', 'en'];
const DEFAULT_LANG = 'ko';

function getCategoryNames(lang = DEFAULT_LANG) {
  const langDir = path.join(postsDirectory, lang);
  if (!fs.existsSync(langDir)) {
    return [];
  }
  return fs.readdirSync(langDir).filter(item => !item.startsWith('.') && !item.startsWith('_'));
}

export function getCategoryInfos(lang = DEFAULT_LANG) {
  const categoryNames = getCategoryNames(lang);
  const categoryInfos = categoryNames.map((categoryName) => {
    const infoPath = path.join(postsDirectory, lang, categoryName, "_info.md");
    if (!fs.existsSync(infoPath)) {
      return null;
    }
    const categoryInfo = fs.readFileSync(infoPath, "utf8");
    const numberOfPosts =
        fs.readdirSync(path.join(postsDirectory, lang, categoryName)).length - 1;

    return {
      numberOfPosts,
      id: categoryName,
      lang,
      ...matter(categoryInfo).data,
    };
  }).filter(Boolean);
  return categoryInfos;
}

export function getCategoryInfoById(lang = DEFAULT_LANG, categoryId) {
  const categoryInfos = getCategoryInfos(lang);
  const categoryInfo = categoryInfos.find(
      (categoryInfo) => categoryInfo.id === categoryId
  );
  return categoryInfo;
}

export function getPostsByCategoryId(lang = DEFAULT_LANG, categoryId) {
  const categoryPath = path.join(postsDirectory, lang, categoryId);
  if (!fs.existsSync(categoryPath)) {
    return [];
  }
  const postNames = fs.readdirSync(categoryPath)
    .filter(name => name.endsWith('.md') && name !== '_info.md');
  const postDatas = postNames.map((postName) => {
    const postData = fs.readFileSync(
        path.join(categoryPath, postName)
    );
    const id = postName.replace(/\.md$/, "");
    const matterResult = matter(postData);
    return {
      id,
      lang,
      ...matterResult.data,
      preview: matterResult.content.slice(0, 140),
    };
  });
  return postDatas.sort(({ date: a }, { date: b }) => {
    if (a < b) {
      return 1;
    } else if (a > b) {
      return -1;
    } else {
      return 0;
    }
  });
}
