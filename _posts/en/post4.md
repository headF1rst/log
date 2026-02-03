---
title: "Why @Transactional Sometimes Fails: A Deep Dive into Spring AOP Proxies"
section: tech
date: "2025-06-01"
tags: "AOP, Transactional"
thumbnail: "https://dev-to-uploads.s3.amazonaws.com/uploads/articles/a1wxef2amdixh3lr4any.png"
description: "Understanding Spring AOP proxies and why @Transactional sometimes fails with internal method calls"
searchKeywords: "Spring AOP, @Transactional, proxy pattern, self-invocation"
---

## How @Transactional Works

### Transaction Management via AOP and the Proxy Pattern

AOP (Aspect-Oriented Programming) is a programming paradigm that complements Object-Oriented Programming (OOP) by addressing its limitations in enterprise application development. It allows developers to separate and modularize cross-cutting concerns like transactions, caching, and logging, enabling them to focus on business logic.

Spring supports AOP using the Proxy Pattern. A proxy object intercepts method calls to the real object, applying common functionalities before and after the business logic executes.

Similarly, for transaction management, when a method annotated with `@Transactional` is called, a proxy object handles the transaction's start and end (commit/rollback) before and after the method execution. So, how is this proxy object created?

---

## Two Proxy Creation Methods in Spring AOP

Spring offers two ways to create proxy objects: **JDK Dynamic Proxy** and **CGLIB Proxy**.

**1. JDK Dynamic Proxy**

This method uses JDK's `java.lang.reflect.Proxy` class to dynamically create proxy objects at runtime that implement interfaces. The target object must implement at least one interface, and the proxy object is created based on the abstract methods of that interface.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/kp5rfzww1urar2lbcfyv.png)

Interface-based proxy objects intercept method calls via an `InvocationHandler` to process additional functionalities.
For example, if logging is added in addition to transaction handling, another necessary proxy object is created, and methods are called in the following order:

> ProxyLogging -> ProxyTransaction -> Target

**2. CGLIB Proxy (Default Method)**

CGLIB (Code Generation Library) is a library that can dynamically generate classes at runtime by manipulating bytecode. Unlike JDK Dynamic Proxy, it creates proxy objects by subclassing the target object. This means a proxy can be created even if the target object doesn't implement an interface. The proxy object overrides the target object's methods to intercept calls and process additional functionalities before and after method execution.

Since Spring Boot 2.x, **CGLIB proxy is the default method** for creating AOP proxies, including for `@Transactional` behaviour, regardless of whether the target object implements an interface.

While this proxy-based AOP mechanism is very powerful, it also creates certain scenarios that require caution. One common point of confusion for developers is method calls within the same class, i.e., self-invocation scenarios. With this understanding of how @Transactional operates through proxies, let's now delve into why transactions might not be applied in such self-invocation cases and the reasons behind it.

---

## Internal Method Calls and AOP Proxies

Now that we understand the principle behind `@Transactional`, let's examine why transactions are not applied when an internal method (a method within the same class) is called, and the reasons for this behavior.

```java
@Service
@RequiredArgsConstructor
public class TransportService {

    private final TransportRepository transportRepository;

    public void sendTransportEvents(List<Long> transportIds) {
        transportRepository.changeStatuses(transportIds);
        // Sending...
    }
}

@Repository
public interface TransportRepository {
    void save(Transport transport);

    default void changeStatuses(List<Long> transportIds) {
        for (Long transportId : transportIds) {
            changeStatus(transportId); // Internal call within the proxy if TransportRepositoryImpl is proxied
        }
    }

    void changeStatus(Long transportId);

    Optional<Transport> findById(Long id);
}

@Repository
@RequiredArgsConstructor
public class TransportRepositoryImpl implements TransportRepository {

    private final TransportJpaRepository transportJpaRepository;

    @Override
    public void save(Transport transport) {
        transportJpaRepository.save(transport);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Override
    public void changeStatus(Long transportId) {
        Transport transport = transportJpaRepository.findById(transportId).orElseThrow();
        transport.updateStatus(TransportStatus.SENT);
    }

    @Override
    public Optional<Transport> findById(Long id) {
        return transportJpaRepository.findById(id);
    }
}

@SpringBootTest
class TransportServiceTest {

    @Autowired
    private TransportService sut;
    @Autowired
    private TransportRepository transportRepository; // This will be a proxy

    @Test
    void whenTransportEventsAreSent_statusChangesToSENT() {
        // given
        var transportA = new Transport(1L, TransportStatus.PENDING);
        var transportB = new Transport(2L, TransportStatus.PENDING);
        List.of(transportA, transportB).forEach(transportRepository::save);

        // when
        sut.sendTransportEvents(List.of(1L, 2L));

        // then
        var result1 = transportRepository.findById(1L).get();
        var result2 = transportRepository.findById(2L).get();

        assertThat(result1.getStatus()).isEqualTo(TransportStatus.SENT);
        assertThat(result2.getStatus()).isEqualTo(TransportStatus.SENT);
    }
}
```

In `TransportRepositoryImpl.changeStatus(transportId)`, we attempt to change the `transport's` status from PENDING to `SENT` using JPA's dirty checking. If dirty checking worked as intended, the test should pass. However, the test fails, and the status remains `PENDING`.

### Why Does This Happen?

```java
@Repository
@RequiredArgsConstructor
@Slf4j
public class TransportRepositoryImpl implements TransportRepository {

    private final TransportJpaRepository transportJpaRepository;
    private final EntityManager em;
    // ...

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Override
    public void changeStatus(Long transportId) {
        Transport transport = transportJpaRepository.findById(transportId).orElseThrow();
        transport.updateStatus(TransportStatus.SENT);

        if (em.contains(transport)) {
            log.info("Entity is managed");
        } else {
            log.info("Entity is detached"); // This will be logged
        }
        log.info("Transaction active: {}", TransactionSynchronizationManager.isActualTransactionActive()); // false
    }
}
```

For dirty checking to work correctly, the entity must be managed by the persistence context. 

However, the logs would show that the `Transport` entity is not managed by the persistence context (Entity is detached) and that no transaction is active (Transaction active: false). This is because the transaction was not applied to this method call.

![persistence](https://i.imgur.com/BANQI7X.png)

The lifecycle of the persistence context is tied to the transaction. If a transaction is not active, a persistence context is not created (or an existing one isn't joined), and thus, the entity is not managed within it. Consequently, in the `changeStatus()` method where no transaction is applied during this specific invocation path, a persistence context isn't effectively used for dirty checking.

Spring creates a proxy object for `TransportRepositoryImpl` (likely using CGLIB by default). This proxy object overrides the `changeStatus()` method (which is annotated with @Transactional) to inject transaction-related logic before and after the actual method call.

The problem arises because the `TransportRepository's` default method `changeStatuses()` calls `changeStatus()` through the this reference of the proxy. However, when `changeStatuses()` (which itself is not @Transactional on the interface proxy) iterates and calls `changeStatus(transportId)`, this call is an internal invocation within the target `TransportRepositoryImpl` object if the proxy delegates to it without re-intercepting.

More precisely:
When `transportRepository.changeStatuses()` is called on the proxy:

1. The proxy might invoke the default method `changeStatuses()` on itself.
2. Inside `changeStatuses()`, the call `changeStatus(transportId)` is effectively `this.changeStatus(transportId)`. If `this` refers to the raw `TransportRepositoryImpl` instance or if the proxy doesn't re-intercept calls from within itself to itself, the proxy's transactional advice for `changeStatus()` is bypassed.

Spring proxies can only apply transactional (and other AOP) advice to calls that go through the proxy from an external caller. Methods called from within the same class instance (self-invocation) typically bypass the proxy mechanism, so transactions are not applied to the inner call.

---

## Why Do Internal Calls Bypass the Proxy?

In Spring AOP, proxies operate when called by an external client (another bean or component). When an external client calls a method on a bean that is proxied, it's actually calling a method on the proxy object. The proxy then intercepts this call, applies any configured AOP advice (like starting a transaction), and then delegates to the actual method on the target object.

However, when a method is called from within the same class instance (e.g., `this.someOtherMethod()`), it's not an external call being made through the proxy. Instead, the method is invoked directly on the current instance's `this` reference, which refers to the raw target object, not the proxy. Therefore, the proxy's AOP advice (including transactional behavior) is bypassed.

To resolve this:

1. It's recommended to apply @Transactional to methods that are called externally (e.g., directly from the `TransportService` to `transportRepository.changeStatus(id)` for each ID).

2. Alternatively, you can separate the internal method that needs its own transaction into a different Spring bean so it can be called externally (i.e., injected and then called, ensuring the call goes through its proxy).

In the given example, the most straightforward fix to ensure `changeStatus` is transactional would be to call it directly from `TransportService` in a loop, or refactor `TransportRepository` so changeStatuses itself is @Transactional (if that's the desired transactional boundary) and handles the logic appropriately, or to make `changeStatuses` a method on `TransportRepositoryImpl` directly and have `TransportService` call it. The current default method on the interface makes the proxy interaction complex.

---

## Conclusion

To summarize, Spring's @Transactional annotation relies on AOP proxies (typically CGLIB in modern Spring Boot) to manage transactions by intercepting external method calls. A critical takeaway is that @Transactional may not apply to self-invocations because these internal calls bypass the proxy mechanism.

It's important to understand that this self-invocation challenge and the underlying proxy behavior are not exclusive to @Transactional. This is a fundamental aspect of how Spring AOP functions. Consequently, other AOP-driven features, such as declarative caching (@Cacheable), method security (@Secured, @PreAuthorize), or any custom aspects you implement, can be similarly affected by internal calls bypassing the proxy.

Therefore, a solid understanding of AOP's core working principles—especially how proxies intercept external calls and why self-invocations are not subject to this interception—is paramount. This knowledge is key not just for mastering @Transactional, but for effectively utilizing the full spectrum of Spring's powerful AOP capabilities, ultimately leading to more robust and predictable applications.
