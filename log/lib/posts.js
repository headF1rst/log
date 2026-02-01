import fs from "fs";
import path from "path";
import matter from "gray-matter";

const postsDirectory = path.join(process.cwd(), "_posts");

export const SUPPORTED_LANGS = ['ko', 'en'];
export const DEFAULT_LANG = 'ko';

const excludeFiles = ['_info.md'];

function getCategoryNames(lang = DEFAULT_LANG) {
  const langDir = path.join(postsDirectory, lang);
  if (!fs.existsSync(langDir)) {
    return [];
  }
  return fs.readdirSync(langDir).filter(item => !item.startsWith('.') && !item.startsWith('_'));
}

export function getSortedPostsData(lang = DEFAULT_LANG) {
  const categoryNames = getCategoryNames(lang);
  let allPostData = [];
  categoryNames.map((categoryName) => {
    const categoryPath = path.join(postsDirectory, lang, categoryName);
    const fileNames = fs.readdirSync(categoryPath)
      .filter(fileName => fileName.endsWith('.md') && !excludeFiles.includes(fileName));
    const postData = fileNames.map((fileName) => {
      const id = fileName.replace(/\.md$/, "");
      const fullPath = path.join(categoryPath, fileName);
      const fileContents = fs.readFileSync(fullPath, "utf8");

      const matterResult = matter(fileContents);

      return {
        id,
        lang,
        ...matterResult.data,
        preview: matterResult.content.slice(0, 140),
      };
    });
    allPostData = allPostData.concat(postData);
  });
  return allPostData.sort(({ date: a }, { date: b }) => {
    if (a < b) {
      return 1;
    } else if (a > b) {
      return -1;
    } else {
      return 0;
    }
  });
}

export function getPostDataById(lang = DEFAULT_LANG, id) {
  const allPostData = getSortedPostsData(lang);
  const postData = allPostData.find((data) => data.id === id);
  return postData;
}

export function getPostDetailById(lang = DEFAULT_LANG, id) {
  const categoryNames = getCategoryNames(lang);
  let allPostsData = [];
  categoryNames.map((categoryName) => {
    const categoryPath = path.join(postsDirectory, lang, categoryName);
    const fileNames = fs.readdirSync(categoryPath)
      .filter(fileName => fileName.endsWith('.md') && !excludeFiles.includes(fileName));
    const postData = fileNames.map((fileName) => {
      const id = fileName.replace(/\.md$/, "");
      const fullPath = path.join(categoryPath, fileName);

      return {
        id,
        fullPath,
      };
    });
    allPostsData = allPostsData.concat(postData);
  });
  const postDataWithPath = allPostsData.find(
    (postData) => postData.id === id
  );
  
  if (!postDataWithPath) {
    return '';
  }
  
  const fileContents = fs.readFileSync(postDataWithPath.fullPath, "utf8");
  const matterResult = matter(fileContents);
  return matterResult.content;
}

export function getAllTags(lang = DEFAULT_LANG) {
  const allPostData = getSortedPostsData(lang);
  let allTag = [];
  allPostData.map((postData) => {
    const tagArr = postData.tags && postData.tags.split(", ");
    allTag = allTag.concat(tagArr);
  });
  allTag = allTag.reduce((prev, cur) => {
    prev[cur] = ++prev[cur] || 1;
    return prev;
  }, {});
  
  const allLabel = lang === 'ko' ? "전체" : "All";
  let result = [{ name: allLabel, count: allPostData.length }];
  for (const [key, value] of Object.entries(allTag)) {
    result.push({ name: key, count: value });
  }

  return result.sort(({ count: a }, { count: b }) => {
    if (a < b) {
      return 1;
    } else if (a > b) {
      return -1;
    } else {
      return 0;
    }
  });
}
