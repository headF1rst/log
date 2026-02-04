---
title: "10억 달러짜리 실수 해결하기: JSpecify와 NullAway를 사용한 최신 Java Null 안전성"
date: "2025-09-24"
section: tech
tags: "JSpecify"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Ftotx4mdagz9nsegld5mr.png"
description: "JSpecify 어노테이션과 NullAway 정적 분석을 사용하여 현대 Java 애플리케이션에서 NullPointerException을 제거하는 방법 학습"
searchKeywords: "JSpecify, NullAway, Java null 안전성, NullPointerException 방지, 정적 분석"
translationSlug: "post9"
---

자바 프로그래밍을 처음 시작한 개발자부터 20년 경력의 시니어 개발자까지, 경력을 불문하고 개발자들이 가장 자주 마주치는 에러는 **NullPointerException**일 것입니다.

![Top Crash Reasons](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/v82uppsp39zvfkuuwr1m.png)

실제로 한 통계 자료에 따르면 NullPointerException이 소프트웨어 결함 통계 2위에 해당할 정도로 많은 개발자가 NPE로 고통받고 있다고 하는데요.

"Null 참조를 만든 건 나의 10억 달러짜리 실수다"라고 [토니 호어(Tony Hoare)](https://news.ycombinator.com/item?id=12427069)의 말도 너무 유명하죠.

> "I call it my billion-dollar mistake. It was the invention of the null reference in 1965. … This has led to innumerable errors, vulnerabilities, and system crashes, which have probably caused a billion dollars of pain and damage in the last forty years."

이러한 null 안전성을 높이기 위해 Java에서는 다양한 시도들이 있었고, `Optional`, JSR 305의 `@NonNull` 어노테이션을 거쳐, 마침내 **JSpecify**가 표준 어노테이션으로 제정되었습니다.

지금부터 JSpecify를 사용하여 어떻게 프로젝트에 안정성을 높일 수 있는지, 신규 프로젝트뿐만 아니라 기존 시스템에 도입하기에도 부담이 없을지에 대해 소개해 드리고자 합니다.

## NullPointerException: 왜 여전히 문제인가?

토큰을 추출하는 API를 호출하고, 그 결과를 아무런 확인 없이 사용하는 코드가 있습니다.

```java
// TokenExtractor.java
public interface TokenExtractor {
    String extractToken(String authorization);
}

// Main.java
TokenExtractor tokenExtractor = new DefaultTokenExtractor();
String token = tokenExtractor.extractToken("some-auth-header");
System.out.println("Token length: " + token.length()); // <-- NullPointerException 발생!
```

이 코드는 `extractToken` 메서드가 `null`을 반환할 가능성이 있을 때 `NullPointerException`을 발생시킵니다.

`extractToken` 메서드가 `null`을 반환하게 되면 `token`에 `null`값이 들어가고 `token.length()`로 `token` 값에 접근할 때 `NullPointerException`이 발생하게 됩니다.

이처럼 Java의 근본적인 문제는 Null 가능성(Nullability)이 암시적(implicit)이라는 점입니다.

API 문서에 명시되어 있지 않으면 개발자는 반환 값이 null일 수 있는지 아닌지 알기 어렵고, 이는 오해와 버그로 이어지게 됩니다.

## JSpecify: 명시적인 Null 안전성을 향한 표준

이 문제를 해결하기 위해 Google, JetBrains, Spring 등 여러 팀이 협력하여 JSpecify 표준을 만들었습니다.

JSpecify는 단순한 어노테이션 집합이 아니라, Null 안전성에 대한 명확한 명세를 제공하여 다양한 도구(IDE, 정적 분석기)가 일관되게 동작하도록 하는 것을 목표로 합니다.

JSpecify는 Null 가능성을 세 가지 상태로 정의합니다.

1. **미지정(Unspecified)**: Java의 기본 상태로, `null`일 수도 아닐 수도 있습니다.
2. **Nullable (@Nullable)**: 명시적으로 `null` 값을 가질 수 있음을 나타냅니다.
3. **Non-null (@NonNull)**: 절대 `null` 값을 가지지 않음을 보장합니다.

![JSpecify Null](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qp2g74jw6udz7f0x9nbf.png)

### JSpecify 의존성 추가

```gradle
implementation 'org.jspecify:jspecify:1.0.0'
```

이제 `TokenExtractor` 인터페이스에 어노테이션을 추가하여 Null 가능성을 명시할 수 있습니다.

```java
import org.jspecify.annotations.Nullable;

public interface TokenExtractor {
  
    @Nullable // 반환 값이 null일 수 있음을 명시
    String extractToken(String authorization);
}
```

이렇게 하면 IntelliJ IDEA와 같은 IDE는 `token.length()`를 호출하는 부분에서 잠재적인 `NullPointerException`을 경고해 주어, 개발자가 런타임 오류가 발생하기 전에 문제를 해결할 수 있게 도와줍니다.

![IntelliJ IDE Null](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/i34w3oga4na12thlupwp.png)

## 가독성 향상: `@NullMarked`로 기본값 설정하기

대부분의 경우(약 90%) API는 `null`이 아닌 값을 다룹니다. 모든 매개변수와 반환 값에 `@NonNull`을 붙이는 것은 귀찮은 일이며 코드를 지저분하게 만들고 자칫 가독성을 해칠 수 있습니다.

이를 해결하기 위해 JSpecify는 `@NullMarked` 어노테이션을 제공합니다.

`@NullMarked` 어노테이션을 패키지 수준(`package-info.java` 파일)에 적용하면 해당 패키지 내의 모든 타입은 기본적으로 Non-null로 간주됩니다.

```java
// src/main/java/com/example/package-info.java
@NullMarked
package com.example;

import org.jspecify.annotations.NullMarked;
```

이제 명시적으로 `@Nullable`을 붙인 경우를 제외하고는 모두 Non-null로 처리되므로 코드가 훨씬 깔끔하게 관리할 수 있습니다.

## 빌드 시간 검증: NullAway로 Null 안전성 강화하기

IDE의 경고는 유용하지만, 이를 무시하고 코드를 커밋하는 것을 막을 수는 없는데요.

Null 안전성을 강제하기 위해 [NullAway](https://github.com/uber/NullAway)와 같은 정적 분석 도구를 사용할 수 있습니다. `NullAway`는 Error Prone의 플러그인으로, 빌드 과정에서 JSpecify 어노테이션을 분석하여 Null 안전성 위반 시 빌드를 실패시킵니다.

Gradle에 다음과 같이 설정할 수 있습니다.

```gradle
plugins {
  id 'net.ltgt.errorprone' version '4.1.0'
}

dependencies {
    implementation 'org.jspecify:jspecify:1.0.0'
    
    errorprone "com.google.errorprone:error_prone_core:2.37.0"
    errorprone "com.uber.nullaway:nullaway:0.12.6"
}

tasks.withType(JavaCompile).configureEach {
    options.errorprone {
        disableAllChecks = true
        option("NullAway:OnlyNullMarked", "true")
        error("NullAway")
    }
}
```

IDE의 경고를 무시하고 빌드를 하면 다음과 같이 컴파일 시점에 에러가 발생하여 Null 안전성을 위반하는 코드가 배포되는 것을 막을 수 있습니다.

![build error](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/k82l826lqbmlzs5rclpu.png)

## Spring 생태계에서의 JSpecify

Spring Framework 7(Spring Boot 4에 포함)부터는 코드베이스 전체가 JSpecify 어노테이션으로 마이그레이션되었습니다. 이는 Spring 개발자들이 별도의 설정 없이도 Spring API의 Null 안전성 정보를 IDE와 빌드 도구에서 바로 활용할 수 있음을 의미합니다.

예를 들어, `RestClient`의 `.body()` 메서드는 `@Nullable String`을 반환하므로, 개발자는 반환 값이 `null`일 가능성을 인지하고 적절히 처리해야 합니다.

```java
// Spring의 RestClient API
@Nullable
String body = restClient.get().uri("/user").retrieve().body(String.class);

// IDE는 body가 null일 수 있음을 경고
System.out.println(body.length());
```

## 앞으로의 Java의 Null 안전성

장기적으로 Java 언어 자체에 Null 안전성 기능이 도입될 예정이라고 하는데요.

`?` (nullable)와 `!` (non-null) 같은 새로운 구문이 제안되었지만, Java의 하위 호환성 원칙 때문에 기본값은 여전히 "미지정(unspecified)"으로 남을 것이라고 합니다. [(https://openjdk.org/jeps/8303099)](https://openjdk.org/jeps/8303099)

하지만 어디까지나 제안 단계이고 이 기능이 현실화되기까지는 수년이 걸릴 것이므로, 현재로서는 JSpecify와 NullAway가 Java 애플리케이션의 안정성을 높이는 가장 현실적이고 강력한 방법입니다.

## 마무리

JSpecify와 NullAway는 Java의 "10억 달러짜리 실수"를 해결하기 위한 강력한 조합입니다. 명시적인 어노테이션을 통해 코드의 의도를 명확히 하고, IDE와 빌드 도구를 연동하여 컴파일 시간에 잠재적인 NullPointerException을 제거할 수 있습니다.

실제로 팀에 JSpecify를 공유하고 프로젝트에 적용하면서 느낀 경험에 비추어 볼때, 간단한 설정으로 애플리케이션 안정성과 코드 품질이 향상되는 것을 경험하였으며, 패키지 단위의 점진적 도입이 가능하기 때문에 기존 프로젝트에 적용하는 데 부담이 적다는 것 역시 큰 장점으로 느껴졌습니다.

이 글을 읽어주시는 분들께서도 JSpecify를 프로젝트에 적용하여 더 안전하고 견고한 코드를 작성해 보시기 바랍니다.
