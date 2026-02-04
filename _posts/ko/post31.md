---
title: "Resilience4j Bulkhead 패턴: 대용량 데이터 처리 안정성 높이기"
date: "2025-10-24"
section: tech
tags: "Java"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fg3q8du889pux1selrwp9.png"
---

물류 시스템을 개발하다 보면, 대량의 데이터를 엑셀 파일로 내보내야 하는 요구사항을 자주 마주합니다. 사용자가 지정한 기간의 데이터를 엑셀로 제공하려면, 먼저 데이터를 조회한 뒤 Apache POI로 엑셀 형식으로 변환하는 과정이 필요합니다.

다만 이 과정을 한 번에 처리하면 메모리 사용량이 급증해 `OutOfMemoryException`이 발생할 수 있습니다. 따라서 데이터를 N개 단위로 나누어 조회하고 변환하는 작업을 반복하는 것이 안전합니다. 특히 POI의 SXSSF는 슬라이딩 윈도우 방식으로 설정된 행 수만 메모리에 유지하고, 초과분은 임시 파일로 디스크에 플러시 하여 메모리 상한을 넘지 않도록 합니다.

하지만 요청이 동시에 몰리는 상황에서는 얘기가 달라집니다. 동시 다운로드 건수와 윈도우 크기가 곱해지면서 `요청 수 × 윈도우 크기`에 해당하는 데이터가 동시에 메모리에 올라가 OOM 위험이 다시 커집니다.

이를 방지하는 방법으로는

> - 서비스 레벨에서 동시 요청 수를 제한하는 방법,
> - 요청마다 독립 프로세스를 띄워 비동기로 처리해 격리하는 방법

이 있습니다.

이번 포스트에서는 `Bulkhead 패턴`을 활용해 동시 요청을 효과적으로 제한하는 방법을 중심으로 정리해 보도록 하겠습니다.

## Bulkhead 패턴이란

![Bulkhead](https://upload.wikimedia.org/wikipedia/commons/1/11/Compartments_and_watertight_subdivision_of_a_ship%27s_hull_%28Seaman%27s_Pocket-Book%2C_1943%29_%28cropped%29.jpg)

Bulkhead는 본래 선박 구조에서 온 용어로, 선체 내부를 여러 개의 격벽으로 나누어 한 구획에 물이 차도 다른 구획으로 침수 피해가 번지지 않게 하는 설계를 뜻합니다. 이러한 선박 설계에서 착안한 Bulkhead 패턴은 시스템 자원을 영역별로 분리하여, 한 영역에 과부하나 장애가 발생해도 전체로 확산하지 않도록 합니다.

구체적으로는 특정 기능이나 엔드포인트를 논리/물리적으로 구분하고, 각 구획에 허용할 동시 처리 수와 대기열 상한을 고정합니다. 이렇게 하면 한 구획의 트래픽이 급증하거나 해당 구획이 리소스를 모두 소진하더라도, 다른 API 처리를 위한 자원은 보존되어 한 작업 때문에 다른 작업이 지연되는 상황을 예방할 수 있습니다.

엑셀 파일 생성은 메모리 소모가 크고 일반적인 API보다 처리 시간이 길기 때문에, 동일 서버가 다른 중요한 요청까지 함께 처리하는 환경에서는 엑셀 다운로드가 몰릴 때 톰캣 스레드나 메모리 같은 공용 리소스를 잠식하여 다른 API까지 느려지는 등 문제가 발생할 수 있습니다. Bulkhead 패턴은 작업별로 리소스를 분리하고 상한을 설정해 이러한 장애 전파를 차단합니다.

## Resilience4j를 사용한 Bulkhead 패턴 적용

이러한 Bulkhead 패턴은 직접 구현할 필요 없이 라이브러리를 사용하여 간단하게 구현할 수 있습니다.

대표적인 라이브러리에는 `Resilience4j`, `Netflix Hystrix`, `Alibaba Sentinel` 등이 있는데 가장 활발하게 개발되고 있고, Spring 생태계와의 통합도 잘 되어있는 [Resilience4j](https://resilience4j.readme.io/)를 사용하도록 하겠습니다.
(Resilience4j는 이 외에도 서킷 브레이커나 재시도 등 시스템의 회복 탄력성을 위한 다양한 기능들을 제공합니다)

Resilience4j를 사용하여 Bulkhead 패턴을 적용하는 방법은 간단합니다.

### 의존성 추가

아래와 같이 의존성을 추가해 줍니다.

```gradle
// Resilience4j
implementation 'io.github.resilience4j:resilience4j-spring-boot3:2.3.0'
```

참고: https://mvnrepository.com/artifact/io.github.resilience4j

그리고 `application.yml`에 아래와 같이 추가합니다

```yml
resilience4j:
  bulkhead:
    instances:
      excelStream: # 벌크헤드의 이름
        maxConcurrentCalls: 5   # 동시에 5건까지만 스트리밍 생성
        maxWaitDuration: 100ms    # 100ms 초과 시 거절
```

`maxConcurrentCalls`는 허용할 최대 동시 호출 수(기본값: 25), `maxWaitDuration`은 최대 동시 호출 수에 도달했을 때 추가 요청이 들어온 경우 얼마나 대기할 것인지를 나타냅니다. 기본값인 0s로 설정할 경우 대기 없이 즉시 거절하게 됩니다.

![default value](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/dkfxicw3isiauf3943u9.png)

`application.yml`에 옵션을 추가하지 않고 Bulkhead 인스턴스를 만들고 주입해서 사용하는 방법도 가능합니다.

**BulkheadSemaphoreConfig.java**

```java
@Configuration
public class BulkheadSemaphoreConfig {

    @Bean
    public BulkheadConfigCustomizer excelStreamSemaphore() {
        return BulkheadConfigCustomizer.of("excelStream", builder -> builder
                .maxConcurrentCalls(5)
                .maxWaitDuration(Duration.ofMillis(100))
            );
    }
}
```

**BulkheadThreadPoolConfig.java**

```java
@Configuration
public class BulkheadThreadPoolConfig {

    @Bean
    public ThreadPoolBulkheadConfigCustomizer excelStreamThreadPool() {
        return ThreadPoolBulkheadConfigCustomizer.of("excelStream", builder -> builder
                .coreThreadPoolSize(4)
                .maxThreadPoolSize(8)
                .queueCapacity(16)
            );
    }
}
```

### 구현 예시

Bulkhead를 적용한 간단한 Controller와 검증을 위한 테스트 코드를 만들어보겠습니다.

**ExcelDownloadController.java**

```java
@RestController
@RequiredArgsConstructor
public class ExcelDownloadController {

    @Bulkhead(name = "excelStream", type = Type.SEMAPHORE, fallbackMethod = "excelStreamFallback")
    @PostMapping(value = "/orders/download")
    public void download(
        @RequestBody @Valid OrderDownloadRequest request,
        HttpServletResponse response
    ) {
        try {
            // 엑셀 다운로드 처리 시뮬레이션 (500ms 소요)
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public void excelStreamFallback(
        OrderDownloadRequest request,
        HttpServletResponse response,
        BulkheadFullException ex
    ) {
        throw new TooManyRequestsException("Too many concurrent requests");
    }
}
```

`@Bulkhead`의 ‎`type`에는 ‎`Bulkhead.Type.SEMAPHORE`와 ‎`Bulkhead.Type.THREADPOOL` 두 가지가 있으며, 기본값은 ‎`SEMAPHORE`입니다. 두 방식의 차이는 아래에서 자세히 설명하겠습니다.

실패 시 호출할 ‎`fallbackMethod` 또한 지정할 수 있습니다.

**주의할 점:**
>  • ‎`fallback` 메서드의 시그니처는 원본 컨트롤러 메서드와 호환되어야 합니다. 즉, 원본 메서드의 파라미터를 동일한 순서로 모두 받아야 하며, 마지막 인자로 예외 타입을 추가할 수 있습니다.
 • 반환 타입도 일치해야 합니다. 원본이 ‎`void`면 ‎`fallback`도 ‎`void`여야 하고, ‎`ResponseEntity<T>`를 반환하면 ‎`fallback` 역시 같은 타입을 반환해야 합니다.


**ExcelDownloadControllerBulkheadTest.java**

```java
@SpringBootTest(classes = SampleApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ExcelDownloadControllerBulkheadTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void bulkhead가_최대_동시_호출_수를_제한한다() throws InterruptedException {
        // given
        int totalRequests = 10;
        int maxConcurrentCalls = 5;
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(totalRequests);
        ExecutorService executorService = Executors.newFixedThreadPool(totalRequests);
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger rejectedCount = new AtomicInteger(0);

        // when
        for (int i = 0; i < totalRequests; i++) {
            executorService.submit(() -> {
                try {
                    startLatch.await(); // 모든 스레드가 동시에 시작하도록 대기
                    
                    mockMvc.perform(post("/orders/download")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                        .andExpect(status().isOk());
                    
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    // TooManyRequestsException이 발생하면 거절된 것으로 카운트
                    if (e.getCause() instanceof TooManyRequestsException ||
                        (e.getMessage() != null && e.getMessage().contains("Too many concurrent requests"))) {
                        rejectedCount.incrementAndGet();
                    } else {
                        // 다른 예외도 거절로 간주 (Bulkhead 관련)
                        rejectedCount.incrementAndGet();
                    }
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown(); // 모든 요청 동시 시작
        doneLatch.await(5, TimeUnit.SECONDS); // 모든 요청 완료 대기
        executorService.shutdown();

        // then
        System.out.println("[DEBUG_LOG] Success count: " + successCount.get());
        System.out.println("[DEBUG_LOG] Rejected count: " + rejectedCount.get());
        
        // maxConcurrentCalls(5)를 초과하는 요청은 거절되어야 함
        assertThat(successCount.get()).isLessThanOrEqualTo(maxConcurrentCalls);
        // 일부 요청은 거절되어야 함 (10개 요청 중 5개 초과분)
        assertThat(rejectedCount.get()).isGreaterThan(0);
        // 전체 처리된 요청 수 확인
        assertThat(successCount.get() + rejectedCount.get()).isEqualTo(totalRequests);
    }
```

**application-test.yml**

```yml
resilience4j:
  bulkhead:
    instances:
      excelStream: # 벌크헤드의 이름
        maxConcurrentCalls: 5   # 동시에 5건까지만 스트리밍 생성
        maxWaitDuration: 100ms    # 100ms 초과시 거절
```

테스트를 실행해 보면 다음과 같이 테스트가 성공하고, 10건의 동시 요청 중 5건만 수행되고 나머지 5건은 거절된 걸 확인할 수 있습니다.

![Bulkhead test result](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0hj1my13497fwex16t4m.png)

## SEMAPHORE vs THREADPOOL

Resilience4j의 `Bulkhead`는 내부적으로 두 가지 실행 모델을 제공합니다. 

`SEMAPHORE`와 `THREADPOOL` 두 방식 모두 동시 처리량을 제한하고 격리하는 목적은 같지만, 격리 수준과 적용 시점에서 차이가 있습니다.

### SemaphoreBulkhead

`SemaphoreBulkhead`는 `java.util.concurrent.Semaphore`를 내부적으로 사용하여 동시 호출 수를 제어하며, 현재 스레드에서 동기적으로 코드를 실행합니다.

자바의 세마포어는 `permit`이라는 내부 카운터를 기반으로 동시 접근을 제어하는 동기화 메커니즘입니다. Resilience4j의 Bulkhead는 `maxConcurrentCalls`에 설정된 최대 동시 호출 수만큼 permit이 초기화됩니다. 

![Semaphore](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/apiqg6dl2liqonzodw6s.png)

![new Semaphore](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/0pmv6ci7zedqn40b4jb4.png)

스레드가 호출을 시도할 때, 설정된 동시 호출 수 한도 내라면 즉시 실행되고 한도를 초과했다면 `maxWaitDuration` 동안 대기하게 됩니다. 이 시간 내에 permit을 얻지 못하면 `BulkheadFullException`이 발생하게 됩니다.

![try lock](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/pp3zihqvlwq5q6bguvv3.png)


![try lock 2](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/i74x9dyeahihiszbjoda.png)

세마포어 방식은 다양한 스레딩 모델과 I/O 모델에서 잘 동작하며, 호출 응답이 빠를고 예측 가능한 동기 작업에 효과적입니다. 별도의 스레드 풀을 관리하지 않으므로 오버헤드가 적고, 단순한 동시성 제어가 필요한 경우에 유용합니다.

### ThreadPoolBulkhead

`ThreadPoolBulkhead`는 내부적으로 `ArrayBlockingQueue`와 `ThreadPoolExecutor`를 사용하여 작업을 비동기적으로 실행하며, 
특정 작업을 전용 스레드 풀로 격리하여 동시 호출을 관리합니다.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/7pbudt2v42pntvnrtbjm.png)

스레드 풀에 사용 가능한 스레드가 있다면 작업이 즉시 실행되고, 모든 스레드가 사용 중이면 작업은 큐에 추가되어 스레드가 사용 가능해질 때까지 대기합니다. 만약 큐까지 가득 차면 `BulkheadFullException`이 발생하여 요청이 거부됩니다.

이러한 스레드 풀 방식은 응답 시간이 길거나 예측 불가능한 I/O 바운드 작업에 적합합니다. 비동기 처리가 필요하거나, 느린 외부 서비스 호출로부터 메인 스레드 풀을 보호해야 하는 경우에 적합합니다.

### 언제 뭘 사용해야 할까

세마포어는 호출 스레드에서 직접 동기적으로 실행되기 때문에 별도의 스레드 생성이나 컨텍스트 스위칭 등의 오버헤드가 발생하지 않습니다. 만약 수행시간이 적게 걸리는 작업이라면 스레드 풀로 작업을 위임하고 컨텍스트 스위칭하는 데 드는 비용이 오히려 더 클 수 있습니다.

반면 느린 작업에 세마포어를 사용할 경우 호출

단순히 동시 호출 수만 제한하는 것이 목적이라면 세마포어 방식이 효율적입니다. 하지만 외부 API 호출처럼 작업 시간이 길고 완전한 리소스 격리가 필요하다면 전용 스레드 풀을 할당하는 스레드 풀 방식이 더 적합합니다.

## 마무리

지금까지 Bulkhead 패턴과 Resilience4j를 활용하여 시스템 전체의 안정성을 확보하는 방법을 알아보았습니다.

촉박한 개발 일정 속에서 장애 방어 로직을 추가하는 것이 때로는 오버엔지니어링처럼 느껴질 수 있습니다. 하지만 리소스 소모가 많고 장애 전파 위험이 큰 기능에서 발생하는 한 번의 장애는, 시스템 전체를 마비시키며 훨씬 더 큰 비용을 초래할 수 있습니다.

특히 Resilience4j는 Bulkhead 뿐만 아니라 서킷 브레이커와 같은 강력한 회복탄력성 패턴들을 제공합니다. 복잡한 구현 없이 어노테이션과 간단한 설정만으로 시스템의 안정성을 크게 높일 수 있으니, 이 글이 도입에 도움이 되었으면 합니다.
