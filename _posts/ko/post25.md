---
title: "새 트랜잭션은 열렸는데 커넥션은 그대로였다: read-only 트랜잭션에서 UPDATE가 실패한 이유"
section: tech
date: "2025-12-19"
tags: "Spring, Transaction, AbstractRoutingDataSource, LazyConnectionDataSourceProxy, JPA, 트러블슈팅"
thumbnail: "https://i.imgur.com/xyivoH3.jpeg"
description: "REQUIRES_NEW로 새 트랜잭션을 열었는데도 read-only 커넥션이 사용되어 UPDATE가 실패했습니다. 두 개의 가설을 로그로 검증하고, 스프링 트랜잭션 정리 순서와 커넥션 획득 시점의 어긋남을 원인으로 규명한 뒤 LazyConnectionDataSourceProxy로 해결한 과정을 정리합니다."
searchKeywords: "cannot execute UPDATE in a read-only transaction, TransactionalEventListener, REQUIRES_NEW, AbstractRoutingDataSource, LazyConnectionDataSourceProxy, 읽기 쓰기 DB 분리, Replica 라우팅, TransactionSynchronizationManager, determineCurrentLookupKey, 스프링 트랜잭션 생명주기"
---

조회 부하를 분산하기 위해 읽기 전용 복제본을 두고, `@Transactional(readOnly = true)` 여부에 따라 커넥션을 갈라 보내는 구성은 흔히 사용됩니다. 스프링에서는 `AbstractRoutingDataSource` 를 상속해 `determineCurrentLookupKey()` 안에서 현재 트랜잭션이 읽기 전용인지 확인하고, 그 결과에 따라 읽기 DB와 쓰기 DB 중 하나를 고르는 방식으로 구현합니다.

운영 중 이 구성에서 예상하지 못한 문제를 만났습니다. 배송대행 페이지에서 송장을 출력하면 송장 파일은 정상적으로 만들어지는데, '송장 출력 여부' 값만 갱신되지 않는 현상이었습니다. 로그를 확인해 보니 원인은 명확했습니다.

```plaintext
Caused by: org.postgresql.util.PSQLException: ERROR: cannot execute UPDATE in a read-only transaction
	at org.postgresql.core.v3.QueryExecutorImpl.receiveErrorResponse(QueryExecutorImpl.java:2734)
```

읽기 전용 트랜잭션에서 UPDATE를 수행해서 발생한 오류였습니다. 그런데 이상한 점이 있었습니다. 문제가 된 UPDATE는 이미 `@TransactionalEventListener` 와 `REQUIRES_NEW` 로 분리해 둔 코드였기 때문입니다. 부모 트랜잭션이 커밋된 뒤에 새로운 트랜잭션에서 실행되도록 만들어 두었으니, 그 트랜잭션은 읽기 전용이 아니어야 정상입니다.

이번 포스트에서는 새 트랜잭션을 분명히 열었는데도 왜 읽기 전용 커넥션이 사용되었는지, 두 개의 가설을 세우고 로그로 검증해 원인을 좁혀간 과정과, 스프링 트랜잭션의 정리 순서와 커넥션 획득 시점이 어긋나는 지점을 찾아 `LazyConnectionDataSourceProxy` 로 해결하기까지의 과정을 순서대로 정리해 보겠습니다.

## 문제가 된 코드

먼저 문제가 발생한 코드의 구조를 살펴보겠습니다. 송장 출력은 조회 성격의 작업이라 읽기 전용 트랜잭션으로 열려 있고, 출력 여부를 기록하는 쓰기 작업만 이벤트로 분리되어 있습니다.

**LabelPrintService.java**

```java
@Override
@Transactional(readOnly = true)
public List<LabelPrint> printLabels(List<Long> labelIds) {
    List<LabelPrint> prints = labelRepository.findAllByIdIn(labelIds).stream()
        .map(this::render)
        .toList();

    // 출력 여부 갱신은 이벤트로 분리
    eventPublisher.publishEvent(new LabelsPrintedEvent(labelIds));
    return prints;
}
```

**LabelPrintEventListener.java**

```java
@TransactionalEventListener
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void markLabelsPrinted(LabelsPrintedEvent event) {
    try {
        labelRepository.markPrintedByIds(event.labelIds());
    } catch (Exception e) {
        log.error("출력 여부 갱신 실패: {}", event.labelIds(), e);
    }
}
```

**LabelRepository.java**

```java
@Modifying(clearAutomatically = true, flushAutomatically = true)
@Query("""
    update Label l
       set l.isPrinted = true,
           l.firstPrintedAt = current_timestamp
     where l.id in :ids and (l.isPrinted = false or l.isPrinted is null)
""")
void markPrintedByIds(@Param("ids") List<Long> ids);
```

리스너에서 예외를 잡아 로그만 남기고 있었기 때문에, 송장 출력 자체는 실패하지 않고 출력 여부만 조용히 갱신되지 않았습니다. 사용자 입장에서는 기능이 절반만 동작하는 것처럼 보이는 상태였습니다.

읽기와 쓰기를 가르는 라우팅 설정은 다음과 같습니다.

**DataSourceConfig.java**

```java
@Configuration
@EnableTransactionManagement
public class DataSourceConfig {

    private enum DbType { WRITE, READ }

    static class RoutingDataSource extends AbstractRoutingDataSource {

        @Override
        protected Object determineCurrentLookupKey() {
            boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
            return readOnly ? DbType.READ : DbType.WRITE;
        }
    }

    @Bean
    public DataSource routingDataSource(@Qualifier("writerDataSource") DataSource writer,
        @Qualifier("readerDataSource") DataSource reader) {

        RoutingDataSource routing = new RoutingDataSource();
        Map<Object, Object> targetDataSources = new HashMap<>();
        targetDataSources.put(DbType.WRITE, writer);
        targetDataSources.put(DbType.READ, reader);
        routing.setTargetDataSources(targetDataSources);
        routing.setDefaultTargetDataSource(writer);
        return routing;
    }

    @Primary
    @Bean(name = "dataSource")
    public DataSource dataSource(@Qualifier("routingDataSource") DataSource routingDataSource) {
        return routingDataSource;
    }
}
```

## 처음 예상했던 동작

코드를 작성할 당시 기대했던 흐름은 이렇습니다.

1. `printLabels` 가 `readOnly = true` 로 열리며 읽기 DB 커넥션을 사용합니다. 조회를 마치고 커밋되어 트랜잭션이 종료됩니다.
2. `@TransactionalEventListener` 의 기본 실행 시점은 `AFTER_COMMIT` 이므로, 부모 트랜잭션이 커밋된 뒤에 리스너가 실행됩니다.
3. 리스너에는 `REQUIRES_NEW` 가 붙어 있으니 새로운 트랜잭션이 열리고, 이 트랜잭션은 `readOnly` 속성이 없으므로 쓰기 DB 커넥션을 사용합니다.
4. UPDATE가 성공합니다.

부모 트랜잭션이 끝난 뒤에 새 트랜잭션을 여는 구조이므로, 부모의 읽기 전용 설정은 더 이상 영향을 주지 않을 것이라고 생각했습니다. 하지만 실제로는 그렇지 않았습니다.

## 두 개의 가설

그렇다면 무엇이 문제였을까요. 가능성을 두 가지로 좁혀 보았습니다.

**가설 1.** `REQUIRES_NEW` 는 정상 동작해서 새 트랜잭션이 생성되었지만, 물리적으로는 부모 트랜잭션이 쓰던 읽기 전용 커넥션을 그대로 사용해 오류가 발생했다.

**가설 2.** `REQUIRES_NEW` 가 동작하지 않아 새 트랜잭션이 아예 열리지 않았고, 부모의 읽기 전용 트랜잭션 안에서 UPDATE가 실행되어 오류가 발생했다.

두 가설은 결과는 같지만 원인이 완전히 다릅니다. 가설 2가 맞다면 트랜잭션 전파 설정을 고쳐야 하고, 가설 1이 맞다면 **논리적인 트랜잭션 속성과 물리적인 커넥션 선택이 어긋나 있다**는 뜻이므로 커넥션을 고르는 시점을 손봐야 합니다.

## 로그로 가설을 검증하기

두 가설을 가르려면 세 지점의 상태를 봐야 했습니다. 부모 트랜잭션이 정리되는 과정, 리스너가 실행되는 시점의 트랜잭션 속성, 그리고 커넥션을 고르는 순간의 판단 근거입니다.

먼저 부모 트랜잭션의 생명주기 각 단계에서 `ThreadLocal` 에 어떤 값이 남아 있는지 확인하기 위해 동기화 콜백을 등록했습니다.

```java
@Override
@Transactional(readOnly = true)
public List<LabelPrint> printLabels(List<Long> labelIds) {
    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void beforeCommit(boolean readOnly) {
            log.info("[TX Lifecycle] beforeCommit - readOnly={}", readOnly);
        }

        @Override
        public void afterCommit() {
            log.info("[TX Lifecycle] afterCommit - ThreadLocal readOnly={}",
                TransactionSynchronizationManager.isCurrentTransactionReadOnly());
        }

        @Override
        public void afterCompletion(int status) {
            log.info("[TX Lifecycle] afterCompletion - status={}, ThreadLocal readOnly={}",
                status == STATUS_COMMITTED ? "COMMITTED" : "ROLLED_BACK",
                TransactionSynchronizationManager.isCurrentTransactionReadOnly());
        }
    });

    // ...
}
```

다음으로 리스너 진입 시점의 트랜잭션 상태를 찍었습니다. 트랜잭션 이름이 바뀌었는지 보면 새 트랜잭션이 실제로 열렸는지 판별할 수 있습니다.

```java
@TransactionalEventListener
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void markLabelsPrinted(LabelsPrintedEvent event) {
    log.info("[EventListener] REQUIRES_NEW 진입 - readOnly={}, active={}, txName={}",
        TransactionSynchronizationManager.isCurrentTransactionReadOnly(),
        TransactionSynchronizationManager.isActualTransactionActive(),
        TransactionSynchronizationManager.getCurrentTransactionName());

    // ...
}
```

마지막으로 커넥션을 고르는 순간의 판단 근거를 남겼습니다.

```java
@Override
protected Object determineCurrentLookupKey() {
    boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
    log.info("[DataSource Routing] readOnly={}, txName={}",
        readOnly, TransactionSynchronizationManager.getCurrentTransactionName());
    return readOnly ? DbType.READ : DbType.WRITE;
}
```

### 실행 결과

로컬에서 송장 출력 API를 호출해 확인한 로그는 다음과 같았습니다.

```plaintext
[TX Lifecycle] beforeCommit - readOnly=true
[TX Lifecycle] afterCommit - ThreadLocal readOnly=true
[TX Lifecycle] afterCompletion - status=COMMITTED, ThreadLocal readOnly=true
[DataSource Routing] readOnly=true          ← 커넥션은 여기서 결정된다
[EventListener] REQUIRES_NEW 진입 - readOnly=false
```

이 다섯 줄에 답이 전부 들어 있었습니다.

**가설 2는 기각되었습니다.** 리스너 진입 시점의 `readOnly` 가 `false` 로 바뀌었고 트랜잭션 이름도 `printLabels` 에서 `markLabelsPrinted` 로 바뀌었습니다. `REQUIRES_NEW` 는 정상적으로 동작해 새 트랜잭션을 열고 있었습니다.

**가설 1이 맞았습니다.** 문제는 순서였습니다. 커넥션을 고르는 `[DataSource Routing]` 로그가 리스너 진입보다 **먼저** 찍혔고, 그 시점의 `readOnly` 는 여전히 `true` 였습니다. 새 트랜잭션의 속성이 반영되기 전에 이미 읽기 DB로 커넥션이 결정된 것입니다.

정리하면, 논리적으로는 쓰기 트랜잭션이 열렸지만 물리적으로는 읽기 전용 커넥션을 붙잡고 있는 상태였습니다.

## 커넥션은 언제 결정되는가

그렇다면 왜 커넥션이 리스너 진입보다 먼저 결정될까요. 여기서부터는 스프링 트랜잭션 매니저의 내부 동작을 따라가 봐야 합니다. `AbstractPlatformTransactionManager` 의 소스에서 세 가지를 확인할 수 있었습니다.

### 커넥션 획득이 트랜잭션 속성 설정보다 먼저다

새 트랜잭션을 시작하는 `startTransaction()` 을 보면 순서가 분명합니다.

```java
// AbstractPlatformTransactionManager.java
private TransactionStatus startTransaction(TransactionDefinition definition, Object transaction,
        boolean nested, boolean debugEnabled, @Nullable SuspendedResourcesHolder suspendedResources) {

    boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
    DefaultTransactionStatus status = newTransactionStatus(...);
    this.transactionExecutionListeners.forEach(listener -> listener.beforeBegin(status));
    try {
        doBegin(transaction, definition);          // ① 커넥션을 확보한다
    }
    catch (RuntimeException | Error ex) {
        ...
    }
    prepareSynchronization(status, definition);    // ② 이제서야 readOnly 를 세팅한다
    ...
}
```

`doBegin()` 이 커넥션을 확보하고, 그 **다음에** `prepareSynchronization()` 이 새 트랜잭션의 `readOnly` 값을 `ThreadLocal` 에 씁니다. 즉 `determineCurrentLookupKey()` 가 호출되는 ① 시점에는 새 트랜잭션의 속성이 아직 반영되어 있지 않습니다. 이때 읽히는 값은 **직전에 남아 있던 값**입니다.

### 부모의 readOnly 는 아직 지워지지 않았다

그렇다면 ① 시점에 남아 있는 값은 무엇일까요. 부모 트랜잭션의 `readOnly = true` 입니다. `ThreadLocal` 을 실제로 비우는 것은 `cleanupAfterCompletion()` 이기 때문입니다.

```java
// AbstractPlatformTransactionManager.java
private void cleanupAfterCompletion(DefaultTransactionStatus status) {
    status.setCompleted();
    if (status.isNewSynchronization()) {
        TransactionSynchronizationManager.clear();   // readOnly 를 포함한 ThreadLocal 정리
    }
    ...
}
```

그런데 `@TransactionalEventListener` 는 이 정리보다 **앞선** 단계에서 실행됩니다. 앞의 로그에서 `afterCompletion` 이 찍힌 직후에 리스너가 동작한 것이 그 증거입니다. 즉 리스너가 도는 동안 부모의 `readOnly = true` 는 아직 살아 있습니다.

### suspend 도 이 값을 되돌려 주지 못한다

여기서 한 가지 반문이 가능합니다. `REQUIRES_NEW` 는 기존 트랜잭션을 잠시 미뤄두는 `suspend()` 를 호출하고, 그 안에서 `readOnly` 를 초기화하지 않느냐는 것입니다. 실제로 `suspend()` 에는 그런 처리가 있습니다.

```java
// AbstractPlatformTransactionManager.java
protected final SuspendedResourcesHolder suspend(@Nullable Object transaction) throws TransactionException {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {   // ← 이 조건
        List<TransactionSynchronization> suspendedSynchronizations = doSuspendSynchronization();
        try {
            ...
            boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
            TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
            ...
```

다만 이 처리는 **동기화가 활성 상태일 때만** 동작합니다. 그리고 하필 `afterCompletion` 콜백이 실행되기 직전에 동기화가 먼저 해제됩니다.

```java
// AbstractPlatformTransactionManager.java
private void triggerAfterCompletion(DefaultTransactionStatus status, int completionStatus) {
    if (status.isNewSynchronization()) {
        List<TransactionSynchronization> synchronizations = TransactionSynchronizationManager.getSynchronizations();
        TransactionSynchronizationManager.clearSynchronization();      // ← 콜백보다 먼저 해제
        if (!status.hasTransaction() || status.isNewTransaction()) {
            invokeAfterCompletion(synchronizations, completionStatus); // ← 여기서 리스너가 돈다
        }
        ...
    }
}
```

리스너가 실행되는 시점에는 이미 `clearSynchronization()` 이 지나간 뒤라 `isSynchronizationActive()` 가 `false` 입니다. 그래서 `suspend()` 는 `readOnly` 를 초기화하는 분기를 타지 않고 조용히 지나갑니다.

### 조각을 맞추면

세 가지를 이어 붙이면 문제의 전모가 드러납니다.

1. 부모 트랜잭션이 커밋되고 `afterCompletion` 단계에 들어간다. 이때 동기화는 해제되었지만 `readOnly = true` 는 아직 `ThreadLocal` 에 남아 있다.
2. 이 단계에서 `@TransactionalEventListener` 가 실행된다. `REQUIRES_NEW` 가 `suspend()` 를 호출하지만, 동기화가 이미 해제되어 `readOnly` 는 초기화되지 않는다.
3. `doBegin()` 이 커넥션을 요청한다. `determineCurrentLookupKey()` 가 읽는 값은 부모가 남긴 `true` 이므로 **읽기 DB 커넥션이 잡힌다.**
4. `prepareSynchronization()` 이 새 트랜잭션의 `readOnly = false` 를 세팅한다. 논리적으로는 쓰기 트랜잭션이 되었지만 커넥션은 이미 정해진 뒤다.
5. UPDATE가 읽기 전용 커넥션 위에서 실행되어 실패한다.

핵심은 **커넥션을 고르는 시점이 트랜잭션 속성이 확정되는 시점보다 이르다**는 것입니다. 부모의 정리가 아직 끝나지 않은 좁은 구간에서 새 트랜잭션이 시작되면, 그 틈에 잘못된 판단 근거로 커넥션이 결정됩니다.

## 해결: LazyConnectionDataSourceProxy

원인이 시점의 문제라면 해결도 시점을 옮기는 방향이 됩니다. `LazyConnectionDataSourceProxy` 는 **실제로 쿼리가 실행되기 전까지 커넥션 획득을 미루는** 프록시입니다. 트랜잭션이 시작될 때는 가짜 커넥션 핸들만 넘겨주고, 첫 쿼리가 나가는 순간에 비로소 실제 `DataSource` 에서 커넥션을 가져옵니다.

커넥션을 가져오는 시점이 뒤로 밀리면 `determineCurrentLookupKey()` 의 호출 시점도 함께 밀립니다. 그때는 이미 `prepareSynchronization()` 이 지나가 새 트랜잭션의 `readOnly = false` 가 반영되어 있습니다.

라우팅 데이터소스를 이 프록시로 한 겹 감싸주면 됩니다.

```java
@Primary
@DependsOn("routingDataSource")
@Bean(name = "dataSource")
public DataSource dataSource(@Qualifier("routingDataSource") DataSource routingDataSource) {
    return new LazyConnectionDataSourceProxy(routingDataSource);   // ← 한 겹 감싼다
}
```

`routingDataSource` 빈은 그대로 두고, 애플리케이션이 실제로 주입받는 `@Primary` 데이터소스만 프록시로 교체한 것입니다. 라우팅 로직도, 트랜잭션 코드도 손대지 않습니다.

적용 후 같은 API를 호출해 로그를 다시 확인해 보면 순서가 뒤바뀐 것을 볼 수 있습니다.

```plaintext
[TX Lifecycle] beforeCommit - readOnly=true
[TX Lifecycle] afterCommit - ThreadLocal readOnly=true
[TX Lifecycle] afterCompletion - status=COMMITTED, ThreadLocal readOnly=true
[EventListener] REQUIRES_NEW 진입 - readOnly=false
[DataSource Routing] readOnly=false         ← 쿼리 실행 시점으로 밀렸다
```

커넥션 라우팅이 리스너 진입 **뒤로** 옮겨갔고, 그 결과 `readOnly=false` 를 읽어 쓰기 DB로 연결되었습니다. UPDATE도 정상적으로 수행되었습니다.

> `LazyConnectionDataSourceProxy` 는 이번 문제만을 위한 임시방편이 아닙니다. 읽기·쓰기 DB를 분리한 구성에서는 트랜잭션이 시작되자마자 커넥션을 잡아버리면 라우팅 판단이 이르게 확정되는 문제가 늘 따라붙습니다. 그래서 이런 구성에서는 기본으로 함께 두는 편이 안전합니다. 부수적으로 쿼리를 한 번도 실행하지 않는 트랜잭션에서 커넥션을 아예 잡지 않게 되어 커넥션 점유 시간도 줄어듭니다.

## 다른 선택지는 없었을까

원인을 알고 나면 해결 방법은 여러 갈래로 떠오릅니다. 검토했던 선택지들을 정리하면 다음과 같습니다.

| 선택지 | 방식 | 한계 |
|---|---|---|
| 부모 트랜잭션을 쓰기로 변경 | `printLabels` 의 `readOnly` 를 `false` 로 | 조회 부하 분산 이점을 포기하게 됨. 문제의 원인이 아니라 조건을 없애는 방식 |
| 리스너에서 쓰기 DataSource 직접 지정 | 라우팅을 우회해 커넥션을 명시 | 이 지점만 예외 처리됨. 같은 구조의 코드가 생기면 문제가 반복 |
| 실행 시점을 `AFTER_COMPLETION` 으로 변경 | `@TransactionalEventListener` 의 phase 조정 | `AFTER_COMPLETION` 역시 `cleanupAfterCompletion()` 이전이라 동일한 문제 발생 |
| **LazyConnectionDataSourceProxy 적용** | 커넥션 획득 시점을 쿼리 실행 시점으로 지연 | 커넥션 획득 시점이 전역적으로 바뀌므로 기존 동작 확인 필요 |

앞의 세 가지는 모두 **문제가 드러나는 조건을 피하는** 방식입니다. 반면 마지막 방식은 커넥션을 고르는 시점 자체를 옳은 위치로 옮기기 때문에, 같은 유형의 문제가 다른 코드에서 다시 나타나지 않습니다. 그래서 마지막 방식을 선택했습니다.

세 번째 선택지는 특히 짚어둘 만합니다. 실행 시점만 뒤로 미루면 될 것 같지만, `AFTER_COMPLETION` 도 결국 `cleanupAfterCompletion()` 보다 앞서 호출되기 때문에 `ThreadLocal` 이 정리되지 않은 상태는 그대로입니다. **원인을 정확히 짚지 못한 채 phase만 바꿨다면 문제가 그대로 남았을 것입니다.**

## 마무리

지금까지 읽기 전용 트랜잭션에서 UPDATE가 실패한 현상을 두 개의 가설로 좁히고, 로그로 하나를 기각한 뒤, 스프링 트랜잭션 매니저의 내부 호출 순서를 따라가 원인을 규명하고 `LazyConnectionDataSourceProxy` 로 해결하기까지의 과정을 살펴보았습니다.

이번 문제를 겪으며 가장 크게 남은 것은 **논리적인 설정과 물리적인 자원이 항상 같은 시점에 확정되지는 않는다**는 감각입니다. `REQUIRES_NEW` 는 분명히 새 트랜잭션을 열어주었고 `readOnly` 도 올바르게 `false` 였습니다. 설정만 놓고 보면 아무 문제가 없었습니다. 그럼에도 실패한 이유는 그 설정이 확정되기 전에 커넥션이 먼저 정해졌기 때문이었습니다. 어노테이션이 선언하는 것과 런타임에 실제로 일어나는 일 사이에는 이런 간극이 존재할 수 있고, 그 간극은 프레임워크의 호출 순서를 직접 따라가 보기 전에는 보이지 않습니다.

가설을 두 개 세워둔 것도 도움이 되었습니다. 만약 `REQUIRES_NEW` 가 동작하지 않았다는 쪽만 의심했다면 전파 설정을 이리저리 바꿔보다 시간을 흘려보냈을 것입니다. 로그 한 줄로 그 가설을 먼저 기각했기 때문에 남은 방향으로 곧장 파고들 수 있었습니다. 원인을 모를 때일수록 **틀릴 수 있는 가설을 여러 개 세워두고 하나씩 지워나가는 편이 빠르다**는 것을 다시 확인했습니다.

읽기와 쓰기 DB를 분리한 환경에서 비슷한 현상을 마주하신 분들께 조금이나마 도움이 되었으면 합니다.

---

**참고 자료**

- [Spring Framework - AbstractPlatformTransactionManager](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/support/AbstractPlatformTransactionManager.html)
- [Spring Framework - LazyConnectionDataSourceProxy](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/LazyConnectionDataSourceProxy.html)
- [Spring Framework - AbstractRoutingDataSource](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/lookup/AbstractRoutingDataSource.html)
- [Spring Framework Reference - Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
