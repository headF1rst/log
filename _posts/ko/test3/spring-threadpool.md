---
title: 다중 요청 처리를 위한 ThreadPool 적용하기
category:
thumbnail: https://i.imgur.com/mHibXLP.jpg
tags: Spring
date: 2022-09-20 10:00
---

프레임워크는 개발자가 쉽고 편하게 개발을 할 수 있도록 많은 기술을 추상화해서 제공한다.

스프링 또한 많은 부분이 추상화 되었으며 개발자 스스로가 의문을 갖지 않는다면, 모른채 넘어갈 기술들이 여럿 존재한다.

오늘은 그러한 기술들 중, 개발자들을 대신해서 사용자의 다중 요청을 처리해주는 WAS의 `ThreadPool`에 대해서 알아보도록 하겠다.

# WAS의 Thread 생성 과정

스프링 부트는 2.5.4 버전 이후로 Tomcat (WAS)을 내장하고 있다.

WAS는 사용자의 요청마다 Thread를 할당해 주는데, 코드를 통해 WAS의 Thread 생성 과정을 살펴보도록 하자.

```java
import java.net.ServerSocket;
import java.net.Socket;

public class WebApplicationServer {
    private static final int DEFAULT_PORT = 8080;

    public static void main(String[] args) throws Exception {
        int port = 0;

        if (args == null || args.length == 0) {
            port = DEFAULT_PORT;
        } else {
            port = Integer.parseInt(args[0]);
        }

        // 서버소켓을 생성한다. 웹 서버는 8080 포트를 사용한다.
        try (ServerSocket listenSocket = new ServerSocket(port)) {

            Socket connection;
            while ((connection = listenSocket.accept()) != null) {
                Thread thread = new Thread(new RequestHandler(connection));
                thread.start();
            }
        }
    }
}
```
위 코드는 다음 과정을 순서대로 수행하게 된다.

- 어플리케이션을 실행한다. 
- `try (ServerSocket listenSocket = new ServerSocket(port)) {`
   - 8080 포트를 디폴트로 사용하는 `ServerSocket` 객체를 생성한다. 
   - `ServerSocket` 객체는 주어진 포트에서 들어오는 요청을 청취한다.
- `while ((connection = listenSocket.accept()) != null) {`
   - `listenSocket.accept()`는 연결 요청이 들어올 때까지 블로킹된다.
   - 연결 요청이 들어오면, 연결을 수락하고 `Socket` 객체를 반환한다.
   - 연결 요청이 끊길때 까지 루프를 돌며 요청을 처리한다.
- 클라이언트의 요청이 들어오면, 요청(task)를 처리하기 위한 스레드를 생성하여 할당한다.
- 할당된 스레드가 `RequestHandler` 객체를 생성한다.
   - [thread.start()](https://kim-jong-hyun.tistory.com/101) 에 의해서 Thread가 task를 수행한다
   - `RequestHandler` 에 오바라이드된 `run()` 메서드를 수행한다.
    

하지만 이처럼 사용자 요청이 있을 때 마다 스레드를 생성해서 사용자 요청을 처리하게 되면 다음과 같은 문제가 발생한다.

- 모든 요청마다 스레드를 생성하기 때문에 스레드 생성 비용 발생 → 성능 저하.
- 동시 접속자가 많아질 경우, Context Switching 비용 증가, WAS의 메모리 자원이 부족하여 서버가 다운될 가능성이 존재.

이처럼 여러 유저의 요청을 효율적으로 처리하고 동시 접속자가 많더라도 안정적으로 서비스를 제공하기 위해서 WAS는 **Thread Pool**을 제공한다.

# Thread Pool 이란?

[Thread Pool](https://www.baeldung.com/thread-pool-java-and-guava)은 어플리케이션 실행에 필요한 [Thread](https://en.wikipedia.org/wiki/Thread_(computing))들을 미리 생성한 다음, Pool에 있는 Thread를 돌려가며 사용하여 사용자의 요청을 처리한다.
(Task를 처리한 Thread는 다시 Thread Pool에 반납되어 재사용 된다.)

미리 만들어 두는 방식과 Thread가 task를 처리하는 방식에 따라서 여러 Pool 구현체들이 존재한다.
대표적인 Thread Pool에는 `newFixedThreadPool`이 있다.

## Thread Pool의 Thread 할당 과정

![스크린샷 2022-09-08 오후 3.21.21.png](https://i.imgur.com/kZs00M1.png)

Thread Pool의 Thread 할당 과정을 살펴보면 다음과 같다.

- 설정된 `core size` 만큼 Thread Pool에 Thread를 생성한다.
- 사용자로 부터 Task(요청)가 들어올 때마다 큐에 Task를 저장한다.
- Thread Pool에 idle 상태의 Thread가 있다면 큐에서 Task를 꺼내 해당 Thead에 할당한다.
    - idle 상태의 Thread가 Pool에 존재하지 않으면 Task는 큐에 대기한다.
    - ❗️ 대기중인 Task로 인해 **큐가 꽉 차면, Thread를 새로 생성한다**. (설정된 `Maximum Thread Size` 까지)
    - Maximum Thread Size 까지 Thread의 수가 도달하고 큐도 꽉 차게 되면 추가 Task에 대해선 `Connection-refused` 오류를 반환한다.
- Task를 처리한 Thread는 다시 idle 상태로 Thread Pool에 반납된다.
    - 큐가 비어있고 `core size` 이상의 Thread가 생성되어있다면 **Thread를 삭제한다.**

## Thread Pool을 사용하여 다중 요청을 처리하는 WAS

이제 자바에서 기본으로 제공하는 [ThreadPoolExecutor](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/ThreadPoolExecutor.html) 를 활용해 아래의 설정값을 바탕으로하는 Thread Pool 기능을 추가해보자.

- 최대 Thread Pool의 크기 = `250` (Pool Size)
- 모든 Thread가 사용중인 (Busy) 상태이면 `100` 명까지 대기 상태 유지 (Queue Size)

```java
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WebApplicationServer {

    private static final Logger logger = LoggerFactory.getLogger(WebApplicationServer.class);

    private static final int DEFAULT_PORT = 8080;
    private static final int PORT_ARGS_INDEX = 0;
    private static final int THREAD_POOL_SIZE_ARGS_INDEX = 1;
    private static final int THREAD_QUEUE_SIZE_ARGS_INDEX = 2;
    private static final int DEFAULT_THREAD_POOL_SIZE = 250;
    private static final int DEFAULT_THREAD_QUEUE_SIZE = 100;

    public static void main(String args[]) throws Exception {

        int port = port(args);
        ThreadPoolExecutor threadPoolExecutor = threadPoolExecutor(poolSize(args), queueSize(args));

        // 서버소켓을 생성한다. 웹서버는 기본적으로 8080번 포트를 사용한다.
        try (ServerSocket listenSocket = new ServerSocket(port)) {
            logger.info("Web Application Server started {} port.", port);

            // 클라이언트가 연결될때까지 대기한다.
            Socket connection;
            while ((connection = listenSocket.accept()) != null) {
                threadPoolExecutor.execute(new RequestHandler(connection));
            }
        }
    }
    ...

    private static int port(String[] args) {
        return extractValueByIndexOrDefault(args, PORT_ARGS_INDEX, DEFAULT_PORT);
    }

    private static int extractValueByIndexOrDefault(String[] args, int index, int defaultValue) {
        if (args == null || args.length < index + 1) {
            return defaultValue;
        }
        return Integer.parseInt(args[index]);
    }
}
```

코드에서 볼 수 있듯이, Thread Pool 적용의 핵심 로직은 `threadPoolExecutor` 메서드에 존재한다.

`threadPoolExecutor` 메서드를 살펴보기에 앞서, 인자로 전달되는 값을 구하는 두개의 메서드를 살펴보도록 하자.

`threadPoolExecutor` 메서드는 두개의 인자값을 전달받는다.

- Thread Pool의 `core size`
- Task를 저장할 `queue size`

이들은 각각 `poolSize(args)`, `queueSize(args)` 메서드에 의해서 값이 구해진다.

```java
public class WebApplicationServer {
    ...
    
    private static int poolSize(String[] args) {
        return extractValueByIndexOrDefault(args, THREAD_POOL_SIZE_ARGS_INDEX, DEFAULT_THREAD_POOL_SIZE);
    }

    private static int queueSize(String[] args) {
        return extractValueByIndexOrDefault(args, THREAD_QUEUE_SIZE_ARGS_INDEX, DEFAULT_THREAD_QUEUE_SIZE);
    }
```

`port(args)`, `poolSize(args)` , `queueSize(args)` 모두 `extractValueByIndexOrDefault()` 메서드에 의해서 값이 파싱된다.

`extractValueByIndexOrDefault()` 메서드는 사용자의 요청시 전달되는 `args[]` 에 필요한 옵션의 값이 전달되지 않은 경우에 기본값을 반환하고 옵션 값이 전달된 경우에는 전달된 값을 반환한다.

### ThreadPoolExecutor

`poolSize` 와 `queueSize` 메서드로 부터

전달받은 두 인자를 사용하여 `ThreadPoolExecutor` 객체를 생성하여 Thread Pool을 적용한다.

```java
public class WebApplicationServer {
    ...
    
    private static ThreadPoolExecutor threadPoolExecutor(int corePoolSize, int queueSize) {
        return new ThreadPoolExecutor(corePoolSize, corePoolSize, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(queueSize));
    }
```

> ThreadPoolExecutor(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue)

- corePoolSize
    - 어플리케이션 시작시 Pool에 할당되는 쓰레드 수
- maximumPoolSize
    - Pool에 유지될 수 있는 **최대** 쓰레드 수
- keepAliveTime
    - corePoolSize 보다 쓰레드 개수가 많아 진 상태에서, 새로운 테스크를 기다리는 시간.
    - keepAliveTime 이상 시간이 경과하면 쓰레드를 없애서 corePoolSize만큼 쓰레드 수를 유지한다.
- unit
    - keepAliveTime의 시간 단위
- workQueue
    - 실행 되기전에 홀드시켜 두는 테스크를 유지하는 큐.
    - idle 상태의 쓰레드가 없는 경우, 테스크를 workQueue에 저장한다.

- corePoolSize = 1, maximumPoolSize = 1 이면 `newSingleThreadExecutor` 가 된다.
- corePoolSize = 0, maximumPoolSize = MAX_VALUE 이면 `newCachedThreadPool`

현재 우리는 최소, 최대가 250인 고정된 Thread Pool을 생성한 것이다.

`threadPoolExecutor.execute(new RequestHandler(connection))`

Thread Pool을 만들고 나서는 클라이언트의 요청이 들어오기까지 대기하다가 요청이 들어오는 순간 Thread Pool의 idle한 Thread를 하나 할당하여 요청 (Task)를 처리한다.

- `execute(테스크)`
    - Thead Pool에서 하나의 Thread를 할당.

## Thread Pool 수보다 많은 요청을 동시에 보내보기

앞서 적용한 Thread Pool과 동일한 [newFixedThreadPool](https://docs.oracle.com/javase/7/docs/api/java/util/concurrent/Executors.html) 를 사용하여 Thread Pool이 정상 동작하는지 알아보기 위한 테스트를 해보자.

먼저 Thread Pool의 총 스래드 개수보다 적은 동시 요청을 보냈을때 WAS가 정상 동작하는지 검증하는 테스트 코드를 작성하였다.

![스크린샷 2022-09-23 오후 6.24.57.png](https://i.imgur.com/06RShUw.png)

- `executorService.execute()`
    
    Thread Pool에서 스레드를 하나 할당해서 테스크를 수행한다.
    
- `restTemplate.getForEntity()`
    
    동기방식으로, 인자로 주어진 url 주소에 HTTP GET 요청을 보내고 결과는 ResponseEntity를 받는다.
    

Thread Pool에서 스레드를 하나씩 할당해 주어 index.html을 불러오는 get 메서드를 실행하도록 하였다.

그리고 하나의 스레드가 정상적으로 수행을 마치면 latch의 숫자가 하나씩 감소한다.

200개의 스레드를 가지고 있는 Thread Pool이 100개의 요청을 다 처리하였다면 latch의 숫자는 0이어야하며 정상적으로 모든 요청을 처리하였기 때문에 await의 값도 true 여야만 한다.

Thread Pool 내부의 스레드가 요청 테스크 보다 많기 때문에 WAS가 정상 동작할 것이라고 생각하였고

테스트 실행결과, WAS가 3초만에 요청들을 처리하는 것을 확인할 수 있었다.

![스크린샷 2022-09-23 오후 6.23.28.png](https://i.imgur.com/XdtUK2j.png)

이번에는 Thread Pool에 200개의 스레드를 생성하고 이보다 많은 400개의 동시 요청을 처리할 수 있는지를 테스트 해보았다.

![스크린샷 2022-09-23 오후 7.35.43.png](https://i.imgur.com/is78b8W.png)

200개의 고정된 크기의 스레드풀을 만들고 400개의 테스크를 넣어주었기 때문에 200개의 워커(스레드)는 200개의 테스크를 먼저 처리하고, 나머지 200개는 Queue에서 할당되기만을 기다리고 있을 것이다.

이후, 먼저 끝난 워커가 나머지 스레드들을 처리하게 된다.

(더 자세한 과정이 궁금하다면 다음 [링크](https://hamait.tistory.com/937?category=79137)를 참고하기를 바란다.)

![스크린샷 2022-09-23 오후 7.35.24.png](https://i.imgur.com/0PMF4bv.png)

그렇다면 더 많은 700개의 테스크를 200개의 고정 크기 스레드풀이 처리할 수 있을까?

현재 테스트 코드의 스레드 풀은 고정 스레드 풀이기 때문에 초기 스레드 개수에서 스레드가 추가로 생성되지는 않는다. 

때문에 newFixedThreadPool의 workQueue 사이즈 만큼의 테스크를 처리할 수 있을것이다.

java/util/concurrent/Executors.java 파일의 Executors 클래스는 정적 메서드로 newFixedPool을 제공한다.

![스크린샷 2022-09-23 오후 8.14.32.png](https://i.imgur.com/WfjqPOD.png)

고정 스레드 풀이기 때문에 corePoolSize와 maximumPoolSize의 값이 같고 corePoolSize보다 스레드 개수가 많아질 일이 없기 때문에 keepAliveTime은 0이다.

눈여겨봐야할 부분은 바로 workQueue인데, [LinkedBlockingQueue](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/LinkedBlockingQueue.html) 를 사용한다.

LinkedBlockingQueue는 생성자의 인자로 queue의 사이즈를 지정해주지 않으면 최대 큐 사이즈를 **Integer.MAX_VALUE (2*31 - 1)**로 설정하고 값이 삽입될 때 마다 동적으로 node를 생성하여 값을 저장한다.

덕분에 우리는 Thread Pool에 존재하는 스레드의 개수보다 더 많은 동시요청이 들어오더라도 정수형의 최대 값 만큼의 테스크를 처리할 수 있다.

테스트 실행 결과, 700개의 테스크를 200개의 스레드가 성공적으로 처리한 것을 확인할 수 있다.

![스크린샷 2022-09-23 오후 7.34.31.png](https://i.imgur.com/582ZHWQ.png)

하지만 스프링부트를 사용하면서 Thread Pool을 직접 적용한적도, 신경써본적도 없었을 수 있다.

실제로 스프링부트는 Thread Pool을 직접 구현할 필요 없이 설정 파일을 통해서 Thread Pool 관련 설정을 할 수 있는 기능을 제공한다.

## 스프링 부트의 Embedded Tomcat

스프링과 스프링부트의 차이점 중 하나는 바로 내장 WAS (Tomcat)지원 여부이다.

지금까지 Thread Pool을 적용하기 위한 코드를 작성하고 이를 알아보았지만, 감사하게도 스프링부트는 Tomcat을 내장하고 있다.

 내장 Tomcat 덕분에 위와 같이 Thread Pool을 구현할 필요 없이 `application.yml` 혹은 [application.properties](http://application.properties) 에서 Tomcat의 Connector설정을 변경 할 수 있다.

```yml
# application.yml (적어놓은 값은 default)
server:
  tomcat:
    threads:
      max: 200 # 생성할 수 있는 thread의 총 개수
      min-spare: 10 # 항상 활성화 되어있는(idle) thread의 개수
    max-connections: 8192 # 수립가능한 connection의 총 개수
    accept-count: 100 # 작업큐의 사이즈 (운영체제에서 관리)
    connection-timeout: 20000 # timeout 판단 기준 시간, 20초
  port: 8080 # 서버를 띄울 포트번호
```

## 마치며

지금까지 Thead Pool을 WAS에 적용해 보면서 WAS가 다중 요청을 어떻게 처리하는지에 대해 알아보았다.

사실 다중 요청 처리에는 Thread Pool 뿐만 아니라 WAS의 Connector도 밀접하게 연관되어 있다.

현재 구현된 WAS는 Socket Connection을 처리할 때 자바의 기본적인 I/O를 사용한다.

Thead Pool에 의해 관리되는 스레드는 소켓 연결을 받아 요청을 처리하고 요청에 대해 응답한 다음, 소켓 연결이 종료되면 Thead Pool에 반납된다.

즉, connection이 닫힐 때까지 하나의 스레드는 특정 connection에 계속 할당되어 있게 된다.

이러한 방식으로 스레드를 할당하여 사용하면, 동시에 사용되는 스레드 수가 동시 접속할 수 있는 사용자 수가 되어 버리는데 스레드들이 충분히 사용되지 않고 idle 상태로 낭비되는 시간이 많이 발생하게 된다.

이러한 문제점을 해결하고 리소스를 효율적으로 사용하기 위한 방법으로 `NIO Connector` 가 등장하였는데 다음 포스트에서는 지금까지 구현한 BIO 방식과 NIO 방식의 차이점에 대해서 알아보도록 하겠다.

---

### 참고자료 📚

- [Task queuing in Executors.newFixedThreadPool()](https://medium.com/@amardeepbhowmick92/task-queuing-in-executors-newfixedthreadpool-31bc8c24b4d2)
- [Introduction to Thread Pools in Java](https://www.baeldung.com/thread-pool-java-and-guava)
- [JAVA 쓰레드풀 분석 - newFixedThreadPool 는 어떻게 동작하는가?](https://hamait.tistory.com/937)
- [스프링부트는 어떻게 다중 유저 요청을 처리할까? (Tomcat9.0 Thread Pool)](https://velog.io/@sihyung92/how-does-springboot-handle-multiple-requests)
- [병행성(Concurrency)을 위한 CountDownLatch](https://imasoftwareengineer.tistory.com/100)
