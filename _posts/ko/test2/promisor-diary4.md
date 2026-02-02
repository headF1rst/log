---
title: CORS, 알고보니 우리편?
category:
thumbnail: https://user-images.githubusercontent.com/85024598/236966566-6127653c-7540-485e-859f-01240e7e7154.png
tags: 프로젝트
date: 2022-05-26 10:00
---

Server Side Template 방식이 아닌 프론트와 백으로 나눠서 API 통신을 하는
프로젝트의 경우, 열에 아홉은 만나게 되는게 바로 `CORS` 입니다.

아니나 다를까 현재 진행중인 프로젝트에서도 CORS 관련 이슈가 올라왔습니다.

![스크린샷 2022-05-25 오전 10.08.30.png](https://i.imgur.com/KQEVRRE.png)

오늘은 CORS 정책을 해결하는 과정과 CORS란 무엇인지 알아보도록 하겠습니다.

## Cross Origin Resource Sharing Policy

개발을 막 시작하시는 많은 분들이 CORS를 그저 번거로운 오류라고 생각하시지만 사실
CORS는 말 그대로 에러나 오류가 아닌 **하나의 보안 정책**입니다.

CORS 정책을 이해하기 위해서는 아래 3가지를 이해해야만 합니다.

- Origin
- SOP
- Access-Control-Allow-Origin

### 1. Origin

`Origin` : 요청이 시작된 서버의 위치

- `Client` : http://localhost:3000
- `Server` : http://localhost:8080

로컬에서 리엑트와 스프링 서버를 실행하였을때 둘은 각각 3000과 8080포트를 사용하게 됩니다. 포트번호가 다르기
때문에 이 둘의 **Cross Origin**이며 이로 인해서 CORS 에러가 발생하게 됩니다.

두 서버 IP의 Origin이 같다면 **Same Origin,** 다르면 **Cross
Origin** 이라고 하며, 아래의 3가지가 같아야 같은 Origin입니다.

- Schema
- HOST
- Port

![스크린샷 2022-05-25 오전 11.06.46.png](https://i.imgur.com/vc7T5r5.png)

**Cross Origin 예제**

```text
A. https://localhost:80
B. http://localhost:80
```

위의 A, B는 Host, Port는 동일하나 Schema 부분이 다릅니다. 즉, Cross Origin입니다.

```text
A. https://localhost
B. https://127.0.0.1
```

언뜻보면 localhost의 IP주소가 127.0.0.1이기 때문에 Same Origin 처럼 보입니다. 하지만 위 예제는 Cross Origin입니다.
브라우저 입장에서는 String-value를 서로 비교하기 때문에 다른 출처로 판단합니다.

**Same Origin 예제**

```text
A. http://localshot:80
B. http://localhost
```

위 예제는 Same Origin 입니다.
B의 경우 포트가 생략되어있지만 http의 기본 포트가 80이기 때문에 A, B는 동일 출처가
됩니다.

### 2. SOP

SOP (Same Origin Policy)은 동일한 출처의 Origin만 리소스를 공유할 수 있도록
하는 보안 정책입니다.

바로 이 SOP 때문에 CORS 문제를 마주하게 되지만 SOP 표준 덕분에 XSS, CSRF와 같은
보안상의 이슈를 막을 수 있습니다.

### 3. Access Control Allow Origin

앞서 SOP 정책에 의해서 Same Origin의 자원만 공유가 가능하는 것을 알아보았습니다. 하지만 웹에서 다른 리소스의 공유를 할 수 없다는건 말이 안되는 일입니다.
때문에 Access Control Allow Origin으로 Cross Origin에서도 자원 공유를
가능하게 할 수 있습니다.

## 그래서 Cross Origin에서 자원 요청은 어떻게 해야할까?

1\_ HTTP 통신 헤더인 Origin 헤더에 요청을 보내는 곳의 정보를 담고 서버로 요청을
보낸다.

2\_ 이후 서버는 Access Control Allow Origin 헤더에 허용된 Origin이라는
정보를 담아서 보낸다.

3\_ 클라이언트는 헤더의 값과 비교해 정상 응답임을 확인하고 지정된 요청을 보낸다.

4\_ 서버는 요청을 수행하고 200 상태를 응답한다.

## Spring Boot 프로젝트에서 CORS 해결하기

Preflight 요청에서 적절한 Access Control을 위한 해결 방법에는 3가지가 있습니다.

- `CorsFilter` 생성하여 직접 response에 header를 넣어주기
- Controller단에서 `@CrossOrigin` 어노테이션 추가하기
- `WebMvcConfigurer` 를 상속받는 설정 파일 생성하여 설정 추가하기

CorsFilter를 생성하는 방법의 경우, 필터를 생성하고 커스텀 하는게 번거로웠고
CrossOrigin 어노테이션을 사용하는 케이스는 설정해야하는 어노테이션이 많아진다는
단점이 있었습니다.

때문에 저는 WebMvcConfigurer를 상속받는 설정 파일을 생성하여 CORS를 해결하는
방법으로 테스크를 진행하였습니다.

### Configuration으로 해결하기

![스크린샷 2022-05-25 오후 12.55.02.png](https://i.imgur.com/hlj97Tq.png)

`WebMvcConfigurer` 인터페이스를 상속받는 `WebConfig` 클래스를 생성해주었습니다.
그 다음, WebMvcConfigurer 인터페이스의 `addCorsMappings` 메서드를 구현해
주었습니다.

**registry.addMapping** 메서드

registry.addMapping 메서드를 이용해서 CORS를 적용할 URL 패턴을 정의해
주었습니다. Ant-style도 지원하지만 저는 `"/**"` 와일드 카드를 사용하였습니다.

**allowedOrigins 메서드**

allowedOrigins 메서드를 사용해서 자원 공유를 허락할 Origin을 지정하였습니다. “\*”로 모든 Origin을 허락해 주었습니다.
그 밖에도 다음과 같이 한번에 여러 Origin을 설정할 수도 있습니다.

```java
.allowedOrigins("http://localhost:8080", "http://localhost:8081");
```

**allowedMethods**

allowedMethods를 이용하면 허용할 http method를 지정할 수 있습니다. “\*”를 이용하여 모든 http method를 허용할 수 있습니다.

**maxAge**

maxAge 메서드를 이용하여 원하는 시간만큼 preFlight request를 캐싱 해 둘 수
있습니다.

**Default 값**

- allow all origins
- allow GET, HEAD, POST
- allow all headers
- Set max age to 1800 seconds (30분)

## Nginx에서의 CORS 설정

위의 CORS 관련 설정을 했음에도 또 다시 CORS 에러가 발생하여
어려움을 겪었습니다.

기존과 달라진 점이라면 CORS 이슈가 발생하는 경우도 있고 그렇지
않을 때도 있었다는 점이었습니다.

이는 서버 자체에서 받아들일 파일의 사이즈를 설정하는 nginx의
`client_max_body` 값이 너무 낮게 설정되어있었기
때문이었습니다.

다음과 같이 nginx.conf 파일 혹은 default 파일 내부에
`client_max_body` 를 추가해준 다음 nginx를 재실행하여
문제를 해결하였습니다.

![스크린샷 2022-05-25 오후 12.55.02.png](https://i.imgur.com/9lbV5wg.png)
