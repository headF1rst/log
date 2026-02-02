---
title: MVC 프레임워크 만들기 - MVC 1편
category:
thumbnail: https://i.imgur.com/b9vvtK7.png
tags: Spring
date: 2022-10-08 10:00
---

7월에 [넥스트 스텝](https://edu.nextstep.camp/)에서 진행하는 [만들면서 배우는 스프링 3기](https://edu.nextstep.camp/s/I7LCaCf3)에 참여하였습니다.

이 포스트는 해당 과정에서 스스로 고민하며 MVC 프레임워크를 차근 차근 구현해보았던 과정입니다.

## 1. MVC 패턴의 탄생

### 1.1 Servlet, JSP, Model

MVC 구현 과정을 살펴보기 이전에 MVC 패턴이 무엇이고 어떤 과정을 통해서 발전하였는지 개념을 짚고 넘어가도록 하자.

초기 자바 진영에서는 동적인 웹 페이지를 구현하기 위한 표준으로 [서블릿](https://mangkyu.tistory.com/m/14)이 등장하였다. 서블릿은 WAS의 tcp/ip 연결, 멀티 쓰레드 관리등을 담당하였으며 사용자 요청에 대한 처리와 처리 결과에 따른 응답을 생성해서 HTML 파일을 클라이언트에게 반환하는 역할을 하였다.

하지만 서블릿은 자바 코드로 작성되기 때문에 HTML 파일을 생성하기 어렵다는 단점이 존재했고, 화면 출력 로직을 담당하는 `템플릿 엔진` (JSP, Thymeleaf …)이 등장했다.

JSP의 등장으로 HTML 파일 생성은 쉬워졌지만 JSP가 비즈니스 로직까지 너무 많은 역할을 담당한다는 단점이 여전히 존재했다. (하나의 JSP파일에 코드가 수천줄이 넘어가고 유지보수가 어려웠다.)
UI와 로직의 역할 분리가 제대로 이뤄지지 않았기 때문에 간단한 UI를 변경하더라도 로직까지 함께 수정해야 하는 등 변경 라이프 사이클이 맞지 않았기 때문에 유지보수에 좋은 구조라고 볼 수도 없었다.

유지보수에 유연한 구조를 생성하고자 어플리케이션 구성 요소의 관심사를 분리한 MVC 패턴을 도입하였으며 서블릿, JSP 조합 MVC 패턴을 통해서 로직과 뷰 부분을 나누어서 개발하기 시작했다. 이후 MVC 패턴을 기반으로한 여러 MVC 프레임워크가 등장하기 시작했다 (스트럿츠, 스프링 MVC 등)

![](https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/ModelViewControllerDiagram2.svg/1200px-ModelViewControllerDiagram2.svg.png)
출처 - 위키피디아

- **MVC 패턴의 구성 요소**
    - `Controller`
        - HTTP 요청을 받아서 파라미터를 검증하고 비즈니스 로직을 실행하는 역할.
        - View에 전달할 결과 데이터를 조회해서 Model에 담는 책임을 수행한다.
    - `Model`
        - View에 출력할 데이터를 저장한다.
        - (View는 로직이 처리된 결과 데이터가 Model에 담겨서 전달되기 때문에 비즈니스 로직이나 데이터 접근을 몰라도된다. 오직 화면 렌더링 역할에만 최적화 될 수 있다.)
    - `View`
        - `Model` 에 담긴 데이터를 사용하여 화면을 렌더링하는 책임을 수행한다.
        

### 1.2 Front Controller 패턴

초기 MVC 패턴에서 클라이언트들은  서로 다른 Controller를 호출하였으며 공통 코드들이 각 Controller에 포함되어있었다.

코드의 중복을 없에기 위해서 모든 Controller로 가기 위한 입구 역할을 하는 Front Controller 패턴을 MVC 프레임워크에 도입하였다.

![스크린샷 2022-10-09 오후 6.28.21.png](https://i.imgur.com/e0ZXbT7.png)

바로 이 Front Controller가 Spring MVC 프레임워크의 `DispatcherServlet` 이며 다음과 같은 역할을 수행한다.

- 클라이언트의 요청을 받아서 요청 (uri)에 맞는 컨트롤러를 찾아 호출.
- 공통 기능을 처리.
    - 덕분에 Front Controller를 제외한 나머지 Controller는 Servlet을 사용하지 않아도 된다.

더 자세한 내용은 해당 [링크](https://www.baeldung.com/java-front-controller-pattern)를 통해서 알아보기로 하고 이제부터는 코드를 살펴보도록 하자.

## 2. DispatcherServlet

Front Controller의 역할을 하는 DispatcherServlet 클래스 코드를 만들어보자.

### 2.1 기능 구현

가장 먼저 [HttpServlet](https://docs.oracle.com/javaee/7/api/javax/servlet/http/HttpServlet.html) 인터페이스를 상속받아서 [init() 과 service()](https://docs.oracle.com/javaee/6/api/javax/servlet/Servlet.html#:~:text=init,-void%20init(ServletConfig&text=config)%20throws%20ServletException-,Called%20by%20the%20servlet%20container%20to%20indicate%20to%20a%20servlet,servlet%20can%20receive%20any%20requests.) 메서드를 다음과 같이 구현하였다.

![스크린샷 2022-10-09 오후 10.53.15.png](https://i.imgur.com/ptoieWN.png)

`init()` 메서드는 서블릿 컨테이너에 의해 한번 호출되면서 필드값에 값을 주입하게 된다.

필드값은 `RequestMapping` 과 `HandlerAdapterStorage` 객체를 선언하였는데, 각각 initMapping(), init() 메서드가 호출된다.

- `HandlerAdapterStorage` - init()
    - 어댑터를 등록한다.
    - HandlerExecution 객체와 SimpleControllerHandlerAdapter 객체의 인스턴스를 생성하여 handlerAdapters 리스트에 **순서 대로** 추가한다.

여기서 순서대로 어댑터들이 저장된것을 주의해야 하는데, 동일한 URI를 처리하는 어댑터가 여러개 존재하더라도 우선순위를 부여하기 위함이다. 이후에 `getHandlerAdapter()` 메서드가 호출되면 `HandlerExecution` → `SimpleControllerHandlerAdapter` 순으로 리스트에서 객체를 가져와서 인자로 주어진 handler를 지원하는지 여부를 검사한다.

> **Handler** 라는 용어가 어색할 수 있는데, Handler는 더 넓은 의미에서의 Controller를 뜻하며 현재 포스트에서는 Handler와 Controller를 같은 의미로 받아들여도 좋다.

  ![스크린샷 2022-10-09 오후 10.50.52.png](https://i.imgur.com/CtG6FlS.png)

- `ReqeustMapping` - initMapping()
    - 특정 requestURI를 처리할 수 있는 컨트롤러 객체를 생성한 다음 URI와 매핑하여 HashMap에 저장한다.

    ![스크린샷 2022-08-23 오전 3.01.41.png](https://i.imgur.com/oNV68VT.png)

## 2.1.1 service 메서드

`service(request, response)` 메서드는 DispatcherServlet의 init() 메서드가 성공적으로 수행되었을때 서블릿 컨테이너에 의해서 호출된다.

![스크린샷 2022-10-09 오후 11.00.31.png](https://i.imgur.com/KKZ6gds.png)

service 메서드의 핵심 로직을 살펴보도록 하자.

- `getHandler(request)` - requestURI와 매핑되는 Controller를 찾아온다.
- `requestMapping.findController(requestURI)` 메서드는 RequestMapping 객체내 URI를 키값으로 하는 값(Controller)을 반환한다. 
    ![스크린샷 2022-10-09 오후 11.04.15.png](https://i.imgur.com/pF0xb8p.png)
    

- 찾은 Controller를 지원하는 HandlerAdapter를 찾는다.
- HandlerAdapter는 지원하는 Controller에 구현된 handle 메서드를 수행하고 ModelAndView 객체를 반환한다.
    
    ![스크린샷 2022-10-09 오후 11.02.43.png](https://i.imgur.com/6r7svKL.png)
    

### 2.2 DispatcherServlet 전체 코드

```java
package core.mvc.asis;

import core.mvc.ModelAndView;
import core.mvc.tobe.*;
import core.mvc.view.View;
import exception.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@WebServlet(name = "dispatcher", urlPatterns = "/", loadOnStartup = 1)
public class DispatcherServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;
    private static final Logger logger = LoggerFactory.getLogger(DispatcherServlet.class);

    private HandlerAdapterStorage handlerAdapterStorage;
    private RequestMapping requestMapping;

    @Override
    public void init() {
        handlerAdapterStorage = new HandlerAdapterStorage();
        handlerAdapterStorage.init();

        requestMapping = new RequestMapping();
        requestMapping.initMapping();
    }

    @Override
    protected void service(HttpServletRequest request, HttpServletResponse response) throws ServletException {
        Object handler = getHandler(request);
        if (handler == null) {
            throw new NotFoundException(HttpStatus.NOT_FOUND);
        }
        HandlerAdapter adapter = handlerAdapterStorage.getHandlerAdapter(handler);
        handleAdapter(request, response, handler, adapter);
    }

    private void handleAdapter(HttpServletRequest request, HttpServletResponse response,
                               Object handler, HandlerAdapter adapter) throws ServletException {
        try {
            handle(request, response, handler, adapter);
        } catch (Exception e) {
            logger.error("Exception: {}", e.getMessage());
            throw new ServletException(e.getMessage());
        }
    }

    private void handle(HttpServletRequest request, HttpServletResponse response,
                        Object handler, HandlerAdapter adapter) throws Exception {
        ModelAndView modelAndView = adapter.handle(request, response, handler);
        View view = modelAndView.getView();
        view.render(modelAndView.getModel(), request, response);
    }

    private Object getHandler(HttpServletRequest request) {
        String requestURI = request.getRequestURI();
        logger.debug("Method: {}, RequestURI: {}", request.getMethod(), requestURI);
        return requestMapping.findController(requestURI);
    }
}
```

## 3. HandlerAdapter

- HandlerAdapter란?
    - `HandlerAdapter`
        - DispatcherServlet과 Controller 사이에 HandlerAdpater를 위치시켜서 DispatcherServlet이 다양한 형태의 Handler(Controller)를 호출할 수 있게 한다.
    - `어뎁터 패턴`
        - 기존 코드를 클라이언트가 사용하는 인터페이스의 구현체로 바꿔주는 패턴
        - 어뎁터 패턴을 사용하여 DispatcherServlet이 다양한 반환 타입의 컨트롤러를 처리할 수 있게 한다.
        - 장점
            - 기존 코드를 변경하지 않고 원하는 인터페이스 구현체를 만들어 재사용 가능
            - 기존 코드가 하던 일과 특정 인터페이스 구현체로 변환하는 작업을 각기 다른 클래스로 분리하여 관리가 가능
        - 단점
            - 복잡도 증가. 때에 따라서 기존 코드가 해당 인터페이스를 구현하도록 수정하는 것이 좋은 선택이 될 수 있다.

다양한 어댑터를 유연하게 사용하기 위한 `HandlerAdapter` 인터페이스를 선언해 주었다.

![스크린샷 2022-10-09 오후 11.11.31.png](https://i.imgur.com/CF6LYyF.png)

- `boolean supports(Object handler)`
    - 어댑터가 핸들러(컨트롤러)를 처리할 수 있는지 여부를 판단한다.
- `ModelAndView handle(HttpServletRequest, HttpServletResponse, Object)`
    - 어댑터가 실제 컨트롤러를 호출하고 결과로 ModelAndView를 반환 한다.
    - 컨트롤러가 ModelAndView를 반환하지 못하면 어댑터가 ModelAndView를 생성해서 반환 한다.

### 3.1 SimpleControllerHandlerAdapter

HandlerAdapter 인터페이스의 구현체인 `SimpleControllerHandlerAdapter` 객체를 살펴보면 `support()` 의 인자로 주어진 handler가 Controller 인터페이스를 구현한 객체일 경우 true를, 그렇지 않을 경우 false를 반환한다.

![스크린샷 2022-10-09 오후 11.14.21.png](https://i.imgur.com/9UjRZsq.png)

`handle()` 메서드는 아래와 같이 DispatcherServlet의 `handlerAdater()` → `handle()` → `adapter.handle()` 메서드에 의해서 호출된다.

![스크린샷 2022-10-09 오후 11.02.43.png](https://i.imgur.com/BA0tMbg.png)

만약 요청 uri를 처리할 수 있는 Controller를 알고있는 어댑터가 `SimpleControllerHandlerAdapter`일 경우, SimpleControllerHandlerAdapter의 handle 메서드가 호출된다.
handle() 메서드의 인자로 받아온 handler 객체를 Controller로 다운캐스팅 한 다음 `execute()` 메서드를 호출하여 Controller가 로직을 수행하도록 요청하게 된다.

## 4. Controller

Controller 인터페이스를 다음과 같이 정의하였고 그 구현체로 다양한 URI를 처리할 수 있는 각각의 Controller 구현체를 구현해 주었다. (HomeController, ForwardController, ListUserController …)

![스크린샷 2022-10-09 오후 11.16.06.png](https://i.imgur.com/NwEgKVD.png)

`exeute()` 메서드가 호출되었을때 어떤 로직이 수행되는지 Controller 인터페이스의 구현체인 `ListUserController` 를 예로 알아보도록 하자 .

### 4.1 execute 메서드

![스크린샷 2022-10-09 오후 11.20.09.png](https://i.imgur.com/L8po0KF.png)

ListUserController는 로그인되어있는 상태라면 모든 회원정보를 출력하는 `list.jsp` 파일을 렌더링하고, 그렇지 않은 상태라면 사용자가 로그인을 먼저 하고 다시 요청할 수 있게끔 로그인 폼으로 리다이렉트하는 로직을 수행한다.

이때 사용자의 로그인 상태 여부를 확인하기 위해서 `HttpServletRequest` 의 `getSession()` 메서드를 통해 HttpSession 정보를 isLogined 메서드의 인자로 넘겨주게 되는데 HttpServeltRequest가 Controller에게 데이터를 전달하는 MVC 패턴의 **Model** 역할을 하게 되는 것이다.

좀 더 로직을 자세히 알아보기 위해서 UserSessionUtils 객체를 어떻게 구현하였는지 알아보도록 하자.

### 4.1.1 UserSessionUtils

static 멤버만을 저장하는 유틸성 클래스이기 때문에 객체 생성을 막고자 추상 클래스로 선언해 주었다.

![스크린샷 2022-10-18 오후 8.37.24.png](https://i.imgur.com/cymChPc.png)

앞서 `ListUserController` 의 `execute()` 메서드에서 호출된 `UserSessionUtils.isLogined()` 메서드를 살펴보도록 하겠다.

조건문에서 `getUserFromSession()` 메서드를 호출하고 호출된 메서드는 HttpSession으로 부터 “user”를 키값으로 갖는 속성값을 가져온다.
만약 그러한 속성값이 존재하지 않을 경우 null을 반환하고, 존재할 경우 User 클래스로 다운 캐스팅하여 반환한다.

만약 getUserFromSession()의 결과값이 null일 경우, 해당 회원의 로그인 정보가 세션에 저장되어 있지 않다는 뜻이기 때문에 false를 반환하며 그렇지 않을 경우 로그인 되어있는 회원임을 나타내는 true를 반환한다.

다시 `ListUserController` 클래스의 execute()의 로직을 살펴보면 UserSessionUtils.isLogined() 메서드의 결과값에 따라서 
`RedirectView` 혹은 `ForwardView` 를 생성자의 인자로 넘겨받아 ModelAndView 객체를 생성하여 반환한다.

- UserSessionUtils 전체 코드

```java
package next.controller;

import next.model.User;

import javax.servlet.http.HttpSession;

public abstract class UserSessionUtils {
    public static final String USER_SESSION_KEY = "user";

    public static User getUserFromSession(HttpSession session) {
        Object user = session.getAttribute(USER_SESSION_KEY);
        if (user == null) {
            return null;
        }
        return (User) user;
    }

    public static boolean isLogined(HttpSession session) {
        if (getUserFromSession(session) == null) {
            return false;
        }
        return true;
    }

    public static boolean isSameUser(HttpSession session, User user) {
        if (!isLogined(session)) {
            return false;
        }

        if (user == null) {
            return false;
        }

        return user.isSameUser(getUserFromSession(session));
    }
}
```

## 5. View

`ModelAndView` 객체는 이름에서 알 수 있듯이 이동하고자 하는 View와 model이라는 이름의 HashMap 구조를 멤버변수로 포함하고 있다.

ModelAndView는 Controller의 로직 처리 결과 후 응답할 View와 View에 전달할 값을 저장한다.

![스크린샷 2022-08-23 오전 3.05.00.png](https://i.imgur.com/6qb8wGR.png)

앞서 살펴보았던 DispatcherServlet의 handle() 메서드를 마저 알아보도록 하자. 

![스크린샷 2022-10-09 오후 11.02.43.png](https://i.imgur.com/iqDt1QP.png)

인자로 전달받은 HandlerAdapter의 handle()을 호출하여 이동할 View
(ListUserController의 경우 `ForwardView` or `RedirectView`)와 View에 전달할 모델(데이터)을 알고있는 `ModelAndView` 객체가 반환된다.

반환된 ModelAndView 객체의 `getView()` 메서드를 통해서 이동할 View 구현체를 가져온다.
그다음 View 인터페이스를 상속한 구현체가 정의한 `render()` 함수를 호출하여 model 데이터를 인자로 넘겨주었다.

![스크린샷 2022-08-23 오전 3.05.28.png](https://i.imgur.com/sHLtiFN.png)

![스크린샷 2022-08-23 오전 3.06.57.png](https://i.imgur.com/1uv52fY.png)

View 인터페이스의 구현체인 ForwardView는 JSP 파일이 저장된 경로인 `viewPath` 를 멤버변수로 포함하고 있으며 render() 메서드가 호출되면 
`modelToRequestAttribute()` 메서드를 호출하여 Model에 담긴 데이터를 전부 꺼내서 `request.setAttibute` 에 다 넣어 주었다. 
(Model내 데이터를 전부 HttpServletRequest에 저장하는 이유는 아래에서 설명하도록 하겠다.)

HttpServletRequest의 `getRequestDispatcher(String)` 팩토리 메서드를 통해서 `RequestDispatcher` 객체를 생성해주었고 
메서드의 인자로 viewPath를 주어서 제어권이 이동할 페이지의 경로를 지정하였다.

RequestDispatcher의 `forward(request, response)` 메서드는 getRequestDispatcher(String)의 인자로 주어진 경로의 자원으로 제어를 넘기는 역할을 한다. 
앞서 ListUserController 객체에서 ForwardView를 생성하면서 인자인 viewPath로 `user/list.jsp` 를 명시해 주었기 때문에 
해당 jsp 파일로 제어가 넘어가게 되며 최종적으로 user/list.jsp의 처리 결과가 브라우저에 출력되게 된다.

이때 forward(request, response) 메서드가 제어권을 다른 새로운 자원으로 넘겨주면서 인자로 HttpServletRequest 객체를 포함하기 때문에
jsp 파일 내에서 필요한 데이터를 HttpServletRequest의 속성값에 저장해 줘야만 한다.

때문에 앞에서 modelToRequestAttribute() 메서드를 호출하여 Model의 데이터를 request.setAttribute로 넘겨준 것이다.
ModelAndView 객체내에 model이라는 이름의 필드값이 존재하지만 실질적인 Model의 역할은 HttpServletRequest가 담당하게 된다.

`RedirectView`는 생성자로 redirectPath를 넘겨받으며 `HttpServletResponse` 의 `sendRedirect(String)` 메서드를 호출한다.

![스크린샷 2022-08-23 오전 3.07.16.png](https://i.imgur.com/m5fA7u6.png)

sendRedirect(String) 메서드 또한 forward(request, response)와 마찬가지로 인자로 넘어온 경로로 제어를 이동시킨다. 

하지만 두 메서드는 다음과 같은 차이점이 존재한다.

**Redirect 와 forward의 차이점**

- `redirect`
    - 실제 클라이언트에 응답이 갔다가, 클라이언트가 redirect경로로 다시 요청 → url경로 변경 O
    - 요청이 처리되기 위해 다른 자원이나 다른 서버로 전달된다.
    - HttpServletRequest, Response에 저장되어있던 속성값들이 전부 초기화된다.
        - 브라우저는 redirect 요청을 아예 새로운 요청으로 간주한다.
        - 만약 새로운 자원에서 기존 속성값들을 사용하고 싶다면 세션에 저장하거나 URL과 함께 전달해야한다.
- `forward`
    - 서버 내부에서 일어나는 호출 → url 경로 변경 X
        - 웹 컨테이너가 모든 과정을 처리하고 클라이언트나 브라우저는 포함되지 않는다.
    - 요청이 처리되기 위해 같은 서버의 다른 자원에 전달된다.
    - forward 메서드는 인자로 HttpRequest, Response 객체를 넘겨주기 때문에 새로운 자원으로 제어권이 넘어가서 과정이 처리되더라도 request 객체 내의 이전 데이터를 사용할 수 있다.
        - 때문에 model 내 모든 데이터를 request.setAttribute()로 옮기는 작업을 수행하였다.

최종적으로 jsp파일로 화면 구성에 필요한 데이터가 전달되며 사용자의 요청에 해당하는 결과값이 출력되게 된다.

## 마치며

지금까지 간단한 MVC 프레임워크를 만들어 보았다.

하지만 아직 부족한 부분이 많이 보인다. 스프링 MVC 프레임워크가 다른 MVC 프레임워크와 비교해서 우위를 가져가기 시작한 시점은 바로 어노테이션 기반의 MVC 프레임워크를 도입하면서 부터였다. 

지금의 MVC 프레임워크는 어노테이션 기반이 아니며 동일한 URI여도 다른 HttpMethod라면 다르게 인식해야 하는데 그렇지 못하고 있다.

다음 포스팅에서는 이러한 문제점을 개선하며 점진적 리팩토링 과정을 거쳐서 어노테이션 기반의 MVC 프레임워크로 개선하는 과정을 다뤄보도록 하겠다.

---

### 참고자료 📚

[HttpServlet (Java(TM) EE 7 Specification APIs)](https://docs.oracle.com/javaee/7/api/javax/servlet/http/HttpServlet.html)

[RequestDispatcher.forward() vs HttpServletResponse.sendRedirect()](https://stackoverflow.com/questions/2047122/requestdispatcher-forward-vs-httpservletresponse-sendredirect)

[[개발자 면접준비]#1. MVC패턴이란](https://m.blog.naver.com/jhc9639/220967034588)

[페이지출력, 페이지전환 및 특정 url로 재 요청 을 해주는 RequestDispatcher 의 request.getRequestDispatcher()/forward() / HttpServletResponse의 response.sendRedirect()](https://u-it.tistory.com/m/entry/%ED%8E%98%EC%9D%B4%EC%A7%80%EC%B6%9C%EB%A0%A5-%ED%8E%98%EC%9D%B4%EC%A7%80%EC%A0%84%ED%99%98-%EB%B0%8F-%ED%8A%B9%EC%A0%95-url%EB%A1%9C-%EC%9E%AC-%EC%9A%94%EC%B2%AD-%EC%9D%84-%ED%95%B4%EC%A3%BC%EB%8A%94-RequestDispatcher-%EC%9D%98-requestgetRequestDispatcherforward-HttpServletResponse%EC%9D%98-responsesendRedirect)

[[JSP] 서블릿(Servlet)이란?](https://mangkyu.tistory.com/m/14)
