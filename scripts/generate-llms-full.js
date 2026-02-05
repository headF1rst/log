/**
 * Generate llms-full.txt - Complete blog content for AI systems
 * This script creates a markdown file containing all blog posts
 * Run during build: node scripts/generate-llms-full.js
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const postsDirectory = path.join(process.cwd(), '_posts');
const outputPath = path.join(process.cwd(), 'public', 'llms-full.txt');

const SUPPORTED_LANGS = ['ko', 'en'];

function getCategoryNames(lang) {
  const langDir = path.join(postsDirectory, lang);
  if (!fs.existsSync(langDir)) {
    return [];
  }
  return fs.readdirSync(langDir)
    .filter(item => !item.startsWith('.') && !item.startsWith('_'))
    .filter(item => {
      const itemPath = path.join(langDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
}

function getAllPosts(lang) {
  const categoryNames = getCategoryNames(lang);
  let allPosts = [];

  // Posts in category folders
  categoryNames.forEach(categoryName => {
    const categoryPath = path.join(postsDirectory, lang, categoryName);
    const fileNames = fs.readdirSync(categoryPath)
      .filter(fileName => fileName.endsWith('.md') && fileName !== '_info.md');
    
    fileNames.forEach(fileName => {
      const fullPath = path.join(categoryPath, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data, content } = matter(fileContents);
      
      allPosts.push({
        id: fileName.replace(/\.md$/, ''),
        lang,
        category: categoryName,
        ...data,
        content
      });
    });
  });

  // Posts in root lang folder
  const langDir = path.join(postsDirectory, lang);
  if (fs.existsSync(langDir)) {
    const fileNames = fs.readdirSync(langDir)
      .filter(fileName => fileName.endsWith('.md') && fileName !== '_info.md');
    
    fileNames.forEach(fileName => {
      const fullPath = path.join(langDir, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      const { data, content } = matter(fileContents);
      
      allPosts.push({
        id: fileName.replace(/\.md$/, ''),
        lang,
        category: null,
        ...data,
        content
      });
    });
  }

  // Sort by date descending
  return allPosts.sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  });
}

function generateLlmsFullTxt() {
  const header = `# JustAnotherBlog - Complete Content

> This file contains all blog posts in full markdown format.
> Optimized for AI systems and language models.
> Generated: ${new Date().toISOString()}

---

`;

  let content = header;

  SUPPORTED_LANGS.forEach(lang => {
    const posts = getAllPosts(lang);
    const langName = lang === 'ko' ? 'Korean (한국어)' : 'English';
    
    content += `\n# ${langName} Posts\n\n`;
    
    posts.forEach(post => {
      const url = `https://headf1rst.github.io/log/${lang}/${post.id}`;
      const tags = post.tags ? post.tags.split(', ').map(t => `\`${t}\``).join(' ') : '';
      
      content += `## ${post.title}\n\n`;
      content += `- **URL**: ${url}\n`;
      content += `- **Date**: ${post.date}\n`;
      if (post.category) {
        content += `- **Category**: ${post.category}\n`;
      }
      if (tags) {
        content += `- **Tags**: ${tags}\n`;
      }
      if (post.description) {
        content += `- **Summary**: ${post.description}\n`;
      }
      content += `\n### Content\n\n`;
      content += post.content;
      content += `\n\n---\n\n`;
    });
  });

  // Add footer
  content += `
# About This File

This is \`llms-full.txt\`, part of the llms.txt specification for AI-friendly websites.

- **Blog**: https://headf1rst.github.io/log
- **Author**: Sanha Ko
- **llms.txt**: https://headf1rst.github.io/log/llms.txt
- **GitHub**: https://github.com/headF1rst

For more information about llms.txt, visit: https://llmstxt.org/
`;

  fs.writeFileSync(outputPath, content, 'utf8');
  console.log(`✅ Generated llms-full.txt (${(content.length / 1024).toFixed(2)} KB)`);
}

generateLlmsFullTxt();
