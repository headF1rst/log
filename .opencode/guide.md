# Project: JustAnotherBlog

## Overview
Next.js 기반 다국어 지원 정적 블로그. 마크다운으로 콘텐츠를 관리하며 GitHub Pages에 배포됩니다.

- **URL**: https://headF1rst.github.io/log
- **Framework**: Next.js 13.4.1 (SSG)
- **Languages**: TypeScript + JavaScript
- **Styling**: Tailwind CSS 3.1.5

## Commands

```bash
npm run dev       # 개발 서버 실행 (localhost:3000)
npm run build     # 정적 사이트 빌드 (out/ 폴더)
npm run lint      # ESLint 실행
npm run deploy    # 빌드 + gh-pages 브랜치로 배포
```

## Directory Structure

```
├── pages/           # Next.js 페이지 (라우팅)
│   ├── [lang]/      # 다국어 라우팅
│   │   ├── index.tsx    # 홈 - 포스트 목록 + 태그 필터
│   │   ├── [id].tsx     # 포스트 상세 페이지
│   │   ├── tech.tsx     # 기술 포스트 목록
│   │   └── domain.tsx   # 도메인 포스트 목록
│   ├── _app.tsx        # 앱 초기화
│   └── index.tsx       # 루트 페이지
├── components/      # React 컴포넌트
│   ├── layout/      # 레이아웃, 헤더
│   ├── side-profile.tsx   # 프로필 사이드바
│   ├── scroll-spy.tsx     # 목차 (TOC)
│   └── utterances.tsx     # GitHub 댓글
├── lib/             # 데이터 로직
│   ├── posts.js     # 포스트 파싱
│   ├── i18n.ts      # 다국어 설정
│   └── blog.js      # 블로그 데이터
├── _posts/          # 블로그 콘텐츠 (마크다운)
│   ├── {lang}/      # 언어별 폴더 (ko, en)
│   │   ├── {slug}.md     # 포스트 파일
│   │   └── {category}/   # 카테고리별 폴더 (선택)
│   │       └── *.md      # 포스트 파일
├── _blog/           # 사이트 전역 콘텐츠
│   ├── profile.{lang}.md   # 작성자 프로필 (다국어)
│   └── about.md          # 소개 페이지 내용
├── public/          # 정적 파일
└── styles/          # 스타일시트
```

## Content Writing Rules

### Post Format (`_posts/{lang}/{slug}.md` or `_posts/{lang}/{category}/{slug}.md`)

```yaml
---
title: "포스트 제목"
section: tech  # tech 또는 domain
date: "YYYY-MM-DD"
tags: "태그1, 태그2, 태그3"
thumbnail: "https://이미지-url"
description: "SEO 설명" (선택)
searchKeywords: "검색 키워드" (선택)
---

마크다운 본문...
```

**Required Fields:**
- `title`: 포스트 제목
- `section`: 섹션 구분 (`tech` 또는 `domain`)
- `date`: 작성일 (YYYY-MM-DD 형식)
- `tags`: 태그 (쉼표로 구분)
- `thumbnail`: 썸네일 이미지 URL

**Optional Fields:**
- `description`: SEO 메타 설명
- `searchKeywords`: 검색용 키워드

### Profile (`_blog/profile.{lang}.md`)

```yaml
---
name: "이름"
description: "소개"
email: "이메일"
github: "깃허브 아이디"
image: "https://프로필-이미지"
---
```

## Code Patterns

- **Static Generation (SSG)**: `getStaticProps`, `getStaticPaths` 사용
- **Dynamic Routing**: `[lang]/[id].tsx`(포스트), `[lang]/{tech|domain}.tsx`(섹션)
- **Multi-language**: `lang` 파라미터 기반 라우팅 (`ko`, `en`)
- **TypeScript**: 인터페이스는 `lib/i18n.ts` 및 각 페이지 파일 내 정의
- **Dark Mode**: Tailwind `dark:` 접두사 사용
- **Responsive**: `sm:`(모바일), 기본(데스크톱)

## Key Features

- 다국어 지원 (한국어, 영어)
- 태그 기반 필터링
- 섹션 분류 (Tech / Domain)
- 목차 자동 생성 (스크롤 추적)
- GitHub Discussions 댓글 (Utterances)
- 코드 구문 강조
- SEO 최적화 (sitemap, Open Graph)

## Configuration Files

- `next.config.js`: 기본 경로(`/log`), 이미지 도메인, export 모드
- `tailwind.config.js`: 커스텀 브레이크포인트(sm: 300-1000px)
- `tsconfig.json`: strict 모드 활성화
- `next-sitemap.config.js`: sitemap 생성 설정

## Deployment

`npm run deploy` 실행 시:
1. 정적 사이트 빌드 (`out/`)
2. sitemap 생성
3. `gh-pages` 브랜치로 푸시
4. GitHub Pages에서 자동 서빙
