# CLAUDE.md - 산하개발실록 (TIL Blog)

## 프로젝트 개요

Next.js 기반 정적 블로그 사이트. 마크다운으로 콘텐츠를 관리하며 GitHub Pages에 배포됩니다.

- **URL**: https://headf1rst.github.io/TIL
- **프레임워크**: Next.js 13.4.1 (SSG)
- **언어**: TypeScript + JavaScript
- **스타일링**: Tailwind CSS 3.1.5

## 주요 명령어

```bash
npm run dev       # 개발 서버 실행 (localhost:3000)
npm run build     # 정적 사이트 빌드 (out/ 폴더)
npm run lint      # ESLint 실행
npm run deploy    # 빌드 + gh-pages 브랜치로 배포
```

## 디렉토리 구조

```
├── pages/           # Next.js 페이지 (라우팅)
│   ├── index.tsx    # 홈 - 포스트 목록 + 태그 필터
│   ├── [id].tsx     # 포스트 상세 페이지
│   ├── about.tsx    # 소개 페이지
│   └── category/    # 카테고리 관련 페이지
├── components/      # React 컴포넌트
│   ├── layout/      # 레이아웃, 헤더
│   ├── side-profile.tsx   # 프로필 사이드바
│   ├── scroll-spy.tsx     # 목차 (TOC)
│   └── utterances.tsx     # GitHub 댓글
├── lib/             # 데이터 로직
│   ├── posts.js     # 포스트 파싱
│   └── category.js  # 카테고리 데이터
├── _posts/          # 블로그 콘텐츠 (마크다운)
│   ├── {category}/  # 카테고리별 폴더
│   │   ├── _info.md # 카테고리 메타데이터
│   │   └── *.md     # 포스트 파일
│   └── _temp/       # 임시 저장 (빌드 제외)
├── _blog/           # 사이트 전역 콘텐츠
│   ├── profile.md   # 작성자 프로필
│   └── about.md     # 소개 페이지 내용
└── public/          # 정적 파일
```

## 콘텐츠 작성 규칙

### 포스트 형식 (`_posts/{category}/{slug}.md`)

```yaml
---
title: "포스트 제목"
date: "YYYY-MM-DD"
category: "카테고리명"
tags: "태그1, 태그2, 태그3"
thumbnail: "https://이미지-url"
description: "SEO 설명"
searchKeywords: "검색 키워드"
---

마크다운 본문...
```

### 카테고리 정보 (`_posts/{category}/_info.md`)

```yaml
---
name: "카테고리 이름"
thumbnail: "https://이미지-url"
description: "카테고리 설명"
---
```

### 프로필 (`_blog/profile.md`)

```yaml
---
name: "이름"
description: "소개"
email: "이메일"
github: "깃허브 아이디"
image: "https://프로필-이미지"
---
```

## 코드 패턴

- **정적 생성(SSG)**: `getStaticProps`, `getStaticPaths` 사용
- **동적 라우팅**: `[id].tsx`(포스트), `[cid].tsx`(카테고리)
- **TypeScript**: 인터페이스는 페이지 파일 내 정의
- **다크 모드**: Tailwind `dark:` 접두사 사용
- **반응형**: `sm:`(모바일), 기본(데스크톱)

## 주요 기능

- 태그 기반 필터링
- 목차 자동 생성 (스크롤 추적)
- GitHub Discussions 댓글 (Utterances)
- 코드 구문 강조
- SEO 최적화 (sitemap, Open Graph, JSON-LD)

## 설정 파일

- `next.config.js`: 기본 경로(`/TIL`), 이미지 도메인
- `tailwind.config.js`: 커스텀 브레이크포인트(sm: 300-1000px)
- `tsconfig.json`: strict 모드 활성화

## 배포

`npm run deploy` 실행 시:
1. 정적 사이트 빌드 (`out/`)
2. sitemap 생성
3. `gh-pages` 브랜치로 푸시
4. GitHub Pages에서 자동 서빙
