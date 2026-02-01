module.exports = {
  siteUrl: "https://headf1rst.github.io/TIL/",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        disallow: ["/404"],
      },
      { userAgent: "*", allow: "/" },
    ],
    // server-sitemap.xml이 없는 경우 이 줄을 제거하세요
    // additionalSitemaps: [`https://headf1rst.github.io/TIL/server-sitemap.xml`],
  },
  // 사이트맵이 현재 날짜로 업데이트되도록 이 항목을 추가
  changefreq: 'daily',
  priority: 0.7,
  sitemapSize: 5000,
};
