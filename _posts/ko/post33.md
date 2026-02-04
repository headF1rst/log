---
title: "Netty 내부 동작 원리로 파헤친 WebClient 초기 지연 이슈"
date: "2025-12-26"
section: tech
tags: "Netty"
thumbnail: "https://miro.medium.com/1*KNou9wcBzw1P9IrgfxrJyQ.png"
---

물류 인프라를 보유하고 있는 회사들은 3PL이라는 서비스를 제공합니다. 3PL이란 물류 인프라를 갖춘 회사가 그렇지 못한 판매처로부터 배송 업무를 위탁받아 제공하는 서비스를 말합니다.

판매처는 배송이 필요한 주문 목록을 3PL 시스템에 등록하게 되는데, 이 과정에서 입력된 주문이 유효한 주문인지 확인하기 위해서 여러 시스템과 소통하게 됩니다.

외부 API 호출을 위한 도구로는 WebClient를 사용하고 있었는데요. 아래 지표에서 보듯이, 외부 API 호출까지의 지연 시간이 원인을 알 수 없이 길어지는 현상이 '간헐적'으로 발견되었습니다.

![APM](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/yb2pzcn03325b8pk9z9p.png)

이번 포스트에서는 해당 현상의 원인을 파악하며 알게 된 WebClient의 내부 동작 원리와 Reactor Netty의 아키텍처, 그리고 해결책을 공유하고자 합니다.

## 원인 파악을 위한 가정

지연이 발생한다는 것은 요청이 어딘가에서 즉시 처리되지 못하고 대기하고 있었을 가능성이 높다는 의미입니다.

이전 사진에서 빨간 박스로 표시된 메서드는 객체 생성과 WebClient 호출만을 담당하고 있었습니다. WebClient 내부의 어느 처리 단계에서 병목이 발생할 수 있는지 명확히 식별하려면 아키텍처에 대한 이해가 선행되어야 했습니다. 이를 위해 WebClient의 요청 처리 방식과 Reactor Netty의 아키텍처를 분석했습니다.

## WebClient 실행 메커니즘

먼저 문제가 발생한 코드의 구조를 살펴보겠습니다.

**OrderRegistrationService.java**

```java
private final static int CONCURRENCY_CALL = 10;

List<RefineResult> results = Flux.fromIterable(registerDtos)
    .flatMap(dto -> Mono.defer(() ->
       omsService.refineAddress(dto.getPrimaryAddress(), dto.getSecondaryAddress())
       .defaultIfEmpty(ApiResponse.failure("NO_RESPONSE", false))
    ).map(resp -> new RefineResult(dto, resp)), CONCURRENCY_CALL)
    .collectList()
    .block();
```

**OmsService.java**

```java
@Override
public Mono<ApiResponse<RefineAddressDto>> refineAddress(String primaryAddress, String secondaryAddress) {
    RefineAddressInput request = RefineAddressInput.builder()
        .primaryAddress(primaryAddress)
        .secondaryAddress(secondaryAddress)
        .build();

    return omsClient.post()
        .uri("/refine-address")
        .bodyValue(request)
        .retrieve()
        .bodyToMono(RefineAddressOutput.class)
        .timeout(Duration.ofSeconds(5))
        .retryWhen(RetryPolicy.fixedDelay(1, Duration.ofMillis(100), "[OMS 주소정제] 재시도 요청: " + request))
        .map(output -> output.isSuccess() ? ApiResponse.success(RefineAddressDto.from(output))
            : ApiResponse.<RefineAddressDto>failure("응답 결과에 데이터가 없음", false))
        .onErrorResume(ex -> ExternalErrorHandler.handleError(ex, extractOmsErrorMessage(ex), "OMS 주소정제"));
}
```

## Cold Sequence와 구독 시점

위 코드에서 실제 HTTP 요청이 언제 발생하는지 이해하려면 WebClient의 Cold Sequence 특성을 먼저 이해해야 합니다.

WebClient의 리액티브 체인은 Cold Sequence로 동작합니다. 구독이 발생하기 전까지는 파이프라인만 정의될 뿐, 실제 실행은 일어나지 않습니다. HTTP 요청 발송 시점은 `subscribe()`가 호출되는 순간이며, 코드상의 `block()`이 내부적으로 이를 트리거합니다.

```java
List<RefineResult> results = Flux.fromIterable(registerDtos)
    .flatMap(dto -> Mono.defer(() -> ...))
    .collectList()
    .block();  // ← 구독 시작점
```

`block()`의 구독 신호는 **역방향(upstream)**으로 전파됩니다

```text
block() → collectList() → flatMap() → Mono.defer() → WebClient 체인
```

`flatMap(Function, int concurrency)`은 인자로 전달된 concurrency 수 만큼의 Mono를 동시에 구독합니다. `Mono.defer()`는 각 구독 시점마다 내부 람다를 실행하여 새로운 Mono를 생성하므로, 각 DTO마다 독립적인 HTTP 요청 파이프라인이 생성됩니다.

```java
// 구독될 때마다 새로운 WebClient 체인 생성
Mono.defer(() -> omsService.refineAddress(...))
```

## TaskQueue로의 전달

`omsService.refineAddress(...)`가 반환하는 Mono가 구독되면 요청 설정을 빌드하고, `.retrieve()` 이후 체인이 구독되면서 쓰기 요청이 **TaskQueue**에 저장됩니다. 

```java
omsClient.post()
    .uri("/refine-address")
    .bodyValue(request)
    .retrieve()
    .bodyToMono(RefineAddressOutput.class)
```

POST 요청이 NioEventLoop의 TaskQueue에 저장되면, WebClient를 호출한 스레드의 역할은 여기서 끝납니다. 이후 작업은 EventLoop 스레드가 담당합니다.

## Netty EventLoop 스레드의 동작 원리

WebClient의 HTTP 요청이 TaskQueue에 저장되는 이유는 Netty의 **이벤트 루프 기반 비동기 처리 모델** 때문입니다. 이 모델을 이해하려면 먼저 네트워크 통신의 기본 개념을 짚고 넘어가야 합니다.

### User Space와 Kernel Space

서로 다른 머신의 애플리케이션이 통신하려면 시스템 콜로 유저 모드와 커널 모드를 오가며 커널 내 소켓 버퍼에 데이터를 읽거나 써야 합니다.

![Web protocol](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/qjtark4qo45ybfnj0lwk.png)

소켓 버퍼에 데이터를 어떻게 읽고 쓰느냐에 따라 Blocking I/O와 Non-blocking I/O로 나뉩니다. 둘의 차이는 스레드가 시스템 콜 후 응답을 기다리는지 여부입니다.

- `Blocking I/O`: 데이터가 준비될 때까지 스레드가 대기
- `Non-blocking I/O`: 데이터가 없으면 즉시 반환, 스레드는 다른 작업 수행 가능

효율적인 Non-blocking I/O를 구현하려면 특정 이벤트를 등록해 놓고 해당 이벤트가 발생했을 때만 처리하는 방식이 필요합니다. 이렇게 하면 하나의 스레드로 여러 채널을 관리할 수 있습니다.

### Multiplexing I/O와 Selector

이벤트 기반 소켓 통신에서는 **하나의 Selector가 여러 소켓 채널의 변화를 감지**하며 이벤트가 발생했을 때만 처리합니다. 이를 `Multiplexing I/O`라고 합니다.

![Multiplexing I/O](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7sqinsru5nse3xrks1f3.png)

Linux에서 이 Multiplexing I/O는 `epoll` 시스템 콜로 구현됩니다. Java NIO의 Selector는 내부적으로 이 epoll을 사용합니다.

## Selector.select()의 실제 동작

OS 커널이 능동적으로 I/O 이벤트를 Selector에 알려주는 것처럼 보이지만, 실제로는 그렇지 않습니다.

Selector.select()가 호출되면 유저 모드에서 커널 모드로 전환되고, 내부적으로 `epoll_wait()` 시스템 콜이 호출되면서 호출 스레드는 커널에서 블로킹 상태로 대기합니다.

![How Selector work](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/rokpi9s20m4thyx0akjp.png)

`epoll_wait`을 호출하면, OS 커널은 이전에 `epoll_ctl`로 등록된 파일 디스크립터(소켓)들을 모니터링하다가, 네트워크 카드에 데이터가 도착하거나 소켓 버퍼에 쓰기가 가능해지는 등의 I/O 이벤트가 발생하면 이를 감지합니다. I/O가 발생한 소켓은 커널 내 Ready Queue에 추가되고, `epoll_wait()`이 반환되어 대기 중이던 스레드가 깨어납니다.

즉, User Space가 커널에 요청하고 시스템 콜로 응답받는 pull 구조입니다.

`select()` 자체는 블로킹 호출이지만, 하나의 스레드가 여러 소켓을 감시하고 이벤트가 발생한 소켓들만 골라서 처리합니다. 따라서 각 소켓 입장에서는 전용 스레드 없이도 비동기적으로 처리되는 것과 같은 효과를 얻게 됩니다.

## NioEventLoop의 구조

이제 Netty의 EventLoop가 Selector를 어떻게 활용하는지 살펴보겠습니다.

EventLoop의 구현체인 NioEventLoop는 `1 Thread + 1 Selector + 1 TaskQueue`로 구성됩니다.

![NioEventLoop Structure](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/c1xl9zcj1h0pk3eml8sr.png)

EventLoop 스레드는 기본적으로 CPU 코어 수만큼 생성됩니다. `Math.max(Runtime.getRuntime().availableProcessors(), 4)`

각 EventLoop 스레드는 전용 NioEventLoop 인스턴스를 실행하며, 단일 스레드가 무한 루프를 돌면서 두 가지 작업을 수행합니다.

1. I/O 이벤트 처리 (네트워크 읽기/쓰기)
2. TaskQueue의 작업 처리 (사용자가 등록한 Runnable)

```java
// 개념적인 코드
while (true) {
    // 1. 네트워크에서 뭔가 일어났는지 확인
    네트워크_이벤트_확인();
    // 2. 일어난 일들 처리
    이벤트들_처리();
    // 3. 누가 시켜놓은 작업들 처리
    작업큐에서_작업꺼내서_실행();
}
```

실제 Netty 코드를 보면 (Netty 4.2 기준)

```java
// SingleThreadIoEventLoop.java:153-164
protected void run() {
    do {
        runIo();                    // ← 1+2: I/O 확인 및 처리
        runAllTasks(maxTasksPerRun); // ← 3: 작업큐 처리
    } while (!confirmShutdown());
}
```
 
`runIo()`는 내부적으로 `NioIoHandler.run()`을 호출합니다.

```java
// NioIoHandler.java:420-485
public int run(IoExecutionContext runner) {
    // 1단계: select - I/O 이벤트 존재 여부 확인
    select(runner, wakenUp.getAndSet(false));

    // 2단계: 있으면 처리
    return processSelectedKeys();
}
```

이제 각 단계를 자세히 살펴보겠습니다.

### 1. select() - I/O 이벤트 감지

EventLoop는 I/O 이벤트 처리와 TaskQueue에 쌓인 작업 처리, 두 가지 역할을 수행합니다. 이때 `Selector.select()`를 사용하여 처리할 I/O 이벤트가 있는지 확인합니다.

`select()` 메서드는 TaskQueue에 작업이 존재하는지 여부에 따라 적절한 select 방식을 결정합니다.

```java
// NioIoHandler.java
private void select(IoExecutionContext runner, boolean oldWakenUp) {
    Selector selector = this.selector;

    for (;;) {
        // 태스크가 있으면 즉시 확인하고 넘어감
        if (!runner.canBlock() && wakenUp.compareAndSet(false, true)) {
            selector.selectNow();   // 작업 있으면 바로 확인
            break;
        }

        // 태스크가 없으면 이벤트 올 때까지 대기
        int selectedKeys = selector.select(timeoutMillis);
    }
}
```

```java
@Override
public boolean canBlock() {
   assert inEventLoop();
   return !hasTasks() && !hasScheduledTasks();
}
```

#### TaskQueue가 비었을 때

`TaskQueue`가 비어있으면 Netty는 `select(timeout)`을 호출하여 커널로 부터 I/O 이벤트 신호를 받거나 타임아웃이 될 때까지 블로킹 상태로 대기하여 CPU 사용을 줄입니다.

만약 대기 중 `TaskQueue`에 새 task가 들어오면, `wakeup` 메커니즘을 통해 `select()`의 블로킹을 깨워서 즉시 반환시키고, 루프를 돌며 TaskQueue를 처리할 수 있게 합니다.

#### TaskQueue가 있을 때

`TaskQueue`에 작업이 있으면 `selectNow()`를 호출하여 I/O 이벤트가 있는지 빠르게 확인하고, 곧바로 테스크 실행으로 넘어가 작업 지연을 줄입니다.

만약 TaskQueue에 작업이 있는 상황에서 `select(timeout)`을 호출해 블로킹되면, EventLoop 스레드가 잠들어 테스크 처리가 지연되고 응답성이 떨어지게 됩니다. 반대로 `selectNow()`만 계속 수행하면 준비된 I/O 이벤트가 없어도 계속 확인하므로 불필요한 반복으로 busy-wait(CPU 낭비)이 발생할 수 있습니다.

즉, Netty의 `select()`는 상황에 따라 적절한 방식을 선택하여 CPU를 낭비하지 않고 효율적으로 I/O 이벤트를 대기합니다.

#### select() 호출 이후의 내부 동작

앞서 Netty가 상황에 따라 `select(timeout)` 또는 `selectNow()`를 선택적으로 호출한다는 것을 살펴보았습니다. 이제 이 호출이 실제로 어떤 과정을 거쳐 커널까지 도달하고, 다시 돌아오는지 살펴보겠습니다.

`Selector.select()`를 호출하면 JDK 내부의 `SelectorImpl` 클래스가 이를 처리합니다.

```java
// SelectorImpl.java
@Override
    public final int select(long timeout) throws IOException {
        return lockAndDoSelect(null, (timeout == 0) ? -1 : timeout);
    }
```

`lockAndDoSelect()`는 동기화를 수행한 뒤 Multiplexing I/O를 담당하는 `doSelect()`를 호출합니다.

```java
// SelectorImpl.java
private int lockAndDoSelect(Consumer<SelectionKey> action, long timeout)
      throws IOException
{
    synchronized (this) {
        ensureOpen();
        if (inSelect)
            throw new IllegalStateException("select in progress");
        inSelect = true;
        try {
            synchronized (publicSelectedKeys) {
                return doSelect(action, timeout);
            }
        } finally {
            inSelect = false;
        }
    }
}
```

여기서 `doSelect()`는 추상 메서드입니다. 운영체제마다 효율적인 Multiplexing I/O 메커니즘이 다르기 때문에, JDK는 플랫폼별로 다른 구현체를 제공합니다.

| OS      | 구현 클래스            | 시스템 콜      |
|---------|---------------------|--------------|
| Linux   | EPollSelectorImpl   | epoll_wait() |
| macOS   | KQueueSelectorImpl  | kevent()     |
| Windows | WindowsSelectorImpl | IOCP         |

이 글에서는 서버 환경에서 가장 많이 사용되는 **Linux의 epoll 기반 구현**을 중심으로 살펴보겠습니다. (JDK 21 기준)

### EPollSelectorImpl 인스턴스는 언제 생성되는가?

EPollSelectorImpl 인스턴스는 `Selector.open()` 호출 시점에 초기화됩니다.

1. 애플리케이션에서 new NioEventLoopGroup(n) 호출
2. 내부적으로 n개의 NioIoHandler 생성
3. 각 NioIoHandler 생성자에서 provider.openSelector() 호출
4. Linux 환경에서는 EPollSelectorImpl 인스턴스 생성

EPollSelectorImpl 생성 시 다음과 같은 초기화가 이루어집니다.

```java
EPollSelectorImpl(SelectorProvider sp) throws IOException {
   super(sp);

   // 1. epoll 인스턴스 생성 (epoll_create 시스템 콜)
   this.epfd = EPoll.create();

   // 2. epoll_wait 결과를 저장할 네이티브 메모리 할당
   this.pollArrayAddress = EPoll.allocatePollArray(NUM_EPOLLEVENTS);

   // 3. wakeup용 EventFD 생성
   this.eventfd = new EventFD();
   IOUtil.configureBlocking(IOUtil.newFD(eventfd.efd()), false);

   // 4. EventFD를 epoll에 EPOLLIN으로 등록
   EPoll.ctl(epfd, EPOLL_CTL_ADD, eventfd.efd(), EPOLLIN);
}
```

즉, 하나의 EventLoop마다 하나의 epoll 인스턴스가 매핑됩니다.

#### epoll의 세 가지 시스템 콜

epoll은 세 가지 시스템 콜을 제공합니다

- `epoll_create`: epoll 인스턴스(채널 감시 저장소) 생성
- `epoll_ctl`: 감시할 FD 추가/수정/삭제
- `epoll_wait`: 이벤트(read/write)가 발생할 때까지 대기하고, 이벤트가 발생한 FD 목록을 반환

JDK의 `EPoll.wait()`는 JNI를 통해 커널의 `epoll_wait()` 시스템 콜을 직접 호출합니다.

`epoll_wait()`는 미리 할당된 네이티브 메모리의 `epoll_event` 구조체 배열에 준비된 이벤트 정보를 채우고, 준비된 이벤트 개수를 반환합니다. 이 배열에는 각 FD와 발생한  이벤트 타입(EPOLLIN/EPOLLOUT/EPOLLERR 등)이 담겨 있습니다.

EPollSelectorImpl.doSelect()에서 이 메서드들이 실제로 호출되는 흐름을 보면:

```java
// EpollSelectorImpl.java
@Override
protected int doSelect(Consumer<SelectionKey> action, long timeout) throws IOException {
    int to = (int) Math.min(timeout, Integer.MAX_VALUE);

    int numEntries;
    processUpdateQueue();      // epoll_ctl로 관심 이벤트 변경 반영
    processDeregisterQueue();

    try {
        begin(blocking);
        // epoll_wait 시스템 콜 호출
        numEntries = EPoll.wait(epfd, pollArrayAddress, NUM_EPOLLEVENTS, to);
    } finally {
        end(blocking);
    }

    // 반환된 이벤트 처리
    return processEvents(numEntries, action);
}
```

### 2. processSelectedKeys() - I/O 이벤트 처리

`EPoll.wait()`가 이벤트 개수를 반환하면, `EPollSelectorImpl.processEvents()`가 해당 개수만큼 이벤트 배열을 순회하며 각 FD에 연결된 SelectionKey를 찾아 selectedKeys에 추가합니다. 이후 Netty의 `NioIoHandler.processSelectedKeys()`가 `seletedKeys`를 순회하며 각 채널의 이벤트를 처리합니다.

```java
 // NioIoHandler.java
  private int processSelectedKeysOptimized() {
      int handled = 0;
      for (int i = 0; i < selectedKeys.size; ++i) {
          SelectionKey k = selectedKeys.keys[i];
          selectedKeys.keys[i] = null;  // GC를 위해 null 처리

          processSelectedKey(k);  // 각 이벤트 처리
          ++handled;
      }
      return handled;
  }
```

```java
  private void processSelectedKey(SelectionKey k) {
      final DefaultNioRegistration registration = (DefaultNioRegistration) k.attachment();

      // 준비된 이벤트를 핸들러에 전달
      // OP_READ  → 데이터 수신
      // OP_WRITE → 데이터 송신
      // OP_CONNECT → 연결 완료
      // OP_ACCEPT → 새 연결 요청
      registration.handle(k.readyOps());
  }
```

`registration.handle()`은 내부적으로 `AbstractNioChannel.AbstractNioUnsafe.handle()`을 호출합니다. 이 메서드는 이벤트 타입에 따라 적절한 처리를 수행합니다.

```java
// AbstractNioChannel.java:420-450
@Override
public void handle(IoRegistration registration, IoEvent event) {
    NioIoOps nioReadyOps = ((NioIoEvent) event).ops();

    // 1. OP_CONNECT: 연결 완료 처리 (가장 먼저 처리)
    if (nioReadyOps.contains(NioIoOps.CONNECT)) {
        removeAndSubmit(NioIoOps.CONNECT);
        unsafe().finishConnect();
    }

    // 2. OP_WRITE: 쓰기 가능 상태 - 대기 중인 버퍼 전송
    if (nioReadyOps.contains(NioIoOps.WRITE)) {
        forceFlush();
    }

    // 3. OP_READ / OP_ACCEPT: 데이터 수신 또는 새 연결 수락
    if (nioReadyOps.contains(NioIoOps.READ_AND_ACCEPT) || nioReadyOps.equals(NioIoOps.NONE)) {
        read();
    }
}
```

### 3. runAllTasks() - Non-I/O Task 처리

I/O 이벤트 처리가 끝나면 runAllTasks()가 호출되어 TaskQueue에 쌓인 작업들을 처리합니다. WebClient의 HTTP 요청도 바로 이 단계에서 실제로 전송됩니다.

```java
// SingleThreadEventExecutor.java
protected boolean runAllTasks(long timeoutNanos) {
     // 스케줄 큐에서 실행 가능한 태스크를 TaskQueue로 이동
     fetchFromScheduledTaskQueue();
     Runnable task = pollTask();

     final long deadline = timeoutNanos > 0 ? getCurrentTimeNanos() + timeoutNanos : 0;
     long runTasks = 0;

     for (;;) {
         safeExecute(task); // 테스크 실행

         runTasks ++;

         task = pollTask();
         if (task == null) {
             lastExecutionTime = getCurrentTimeNanos();
             break;
          }
      }

     afterRunningAllTasks();
     return true;
}
```

### 전체 흐름 요약

지금까지 살펴본 내용을 하나의 다이어그램으로 정리하면 다음과 같습니다.

![overall](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/s5f9g86wsuwo500ky37d.png)

병목이 발생한 인스턴스의 vCPU 수는 2개였습니다. Netty의 EventLoop 스레드 수는 기본적으로 `Math.max(availableProcessors(), 4)`로 결정되므로, 이 환경에서는 EventLoop 스레드가 **총 4개** 존재합니다.

지금까지 살펴본 바와 같이 Netty의 EventLoop는 Multiplexing I/O 방식으로 동작하기 때문에 적은 수의 스레드로도 많은 동시 요청을 처리할 수 있습니다. `epoll_wait()`은 수천 개의 채널이 등록되어 있어도 실제로 I/O 이벤트가 발생한 채널만 반환하므로, 동시 요청 수가 EventLoop 스레드 수보다 많다고 해서 병목이 발생하지는 않습니다.

따라서 **"동시 요청 10개 > EventLoop 스레드 4개"는 병목의 원인이 아닙니다.**

### 또 다른 가설: Parallel Scheduler 스레드 경합

그렇다면 무엇이 문제였을까요? 문제가 발생한 코드를 다시 살펴보겠습니다.

```java
return omsClient.post()
   .uri("/refine-address")
   .bodyValue(request)
   .retrieve()
   .bodyToMono(RefineAddressOutput.class)
   .timeout(Duration.ofSeconds(5)) // ← 여기
   .retryWhen(RetryPolicy.fixedDelay(1, Duration.ofMillis(100), "...")) // ← 여기
   // ...
```

`timeout()`과 `retryWhen()`의 fixedDelay()는 내부적으로 **Schedulers.parallel()**을 사용하여 타이머를 스케줄링합니다. 그리고 Parallel Scheduler의 스레드 수 역시 CPU 코어 수에 비례합니다.

vCPU 2개 환경에서 동시 요청 수가 10개인 환경에서 할당된 Parallel Scheduler 스레드 수보다 많은 요청을 처리하면서 병목이 발생했을 가능성이 있습니다.

## 검증

실제로 CPU 코어 수 제한이 WebClient 동시 호출 성능에 미치는 영향을 측정하기 위해 `JMH(Java Microbenchmark Harness)`를 사용하여 벤치마크를 수행했습니다.

### 테스트 환경

**공통 설정**

- 동시 호출 수 (Concurrency): 10
- 총 요청 수 (totalRequests): 50
- 서버 응답 지연 (serverLatencyMs): 200m
- 측정 방식: 10회 반복 측정 후 평균값 산출

### Case 1: CPU 코어 10개 (refineAddress_concurrency10_cpu10)

- JVM 옵션: `-XX:ActiveProcessorCount=10`
- Available Processors: 10
- Reactor Schedulers DefaultPoolSize: 10

![Benchmark result1](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/izmlmaiex478fbxj28hm.png)

![Benchmark result2](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/lnz16df329xde31f8r3k.png)

### Case 2: CPU 코어 2개 (refineAddress_concurrency10_cpu2)

- JVM 옵션: `-XX:ActiveProcessorCount=2`
- Available Processors: 2
- Reactor Schedulers DefaultPoolSize: 2

![Benchmark result3](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ma6r5otdoiguigptt1y8.png)

![Benchmark result4](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/d26n2gg4dthjtbew5m8c.png)

### 결과

![JMH Benchmark result](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/640a2hz9kqcccv395blw.png)

| 지표    | CPU 10 코어            | CPU 2 코어      |
|---------|---------------------|--------------|
| 평균 처리 시간   | 1035.498 ms   | 1049.652 ms |
| 안정성 (Stdev)   | 7.496  | 18.554  |
| 신뢰구간 폭 | 22.667 ms | 56.103 ms         |
| Reactor 워커 수   | 10  |  2  |

예상과 달리, CPU 코어 수(Parallel Scheduler Pool Size)에 따른 처리 시간 차이는 약 14ms(1.4%) 로 거의 없었습니다.

스레드 수가 2개에서 10개로 증가해도 성능 향상이 미미합니다. timeout/retry의 스케줄링 자체는 매우 가벼운 작업이므로, 스레드 수가 적어도 큰 영향을 주지 않는것을 확인할 수 있었습니다.

**벤치 마크 코드**

```java
public class RunBenchmark {

    public static void main(String[] args) throws RunnerException {

        Options options = new OptionsBuilder()
            .include(OmsWebClientConcurrencyBenchmark.class.getSimpleName())
            .forks(1)
            .warmupIterations(10) // 각 벤치 마크 실행 전 최적화를 위한 웜업
            .warmupTime(TimeValue.seconds(5))
            .measurementIterations(10) // 각 벤치마크 측정. 10회 반복
            .measurementTime(TimeValue.seconds(5))
            .timeUnit(TimeUnit.MILLISECONDS)
            .addProfiler(JavaFlightRecorderProfiler.class)  // JFR 프로파일러 추가
            .resultFormat(ResultFormatType.JSON)
            .result("jmh-results.json")
            .build();

        new Runner(options).run();
    }
}
```

```java
@BenchmarkMode(Mode.AverageTime)
public class OmsWebClientConcurrencyBenchmark {

    private static final int CONCURRENCY_CALL = 10;

    @State(Scope.Benchmark)
    public static class BenchState {

        @Param({"50"})
        public int totalRequests; // 한 번의 벤치마크 호출당 요청 총 개수

        @Param({"200"})
        public int serverLatencyMs; // 목 서버가 응답 전 인위적으로 대기할 지연(ms)

        private DisposableServer server;
        private OmsService omsService;

        @Setup(Level.Trial)
        public void setup() {
            int availableProcessors = Runtime.getRuntime().availableProcessors();
            String reactorPoolSize = System.getProperty("reactor.schedulers.defaultPoolSize", String.valueOf(availableProcessors));
            System.out.println("\n========================================");
            System.out.println("Benchmark started: OMS WebClient concurrency(10) under different CPU core caps");
            System.out.println("Params: totalRequests=" + totalRequests + ", serverLatencyMs=" + serverLatencyMs);
            System.out.println("Available processors (current JVM): " + availableProcessors);
            System.out.println("Reactor Schedulers DefaultPoolSize: " + reactorPoolSize);
            System.out.println("========================================");

            // 목 응답 JSON
            String json = "{" +
                "\"jibeonAddress\":{\"primaryAddress\":\"서울시 강남구\",\"secondaryAddress\":\"테스트로 123\",\"zipCode\":\"06200\"}," +
                "\"roadAddress\":{\"primaryAddress\":\"서울시 강남구\",\"secondaryAddress\":\"테스트로 123\",\"zipCode\":\"06200\"}," +
                "\"sigungu\":\"강남구\",\"dong\":\"역삼동\",\"provider\":\"OMS\",\"hcode\":\"11110\",\"bcode\":\"1111010100\",\"buildingNumber\":\"123\"" +
                "}";

            this.server = HttpServer.create()
                .host("127.0.0.1")
                .port(0)
                .route(routes -> routes.post("/refine-address", (req, res) ->
                    res.header("Content-Type", "application/json")
                        .sendString(Mono.delay(Duration.ofMillis(serverLatencyMs))
                            .then(Mono.just(json)))))
                .bindNow();

            int port = server.port();
            WebClient omsClient = WebClient.builder().baseUrl("http://127.0.0.1:" + port).build();
            WebClient fbkClient = WebClient.builder().baseUrl("http://127.0.0.1:" + port).build();
            this.omsService = new OmsServiceImpl(omsClient, fbkClient);
        }

        @TearDown(Level.Trial)
        public void tearDown() {
            if (server != null) {
                server.disposeNow();
            }
        }
    }

    private List<ApiResponse<RefineAddressDto>> invokeRefineAddressBatch(OmsService omsService, int totalRequests) {
        return Flux.range(0, totalRequests)
            .flatMap(i -> Mono.defer(() -> omsService.refineAddressIgnore("서울시 강남구", "테스트로 123")
                .defaultIfEmpty(ApiResponse.failure("NO_RESPONSE", false))), CONCURRENCY_CALL)
            .collectList()
            .block();
    }

    // 코어 수 2로 실행
    @Benchmark
    @Fork(value = 1, jvmArgsAppend = {
        "-XX:ActiveProcessorCount=2",
        "-XX:FlightRecorderOptions=threadbuffersize=16k,globalbuffersize=10m,memorysize=50m",
        "-XX:StartFlightRecording=settings=profile"
    })
    public List<ApiResponse<RefineAddressDto>> refineAddress_concurrency10_cpu2(BenchState state, Blackhole blackhole) {
        var result = invokeRefineAddressBatch(state.omsService, state.totalRequests);
        blackhole.consume(result);
        return result;
    }

    // 코어 수 10으로 실행
    @Benchmark
    @Fork(value = 1, jvmArgsAppend = {
        "-XX:ActiveProcessorCount=10",
        "-XX:FlightRecorderOptions=threadbuffersize=16k,globalbuffersize=10m,memorysize=50m",
        "-XX:StartFlightRecording=settings=profile"
    })
    public List<ApiResponse<RefineAddressDto>> refineAddress_concurrency10_cpu10(BenchState state, Blackhole blackhole) {
        var result = invokeRefineAddressBatch(state.omsService, state.totalRequests);
        blackhole.consume(result);
        return result;
    }
}
```

## 지연의 원인: Cold Start

원인을 분석하는 동안 유사한 지표를 가진 Trace를 추가로 수집할 수 있었는데요. 지표에서 한 가지 공통된 패턴을 발견할 수 있었습니다.

지연이 발생한 모든 케이스가 애플리케이션 배포 직후 첫 번째 외부 API 호출 시점에 발생한다는 사실을 발견했습니다.

Netty의 리소스는 **Lazy Initialization** 방식으로 동작합니다. 즉, `WebClient`를 생성하는 시점이 아니라 **실제로 첫 번째 HTTP 요청을 보내는 시점**에 초기화가 이루어집니다.

## Cold Start 해결책

두 가지 해결책을 검토했습니다.

1. `Connection Pool에 사전 커넥션 맺기`: 미리 연결을 생성해 대기
2. `Warmup 옵션`: 리소스를 사전 로드하되 실제 연결은 필요 시점에 생성

### Connection Pool에 사전 커넥션 생성

처음에는 애플리케이션 시작 시점에 미리 커넥션을 생성하여 풀에 대기시키는 방법을 고려하였습니다. 커넥션은 `maxIdleTime`, `maxLifeTime` 만큼 살아있다가 종료되는데, 기본값은 `-1`로 무제한입니다. 즉, 별도로 설정하지 않으면 커넥션이 시간 제한 없이 풀에 유지됩니다.

단, 두 설정값을 기본값(-1)으로 두면 서버 측의 `keepAliveTimeout` 설정과 충돌할 수 있습니다. 

서버에서 커넥션을 먼저 끊으면 클라이언트는 이미 닫힌 커넥션으로 요청을 보내게 되어 `"Connection reset by peer"` 오류가 발생할 수 있습니다. 따라서 실무에서는 **서버의 keepAliveTimeout보다 작은 값으로 maxIdleTime을 설정**하는 것이 권장됩니다.


결국 애플리케이션 시작 시점에 미리 커넥션을 생성해 놓더라도 일정 시간 요청이 없으면 유휴 커넥션이 자동 해제되므로 트래픽이 간헐적인 '주문 등록'과 같은 케이스에는 적합하지 않습니다.

> Netty 이슈에서도 ConnectionPool을 웜업하는건 해결책이 아니며 고려사항이 아니라는것을 확인할 수 있습니다. ([Add warmup functionality for the servers/clients #1455](https://github.com/reactor/reactor-netty/pull/1455))

![Connection warmup](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/umgeh6s5sbz9pi13lwf2.png)

### Warmup 옵션

반면 warmup은 실제 TCP 커넥션을 맺지 않고, 이후 요청에서 재사용되는 네트워크 리소스들을 애플리케이션 시작 시점에 미리 초기화 합니다. 따라서 커넥션이 해제되더라도 EventLoop, DNS 리졸버 등은 이미 로드되어 있어, 후속 요청에서 초기화 비용이 발생하지 않습니다.

```java
@Configuration
public class WebClientConfig {

   @Bean
   public WebClient omsWebClient() {
      HttpClient httpClient = HttpClient.create()
         .baseUrl("https://oms-api.example.com");

       // 애플리케이션 시작 시 warmup 수행
       httpClient.warmup().block();

       return WebClient.builder()
           .clientConnector(new ReactorClientHttpConnector(httpClient))
           .build();
   }
}
```

**Warmup으로 미리 준비되는 리소스**

Warmup을 호출하면, HttpClient/TcpClient 내부에서 다음 리소스들이 구성에 따라 사전에 초기화됩니다.

- **EventLoopGroup**: EventLoop 스레드 풀 생성
- **DNS Resolver**: 비동기 DNS 리졸버 초기화
- **Native transport 라이브러리**: epoll 등 네이티브 루프 및 관련 라이브러리 로드
- **SSL Context**: TLS 핸드셰이크용 SSL 엔진 (HTTPS인 경우)

## 마무리

지금까지 WebClient의 간헐적 지연 문제를 추적하며 Netty EventLoop가 Selector와 TaskQueue를 관리하는 방식, Linux epoll의 Multiplexing I/O 메커니즘, 그리고 실제 원인이었던 Netty의 Lazy Initialization과 warmup 해결책까지 살펴보았습니다.

이 과정을 통해 단순히 라이브러리를 사용하는 것을 넘어, 내부 동작 원리를 이해하는 것이 얼마나 중요한지 다시 한번 깨달았습니다. 표면적인 증상만 보고 '코어 수를 느리자'거나 '타임아웃을 조정하자'는 식의 접근 대신, 각 레이어를 단계별로 파고들면서 병목이 발생할 수 있는 지점을 하나씩 가시화하고 범위를 좁혀나갈 수 있었습니다.
