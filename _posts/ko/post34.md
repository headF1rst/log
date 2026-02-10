---
title: "AI 브라우저를 활용한 PR 메세지 자동화"
date: "2025-12-14"
section: tech
tags: "AI"
thumbnail: "https://i.imgur.com/iJY5NAV.png"
---

Claude Code, Codex 같은 코딩 에이전트의 등장으로 개발 속도는 빨라졌지만, 그만큼 PR 리뷰에 드는 시간은 이전보다 91% 증가했다고 합니다.
저 역시 예전보다 더 많은 시간을 코드 리뷰에 할애하고 있는데요. 리뷰어로서의 피로를 체감하는 만큼, 제가 올리는 PR만큼은 최대한 이해하기 쉽게 작성하려 노력합니다.

하지만 막상 PR을 작성하다 보면, 코드의 의도를 명확히 전달하고 필요한 정보를 잘 정리된 글로 풀어내는 일이 생각보다 많은 시간과 에너지를 소모합니다.
최근 Copilot이나 IntelliJ AI 같은 도구들이 PR 작성을 돕고 있지만, 여전히 '2%' 정도의 아쉬움이 남습니다. 오늘은 그 부족한 2%를 채워주는, 리뷰어와 작성자 모두에게 도움이 되는 PR 자동화 워크플로우를 소개하려 합니다.

## 1. 좋은 Pull Request 란?

기술적인 자동화를 논하기 전에, 우리가 작성해야 할 '좋은 PR'의 정의부터 명확히 해야 합니다.

좋은 PR의 핵심은 **리뷰어에 대한 공감**입니다. 리뷰어는 바쁜 시간을 쪼개서 코드를 봅니다. 리뷰어의 시간을 아껴주고, 코드의 의도를 명확하게 전달하는것이 PR의 가장 중요한 목표입니다.

### 좋은 PR의 구성요소

1.  **명확한 맥락:** 단순히 코드가 '무엇'이 변했는지는 diff만 봐도 알 수 있습니다. 중요한 것은 '**왜 이 변경이 필요했는가**'입니다.
2. **직관적 시각 자료:** 백 마디 말보다 한 장의 스크린샷이나 다이어그램이 훨씬 빠른 이해를 돕습니다.
3. **작고 집중된 단위:** 하나의 PR은 하나의 이슈만 다루어야 리뷰와 병합의 리스크가 줄어듭니다.

코드 리뷰를 하는 이유 중 하나는 팀원 간의 작업 방향 정렬과 개발 과정에서의 실수 방지입니다.

작업 배경을 상세히 기술하면 리뷰어는 단순히 코드 변경사항만 보는 것이 아니라, 왜 이런 변경이 필요했는지 맥락을 이해할 수 있습니다. 이러한 컨텍스트 공유는 리뷰어가 더 넓은 시야에서 코드를 바라볼 수 있게 하여, 단순 문법적 오류나 컨벤션 위반을 넘어 아키텍처적 개선점, 잠재적 사이드 이펙트, 대안적 접근 방식 등 다양한 관점의 피드백을 제공할 수 있게 됩니다.

결과적으로 배경 설명이 잘 된 PR은 리뷰의 질을 높이고, 팀 전체의 도메인 지식과 시스템 이해도를 향상시키는 효과적인 지식 공유의 수단이 됩니다.

## 2. 현재 AI Assistant의 한계: '맥락'의 부재

최근의 생성형 AI 도구들(GitHub Copilot, IntelliJ AI 등)은 코드 변경 사항(Diff)을 요약하는 데 탁월한 능력을 보여줍니다. 버튼 하나만 누르면 아래와 같은 요약을 순식간에 만들어냅니다.

> Copilot Agent가 생성한 PR

```text
## 개요
- 이미지 업로드 및 변환 기능 개선
- 업로드/변환 로직 통합 및 테스트 코드 정비

## 작업사항
- 이미지 업로드/변환 관련 파일 리팩토링
- S3 업로드 로직 개선
- 테스트 코드 및 샘플 이미지 추가/이동

## 기타 참고사항
- 주요 변경점: 이미지 업로드/변환 기능이 통합되어 유지보수성 향상
```

그러나 AI가 만든 PR 메시지는 초안으로는 충분하지만, 작업의 배경까지는 담아내지 못해 코드 수정의 근본적인 이유를 파악하기 어렵다는 한계가 있습니다.

* **배경 정보 누락:** AI는 코드 자체만 보고 요약하므로, "사용자가 특정 상황에서 겪은 불편함"이나 "기획 의도" 같은 외부 맥락을 알지 못합니다.
* **근본적 이유 부재:** 코드를 '수정했다'는 사실은 알지만, '왜 수정해야만 했는지'에 대한 비즈니스적/기술적 배경은 설명하지 못합니다.

결국, 리뷰어가 가장 궁금해하는 **작업 배경**을 채우는 일은 여전히 사람의 몫으로 남게 됩니다. 그리고 배경을 간결하고 핵심적으로 정리하는 것은 PR 작성에서 가장 많은 시간을 잡아먹습니다.

이 과정을 AI가 대신할 수 있다면, 리뷰어에게 코드의 의도를 명확하게 전달하면서 PR 작성에 드는 시간을 크게 줄일 수 있을 것입니다.

## 3. Jira 티켓에서 맥락 가져오기

그렇다면 어디서 맥락을 가져올 수 있을까요? 저는 개발을 시작하기 전에 티켓에 해결하고자 하는 문제와 목표를 명확히 정의합니다.
티켓에는 작업을 한눈에 파악할 수 있도록 "무엇을", "왜" 하는지를 간결하게 담습니다. 예를 들어 "주문 취소 시 재고 복구 실패 이슈 수정"처럼 핵심 문제와 해결 방향을 제목에서부터 드러냅니다.

그 다음 작업의 배경과 목적을 상세히 기술합니다. 현재 어떤 문제가 발생하고 있는지(AS-IS), 왜 이 작업이 필요한지, 어떤 비즈니스 영향이 있는지를 구체적으로 작성하고, 작업을 통해 달성하고자 하는 상태(TO-BE)와 명확한 완료 기준을 함께 정의합니다.

"PR 쓰기도 귀찮은데 Jira까지 자세히 쓰라고요?"라고 반문하실 수 있습니다. 하지만 **문제 정의는 AI가 아닌 사람이 해야 할 영역**입니다. 티켓을 충실히 작성하면 다음과 같은 이점이 있습니다.

### 작업 전 Jira 티켓을 풍부하게 작성하면 좋은점

1. **명확한 목표 설정과 작업 집중**: "로그인 버그 수정"이라는 한 줄짜리 티켓은 '어떤 상황에서', '어떤 사용자가', '어떻게' 버그를 겪는지 알려주지 않습니다. 상세한 설명, 재현 방법, 기대 결과가 담긴 티켓은 내가 무엇을 해야 하는지 명확히 알려주어 불필요한 고민 없이 작업에만 집중하게 해줍니다.

2. **정확한 계획 수립과 예측 가능성 확보**: 티켓이 상세할수록 작업의 규모와 복잡도를 더 정확하게 예측할 수 있습니다.

3. **미래의 나를 위한 기록**: 몇 달 뒤 내가 작성한 코드를 다시 보게 될 때, Jira 티켓은 "내가 왜 이 코드를 이렇게 작성했더라?"에 대한 완벽한 답변이 되어 줍니다. 유지보수와 기능 확장이 훨씬 쉬워집니다.

## 4. AI 브라우저로 워크플로우 완성하기

우리의 목표는 **PR 작성에 드는 시간과 노력을 최소화하면서, 퀄리티는 극대화하는 것**입니다. 이를 위해 AI 브라우저인 Commet(혹은 Dia)의 기능을 활용할 수 있습니다.

Commet은 단순한 브라우징을 넘어, 사용자가 자주 사용하는 프롬프트를 **Shotcuts** 형태로 저장하고 `/Shotcuts`로 호출할 수 있는 기능을 제공합니다. 이를 통해 매번 긴 프롬프트를 작성할 필요 없이, Jira의 문맥과 코드 변경 사항을 결합할 수 있습니다.

### 자동화 워크플로우

1.  **Jira 티켓 작성:** 작업 전, 이슈의 배경(Why)과 해결 방안(What)을 Jira에 명확히 기록합니다.

2. **Commet Shortcuts 등록:** Commet 브라우저에 PR 자동 생성을 위한 Shortcuts를 등록해줍니다.
![shortcuts](https://i.imgur.com/2CaLzN0.png)

3. PR 수정 화면에서 Commet의 사이드 패널을 열고 미리 등록해 둔 **PR 작성 Shortcuts**을 호출
합니다.

이렇게 하면 AI는 Jira에서 **작업의 의도(Why)** 를 가져오고, Git Diff에서 **구현 내용(What)** 을 가져와 PR 메시지를 생성해 줍니다.

## PR 자동 생성에 사용한 프롬프트

마지막으로 PR 자동 생성에 사용한 프롬프트를 공유드리며 글을 마무리하도록 하겠습니다.

```text
You are an experienced software engineer skilled at writing clear and structured Pull Request descriptions.
Your primary goal is to generate a PR message that **strictly adheres to our team's conventions** based on the given Jira ticket and PR details.

Reference the branch information from this page, and open the related Jira ticket starting with "ABCD" to utilize the context written within it for crafting the Pull Request description.
Access the Jira board through the link below, then search for and open the corresponding ABCD ticket.

Jira 보드 링크:  
`https://jiraboard.atlassian.net/jira/software/c/projects`

**Write the PR message in Korean.**

---

### PR Message Template to Follow

## 내용 요약
*Write a concise summary based on the Jira ticket and PR information.*
First, explain the **background and purpose (Why)** of this change,
then organize the **specific changes (What, How)** in bullet points.

To explain the relationships, roles, and interactions between classes or key components in this document,
render a `mermaid` diagram inside a code block.
The diagram should focus on the changes and newly added parts in the document.

---

## 참고 링크
- Jira: [Insert Jira URL here]
- Related docs: [Optional]

---

## 읽기 좋은 진입점
*Based on the PR details, list the key entry files (Controller, Consumer, etc.) that are best to review first.*

---

## 리뷰어에게
*Briefly explain complex logic, trade-offs, or areas you'd like reviewers to focus on.*
Write at a high level, not overly detailed.
```
