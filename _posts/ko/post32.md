---
title: "Swagger의 사실과 오해: API-First Development"
date: "2025-12-01"
section: tech
tags: "API"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fgw6ikg1xqngndmdycax5.png"
---

개발에서 가장 중요하게 생각하는것 중 하나는 '인터페이스'입니다.
인터페이스를 잘 정의하는 것은 시스템의 일관성과 확장성을 보장하고 변화에 유연하게 대응할 수 있는 기반이 되어줍니다.

새로운 API를 개발할때 가장 먼저 마주하게 되는 인터페이스는 바로 API 명세인데요. API 명세를 잘 정의하기 위해서는 프론트엔드 개발자와 백엔드 개발자간의 효율적인 소통이 필수적입니다.

그렇다면 어떻게 해야 효율적으로 API 명세에 대해 소통할 수 있을까요?
저의 경우, 컨플루언스나 지라 티켓에 API 명세를 작성하거나 임의의 Controller를 구현한 Mock API를 개발환경에 배포한 뒤 Swagger 문서를 공유하는 방식으로 프론트와 소통하였는데요.

이러한 소통 방식은 평소에는 문제가 없지만 짧은 개발 일정 속에 제공해야할 API 수가 많을 경우, 문서와 실제 API가 불일치하거나 다른 작업의 영향으로 인해 빠르게 Mock API를 개발 환경에 제공하지 못하는 상황이 발생했습니다.

## 무엇이 문제인가

문제의 근본적인 원인은 Swagger를 단순히 코드 작성 후 자동으로 문서를 생성해주는 도구로만 생각하고 사용했기 때문입니다. 즉, 코드를 작성해야 Swagger 문서가 만들어지다 보니 API 디자인과 소통이 **Code-First** 방식으로 진행되었습니다.

코드와 동기화된 Swagger 문서는 서버가 배포된 이후에 갱신되기 때문에 API 논의 시점에 딜레이가 발생합니다. 이러한 딜레이를 해결하기 위해 별도의 문서를 만들어 공유해야 했습니다. 하지만 작성자마다 문서 포맷과 표현 방식이 달라 일관성을 유지하기 어려웠습니다. 뿐만 아니라 Swagger 문서가 생성되고 나서는 제대로 관리되지 않았기 때문에 신뢰할 수 없는 문서가 되어갔습니다.

결국 API 소통을 위해서는 코드보다 먼저 문서가 선행되어야 합니다. 이러한 접근 방식을 실현하기 위해 등장한 것이 바로 OpenAPI Specification을 활용한 **API-First** 개발 방식입니다.

## OpenAPI Specification이란?

OpenAPI Specification(OAS)에 대해 알아보기 전에 OAS가 어떠한 문제를 해결하기 위해 등장한 기술인지 먼저 알아보도록 하겠습니다.

사실 OAS의 기원은 Swagger에서 시작되었습니다. 

> The Swagger API project was created in 2011 by Tony Tam, technical co-founder of the dictionary site Wordnik. During the development of Wordnik's products, the need for automation of API documentation and client SDK generation became a major source of frustration. Tam designed a simple JSON representation of the API...
https://en.wikipedia.org/wiki/Swagger_(software)

Swagger의 시작점은 단순한 문서 자동화 툴이 아니었습니다. 2010년대 초, 온라인 사전 서비스 Wordnik를 개발하던 Tony Tam은 API 문서화와 클라이언트 SDK 반복 생성에 점점 지쳐가던 중, “API의 동작을 사람이 아닌 명세(specification)로 정의할 수 있다면 서버와 클라이언트가 동일한 계약을 공유할 수 있지 않을까?”라는 질문에서 Swagger를 고안하게 되었습니다.

Tony Tam은 API를 간결하게 JSON(YAML)으로 기술하는 방식을 설계했고, "코드보다 먼저 계약을 정의하자"라는 단순하지만 강력한 철학을 내세웠습니다. Swagger 명세는 단순한 문서 형식을 넘어, API의 요청-응답 구조와 스키마, 보안, 상태 코드 등 동작의 규약을 포괄하는 '계약(contract)' 그 자체를 기술하는 수단이었습니다. 즉, Swagger의 본래 목적은 API-First(Contract-First) 개발 문화의 정착에 있었던 셈입니다. 

실제로 많은 개발자가 말하는 Swagger는 Swagger 그 자체가 아니라 Spring 진영에서 구현된 Springdoc 혹은 Springfox 라이브러리 입니다. 

```gradle
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0'
    implementation 'io.springfox:springfox-boot-starter:3.0.0'
}
```

Springdoc은 코드에 `@Tag`, `@Operation` 같은 어노테이션을 붙이면 자동으로 Swagger 형식의 JSON 혹은 YAML 명세를 생성해주는 도구입니다. 명세를 작성하는 게 아니라 코드로부터 명세를 추출하는 Code-First 접근인 것입니다.

Code-First 접근의 가장 큰 한계는 명세와 실제 구현 사이의 신뢰가 무너진다는 점입니다. 명세는 항상 이미 작성된 코드를 전제로 생성되기 때문에, 변화가 생길 때마다 명세가 뒤처지게 마련입니다.

반면 API-First 방식은 명세가 먼저 존재하고, 구현은 그 계약을 이행하는 수단일 뿐입니다. API의 요청 구조, 응답 형식, 각종 제약 조건과 오류 모델까지 우선적으로 합의한 뒤, 서버와 클라이언트가 명세를 기준으로 각자 코드를 작성하거나 검증합니다. 이 때 명세서는 단순한 문서가 아니라, 팀 간 신뢰를 담은 실행 가능한 계약이 됩니다.

## OAS를 통한 API-First 실천

이제 API-First 방식을 적용해서 간단한 게시판 서비스를 만들어보겠습니다.

먼저 API 명세를 관리할 별도의 GitHub 저장소를 생성합니다. 클라이언트와 서버 개발자는 각자의 프로젝트에 이 저장소를 서브모듈로 추가해 동일한 명세를 공유하고 효율적으로 관리할 수 있습니다.

### Git 서브모듈 추가 방법

각자의 레포지토리에서 아래 명령어로 서브모듈을 추가합니다.

```bash
git submodule add https://github.com/headF1rst/simple-dash-board-oas.git contract
```

여기서 `contract`는 서브모듈이 생성될 디렉터리 이름입니다. 명령어 실행 후 프로젝트 안에 서브모듈이 정상적으로 추가된 것을 확인할 수 있습니다.

![sub module git](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/bpkoy7z9kr7nav1cj2q0.png)

API 명세 작성은 서비스의 전역 정보를 담는 메인 진입점 파일인 `openapi.yaml` 부터 시작합니다.

**openapi.yaml**

```yaml
openapi: 3.0.0
info:
  title: Simple Dashboard API
  description: 게시판 서비스 API
  version: 1.0.0
servers:
  - url: 'https://api.simpledashboard.com'
    description: Production server
  - url: 'http://localhost:8080'
    description: Local development server

paths:
  # 게시글 목록 조회 및 생성 엔드포인트
  /v1/articles:
    $ref: './paths/articles.yaml'
    # 특정 게시글 조회, 수정, 삭제 엔드포인트
  /v1/articles/{id}:
    $ref: './paths/articles-by-id.yaml'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

`$ref` 키워드를 사용해 다른 위치의 스키마 파일을 참조할 수 있습니다. 이를 통해서 진입점 역할을 하는 `openapi.yaml` 파일이 지나치게 비대해지는 것을 막고, 하나의 정의를 여러 곳에서 재사용할 수 있습니다.

`./paths` 디렉터리 하위에 게시글 목록 API 명세를 별도의 YAML 파일로 분리해 관리해 주었습니다.

**articles.yaml**

```yaml
# GET/POST /v1/articles
get:
  summary: 게시글 목록 조회
  description: 게시글 목록을 조회합니다. 페이징을 지원합니다.
  operationId: listArticles
  tags:
    - Article
  parameters:
    - $ref: '../components/parameters/BoardIdQuery.yaml'
    - $ref: '../components/parameters/WriterIdQuery.yaml'
    - $ref: '../components/parameters/PageQuery.yaml'
    - $ref: '../components/parameters/SizeQuery.yaml'
    - $ref: '../components/parameters/SortQuery.yaml'
  responses:
    '200':
      description: 조회 성공
      content:
        application/json:
          schema:
            $ref: '../components/schemas/ArticleListResponse.yaml'
    '400':
      $ref: '../components/responses/400BadRequest.yaml'
    '500':
      $ref: '../components/responses/500ServerError.yaml'

post:
  summary: 새로운 게시글 생성
  operationId: createArticle
  tags:
    - Article
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../components/schemas/ArticleCreateRequest.yaml'
  responses:
    '201':
      description: 생성 성공
      content:
        application/json:
          schema:
            $ref: '../components/schemas/ArticleResponse.yaml'
    '400':
      $ref: '../components/responses/400BadRequest.yaml'
```

전체 디랙토리 구조는 다음과 같습니다.

```text
contract/
├── openapi.yaml                      # 메인 진입점 (다른 파일들을 $ref로 참조)
├── paths/                            # API 엔드포인트 정의
│   ├── articles.yaml                 # GET/POST /v1/articles
│   └── articles-by-id.yaml           # GET/PUT/DELETE /v1/articles/{id}
├── components/
│   ├── schemas/                      # 데이터 모델 (DTO)
│   ├── parameters/                   # 공통 파라미터
│   ├── responses/                    # 공통 응답
│   └── examples/                     # 예제 데이터
├── openapi-templates/spring/         # 커스텀 Mustache 템플릿
│   ├── api.mustache                  # API 인터페이스 템플릿
│   ├── generatedAnnotation.mustache  # @Generated 제거용
│   └── licenseInfo.mustache          # 라이선스 헤더
└── build.gradle                      # OpenAPI Generator 설정
```

yaml 파일을 작성할 때는 IntelliJ Plugin인 [OpenAPI Specifications](https://plugins.jetbrains.com/plugin/14394-openapi-specifications)이나 [Swagger Editor](https://editor.swagger.io/)를 활용하면 즉각적인 피드백을 받을 수 있어, 명세 작성과 검증을 훨씬 수월하게 진행할 수 있습니다.

![openapi specification plugin](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/5ook4h6nva8pr7po2n78.png)

### OpenAPI Generator 인터페이스 자동 생성

OpenAPI Generator를 사용하면 애플리케이션 빌드 시점에, yaml로 정의한 API 명세를 기반으로 인터페이스를 자동 생성할 수 있습니다. 이렇게 생성된 인터페이스를 기반으로 Controller 구현체를 작성하면, “코드로부터 명세를 생성하는 방식”이 아니라 “명세로부터 코드를 생성하는 방식”으로 개발할 수 있습니다.

먼저 OpenAPI Generator를 사용하기 위한 Gradle 설정을 추가합니다.

**build.gradle**

```
plugins {
    id 'org.openapi.generator' version '7.17.0' apply false
}
```

**build.gradle (:contract)**

```gradle
apply plugin: 'org.openapi.generator'

openApiGenerate {
    generatorName = 'spring'
    
    // 입력 스펙 경로 (번들링된 파일 사용)
    inputSpec = layout.buildDirectory.file("openapi.bundle.yaml").get().asFile.absolutePath
    
    // 출력 경로
    outputDir = layout.buildDirectory.dir("generated/openapi").get().asFile.absolutePath
    
    // 커스텀 Mustache 템플릿 디렉터리
    templateDir = "$projectDir/openapi-templates/spring"
    
    // 패키지 설정
    apiPackage = 'simple.board.contract.api'
    modelPackage = 'simple.board.contract.model'
    
    // API/Model 파일만 생성 (supporting 파일 제외)
    globalProperties = [
        apis           : '',
        models         : '',
        supportingFiles: ''
    ]
    
    // 코드 생성 옵션
    configOptions = [
        interfaceOnly          : 'true',   // 인터페이스만 생성 (구현체 X)
        useTags                : 'true',   // 태그 기반 API 분리
        addGeneratedAnnotation : 'false',  // @Generated 어노테이션 제거
        dateLibrary            : 'java8',  // java.time.* 사용
        serializableModel      : 'true',   // 모델 직렬화 가능
        documentationProvider  : 'none',   // Swagger/SpringDoc 어노테이션 제거
        useBeanValidation      : 'true',   // Bean Validation 사용
        useJakartaEe           : 'true',   // Jakarta EE 사용 (javax → jakarta)
        skipDefaultInterface   : 'true',    // default 메서드 본문 제거
        useSpringBoot3         : 'true'
    ]
}

// 이 모듈은 라이브러리이므로 bootJar 비활성화
tasks.named('bootJar') { enabled = false }
tasks.named('jar') { enabled = true }

// 생성된 소스를 컴파일에 포함
sourceSets {
    main {
        java {
            srcDir layout.buildDirectory.dir("generated/openapi/src/main/java").get().asFile
        }
    }
}

// 컴파일 전에 코드 생성 실행
tasks.named('compileJava') {
    dependsOn tasks.named('openApiGenerate')
}

// OpenAPI 스펙 번들링 태스크
// $ref로 분리된 YAML 파일들을 build 디렉터리로 복사하여 참조 해소
tasks.register('bundleOpenApi') {
    group = 'openapi'
    description = 'Prepare OpenAPI spec files for code generation'
    
    inputs.file("$projectDir/openapi.yaml")
    inputs.dir("$projectDir/paths")
    inputs.dir("$projectDir/components")
    
    outputs.file(layout.buildDirectory.file("openapi.bundle.yaml"))
    outputs.dir(layout.buildDirectory.dir("paths"))
    outputs.dir(layout.buildDirectory.dir("components"))
    
    doLast {
        copy {
            from "$projectDir/openapi.yaml"
            into layout.buildDirectory.get().asFile
            rename { 'openapi.bundle.yaml' }
        }
        if (file("$projectDir/paths").exists()) {
            copy {
                from "$projectDir/paths"
                into layout.buildDirectory.dir("paths").get().asFile
            }
        }
        if (file("$projectDir/components").exists()) {
            copy {
                from "$projectDir/components"
                into layout.buildDirectory.dir("components").get().asFile
            }
        }
    }
}

// 코드 생성 태스크 설정
tasks.named('openApiGenerate') {
    dependsOn tasks.named('bundleOpenApi')
    
    // 불필요한 생성 파일 삭제
    doLast {
        delete layout.buildDirectory.file("generated/openapi/README.md").get().asFile
        delete layout.buildDirectory.file("generated/openapi/.openapi-generator").get().asFile
    }
}

dependencies {
    // 생성된 코드의 컴파일 의존성 (런타임은 소비 모듈에서 제공)
    compileOnly 'org.springframework:spring-web'
    compileOnly 'jakarta.validation:jakarta.validation-api'
    compileOnly 'com.fasterxml.jackson.core:jackson-annotations'
    compileOnly 'org.openapitools:jackson-databind-nullable:0.2.6'
}
```

빌드를 실행하면 아래와 같이 API 인터페이스와 스펙 기반의 모델 객체가 자동으로 생성된 것을 확인할 수 있습니다.

![Spec](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/8c88yzs7f9d64ppz8ttv.png)

## 커스텀 Mustache 템플릿

OpenAPI Generator가 생성한 API 인터페이스를 확인해보면, 저희의 관심사와는 거리가 먼 다양한 보일러플레이트 코드가 함께 생성되어 다소 장황하게 느껴질 수 있습니다.

![Boilerplate](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/dv5rkf83nbofpon44mxm.png)

Mustache 템플릿을 직접 커스터마이징하면, 프로젝트 상황에 맞춰 생성 코드를 한층 더 최적화할 수 있습니다.

Mustache는 다양한 프로그래밍 언어를 지원하는 Logic-less 템플릿 엔진으로, 복잡한 로직을 최소화하고 간단한 조건문과 반복문만을 지원합니다. 이러한 특성 덕분에 데이터 표현에만 집중할 수 있으며, View와 서버 로직이 명확하게 분리되어 코드가 단순하고 가독성이 높아집니다. OpenAPI Generator는 기본적으로 Mustache 템플릿을 사용해 코드를 생성하기 때문에, 이 템플릿을 직접 수정하여 생성 결과물을 원하는 형태로 제어할 수 있습니다.

다음과 같이 mustache로 불필요한 보일러플레이트를 제거하거나 프로젝트에 필요한 커스텀 어노테이션과 메서드를 추가할 수 있습니다.

```mustache
package {{package}};

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
{{#useBeanValidation}}
import jakarta.validation.Valid;
{{/useBeanValidation}}
import {{modelPackage}}.*;

/**
 * {{classname}} - API interface
 */
public interface {{classname}} {
{{#operations}}
{{#operation}}

    @RequestMapping(method = RequestMethod.{{httpMethod}}, value = "{{{path}}}")
    ResponseEntity<{{#returnType}}{{returnType}}{{/returnType}}{{^returnType}}Object{{/returnType}}> {{operationId}}({{#allParams}}{{^-first}}
            {{/-first}}{{#isPathParam}}@PathVariable("{{baseName}}") {{/isPathParam}}{{#isQueryParam}}@RequestParam(value = "{{baseName}}", required = {{required}}) {{/isQueryParam}}{{#isHeaderParam}}@RequestHeader(value = "{{baseName}}", required = {{required}}) {{/isHeaderParam}}{{#isBodyParam}}{{#useBeanValidation}}@Valid {{/useBeanValidation}}@RequestBody {{/isBodyParam}}{{dataType}} {{paramName}}{{^-last}},{{/-last}}{{/allParams}});
{{/operation}}
{{/operations}}
}
```

장황했던 `ArticleApi` 인터페이스가 간결하게 개선된 것을 볼 수 있습니다.

![Article Api](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/5bu0pl719fxbyfw1acfs.png)

## 마무리

지금까지 API-First 방식으로 OpenAPI Specification을 활용한 효율적인 API 개발 프로세스에 대해 알아보았습니다. Git 서브 모듈을 통해 명세를 공유하고, OpenAPI Generator로 백엔드 인터페이스를 자동 생성하며, Mustache 템플릿을 커스터마이징하여 프로젝트에 최적화하는 방법까지 살펴보았습니다.

이러한 접근 방식의 진정한 가치는 프론트엔드 개발자와의 협업에서 더욱 빛을 발합니다. OpenAPI 명세를 공유하면 프론트엔드에서도 `typescript-axios`나 `typescript-fetch` 같은 Generator를 사용해 API 호출 코드와 타입을 자동으로 생성할 수 있습니다.

더 나아가 Prism 같은 Mock 서버를 활용하면 백엔드 API 구현이 완료되기 전에도 프론트엔드에서 명세 기반의 Mock 테스트를 진행할 수 있어, 진정한 의미의 병렬 개발이 가능해집니다.

다만, API-First 방식이 도입 초기부터 즉각적인 생산성 향상을 가져다주진 않을 것으로 생각됩니다. OpenAPI Specification 문법에 익숙해지는 과정, YAML 파일 구조화 방법, 그리고 Mustache 템플릿 커스터마이징까지 생각보다 학습 곡선이 가팔랐습니다. 

무엇보다 아직 OpenAPI Specification 관련 라이브러리들이 전반적으로 미성숙하다는 느낌을 받았습니다. 자잘한 버그들이 존재했고, 이를 해결하는 과정에서 생각보다 많은 시간이 소비되었습니다.

하지만 이러한 초기 투자는 장기적으로 충분한 가치가 있다고 생각합니다. OpenAPI Specification이 단일 진실 공급원이 되면 "문서와 실제 동작이 다르다", "이 필드가 필수인지 선택인지 모르겠다"라는 식의 불필요한 오해와 소통 비용이 사라지고, 팀 전체가 동일한 명세를 기준으로 대화할 수 있게 될 것이라 생각합니다.
