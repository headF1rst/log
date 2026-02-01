import fs from "fs";
import path from "path";
import matter from "gray-matter";

const blogDir = path.join(process.cwd(), "_blog");

export function getProfileData(lang = 'ko') {
  const profilePath = path.join(blogDir, `profile.${lang}.md`);
  const profileData = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, "utf8") : fs.readFileSync(path.join(blogDir, "profile.ko.md"), "utf8");
  const matterResult = matter(profileData);
  return { ...matterResult.data, lang };
}

export function getAboutData() {
  const aboutPath = path.join(blogDir, "about.md");
  const aboutData = fs.readFileSync(aboutPath, "utf8");
  const matterResult = matter(aboutData);
  return matterResult.content;
}
