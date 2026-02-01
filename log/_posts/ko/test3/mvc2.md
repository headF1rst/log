---
title: 어노테이션 기반 MVC로 리팩터링하기 - MVC 2편
category:
thumbnail: https://i.imgur.com/b9vvtK7.png
tags: Spring
date: 2022-10-17 10:00
---

이번 포스트에서는 [이전 포스트](https://headf1rst.github.io/TIL/mvc1)에서 구현한 MVC 프레임워크를 
어노테이션 기반의 MVC로 점진적으로 리팩토링해 나가는 과정에 대해서 다뤄보도록 하겠다.

## 1. 불편함을 감지하기

![스크린샷 2022-08-21 오후 12.54.25.png](https://i.imgur.com/0xMJSgT.png)

지금까지 구현된 MVC 프레임워크는 기능을 추가할 때 마다 Controller 인터페이스를 구현하는 새로운 클래스를 구현하고 mappings에 추가해야 한다. 
또한 HTTP 메서드와 URI가 매핑되어있지 않기 때문에 메서드만 다른 동일 URI를 구분하는것이 불가능 했다.

예를 들어서 다음과 같이 HTTP 메서드만 다른 URI를 구분할 수 없다.

`Post /users` , `Get /users`

이 뿐만 아니라 구현된 컨트롤러의 `execute()` 메서드도 10줄이 넘어가는 경우가 거의 없다.

![스크린샷 2022-08-23 오전 2.57.12.png](https://i.imgur.com/Mzs6jXi.png)

관련된 여러 기능을 하나의 모듈 단위로 묶은 Controller를 구현할 수는 없을까?

`ListUserController`나 `LoginController`와 같이 기능 하나당 하나의 Controller를 추가하는 방식이 아닌, 사용자와 관련된 기능을 처리하는
`UserController`를 구현할 수 있다면 위에서 언급한 문제점들을 해결할 수 있을것이다.

어노테이션 기반의 MVC로 리팩토링을 마치고 난 뒤의 Controller는 다음과 같다. User 도메인에 관련된 모든 기능이 
UserController 객체에 존재하며 동일한 URI 더라도 메서드에 따라 구분되는 것을 볼 수 있다.

![스크린샷 2022-10-20 오후 5.38.33.png](https://i.imgur.com/e1zZaFK.png)

어노테이션 기반 MVC로 리팩토링함으로써 얻는 이점은 다음과 같다.

- 하나의 Controller에 관련 기능이 모두 존재하기 때문에 유지보수에 유리하다.
  - 기능마다 Controller를 생성해서 등록해야 하는 번거로움이 없다.
- @Controller를 설정해주는 것만으로 Controller를 등록할 수 있다.
  - mappings에 Controller를 등록할 필요없다.
- HTTP 메서드에 따른 URI 식별이 가능하다.

하지만 여기서 한가지 고민이 생긴다. 어떻게 하면 @Controller 어노테이션을 설정해주는 것 만으로 Controller를 등록할 수 있을까?

Reflections API를 사용하면 “특정한 어노테이션이 붙은 클래스인가?” 등을 확인 할 수 있다.
혹은 어노테이션에 추가로 제공된 정보를 바탕으로 추가적인 일을 처리하는 것 또한 가능하다.

Reflections을 활용해서 런타임에 동적으로 @Controller 어노테이션의 클래스 정보를 읽어오는 `ControllerScanner` 객체를 구현해 보도록 하자.

## 2. ControllerScanner

어노테이션 기반 MVC 구현에 필요한 핵심 요구사항은 다음과 같다.

- `@Controller` 어노테이션이 설정된 클래스 정보를 읽어와야 한다.
- `@Controller` 가 설정된 클래스 내에 `@RequestMapping` 이 설정된 메서드 정보를 읽어와야 한다.

이와 같은 책임을 `ControllerScanner` 객체를 구현하여 할당해 주었다.

![스크린샷 2022-10-20 오후 5.57.36.png](https://i.imgur.com/qZkw6bT.png)

ControllerScanner 객체의 생성자는 파라미터로 Object 타입의 가변인자를 넘겨받고 이를 통해서 필드값의 `Reflections` 객체를 초기화 한다.

`getControllers()` 메서드는 reflections의 `getTypesAnnotatedWith()` 메서드를 호출하여 basePackage 내에 @Controller 어노테이션이 
설정된 모든 클래스 메타 정보들을 조회해 온다.

[Reflections API](https://www.baeldung.com/reflections-library)에 대해 간략하게 알아보자면 다음과 같다.

- Reflections API란?

  프로그래머가 작성한 모든 클래스는 JVM의 클래스 로더가 클래스 정보를 읽어와서 해당 정보를 메모리에 저장해 놓는다. 
(클래스 정보 - 각 클래스가 어떠한 생성자, 메서드, 필드들을 포함하고 있는지 나타낸다)

    - 컴파일 시간이 아닌 **런타임에** 동적으로 특정 클래스의 정보를 추출할 수 있는 프로그래밍 기법.
    - 구체적인 클래스 타입을 알지 못하더라도 (**접근 제어자가 private 이더라도**) 해당 클래스의 메서드, 타입, 변수들에 접근할 수 있도록 해주는 
  Java API.

getControllers() 메서드가 `instantiateControllers()` 메서드를 호출하며 조회한 클래스들을 파라미터로 전달하여 인스턴스화 시키는 로직을 수행한다.

![스크린샷 2022-10-20 오후 11.58.46.png](https://i.imgur.com/20ccxTJ.png)

- `controllerClass.getConstructor().newInstance();`
    - public으로 선언되어 있으며 매개변수가 없는 생성자에 접근
    - newInstance()를 통해 객체 인스턴스를 생성한다.

생성된 객체의 인스턴스들은 HashMap 형태의 자료구조에 클래스 정보를 키값으로 하여 저장된다.

저장된 인스턴스들은 getControllers() 메서드에 의해 해당 메서드를 호출한 객체에게 전달되어 @Controller 어노테이션이 설정된 Controller 객체들을 특정 패키지내에서 전부 탐색 할 수 있다.

## 3. 레거시 MVC → @MVC

ControllerScanner를 구현하였으니 어노테이션 기반 매핑을 담당할 HandlerMapping 클래스를 추가적으로 구현한 뒤에 초기화해야 한다.

현재의 MVC 구조를 어노테이션 구조로 점진적으로 리팩로링 하기 위해서는 레거시 MVC와 어노테이션 MVC가 공존할 수 있는 환경을 구축해야만 했다.

![스크린샷 2022-10-20 오후 4.22.54.png](https://i.imgur.com/toNV1am.png)

기존의 `RequestMapping` 은 리팩토링 완료시까지 사용되어야 하고 새로운 어노테이션 기반의 `AnnotationHandlerMapping` 을 구현해야 했기 때문에 각 Mapping의 공통된 부분을 추상화한 인터페이스를 만들어 주었다.

![스크린샷 2022-10-20 오후 4.22.54.png](https://i.imgur.com/q8xpHuH.png)

![스크린샷 2022-10-20 오후 4.30.13.png](https://i.imgur.com/xknlOjm.png)

HandlerMapping의 구현체중 RequestMapping은 이전 포스트에서 살펴보았기 때문에 새로 구현한AnnotationHandlerMapping을 살펴보도록 하자.

## 4. AnnotationHandlerMapping

![스크린샷 2022-10-20 오후 5.18.52.png](https://i.imgur.com/L2mVoR5.png)

AnnotationHandlerMapping의 생성자는 파라미터로 가변인자를 전달 받으며 필드값인 `basePackage` 를 초기화 한다. 이 외에도 `HandlerKey` 와 `HandlerExecution` 을 각각 key-value 값으로 저장하는 `handlerExecutions` 멤버 변수를 알고있다.

## 4.1 AnnotationHandlerMapping의 메서드

AnnotationHandlerMapping 객체에 선언되어있는 메서드들을 하나씩 알아보도록 하자.

### 4.1.1 initMapping()

initMapping()은 서블릿 컨테이너가 DispatcherServlet의 init() 메서드를 호출하면서 init() 메서드 내에서 호출 된다.

![스크린샷 2022-10-20 오후 5.18.52.png](https://i.imgur.com/bF34OoX.png)

initMapping() 메서드는 `ControllerScanner` 객체를 생성하고 ControllerScanner의 `getControllers()` 메서드를 호출하여 basePackage 내에 @Controller 어노테이션이 설정된 모든 Controller 인스턴스를 조회해 온다.

그다음 `initHandlerExecution(controllers)` 를 호출하게 된다.

### 4.1.2 initHandlerExecution()

![스크린샷 2022-10-20 오후 11.07.27.png](https://i.imgur.com/rqTBUTB.png)

initHandlerExecution(controllers) 메서드는 가장 먼저 `getMethods(controllers)` 메서드를 호출하여

ControllerScanner를 통해 찾은 Controller 클래스의 메서드 중 `@RequestMapping` 어노테이션이 설정되어 있는 모든 메서드를 Reflections 라이브러리를 활용하여 찾는다.

![스크린샷 2022-10-20 오후 11.09.52.png](https://i.imgur.com/VqmEpzW.png)

그 다음 initHandlerExecution(controllers) 메서드는 반복문을 돌면서 다음의 작업을 수행한다.

- 앞서 getMethods로 찾은 메서드가 선언되어 있는 클래스의 정보를 반환한다.
- 반환된 클래스에 설정된 어노테이션 중 Controller 어노테이션 정보를 annotation 변수에 저장해 놓았다.
- addHandlerExecution() 메서드를 호출한다.

### 4.1.3 addHandlerExecution()

`addHandlerExecution()` 메서드는 @RequestMapping이 선언되어 있는 메서드가 속한 클래스의 인스턴스, 요청 URL 정보, 그리고 @RequestMapping이 설정된 메서드를 인자로 전달받아 `Map<HandlerKey, HandlerExecution> handlerExecutions` 에 값을 저장하는 로직을 수행한다.

![스크린샷 2022-10-21 오전 12.06.55.png](https://i.imgur.com/juikAJ1.png)

![스크린샷 2022-10-21 오전 12.06.55.png](https://i.imgur.com/jiuEOEG.png)

메서드에 설정한 @RequestMapping에 대한 정보를 불러온 다음 `createHandlerKey()` 메서드를 통해서 handlerExecutions의 키값이 될 HandlerKey 객체를 생성해 주었다.

![스크린샷 2022-10-21 오전 12.06.40.png](https://i.imgur.com/oGnvY43.png)

![스크린샷 2022-10-21 오전 12.06.40.png](https://i.imgur.com/5vTnM4o.png)

createHandlerKey() 메서드는 @RequestMapping에 설정한 value(URL)와 method(HttpMethod) 값을 불러온 다음 @Controller에 설정된 공통 URL값과 @RequestMapping URL을 조합한 전체 URL을 HandlerKey의 첫번째 생성자 인자로, method를 두번째 인자로 넘겨서 객체를 생성하여 반환한다.

`HandlerKey` 객체는 요청 url을 저장하는 url과 HttpMethod를 enum 타입으로 관리하는 requestMethod 멤버 변수를 알고 있다. hashCode & equals를 재정의하여 HandlerKey를 키값으로 사용할 수 있도록 하였다.

![스크린샷 2022-10-23 오전 12.08.42.png](https://i.imgur.com/iuA2PBB.png)

![스크린샷 2022-10-23 오전 12.08.42.png](https://i.imgur.com/FhSvs43.png)

![스크린샷 2022-10-23 오전 12.08.42.png](https://i.imgur.com/kSNe4a1.png)

### 4.1.4 getHandler()

AnnotationHandlerMapping에 HttpRequest가 전달되면 해당 요청 URL과 Http 메서드에 해당하는 HandlerExecution을 반환해야 하며 이를 `getHandler()` 메서드를 통해 수행한다.

![스크린샷 2022-10-23 오전 12.38.08.png](https://i.imgur.com/du3fch7.png)

## 5 HandlerExecution

`HandlerExecution` 은 실행할 메서드가 존재하는 클래스의 인스턴스 정보와 실행할 메서드 정보를 가진다. HandlerAdapter 인터페이스를 상속받아서 HandlerAdapterStorage 객체에 추가해 주었다.

![스크린샷 2022-10-23 오전 12.38.08.png](https://i.imgur.com/TeewPYu.png)

![스크린샷 2022-10-23 오전 12.38.08.png](https://i.imgur.com/reGh57l.png)

![스크린샷 2022-10-23 오전 12.38.08.png](https://i.imgur.com/knnOPef.png)

## 6. 기존 MVC와 어노테이션 MVC 통합

![스크린샷 2022-10-20 오후 4.42.21.png](https://i.imgur.com/JeyjJN8.png)

init() 메서드를 통한 DispatcherServlet의 초기화 과정에서 `RequestMapping` 과 `AnnotationHandlerMapping` 모두 초기화 되며 두 HandlerMapping을 List로 관리한다.

![스크린샷 2022-10-20 오후 4.42.21.png](https://i.imgur.com/bFW3VJI.png)

init() 메서드가 정상적으로 수행 되었다면 그다음으로 service(request, response) 메서드가 수행된다.

service() 메서드는 앞에서 초기화한 2개의 HandlerMapping에서 요청 URL에 해당하는 Handler(Controller)를 찾아 메서드를 실행한다. (`getHandler(request)`)

![스크린샷 2022-10-20 오후 4.42.21.png](https://i.imgur.com/Uy3qXkC.png)

그다음 service() 메서드는 찾은 Handler의 인스턴스를 비교하여 해당 Handler를 처리할 수 있는 HandlerAdpater를 불러온다. AnnotationHandlerMapping의 Handler이면 HandlerExecution 타입이기 때문에 HandlerAdapter에는 HandlerExecution이 저장되게 된다.

handleAdapter()와 handle()메서드를 거쳐서 HandlerExecution의 handle 메서드가 수행되고 요청 URL에 매핑되어 있는 메서드가 수행되게 된다.

![스크린샷 2022-10-20 오후 4.42.21.png](https://i.imgur.com/zFLge2W.png)

이후의 과정은 이전 포스트에서 알아본 기존 MVC 구조의 실행 과정과 동일하다.

## 7. AnnotationHandlerMappingTest

![스크린샷 2022-10-23 오전 1.20.58.png](https://i.imgur.com/hjWiZmm.png)

![스크린샷 2022-10-23 오전 1.20.58.png](https://i.imgur.com/FjXMvWc.png)

리팩토링이 성공적으로 이루어졌는지 확인하기 위해서 다음과 같은 테스트코드를 작성하였다.

테스트가 성공적으로 통과되었으며 점진적으로 리팩토링을 해내는데 성공하였다.

---

### ****참고자료 📚****

[reflections-library, baeldung](https://www.baeldung.com/reflections-library)

[[Spring MVC] HandlerMapping](https://bellog.tistory.com/m/219)

[spring-mvc-handler-adapters, baeldung](https://www.baeldung.com/spring-mvc-handler-adapters)
