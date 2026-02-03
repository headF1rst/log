# 새 글 작성 가이드

이 블로그에 새 포스트를 추가할 때는 마크다운 파일의 frontmatter에 필수 메타데이터를 포함해야 합니다.

## 파일 위치

포스트는 `_posts/{언어}/` 디렉토리에 저장됩니다:

```
_posts/
├── ko/           # 한국어 포스트
│   ├── post1.md
│   └── category/
│       └── post2.md
└── en/           # 영어 포스트
    ├── post1.md
    └── category/
        └── post2.md
```

선택적으로 카테고리별 폴더를 만들 수 있습니다.

## 필수 필드

모든 포스트는 다음 frontmatter 필드를 포함해야 합니다:

```yaml
---
title: "포스트 제목"
section: tech
date: "2025-02-03"
tags: "태그1, 태그2"
thumbnail: "https://example.com/image.jpg"
---
```

### 필드 설명

| 필드 | 타입 | 필수 | 설명 | 예시 |
|------|------|------|------|------|
| `title` | string | ✅ | 포스트 제목 | `"Kafka Producer Stability Check"` |
| `section` | string | ✅ | 섹션 분류 (`tech` 또는 `domain`) | `"tech"` |
| `date` | string | ✅ | 작성일 (YYYY-MM-DD) | `"2025-02-03"` |
| `tags` | string | ✅ | 태그 (쉼표+스페이스로 구분) | `"Kafka, Producer, Reliability"` |
| `thumbnail` | string | ✅ | 썸네일 이미지 URL | `"https://img.freepik.com/..."` |

## 선택 필드

선택적으로 추가할 수 있는 필드들:

```yaml
---
# ... 필수 필드들 ...
description: "SEO를 위한 포스트 설명"
searchKeywords: "Kafka, producer, reliability"
---
```

| 필드 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `description` | string | SEO 메타 설명 (검색 결과에 표시) | `"Learn how to build fault-tolerant Kafka producers..."` |
| `searchKeywords` | string | 검색용 키워드 (쉼표로 구분) | `"Kafka, producer, reliability"` |

## 섹션 (Section) 값

포스트의 성격에 따라 `section` 필드에 적절한 값을 지정하세요:

- `tech`: 기술적 내용 (코드, 아키텍처, 트러블슈팅 등)
- `domain`: 도메인 지식 (비즈니스 로직, 프로세스, 일반적 지식 등)

## 태그 규칙

1. 여러 태그는 쉼표(`,`)와 스페이스(` `)로 구분
2. 태그의 첫 글자는 대문자로 시작 (PascalCase 추천)
3. 특수문자 사용 지양

```yaml
# 좋은 예시
tags: "Kafka, Producer, Reliability, Apache Kafka"

# 피해야 할 예시
tags: "kafka,producer,reliability"
```

## 날짜 형식

`date` 필드는 반드시 `YYYY-MM-DD` 형식을 따라야 합니다:

```yaml
date: "2025-02-03"
```

시간까지 지정하려면:

```yaml
date: "2025-02-03 10:00"
```

## 썸네일 이미지

`thumbnail` 필드는 외부 이미지 URL을 사용합니다. 지원되는 도메인:

- `i.imgur.com`
- `velog.velcdn.com`
- `images.unsplash.com`
- `avatars.githubusercontent.com`

새로운 이미지 도메인을 추가하려면 `next.config.js`에 설정이 필요합니다.

## 완성 예시

```yaml
---
title: "레거시 코드에 테스트를 도입하는 방법"
section: tech
thumbnail: https://img.freepik.com/free-vector/software-code-testing-concept-illustration_114360-8414.jpg?w=2000
tags: test
date: 2023-04-07 10:00
description: "레거시 코드베이스에 테스트를 점진적으로 도입하는 방법과 Best Practices"
searchKeywords: "레거시 코드, 테스트, 리팩토링"
---

제가 인턴으로 팀에 합류하던 당시, 개발팀은 빈번하게 변화하는 요구사항에 고통받고 있었습니다.

...
```

## 다국어 포스트

동일한 내용을 다른 언어로 작성할 때는:

1. 각 언어 폴더에 동일한 파일명 사용
2. `date`는 일치시키는 것이 좋음
3. `thumbnail`은 공유 가능

```
_posts/
├── ko/
│   └── kafka-producer.md
└── en/
    └── kafka-producer.md
```
