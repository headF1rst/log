---
title: "정규식 사다리를 걷어내고 Strict Schema로 완성한 결정론적 LLM 시맨틱 라우터"
section: tech
date: "2026-09-19"
tags: "AI Agent, LLM Architecture, Semantic Router, Slack Bot, GenAI Design Patterns"
thumbnail: "https://headf1rst.github.io/log/images/post41_thumb.jpeg"
description: "사내 슬랙봇이 복잡한 자연어 요청을 처리하면서 겪은 라우팅 오분류 트러블슈팅 과정과, 키워드 정규식 사다리를 걷어내고 2단계 시맨틱 라우터 및 Grammar 패턴을 도입해 결정론적 신뢰성을 확보한 엔지니어링 기록입니다."
searchKeywords: "LLM 라우팅, 시맨틱 라우터, 워크플로우와 에이전트, Grammar 패턴, Logits Masking, Structured Outputs, AI 슬랙 봇, Claude Haiku, Plan-Then-Execute, 슬랙봇 아키텍처"
---
지난 포스트에서는 코드 리뷰 병목을 해소하기 위해 사내 슬랙 봇인 '흰둥이'를 만들게 된 배경을 다루었습니다. 처음에는 PR 리뷰를 돕는 단일 목적 도구로 출발했지만, 봇이 팀의 일상에 자연스럽게 자리 잡으면서 담당하는 영역도 점차 넓어졌는데요. 

현재 흰둥이는 배송 시스템 전반에 걸친 **코드베이스 질의**부터 배포 전 JSM 티켓을 자동으로 발의하는 **배포 서비스데스크 작성**, 릴리즈 당일 시스템 상태를 공유하고 모니터링하는 **배포 공지 및 관제 대시보드 생성**에 이르기까지 개발팀의 크고 작은 업무 전반을 지원하고 있습니다.

하지만 지원하는 기능이 늘어날수록 팀원들로부터 아쉬운 피드백도 함께 들려오기 시작했습니다. "가끔 엉뚱한 답을 한다", "분명 알아들을 수 있는 말 같은데 왜 자꾸 특정 형식을 강요하느냐", "그냥 에이전트처럼 알아서 셸 명령도 치고 고쳐주면 안 되냐" 같은 이야기였습니다.

이번 포스트에서는  '워크플로우'와 '에이전트'의 차이를 짚어보고, 기존 슬랙봇 라우팅 로직이 왜 그렇게 설계되었으며 어떤 한계로 인해 오분류가 발생했는지 살펴보고자 합니다. 그리고 이를 해결하기 위해 정규식 사다리를 걷어내고 경량 LLM과 Grammar 패턴을 결합해 2단계 시맨틱 라우터로 전환한 설계와 구현 과정을 공유해 드리도록 하겠습니다.

## 워크플로우와 에이전트

봇이 왜 가끔 융통성 없게 구는지 이해하려면, 먼저 최근 AI 업계에서 정립한 \*\*워크플로우(Workflow)\*\*와 \*\*에이전트(Agent)\*\*의 명확한 정의를 살펴볼 필요가 있습니다.

이전에는 이 두 단어가 마케팅 용어처럼 뒤섞여 쓰였지만, 최근에는 시스템의 흐름 제어권이 어디에 있는가를 기준으로 명확하게 선이 그어졌습니다.

> **코드가 흐름을 제어하면 워크플로우, 모델이 흐름을 제어하면 에이전트.**

두 패턴의 특성을 비교해 보면 다음과 같습니다.


| 구분          | 워크플로우(Workflow) 패턴                                          | 에이전트(Agent) 패턴                                   |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------ |
| **흐름 제어**   | **코드**. 개발자가 짠 고정 그래프(DAG/if-else)를 따라 정해진 순서대로 LLM과 도구를 호출 | **LLM**. 모델에게 목표와 도구만 쥐어주고, 실행 순서는 모델이 자율적으로 판단  |
| **LLM의 역할** | 정해진 단계에서 단위 작업 수행 (요약, 분류, 추출)                              | 도구 선택, 인자 결정, 루프 종료 시점 자체 판단                     |
| **결정론성**    | **높음** (예측 가능, 재현 가능)                                       | **낮음** (동일 입력에도 매번 달라질 수 있음)                     |
| **디버깅**     | 쉬움 (어느 단계의 코드가 실패했는지 명확함)                                   | 어려움 (모델의 내부 추론 경로 추적이 복잡함)                       |
| **실패율**     | 낮음                                                          | 높음 (다중 에이전트 태스크의 40\~80% 실패)                     |
| **대표 패턴**   | Prompt Chaining, Routing, Parallelization                   | ReAct, Autonomous Tool Calling, Multiagent Swarm |


### 왜 흰둥이는 자율 에이전트가 아닌 워크플로우를 택했는가

팀원들이 기대하는 모습은 대개 '자율 에이전트'에 가깝습니다. "알아서 로그 보고, 알아서 브랜치 따서 코드 고치고, 알아서 배포까지 해주면 좋겠다"는 기대입니다.

하지만 흰둥이가 담당하는 핵심 업무를 뜯어보면 이야기가 달라집니다:

- **배포 서비스데스크 작성**: 실제 Jira 결재선이 타고 운영 배포 권한이 열리는 행위
- **배포 공지 및 대시보드 생성**: 개발팀 전체와 사업부, QA가 바라보는 공식 채널에 배포 공지 게시
- **개발계/스테이징 배포 트리거**: 실제 클러스터에 컨테이너가 배포되는 인프라 변경

이 모든 작업은 한 번 실행되면 되돌리기 어렵거나 영향 범위가 넓은 **비가역적 작업**입니다.

2025년 다중 에이전트 시스템 연구(Cemri et al.)에 따르면, 자율 에이전트의 태스크 실패율은 40\~80%에 달하며 실패 원인의 대부분은 명세 미준수, 도구 오호출, 추론과 행동의 불일치에서 비롯됩니다. 환각(Hallucination)으로 인해 엉뚱한 브랜치가 배포되거나, 잘못된 날짜로 서비스데스크 결재 티켓이 올라가는 문제는  용인하기 어렵습니다.

그렇기 때문에 흰둥이는 안전성이 중요한 작업마다 **비가역 작업 직전에 사람이 검토하고 승인하는 HITL(Human-in-the-Loop) 버튼**을 배치하고, 전체 파이프라인의 제어권을 코드가 쥐는 **통제된 워크플로우** 구조를 뼈대로 삼았습니다.

문제는, 이 '흐름 제어'를 너무 보수적으로 짠 나머지 앞단의 자연어 인입 단계에서 융통성 부족이라는 한계가 드러났다는 점입니다.

## 정규식 사다리가 부른 라우팅 오분류

실제 에러 알림 채널에서 겪은 오분류 사례입니다.

개발계 EKS 클러스터에서 미완료 택배 건을 처리하는 배치 Pod가 실패하여 모니터링 시스템이 슬랙 채널에 경보 메시지를 올렸습니다.

```text
[FIRING:1] ... (pod 상태 failed dev -batch ...)
*Alert:* pod 상태 failed - critical
*Summary:* This alert is fired when the defined metric (current value: 4) crosses the threshold (3.5)
```

에러 원인을 빠르게 파악하고 싶어 해당 알림 스레드에 흰둥이를 호출했습니다.

> **엔지니어**: `@흰둥이 뭐가 문제야`

누가 봐도 상위 알림 메시지의 파드 실패 로그를 조회해서 원인을 요약해 달라는 자연스러운 요청이었습니다. 하지만 흰둥이가 내놓은 답변은 팀원을 당황하게 만들었습니다.

> **흰둥이**: 
> 🐶 테스트 자동 수정을 원한 거라면, 발동시키려면 형식을 맞춰줘야 해(지금 입력으론 어떤 서비스/브랜치를 고칠지 확정할 수 없어).  
> 아래처럼 다시 멘션해주면 브랜치를 받아서 재현·수정하고 통과 확인 후 PR까지 올릴게:  
> `@봇 <서비스별칭> [브랜치] 테스트 실패 고쳐줘`  
> (단순 코드 질문이었다면 이 안내는 무시하고 다시 물어봐도 돼.)

결국 팀원은 자연어 대화를 포기하고, `@흰둥이 /skill:infra-log`라는 슬래시 커맨드를 직접 타이핑해 강제로 로그 조회 스킬을 실행해야 했습니다.

### 왜 이런 일이 벌어졌을까?

기존 흰둥이의 라우팅 코드는 전형적인 **'정규식 사다리(Regex Ladder)'** 구조였습니다.

```typescript
// 이전 routerClassifier.ts (개념적 코드)
export function classifyRoute(facts: RouteFacts): RouteDecision {
  // 1. 보안 차단 검사
  if (facts.securityBlocked) return { route: 'security_block' };

  // 2. 명시 커맨드 및 URL 검사 (/배포, PR 링크 등)
  if (facts.cmd) return { route: facts.cmd.route };

  // 3. 🚨 자연어 정규식 사다리
  if (/(배포|서데).*(작성|시작|써줘)/.test(facts.userText)) {
    return { route: 'deploydesk' };
  }
  if (/(테스트.*(실패|깨)|고쳐줘|뭐가\s*문제야)/.test(facts.userText)) {
    return { route: 'testfix' }; // 💥 여기서 가로챔!
  }
  if (/회의실/.test(facts.userText)) {
    return { route: 'roombooking' };
  }

  // 4. 어떤 정규식에도 안 걸리면 일반 대화로 폴백
  return { route: 'codebase_or_chat' };
}
```

처음 이 코드를 짤 때의 의도는 명확했습니다:

1. **즉각적인 응답과 토큰 절약**: 라우팅에 LLM을 부르지 않으므로 네트워크 지연과 비용이 들지 않는다.
2. **빠른 단락(Short-circuit)**: 사용자가 "테스트 깨졌어 고쳐줘"라고 하면 LLM 생각 없이 바로 전용 진단 파이프라인으로 쏜다.

하지만 기능이 확장되면서 이 라우팅 구조에 문제가 생기기 시작했습니다:

- **맥락(Context) 상실**: 정규식은 사용자의 한 줄 텍스트(`"뭐가 문제야"`)만 볼 뿐, 그 메시지가 \*\*어떤 스레드(EKS 배치 파드 실패 경보)\*\*에 달려 있는지를 전혀 보지 못합니다.
- **키워드 근시안**: 테스트 수정 기능의 트리거를 넓히기 위해 넣어둔 `"뭐가 문제야"` 정규식이, 장애 분석을 요구하는 엔지니어의 질문을 중간에서 낚아채 버렸습니다.
- **불필요한 I/O 오버헤드**: 라우팅 결정이 내려지기도 전에 슬랙에 첨부된 파일들을 무조건 미리 다운로드하는 불필요한 네트워크 지연까지 겹쳐 있었습니다.

정규식 사다리는 봇이 지원하는 기능이 2, 3개일 때는 빠르고 효율적이지만 기능이 점차 늘어나는 순간 **규칙 간의 교차 충돌로 무너지는 구조적 한계**를 안고 있었습니다.

## 새로운 해법: 2단계 하이브리드 라우팅 아키텍처

문제를 해결하기 위해 라우팅 아키텍처를 전면 개편했습니다. 

핵심 아이디어는 \*\*"코드 가드가 잘하는 것(결정론적 룰)과 LLM이 잘하는 것(문맥과 뉘앙스 파악)의 역할을 극단적으로 분리하자"\*\*였습니다.

```text
               [ 사용자 멘션 / 메시지 인입 ]
                            │
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  1단계: Fast Path (Zero-latency)             │
 └──────────────────────────┬──────────────────────────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
 [보안 위협 차단]     [기존 세션 이어가기]   [명시 커맨드 & URL]
 (개인정보/대리발송)  (PR리뷰/배포서데/온콜) (/배포, PR링크, Confluence)
       │                    │                    │
       ▼                    ▼                    ▼
  [즉시 거절]          [해당 세션 직행]      [전용 워크플로우 직행]
                            │
                            │ (위 조건에 해당하지 않는 모든 자연어)
                            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  2단계: Semantic Router (경량 LLM: Haiku / Strict Schema)    │
 └──────────────────────────┬──────────────────────────────────┘
                            │ 문맥 전체를 이해하고 의도 분류
       ┌───────────┬────────┴───┬───────────┬───────────┐
       ▼           ▼            ▼           ▼           ▼
  [deploydesk] [devdeploy] [roombooking] [testfix]   [codebase]
  배포 서데 작성  개발/stg 배포   회의실 예약    테스트 수정   코드베이스 탐색
       │           │            │           │           │
       │           │            │           │      (general 폴백)
       │           │            │           │           ▼
       │           │            │           │      [일반 잡담/대화]
       ▼           ▼            ▼           ▼           │
 ┌──────────────────────────────────────────────┐       │
 │  3단계: Plan-Then-Execute (결정적 파서 슬롯 검증)│       │
 └──────────────────────┬───────────────────────┘       │
                        │ 슬롯(스쿼드/날짜/서비스명) 재검증     │
                        ▼                               │
 ┌──────────────────────────────────────────────┐       │
 │  4단계: HITL 안전 게이트 (사람 검토 및 승인)    │       │
 └──────────────────────┬───────────────────────┘       │
                        │ 승인 버튼 클릭 전 비가역 작업 차단     │
                        ▼                               ▼
               [ 최종 도구/API 실행 ] ◀─────────────────┘
```

### 1단계: Fast Path (Zero-latency 코드 가드)

모든 요청에 LLM을 태우면 지연 시간과 비용이 낭비됩니다. 따라서 **기계적으로 명백한 것들**은 1단계 코드 레벨에서 네트워크 지연 없이 즉시 분기합니다:

- **보안 차단**: 프롬프트 인젝션, 민감 정보 유출 시도 즉시 거부
- **세션 유지**: 이미 진행 중인 PR 리뷰나 배포 서데 작성 스레드의 후속 답글은 기존 핸들러로 직행
- **명시적 슬래시 커맨드**: `/배포`, `/회의실`, `/skill:<명령어>` 등 사용자가 의도를 직접 지정한 경우
- **명시적 URL**: GitHub PR 링크나 Confluence 문서 URL이 포함된 경우

### 2단계: Semantic Router (경량 LLM)

1단계의 명시적 조건에 걸리지 않는 \*\*'모든 모호한 자연어'\*\*는 키워드 정규식을 전면 철거하고, 2단계 경량 LLM(Claude Haiku)에게 넘깁니다.

이 라우터는 단편적인 단어가 아니라 **사용자의 발화 전문과 부모 스레드의 알림 맥락 전체**를 읽고 의도를 분류합니다. 이제 `"뭐가 문제야"`가 들어오더라도 상위 메시지에 EKS 파드 에러가 있다면 테스트 수정이 아닌 인프라 로그/코드베이스 질문으로 정확하게 짚어낼 수 있게 되었습니다.

## 라우터의 신뢰성을 보장하는 3가지 핵심 설계 패턴

그러나 정규식을 걷어내고 Semantic Router를 도입하면서 새로운 트레이드오프와 마주하게 되었습니다.

 

문맥을 읽어내는 유연성을 얻은 대신, 모델 특유의 비결정성(환각, 규격 외 출력 포맷)으로 인해 라우팅이 흔들릴 수 있는 불확실성을 떠안게 된 것입니다.

    비가역적 작업을 다루는 워크플로우에서 라우팅 단계의 비결정성은 치명적인 결함이 될 수 있습니다. 이 불확실성을 통제하고 라우팅의 결정론적 신뢰성을 확보하기 위해 세 가지 설계 패턴을 결합했습니다.

### 1. Grammar &amp; Strict Schema (Logits Masking)

보통 프롬프트에 `"다음 7가지 의도 중 하나로만 답해줘. 다른 말은 절대 하지 마!"`라고 요청하곤 합니다. 하지만 이는 프롬프트로 \*\*애원(begging)\*\*하는 안티패턴입니다. LLM은 언제든 `"네, 알겠습니다. deploydesk입니다."`처럼 사족을 붙이거나 스키마를 깨뜨릴 수 있습니다.

이를 방지하기 위해 **Grammar 패턴**을 적용했습니다.

LLM은 한 단어씩 다음 토큰의 확률(Logits)을 계산하며 생성합니다. Grammar 제약(Constrained Decoding)은 추론 엔진 레벨에서 정해진 문법(JSON Schema)에 어긋나는 모든 토큰의 확률을 $-\infty$(0%)로 마스킹(Logits Masking)해 버립니다.

```text
       [ 모델의 어휘 사전 (수만 개 토큰) ]
                      │
                      ▼
     ┌─────────────────────────────────┐
     │  다음 토큰 확률 계산 (Logits)     │
     └────────────────┬────────────────┘
                      │
                      ▼
 [ Grammar 엔진: "지금 올 수 있는 단어는 미리 정의된 7개 Enum뿐이다!" ]
                      │
                      ▼
   7개 Enum을 제외한 모든 토큰 확률을 0%로 강제 마스킹!
                      │
                      ▼
     모델은 물리적으로 허용된 Enum 외에는 출력 불가
```

 API 호출 시 `strict: true`와 `Enum` 스키마를 함께 지정하면, 모델은 물리적으로 정해진 단어 외에는 뱉을 수 없게 됩니다. 오타나 환각, JSON 파싱 에러가 수학적으로 불가능해집니다.

#### 문법 제약만으로 충분하지 않은 이유: Greedy Decoding (`temperature: 0`)

여기서 Grammar를 적용하면 라우팅의 모든 비결정성이 해결된다고 생각하기 쉽습니다. 하지만 Grammar는 출력이 지정된 Enum 규격을 벗어나지 못하도록 **형식(Syntax)**을 강제할 뿐, 그 안에서 어떤 값을 선택할지의 **의도(Semantics)**까지 결정론적으로 만들어주지는 않습니다.

예를 들어 사용자의 질의에 대해 모델이 계산한 확률 분포가 `deploydesk`(60%)와 `deployplan`(30%)으로 나뉘었을 때, `temperature`가 일반적인 기본값(0.7~1.0)으로 열려 있다면 모델은 30%의 확률로 엉뚱한 의도를 선택하게 됩니다. 문법적으로는 완벽하게 유효한 JSON이지만, 라우팅 결과는 확률에 따라 흔들리는 셈입니다.

답변의 다양성과 자연스러움이 필요한 일반 대화와 달리, 시스템의 진입점인 라우터는 창의성이 0%여야 합니다. 동일한 질의에는 언제나 동일한 워크플로우를 타야 시스템의 동작을 예측하고 디버깅할 수 있습니다.

따라서 라우터에서는 반드시 `temperature: 0`을 병행해야 합니다. `temperature: 0`은 소프트맥스 확률 분포에 따른 무작위 샘플링을 끄고, 항상 가장 높은 확률을 가진 단일 토큰만을 선택하는 Greedy Decoding으로 전환합니다.

- **Grammar (Strict Schema)**: 허용되지 않은 어휘는 물리적으로 생성할 수 없다 (형식의 결정론성)
- **Temperature 0 (Greedy Decoding)**: 허용된 어휘 중 확률이 가장 높은 최선의 선택만 고른다 (의도의 결정론성)

이 두 장치가 결합되어야 비로소 규격에 맞으면서도 동일한 입력에 언제나 동일한 경로를 내는 결정론적 라우터가 완성됩니다.

### 2. Plan-Then-Execute 원칙

LLM이 의도를 분류했다고 해서, 그 안의 세부 파라미터(스쿼드명, 배포 날짜 등)까지 LLM의 환각에 전적으로 의존해서는 안 됩니다.

- **의도 분류(Plan)**: 문맥과 뉘앙스를 파악하는 것은 LLM에게 맡깁니다.
- **슬롯 추출 및 검증(Execute)**: 실제 실행에 필요한 인자는 사내 서비스 레지스트리와 매칭되는 결정적 파서(Deterministic Parser)가 텍스트에서 한 번 더 엄격하게 검증합니다.

LLM은 넓은 길을 찾아주는 나침반 역할을 하고, 실제 레일 위를 달리는 열차의 조작은 코드가 담당하는 구조입니다.

### 3. Lazy Evaluation (지연 로딩)

이전 코드에서는 멘션이 인입되자마자 스레드의 첨부파일을 무조건 다운로드했습니다. 하지만 배포 서데 작성이나 회의실 예약, 테스트 진단 같은 워크플로우는 이미지 첨부파일이 전혀 필요하지 않습니다.

라우팅 판정이 완전히 끝난 뒤, 실제로 파일 컨텍스트가 필요한 일반 대화(`chat`)나 심층 코드 탐색(`explore`) 시점에만 첨부파일을 비동기로 내려받도록(Lazy Loading) 개선하여 불필요한 네트워크 I/O 병목을 제거했습니다.

## 실제 코드 들여다보기: Anthropic API

이 설계가 실제 코드베이스에 어떻게 녹아있는지 핵심 구현부를 살펴보겠습니다.

### 1) API 호출 레벨의 Strict Tool Calling

`src/integrations/claudeRunner.ts`에서는 Claude Haiku 모델에 `strict: true` 옵션이 적용된 도구를 바인딩하고 `tool_choice`를 강제합니다.

```typescript
// src/integrations/claudeRunner.ts

// 1. 7개 Enum 외에는 생성을 원천 차단하는 스키마
const ROUTE_TOOL = {
  name: 'route',
  description: '사용자 질의의 의도를 분류하고 신뢰도·후보·슬롯 정보를 낸다.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      kind: {
        type: 'string',
        enum: ['general', 'codebase', 'testfix', 'deploydesk', 'deployplan', 'devdeploy', 'roombooking']
      },
      confidence: { type: 'string', enum: ['high', 'low'] },
      service: { type: 'string', description: '서비스 별칭 또는 스쿼드명' },
      date: { type: 'string', description: '배포 관련 날짜' },
      candidates: { ... },
    },
    required: ['kind', 'confidence', 'candidates', 'service', 'date'],
  },
};

// 2. temperature=0 고정 및 도구 호출 강제
const body = JSON.stringify({
  model: 'claude-haiku-4-5',
  max_tokens: 512,
  temperature: 0, // Greedy Decoding: 확률적 무작위성 제거
  tools: [ROUTE_TOOL],
  tool_choice: { type: 'tool', name: 'route' }, // 일반 텍스트 답변 금지
  messages: [{ role: 'user', content }],
});
```

`temperature: 0`을 통해 탐욕적 디코딩(Greedy Decoding)을 강제하여 동일 입력에 대해 항상 가장 확률이 높은 단일 경로를 선택하도록 고정했습니다. 아울러 `tool_choice`로 일반 텍스트 응답 통로를 원천 차단하여, 모델이 사족을 붙이거나 확률적 모험을 하지 않고 정해진 `route` 규격 내에서만 결정론적으로 결과를 반환하게 됩니다.

### 2) 화이트리스트 기반 안전 파싱

`src/features/conversation/queryRouter.ts`에서는 모델의 출력을 받아 사내 레지스트리와 대조합니다.

```typescript
// src/features/conversation/queryRouter.ts

const { text } = await routerRunner.runClaude({ prompt, cachePrefix, threadTs });
const parsed = JSON.parse(text); // 스키마가 보장되므로 안전하게 파싱

if (parsed?.kind === 'testfix') {
  // 모델이 지어낸 가짜 서비스명(환각)은 사내 화이트리스트로 필터링
  const service = typeof parsed.service === 'string' && effTestfixAliases.includes(parsed.service)
    ? parsed.service
    : undefined;
  return { kind: 'testfix', service, confidence: parsed.confidence };
}

if (parsed?.kind === 'deploydesk') {
  return { kind: 'deploydesk', service: parsed.service, date: parsed.date };
}
```

### 3) 멘션 핸들러에서의 Plan-Then-Execute 디스패치

`src/router/mentionHandler.ts`에서는 2단계 라우터의 의도를 전달받아 안전하게 분기합니다.

```typescript
// src/router/mentionHandler.ts

if (route.kind === 'deploydesk') {
  if (cfg.deployDesk?.enabled) {
    // 모델의 판단(deploydesk)을 바탕으로, 실제 인자는 결정적 파서가 원문에서 재검증
    const dd = parseDeployDeskRequest(userText, cfg.deployDesk.squads, todayKst, names);
    if (dd) return handleDeployStart(dd);
    
    await say('어느 스쿼드·서비스 배포인지 알려주세요. (예: `... 배포 서데 작성`)');
    return;
  }
}

if (route.kind === 'testfix') {
  const parsed = parseTestFailure(event.text, targets);
  if (parsed) return handleTestfixStart(parsed);
  return handleTestfixHint(...);
}

// 첨부파일은 실제로 대화나 코드 탐색이 필요한 시점에만 지연 로딩
async function runChat() {
  const attachments = await getAttachments(); // Lazy Download
  await svc.chat({ ... , attachments });
}
```

## 마무리

지금까지 사내 슬랙봇 흰둥이를 운영하며 겪은 라우팅 오분류의 원인과, 이를 해결하기 위해  2단계 시맨틱 라우터로 전환한 과정을 살펴보았습니다.

이번 작업을 진행하며  느낀 점은, \*\*무작정 모든 자율성을 에이전트에게 위임하는 것만이 정답은 아니다\*\*라는 사실이었습니다.

자율성이 높은 에이전트는 프로토타입 단계에서는 마법처럼 보이지만, 실제  환경의 비가역적 업무와 결합하는 순간 높은 실패율과 디버깅의 악몽으로 다가오기 쉽습니다. 반대로 너무 엄격한 정규식에 갇히면 사용자에게 끝없는 답답함을 안겨줍니다.

중요한 것은 코드가 제어해야 할 명확한 가드레일을 단단하게 세워두고, 모델이 가장 잘할 수 있는 영역에 한해 안전하게 판단을 맡기는 균형감각이라는 생각이 듭니다.

비슷한 고민을 하고 계신  분들께 이 글이 조금이나마 도움이 되었으면 합니다.

---

**참고 자료**

- Anthropic, *Building Effective Agents* (2024)
- OpenAI, *Practices for Governing Agentic AI Systems* (2024)
- Andrew Ng, *Agentic Design Patterns Part 1-4* (2024)
- *Generative AI Design Patterns: Solutions to Common Challenges when Building GenAI Agents and Applications* (2025)

