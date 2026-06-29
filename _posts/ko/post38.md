---
title: "PrematurelyClosedException에서 시작된 외부 API 호출 설계 이야기"
section: tech
date: "2026-05-12"
tags: "MSA, WebClient"
thumbnail: "https://i.imgur.com/rJIacNo.png"
description: "PrematurelyClosedException을 출발점으로, 커넥션 관리·재시도·멱등성·최종 일관성까지 외부 API 호출의 설계 고려사항을 풀어봅니다."
searchKeywords: "MSA, WebClient, WebFlux, PrematurelyClosedException, 재시도, 멱등성, 보상 트랜잭션"
---

MSA가 보편화되면서 서비스들은 점점 더 잘게 나뉘었고, 그만큼 서비스 간 네트워크 호출도 늘어났습니다. 외부 API를 호출하는 코드는 단순해 보이지만, 막상 운영 환경에서 마주하면 생각보다 많은 것을 고려해야 합니다.

이번 포스팅에서는 실제 운영 중 겪었던 `PrematurelyClosedException`을 출발점으로, 커넥션 관리부터 재시도 설계, 그리고 데이터 일관성 보장까지 외부 API 호출 로직을 구현할 때 고민해야 할 것들을 순서대로 풀어보겠습니다.

## 예제: 배송 상태 외부 동기화

배송 시스템을 운영하다 보면 배송 상태를 외부 파트너사에도 동기화해야 하는 경우가 생깁니다. 내부 시스템에서 배송 상태가 변경되면, 외부 API를 호출해 파트너사 서비스에도 반영하는 식입니다. 흐름을 단순화하면 대략 이렇습니다.

1. 배송 상태를 DB에 저장
2. 외부 파트너사 API 호출

외부 API 호출에는 Spring WebFlux 기반의 `WebClient`를 사용하고 있습니다. Non-Blocking I/O 방식으로 동작하기 때문에 여러 외부 API를 병렬로 처리하거나, 스레드를 점유하지 않고 응답을 기다릴 수 있다는 장점이 있습니다.

위 흐름을 코드로 간략히 구현하면 아래와 같습니다.

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient() {
        HttpClient httpClient = HttpClient.create();

        return WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .baseUrl("https://api.partner.com")
            .build();
    }
}

@Component
@RequiredArgsConstructor
public class PartnerApiClient {

    private final WebClient webClient;

    public Mono<Void> notifyStatus(String trackingNo, DeliveryStatus status) {
        return webClient.post()
            .uri("/api/delivery/status")
            .bodyValue(new DeliveryStatusRequest(trackingNo, status))
            .retrieve()
            .bodyToMono(Void.class);
    }
}

@Component
@RequiredArgsConstructor
public class DeliveryStatusRecorder {

    private final DeliveryRepository deliveryRepository;

    @Transactional
    public void bulkUpdateStatus(List<DeliveryStatusCommand> commands) {
        // DB 작업만 — 외부 호출은 이 트랜잭션 경계 안에 절대 넣지 않는다
        deliveryRepository.bulkUpdateStatus(commands);
    }
}

@Slf4j
@Service
@RequiredArgsConstructor
public class DeliveryStatusSyncService {

    private final DeliveryStatusRecorder statusRecorder; // 트랜잭션 경계를 가진 별도 빈
    private final PartnerApiClient partnerApiClient;

    public void syncDeliveryStatuses(List<DeliveryStatusCommand> commands) {
        // 1. DB 저장 — 짧은 트랜잭션 안에서 bulk update만 수행하고 즉시 커밋
        statusRecorder.bulkUpdateStatus(commands);

        // 2. 커밋 이후 외부 API 호출 — DB 커넥션을 잡지 않고 병렬로 통지
        Flux.fromIterable(commands)
            .flatMap(cmd -> partnerApiClient.notifyStatus(cmd.trackingNo(), cmd.status())
                .onErrorResume(e -> {
                    log.warn("파트너사 통지 실패, 후속 보정 대상으로 기록: {}", cmd.trackingNo(), e);
                    return Mono.empty(); // 한 건 실패가 전체를 막지 않도록
                }))
            .subscribe();
    }
}
```

위 코드에서 눈여겨볼 점은, 외부 API 호출을 @Transactional 경계 안에 두지 않고 커밋이 끝난 뒤 별도로 실행한다는 것입니다. DB 저장과 외부 API 호출을 하나의 메서드에 몰아넣으면 간단할 텐데, 굳이 두 단계로 나눈 데에는 이유가 있습니다.

### 왜 외부 API 호출을 트랜잭션 밖으로 빼야 할까?

`@Transactional` 메서드 안에서 외부 HTTP를 호출하면, 응답을 받을 때까지 **DB 커넥션이 반환되지 않고 점유**됩니다. 외부 서버 응답이 평소 50ms이다가 어느 순간 5초로 느려지면, 그 5초 동안 DB 커넥션 하나가 묶입니다. 트래픽이 몰리면 이런 커넥션이 쌓여 **DB 커넥션 풀이 고갈**되고, 정작 DB만 쓰면 되는 다른 요청까지 대기하다 장애가 전파됩니다.

또한 외부 호출 결과에 따라 트랜잭션을 롤백하게 되면, 뒤에서 다룰 "외부 통지 실패로 진실의 원천(DB)을 되돌리면 안 된다"는 원칙과도 충돌합니다. 그래서 **DB 트랜잭션은 짧게 커밋하고, 외부 통지는 커밋 이후 별도로** 처리하는 것이 안전합니다.

> 참고로 `@Transactional`은 같은 빈 내부에서 호출(self-invocation)하면 프록시를 거치지 않아 트랜잭션이 적용되지 않습니다. 트랜잭션 메서드를 별도 빈(`DeliveryStatusRecorder`)으로 분리한 이유가 여기에 있습니다. 이렇게 해야 "DB 저장 → 커밋 → 외부 호출" 순서가 코드 구조상으로도 보장됩니다.

여기서 외부 API를 병렬 호출하는 방법으로 `Flux.flatMap`을 사용했는데, `CompletableFuture`로도 같은 일을 할 수 있습니다. 둘은 스레드 모델부터 동시성 제어까지 성격이 꽤 다른데, 이 비교는 [다음 글](/post39)에서 이어서 다루겠습니다.

## PrematurelyClosedException: 갑자기 끊긴 커넥션

시스템을 잘 운영해오던 어느 날 운영 로그에서 낯선 예외가 눈에 띄었습니다.

```text
reactor.netty.http.client.PrematurelyClosedException: Connection has been closed BEFORE response
```

**Connection prematurely closed BEFORE response** 에러는 서버로부터 응답을 받기 전에 커넥션이 끊어질 때 발생합니다.

### 왜 응답을 받기 전에 커넥션이 끊겼을까?

이 예외를 이해하려면 먼저 `WebClient`가 커넥션을 어떻게 관리하는지 살펴봐야 합니다.

Netty의 커넥션 풀은 클라이언트로 동작할 때만 개입합니다. Netty 서버에는 커넥션 풀 개념이 없지만, `WebClient`처럼 Netty를 HTTP 클라이언트로 사용할 때는 `reactor-netty`의 커넥션 풀이 커넥션을 생성하고 재사용합니다.

그리고 이 풀은 `Lazy Initialization` 방식으로 동작합니다. WebClient를 빈으로 등록한 시점이 아니라 **첫 HTTP 요청을 보내는 시점**에 풀이 초기화되고 커넥션이 생성됩니다. 한 번 만들어진 커넥션은 응답을 받은 뒤 풀로 반환되어 다음 요청에 다시 사용됩니다.

문제는 이 커넥션이 풀에 얼마나 오래 머무는가입니다. `WebClientConfig`에서 `HttpClient.create()`만 호출하면 Netty의 기본 글로벌 커넥션 풀이 적용되는데, 그 기본값은 아래와 같습니다.

| 설정 항목 | 기본값 | 의미 |
|---|---|---|
| `maxConnections` | CPU 코어 수 × 2 | 풀 내 최대 커넥션 수 |
| `pendingAcquireMaxCount` | maxConnections × 2 | 커넥션 획득 대기 큐 크기 |
| `maxIdleTime` | **무제한** | 유휴 상태로 유지되는 시간 |
| `maxLifeTime` | **무제한** | 커넥션의 최대 수명 |

여기서 핵심은 `maxIdleTime`입니다. 이 값이 설정되어 있지 않으면, 한 번 사용된 커넥션은 풀로 반환된 뒤 만료되지 않고 무기한 유지됩니다. 즉, 클라이언트는 이 커넥션을 **언제든 다시 쓸 수 있다고 믿고 계속 들고 있는** 셈입니다.

하지만 서버의 입장은 다릅니다. 대부분의 서버는 `keepAliveTimeout`을 두고, 유휴 상태가 그 시간을 넘긴 커넥션을 스스로 끊습니다. 여기서 한 가지 짚어둘 점은, **이 타이머는 커넥션이 열린 시점이 아니라 직전 요청이 끝난 시점부터 다음 요청을 기다리는 유휴 시간을 잰다**는 것입니다. 요청이 들어올 때마다 타이머는 리셋되고, 요청 사이의 유휴 구간이 임계치를 넘겼을 때 비로소 서버가 `FIN`을 보내 커넥션을 닫습니다.

정리하면 클라이언트는 커넥션을 무기한 보관하려 하고, 서버는 일정 시간 놀고 있으면 닫아버립니다. 이 어긋남이 만들어내는 것이 바로 race condition 입니다.

아래 상황이 대표적입니다. 클라이언트가 응답(`200 OK`)을 받고 커넥션을 풀에 idle 상태로 돌려놓은 뒤, 서버의 `keepAliveTimeout`이 만료되어 `FIN`이 출발합니다. 
그런데 거의 같은 순간, 클라이언트가 풀에서 같은 커넥션을 빌려 새 요청(`POST /`)을 전송합니다. 서버의 `FIN`과 클라이언트의 새 요청이 와이어 위에서 교차하는 것입니다.

![race condition](https://i.imgur.com/nzVSi0W.png)

클라이언트는 아직 `FIN`을 처리하지 못한 채, 닫히는 중인 소켓에 요청을 써버립니다. 그 결과 요청은 분명히 전송됐지만 응답은 받지 못한 상태가 되고, `reactor-netty`는 이를 `PrematurelyClosedException`으로 던집니다. 
즉, 근본적인 원인은 `maxIdleTime`을 설정하지 않아, 서버가 이미 닫기로 한 커넥션을 클라이언트가 그대로 재사용하려 했다는 데 있습니다.

## maxIdleTime 설정으로 클라이언트가 먼저 정리하기

해결책은 **클라이언트의 커넥션 유효 시간을 서버 keepAlive 시간보다 짧게** 설정하는 것입니다. 서버가 끊기 전에 클라이언트가 먼저 해당 커넥션을 제거하면 문제를 방지할 수 있습니다.

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient() {
        ConnectionProvider provider = ConnectionProvider.builder("partner-api")
            .maxConnections(50)
            .maxIdleTime(Duration.ofSeconds(45))      // 서버 keepAlive(60s)보다 짧게
            .maxLifeTime(Duration.ofSeconds(120))
            .evictInBackground(Duration.ofSeconds(30)) // 주기적으로 만료 커넥션 정리
            .build();

        HttpClient httpClient = HttpClient.create(provider)
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
            .responseTimeout(Duration.ofSeconds(10))
            .doOnConnected(conn ->
                conn.addHandlerLast(new ReadTimeoutHandler(10, TimeUnit.SECONDS))
                    .addHandlerLast(new WriteTimeoutHandler(10, TimeUnit.SECONDS))
            );

        return WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(httpClient))
            .build();
    }
}
```

하지만 여전히 문제가 있습니다. **서버 측의 keepAlive 시간을 항상 알 수 있는 것은 아닙니다.** 외부 파트너사 API를 사용하는 경우 해당 값이 문서화되어 있지 않거나, 인프라 변경으로 언제든지 바뀔 수 있습니다.

이런 경우 `maxIdleTime` 설정만으로는 커넥션 만료 문제를 줄일 수는 있어도 완전히 없애기는 어렵습니다. 따라서 **재시도(retry) 전략을 병행**해야 합니다.

## 불확실성에 대비하는 재시도 전략

Reactor Netty는 `PrematurelyClosedException`에 대해 기본적으로 재시도를 지원하기도 하지만, 명시적으로 `RetrySpec`을 구성해 제어권을 가져오는 편이 안전합니다.

```java
@Component
@RequiredArgsConstructor
public class PartnerApiClient {

    private final WebClient webClient;

    public Mono<Void> notifyStatus(String trackingNo, DeliveryStatus status) {
        return webClient.post()
            .uri("/api/delivery/status")
            .bodyValue(new DeliveryStatusRequest(trackingNo, status))
            .retrieve()
            .bodyToMono(Void.class)
            .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
                .filter(t -> t instanceof PrematurelyClosedException
                          || t instanceof ConnectTimeoutException)
                .maxBackoff(Duration.ofSeconds(3)));
    }
}
```

**재시도는 일시적 실패에만 가치가 있습니다.** 잘못된 요청이나 영구적인 오류를 재시도하는 것은 같은 실패를 반복하며 자원만 소모하고, 때로는 장애를 키웁니다.

HTTP 응답 코드를 기준으로 보면 판단이 한결 명확해집니다.

| 응답 코드 | 재시도 | 이유 |
|---|---|---|
| `4xx` (대부분) | ❌ | 요청 자체가 잘못된 것 — 그대로 다시 보내도 결과는 같습니다 (400, 401, 403, 404, 422 등) |
| `408 Request Timeout` | ✅ | 요청이 시간 내 도달하지 못한 일시적 상황 |
| `429 Too Many Requests` | ✅ | 단, 서버가 준 `Retry-After` 헤더를 존중해 간격을 두고 |
| `500 Internal Server Error` | △ | 일시적 버그일 수도, 결정적(deterministic) 버그일 수도 있어 신중하게 |
| `502 / 503 / 504` | ✅ | 게이트웨이·과부하·타임아웃 등 대체로 일시적 |

핵심은 "같은 요청을 다시 보냈을 때 결과가 달라질 여지가 있는가" 입니다. 4xx는 클라이언트가 요청을 고치지 않는 한 결과가 바뀌지 않으므로 재시도가 무의미합니다. 반면 5xx와 네트워크 예외는 잠깐 뒤에 성공할 가능성이 있어 재시도할 가치가 있습니다.

`WebClient`에서는 `retrieve()`가 4xx·5xx에 대해 `WebClientResponseException`을 던지므로, 상태 코드로 필터링을 좁힐 수 있습니다.

```java
.retryWhen(Retry.backoff(3, Duration.ofMillis(500))
    .filter(t -> t instanceof PrematurelyClosedException
              || t instanceof ConnectTimeoutException
              || (t instanceof WebClientResponseException ex
                  && ex.getStatusCode().is5xxServerError()))
    .jitter(0.5)                        // 재시도 시점을 분산
    .maxBackoff(Duration.ofSeconds(3)));
```

### 재시도가 만드는 새로운 부하 — 백오프와 지터

외부 서버가 잠시 흔들려 수백 개의 요청이 동시에 실패하면, 이들이 **같은 순간에 일제히 재시도**하면서 가뜩이나 약해진 서버에 트래픽이 몰아치게 됩니다. 재시도가 오히려 회복을 방해하는 것입니다.

그래서 단순 재시도가 아니라 **지수 백오프(exponential backoff)** 를 사용합니다. 재시도 간격을 500ms → 1s → 2s처럼 점점 늘려, 실패가 길어질수록 서버에 숨 쉴 틈을 줍니다. 위 코드의 `Retry.backoff`가 이 역할을 합니다. 
여기에 `jitter`를 더하면 각 클라이언트의 재시도 시점에 무작위성이 섞여, 재시도가 한 점에 몰리지 않고 시간축에 흩어집니다.

### 재시도로도 부족할 때 — 서킷 브레이커

백오프를 적용한 재시도는 **짧은 순간의 장애** 에는 효과적입니다. 하지만 외부 서버가 수 분간 완전히 죽어 있는 상황이라면 이야기가 다릅니다. 모든 요청이 재시도를 세 번씩 반복하다 실패하고, 그동안 우리 쪽 스레드와 커넥션이 묶이면서 장애가 호출하는 쪽으로 전파됩니다.

이럴 때 필요한 것이 **서킷 브레이커(Circuit Breaker)** 입니다. 일정 시간 동안 실패율이 임계치를 넘으면 회로를 열어(Open), 이후 요청은 외부를 호출하지도 않고 즉시 실패시킵니다. 죽은 서버를 계속 두드리는 대신 fail-fast함으로써, 외부 장애가 내 시스템의 자원을 고갈시키는 것을 막고 외부 서버에게도 회복할 시간을 줍니다.

```
[정상]  요청 → 외부 호출 → 실패율 집계
           │
           │ 실패율 50% 초과
           ▼
[Open]  요청 → 외부 호출 없이 즉시 실패 (fail-fast)
           │
           │ 일정 시간(wait duration) 경과
           ▼
[Half-Open] 소수의 요청만 시험 통과 → 성공하면 [정상], 실패하면 다시 [Open]
```

### 재시도 전에 반드시 확인할 것: 멱등성

앞서 어떤 에러를 재시도할지, 어떻게 부하를 분산할지를 다뤘다면, 재시도를 허용하기 전에 반드시 짚어야 할 전제가 하나 더 있습니다. 바로 멱등성(Idempotency)입니다.

> **멱등성**: 동일한 요청을 여러 번 수행해도 서버의 최종 상태가 동일할 것이 보장되는 성질

멱등성을 이야기할 때 흔히 "메서드를 보면 된다"고 생각하지만, 정확히는 HTTP 명세(RFC 9110)가 **각 메서드에 기대하는 성질**입니다.

| 메서드 | 멱등(Idempotent) | 비고 |
|---|---|---|
| `GET`, `HEAD` | ✅ | 상태를 바꾸지 않는 조회 |
| `PUT` | ✅ | 리소스를 통째로 교체 — 몇 번 보내도 최종 상태 동일 |
| `DELETE` | ✅ | 두 번째 호출은 404를 줄 수 있지만, 최종 상태(삭제됨)는 동일 |
| `POST` | ❌ | 호출할 때마다 새 리소스가 생기는 것이 기본 |
| `PATCH` | ❌ | 부분 수정 — 설계에 따라 멱등일 수도, 아닐 수도 |

여기서 두 가지를 짚고 넘어가야 합니다.

1. **멱등성은 "응답이 매번 같다"가 아니라 "서버의 최종 상태가 같다"는 뜻이다.** 

`DELETE`를 두 번 호출하면 첫 번째는 `200`, 두 번째는 `404`로 응답이 달라지지만, "리소스가 삭제된 상태"라는 결과는 동일하므로 멱등합니다.
2. **이 표는 어디까지나 명세가 권고하는 계약일 뿐, 서버가 자동으로 보장해 주지는 않는다.**

`PUT`으로 만들었어도 내부에서 호출 횟수를 누적한다면 멱등하지 않고, 반대로 `POST`라도 서버가 키를 기준으로 덮어쓰도록 구현했다면 사실상 멱등합니다. 그래서 재시도 안전성을 따질 때는 메서드 이름이 아니라 **그 엔드포인트가 실제로 어떻게 구현되어 있는지**를 확인해야 합니다.

예를 들어, 외부 파트너사 API가 `POST` 엔드포인트를 사용하더라도 내부적으로 `(송장번호, 배송상태)` 조합을 기반으로 상태를 덮어쓴다면 사실상 멱등합니다. 같은 상태를 두 번 전송해도 결과가 동일하기 때문입니다.

반면 **잔액 차감, 건수 누적**처럼 호출할 때마다 새로운 상태가 누적되는 작업은 멱등하지 않습니다. 이런 경우 재시도를 그대로 허용하면 중복 처리가 발생합니다. 
서버 측에서 고유 요청 ID(idempotency key)를 지원한다면 활용하고, 그렇지 않다면 처리 이력을 클라이언트에서 직접 관리해야 합니다.

### 멱등 키(Idempotency Key)로 중복을 막는 법

멱등하지 않은 API라면, **요청마다 고유한 키를 부여해 서버가 중복을 걸러내도록** 만들 수 있습니다. 결제·정산처럼 한 번 더 처리되면 곤란한 작업에서 흔히 쓰는 방식입니다.

이때 키는 비즈니스 작업 단위로 한 번 생성하고, 재시도 사이에는 그대로 유지해야 합니다. 재시도할 때마다 키를 새로 만들면 서버 입장에서는 매번 다른 요청으로 보여, 멱등 키가 아무 역할도 하지 못합니다.

```java
public Mono<Void> chargeFee(String settlementId, long amount) {
    // 키는 재시도와 무관하게 '정산 건' 단위로 한 번만 생성한다
    String idempotencyKey = "settlement:" + settlementId;

    return webClient.post()
        .uri("/api/fees")
        .header("Idempotency-Key", idempotencyKey) // 재시도해도 동일한 키가 전송됨
        .bodyValue(new FeeRequest(settlementId, amount))
        .retrieve()
        .bodyToMono(Void.class)
        .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
            .filter(t -> t instanceof PrematurelyClosedException));
}
```

서버는 이 키를 받아, 이미 처리한 키라면 **실제 로직을 다시 실행하지 않고 이전 결과를 그대로 돌려줍니다.**

```java
@PostMapping("/api/fees")
public ResponseEntity<Void> charge(
        @RequestHeader("Idempotency-Key") String key,
        @RequestBody FeeRequest request) {

    // 키 저장에 성공하면 최초 요청, 이미 존재하면 중복 요청
    if (!idempotencyStore.putIfAbsent(key)) {
        return ResponseEntity.ok().build(); // 중복 — 차감을 다시 하지 않고 종료
    }

    feeService.charge(request); // 최초 요청에서만 실제 차감 수행
    return ResponseEntity.ok().build();
}
```

핵심은 키 등록과 비즈니스 처리가 같은 트랜잭션에서 원자적으로 일어나야 한다는 점입니다. 키만 먼저 저장되고 처리가 실패하거나, 처리만 되고 키 저장이 누락되면 중복 방지가 깨집니다. 

## 보상 트랜잭션: 되돌려야 할 때를 구분하기

재시도를 모두 소진하고도 외부 API 호출이 끝내 실패하면, 이미 처리해 둔 작업을 되돌려야 하는 건 아닌지 고민하게 됩니다. 이때 자연스럽게 떠오르는 것이 보상 트랜잭션(Compensating Transaction)입니다.

보상 트랜잭션은 **이미 커밋된 로컬 비즈니스 상태가, 하류 단계의 실패로 인해 무효가 될 때 이를 되돌리는 것**입니다. 대표적인 예는 재고 예약 흐름입니다.

```
재고 예약(커밋) → 결제 시도 → 실패 → 재고 예약 취소(보상)
```

결제가 실패한 시점에서 재고 예약은 더 이상 유효하지 않습니다. 이때 보상 트랜잭션으로 예약을 되돌릴 수 있습니다.

```java
public Mono<Void> placeOrder(OrderRequest order) {
    // 1) 재고 예약 — 로컬 트랜잭션으로 먼저 커밋한다
    String reservationId = inventoryService.reserve(order);

    // 2) 결제 시도 — 외부 API 호출 (재시도 포함)
    return requestPayment(order)
        .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
            .filter(t -> t instanceof PrematurelyClosedException))
        // 3) 재시도를 모두 소진하고도 실패하면, 커밋해 둔 예약을 되돌린다
        .onErrorResume(error -> {
            inventoryService.cancelReservation(reservationId); // 보상 트랜잭션
            return Mono.error(new OrderFailedException(order.getId(), error));
        });
}
```

여기서 두 가지가 핵심입니다. 보상 로직을 `onErrorResume`에 둔 이유는, `retryWhen`이 모든 재시도를 소진한 **뒤에야** 에러가 이 단계로 흘러오기 때문입니다. 그리고 예약을 되돌린 후에도 에러를 삼키지 않고 `Mono.error`로 다시 전파합니다. 예약은 취소했더라도 주문 자체는 실패한 것이므로, 호출자가 이를 성공으로 오해하지 않도록 실패를 그대로 알려야 합니다.

다만 보상 트랜잭션도 만능은 아닙니다. `cancelReservation` 자체가 실패하면 재고는 예약된 채 묶여버립니다. 그래서 보상 로직 역시 멱등하게 설계하고, 즉시 되돌리기 어려운 경우에는 취소 작업을 별도로 기록해 두고 재시도하는 식의 대비가 필요합니다.

### 외부 통지 실패는 보상 트랜잭션의 대상이 아니다

그러나 모든 실패가 보상 트랜잭션의 대상이 되어서는 안 됩니다. 먼저 "진실의 원천(Source of Truth)이 어디인가"를 따져야 합니다.

배송 상태 동기화 흐름을 다시 봅시다.

```
DB에 배송완료 저장(성공) → 외부 파트너사 API 호출(실패)
```

이 상황에서 "외부 API 호출이 실패했으니 DB의 배송완료 상태도 되돌려야 한다"는 결론은 잘못된 것입니다.

외부 파트너사 API 호출은 DB에 저장된 배송 상태를 외부로 투영하는 마지막 단계에 불과합니다. 진실의 원천은 내부 DB의 배송 상태이며, 외부 통지 성공 여부와는 독립적입니다.

만약 외부 통지 실패를 이유로 DB의 배송 상태를 되돌린다면, 외부 시스템의 일시적 장애가 내부 핵심 데이터를 오염시키는 결과를 낳습니다.

이런 경우에는 보상 트랜잭션 대신, **재시도 + Outbox 패턴**을 통해 최종 일관성을 보장하는 것이 올바른 방향입니다.

## 네트워크 유실: 응답 수신 전에 연결이 끊겼다면?

한 가지 더 까다로운 상황이 있습니다. 바로 `PrematurelyClosedException`처럼 **요청은 전송됐지만 응답을 받기 전에 커넥션이 끊기는 경우**입니다.

이 경우 단순 재시도는 위험합니다. 서버가 요청을 이미 처리했을 수도 있기 때문입니다.

안전한 접근법은 **재시도 전에 현재 상태를 먼저 조회**하는 것입니다.

```java
public Mono<Void> notifyStatusSafely(String trackingNo, DeliveryStatus status) {
    return webClient.post()
        .uri("/api/delivery/status")
        .bodyValue(new DeliveryStatusRequest(trackingNo, status))
        .retrieve()
        .bodyToMono(Void.class)
        .retryWhen(Retry.backoff(3, Duration.ofMillis(500))
            .filter(t -> t instanceof PrematurelyClosedException)
            .doBeforeRetryAsync(signal ->
                // 재시도 전 현재 상태 조회
                queryCurrentStatus(trackingNo)
                    .flatMap(currentStatus -> {
                        if (status.equals(currentStatus)) {
                            // 이미 반영됐으면 재시도 불필요 → 에러로 루프 탈출
                            return Mono.error(new AlreadySyncedException(trackingNo));
                        }
                        return Mono.empty();
                    })
            )
        )
        .onErrorResume(AlreadySyncedException.class, e -> Mono.empty());
}
```

물론 이 방법은 **조회 API가 제공될 때**만 사용할 수 있습니다. 다행히 `(송장번호, 배송상태)` 기반으로 상태를 업데이트하는 API는 앞서 살펴본 것처럼 멱등하기 때문에, 조회 없이 단순 재시도를 허용해도 안전합니다.

## 마무리

지금까지 `PrematurelyClosedException`을 출발점으로, 외부 API를 호출하는 코드를 운영 환경에서 안정적으로 동작시키기 위해 고려해야 할 것들을 살펴보았습니다. 커넥션 풀 설정부터 재시도와 백오프, 서킷 브레이커, 멱등성, 그리고 보상 트랜잭션까지 다뤄보았습니다.

외부 API 호출은 한 줄이면 끝나는 것처럼 보였지만, 막상 안정적으로 동작하게 만들려니 고려할 게 생각보다 많았습니다. 
그래도 정리해보면 결국 두 가지 질문으로 좁혀지는 것 같습니다. 하나는 "같은 요청을 다시 보내도 괜찮은가", 다른 하나는 "이 데이터의 진실은 어디에 있는가"입니다. 재시도를 허용할지는 멱등성이, 실패를 되돌릴지는 진실의 원천이 답을 줬습니다. 쓰는 라이브러리나 설정값은 상황마다 달라도, 판단의 기준은 대체로 이 두 가지에서 크게 벗어나지 않았습니다.

외부 호출 코드를 짤 때 "이게 실패하면 무엇을 되돌려야 하고, 무엇은 절대 되돌리면 안 되는가"를 먼저 떠올리는 것만으로도 설계의 방향이 달라진다고 생각합니다. 이 글이 외부 API 호출 로직을 고민하는 분들께 그 판단 기준을 잡는 데 조금이나마 도움이 되었으면 합니다.
