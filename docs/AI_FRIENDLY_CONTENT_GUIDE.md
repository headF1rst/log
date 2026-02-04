# AI 친화적 블로그 포스트 작성 가이드

이 문서는 검색 엔진과 AI 어시스턴트(Google AI Overviews, Perplexity, ChatGPT Search 등)가 콘텐츠를 더 잘 이해하고 인용할 수 있도록 포스트를 작성하는 방법입니다.

---

## 1. 포스트 구조 (필수)

```markdown
---
title: "포스트 제목"
date: "YYYY-MM-DD"
section: tech
tags: "태그1, 태그2, 태그3"
thumbnail: "https://이미지-url"
description: "SEO 설명 (1-2문장)"
searchKeywords: "검색 키워드1, 검색 키워드2"
---

# H1: 주제 (포스트에 오직 하나의 H1)

## 핵심 요약 (Quick Answer)
> **요약**: 포스트의 핵심 내용을 한 문장으로 요약합니다. AI가 답변을 생성할 때 직접 사용합니다.

> **해결책**: 문제가 있는 경우 해결 방법을 간단히 설명합니다.

## 본문

서론, 배경 지식 설명...

### H2: 주요 섹션 1
섹션 내용...

#### H3: 하위 섹션
상세 내용...

### H2: 주요 섹션 2
섹션 내용...

## 자주 묻는 질문

**Q: 질문 1?**
A: 질문에 대한 답변입니다.

**Q: 질문 2?**
A: 질문에 대한 답변입니다.

### 또는

## 자주 묻는 질문

### 질문 1은 무엇인가요?
답변입니다.

### 질문 2는 어떻게 해결하나요?
답변입니다.

## 결론
마무리 요약...
```

---

## 2. 제목 작성법

- **구체적이고 명확하게**: "Netty 문제 해결" 대신 "Netty WebClient Cold Start 원인과 warmup 해결책"
- **질문 형태 사용**: "CORS는 무엇인가?" "Kafka Producer는 어떻게 설정해야 할까?"
- **키워드 포함**: 검색어(Netty, Kafka, WebClient)를 제목에 포함
- **길이 제한**: 60자 이내 (AI가 요약 시 원문 노출 가능)

---

## 3. FAQ 작성법

### FAQ 형식 1: **Q: 질문?** A: 답변

```markdown
**Q: Cold Start란 무엇인가요?**
A: 애플리케이션이 실제로 첫 번째 HTTP 요청을 보낼 때까지 리소스 초기화를 지연하는 방식입니다.

**Q: warmup은 Cold Start를 완전히 해결하나요?**
A: 아닙니다. warmup은 네트워크 리소스(EventLoop, DNS Resolver, SSL Context)만 미리 로드합니다.
```

### FAQ 형식 2: ## 자주 묻는 질문 섹션

```markdown
## 자주 묻는 질문

### 질문 1은 무엇인가요?
답변입니다.

### 질문 2는 어떻게 해결하나요?
답변입니다.
```

### FAQ 작성 원칙

1. **질문은 사용자의 언어로**: "CORS 에러가 발생합니다" 대신 "CORS 에러는 어떻게 해결하나요?"
2. **답변은 직접적**: 추가 설명 없이 핵심만
3. **한 질문당 한 답변**: 여러 답변 대신 가장 좋은 하나
4. **길이 제한**: 질문 200자 이내, 답변 500자 이내
5. **포스트 내용과 일치**: 새로운 정보가 아닌 포스트 내용 요약

---

## 4. heading 계층 구조

```text
H1 (오직 하나): 포스트 주제
├── H2: 주요 섹션
│   ├── H3: 하위 섹션
│   │   ├── H4: 상세 내용
│   │   └── H4: 상세 내용
│   └── H3: 하위 섹션
└── H2: 자주 묻는 질문 (FAQ)
    ├── (질문은 H3 없이 본문 형식)
    └── (질문은 H3 없이 본문 형식)
```

**절대 레벨을 건너뛰지 마세요**: H1 → H3는 안 됩니다. LLM이 계층을 이해하지 못합니다.

---

## 5. 이미지 alt 텍스트

```markdown
![Netty EventLoop 구조](https://image-url)

또는

![EventLoop 구조](https://image-url)
```

- **alt 텍스트**: 이미지가 안 뜰 때 화면 리더가 읽을 내용
- **간단하고 명확하게**: "이미지" 대신 "Netty EventLoop가 Selector와 TaskQueue를 처리하는 다이어그램"
- **키워드 포함**: "Netty", "EventLoop" 등

---

## 6. 코드 블록

```java
public class Example {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
```

- **언어 지정**: \`\`\`java`, \`\`\`javascript`, \`\`\`typescript`
- **필요한 코드만**: 전체 파일이 아니라 핵심 부분
- **주석 활용**: 복잡한 로직은 코드 내 주석으로 설명

---

## 7. 메타데이터 작성법

```yaml
---
title: "포스트 제목"
date: "YYYY-MM-DD"
section: tech  # tech, design, etc.
tags: "태그1, 태그2, 태그3"
thumbnail: "https://이미지-url"
description: "포스트 요약입니다. AI가 검색 결과 요약 시 사용합니다."
searchKeywords: "검색 키워드1, 검색 키워드2, 검색 키워드3"
---
```

### 메타데이터 원칙

- **description**: 1-2문장, 160자 이내
- **tags**: 3-5개, 쉼표+공백(", ")으로 구분
- **thumbnail**: 1200x630 이상 권장 (OGP용)
- **searchKeywords**: description보다 더 자세한 키워드

---

## 8. AI 최적화 체크리스트

### 구조
- [ ] H1이 오직 하나인가요?
- [ ] heading이 순차적(H1 → H2 → H3)인가요?
- [ ] FAQ 섹션이 있는가요?
- [ ] 핵심 요약이 상단 20%에 있는가요?

### 메타데이터
- [ ] title이 구체적인 질문 형태인가요?
- [ ] description이 160자 이내인가요?
- [ ] tags가 3-5개인가요?
- [ ] thumbnail이 있는가요?

### 콘텐츠
- [ ] 포스트 길이가 800-2500자인가요?
- [ ] 기술적 깊이와 실무 경험이 포함되어 있나요?
- [ ] 코드 예제가 있는가요?
- [ ] 이미지에 alt 텍스트가 있는가요?

---

## 9. 예시: AI 친화적 포스트

```markdown
---
title: "Netty WebClient 간헐적 지연 원인과 warmup 해결책"
date: "2025-12-26"
section: tech
tags: "Netty, WebClient, Performance, Java"
thumbnail: "https://example.com/netty.png"
description: "WebClient 첫 요청 시 발생하는 지연 문제의 원인은 Netty의 Lazy Initialization입니다. 앱 시작 시 warmup()을 호출하여 해결할 수 있습니다."
searchKeywords: "Netty Cold Start, WebClient 지연, EventLoop warmup"
---

# Netty WebClient 간헐적 지연 원인과 warmup 해결책

## 핵심 요약

> **문제**: WebClient 첫 요청 시 알 수 없는 지연이 발생합니다.
> **원인**: Netty 리소스(EventLoop, DNS Resolver)의 Lazy Initialization 때문입니다.
> **해결책**: 애플리케이션 시작 시 `httpClient.warmup()`을 호출하세요.

## 문제 발생 현상

애플리케이션 배포 직후 첫 번째 외부 API 호출에서 **간헐적으로 지연**이 발생했습니다.

![APM 지표](https://example.com/apm.png)

## 원인: Netty의 Lazy Initialization

Netty WebClient는 **실제 첫 요청을 보낼 때까지 리소스를 초기화하지 않습니다**.

초기화되는 리소스:
1. **EventLoopGroup**: NioEventLoop 스레드 풀 생성
2. **DNS Resolver**: 비동기 DNS 리졸버 초기화
3. **Native Transport**: epoll, kqueue 네이티브 라이브러리 로드
4. **SSL Context**: HTTPS 핸드셰이크용 SSL 엔진

이 초기화 과정이 첫 요청 시점에 동기적으로 실행되면서 지연이 발생합니다.

## 해결책: Warmup

```java
@Configuration
public class WebClientConfig {

   @Bean
   public WebClient webClient() {
      HttpClient httpClient = HttpClient.create();

      // 애플리케이션 시작 시 warmup 수행
      httpClient.warmup().block();

      return WebClient.builder()
          .clientConnector(new ReactorClientHttpConnector(httpClient))
          .build();
   }
}
```

`warmup()`은 실제 TCP 연결을 맺지 않고 네트워크 리소스만 미리 로드합니다.

## Warmup의 한계

warmup은 다음을 초기화합니다:
- ✅ EventLoopGroup
- ✅ DNS Resolver
- ✅ Native Transport
- ✅ SSL Context

하지만 **TCP 연결은 생성하지 않습니다**:
- ❌ 실제 커넥션 풀
- ❌ 목 서버와의 연결

따라서 커넥션이 유휴 상태로 오래 유지되면 서버가 연결을 끊고, 다음 요청에서 재연결 시도가 발생할 수 있습니다.

## 자주 묻는 질문

**Q: warmup을 하면 Cold Start가 완전히 사라지나요?**
A: 아닙니다. warmup은 네트워크 리소스만 미리 로드하며, 실제 TCP 연결은 필요 시점에 생성됩니다.

**Q: 언제 warmup을 호출해야 하나요?**
A: 애플리케이션 시작 시 단 한 번만 호출하면 됩니다. 앱이 실행 중일 때는 이미 리소스가 로드되어 있기 때문입니다.

**Q: 커넥션 풀 웜업은 해결책인가요?**
A: 아닙니다. Netty 커뮤니티에서도 ConnectionPool을 웜업하는 것은 권장하지 않습니다. 서버 keepAliveTimeout 설정과 충돌할 수 있습니다.
```

---

## 10. 추가 리소스

- [JSON-LD 구조화 데이터](https://schema.org/)
- [Google 검색 센터](https://search.google.com/search-console)
- [llms.txt 표준](https://github.com/jb-dev/llms-txt)
