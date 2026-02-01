---
title: 내부 메서드 호출시 트랜잭션이 적용되지 않는 이슈
category: spring
thumbnail: https://velog.velcdn.com/images/uiurihappy/post/0c13062e-e5cb-45f0-9727-a9ef018b1ffc/image.png
tags: transactional
date: 2024-10-01 10:00
searchKeywords: transactional, spring, aop
description: Transactional 내부 메서드 호출시 트랜잭션이 적용되지 않는 이슈
---

# @Transactional 동작 원리

## AOP와 프록시 패턴을 통한 트랜잭션 관리

AOP는 엔터프라이즈 애플리케이션 개발에서 객체지향 프로그래밍(OOP)의 한계를 보완해주는 보조적인 프로그래밍 기법이다. 이를 통해 트랜잭션, 캐싱, 로깅 같은 부가적인 관심사를 분리하고 모듈화하여 개발자가 비즈니스 로직에 집중할 수 있게 한다.

스프링은 프록시 패턴을 이용해 AOP를 지원한다. 프록시 객체는 실제 객체로의 메서드 호출을 가로채며, 비즈니스 로직이 실행되기 전후에 공통 기능을 적용하는 방식으로 동작한다.

트랜잭션 관리도 마찬가지로, @Transactional이 적용된 메서드가 호출되기 전후에 프록시 객체가 트랜잭션 시작과 종료를 처리한다. 그렇다면 이 프록시 객체는 어떻게 생성될까?

## Spring AOP의 두 가지 프록시 방식

스프링은 프록시 객체 생성을 위해 JDK 동적 프록시와 CGLIB 프록시, 두 가지 방식을 제공한다.

### 1. JDK 동적 프록시

JDK의 java.lang.reflect.Proxy 클래스를 이용해 인터페이스를 구현하는 프록시 객체를 런타임에 동적으로 생성한다. 타겟 객체는 최소 하나 이상의 인터페이스를 구현해야 하며, 그 인터페이스의 추상 메서드를 기반으로 프록시 객체를 생성한다.

![Drawing 2024-09-25 18.44.13.excalidraw](https://i.imgur.com/V8LdLQg.png)

인터페이스를 구현한 프록시 객체는 InvocationHandler를 통해 타겟 메서드로의 메서드 호출을 가로채고 부가 기능을 처리한다.

만약 트랜잭션 처리 이외에 로깅 처리를 추가로 타겟 메서드에 부여하면 그에 필요한 프록시 객체가 하나 더 생성되며 다음과 같은 순서로 객체가 호출된다.

> ProxyLogging -> ProxyTransaction -> Target

### 2. CGLIB 프록시 (기본 방식)

CGLIB(Code Generation Library)는 바이트코드를 조작해 런타임에 동적으로 클래스를 생성할 수 있는 라이브러리다. JDK 동적 프록시와 달리, 타겟 객체를 상속하는 프록시 객체를 생성하므로 타겟 객체가 인터페이스를 구현하지 않아도 프록시를 생성할 수 있다. 프록시 객체는 타겟 객체의 메서드를 오버라이드하여 호출을 가로채고, 메서드 실행 전후에 부가 기능을 처리한다.

스프링 부트 2.x 이후에는 타깃 객체가 인터페이스를 구현하고 있는지와 상관없이 기본적으로 CGLIB 프록시 방식으로 트랜잭션이 동작한다.

> [AOP in Spring Boot, is it a JDK dynamic proxy or a Cglib dynamic proxy?](https://www.springcloud.io/post/2022-01/springboot-aop/#gsc.tab=0)

# 내부 메서드와 AOP 프록시

@Transactional이 어떤 원리로 동작하는지 알아보았으니, 이제 동일 클래스 내에서 내부 메서드를 호출했을 때 트랜잭션이 적용되지 않는 경우와 그 이유를 살펴보자.

```java
@Service  
@RequiredArgsConstructor  
public class TransportService {  
  
    private final TransportRepository transportRepository;  
  
    public void sendTransportEvents(List<Long> transportIds) {  
        transportRepository.changeStatuses(transportIds);  
        // 전송...  
    }  
}
```

```java
@Repository  
public interface TransportRepository {  
  
    void save(Transport transport);  
  
    default void changeStatuses(List<Long> transportIds) {  
        for (Long transportId : transportIds) {  
            changeStatus(transportId);  
        }  
    }  
  
    void changeStatus(Long transportId);  
  
    Optional<Transport> findById(Long id);  
}
```

```java
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
```

```java
@SpringBootTest  
class TransportServiceTest {  
  
    @Autowired  
    private TransportService sut;  
    @Autowired  
    private TransportRepository transportRepository;  
  
    @Test  
    void 운송_이벤트가_전송되면서_상태를_SENT로_변경한다() {  
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

TransportRepositoryImpl.changeStatus(transportId)에서 JPA의 더티 체킹을 활용해 transport의 상태 값을 PENDING에서 SENT로 변경을 시도하고 있다.

JPA의 더티 체킹이 의도한 대로 동작한다면 테스트가 통과해야 하지만 테스트가 실패하며 상태 값은 그대로 PENDING으로 변하지 않은 것을 확인할 수 있었다.

![스크린샷 2024-10-01 오전 2.05.54.png](https://i.imgur.com/RI75mwO.png)

## 왜 이런 일이 발생할까?

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
            log.info("Entity is detached");  
        }
        
        log.info("Transaction active: {}", TransactionSynchronizationManager.isActualTransactionActive());  
    }
}
```

더티 체킹이 정상적으로 동작하려면 엔티티가 영속성 컨텍스트에서 관리되고 있어야 한다. 하지만 아래 로그를 보면 Transport 엔티티가 영속성 컨텍스트에 관리되지 않는 것을 확인할 수 있는데, 이는 해당 메서드에 트랜잭션이 적용되지 않았기 때문이다.

![스크린샷 2024-10-01 오전 2.35.24.png](https://i.imgur.com/BANQI7X.png)

영속성 컨텍스트의 생명주기는 트랜잭션과 동일하다. 트랜잭션이 활성화되지 않으면 영속성 컨텍스트가 생성되지 않고, 따라서 엔티티도 영속성 컨텍스트에서 관리되지 않는다. 결국, 트랜잭션이 적용되지 않은 `changeStatus()` 메서드에서는 영속성 컨텍스트가 생성되지 않기 때문에 더티 체킹이 동작하지 않는 것이다.

스프링은 CGLIB을 사용해 `TransportRepositoryImpl` 객체를 상속하는 프록시 객체를 생성한다. 이 프록시 객체는 `@Transactional`이 붙은 `changeStatus()` 메서드를 오버라이드하여, 트랜잭션 관련 로직을 메서드 호출 전후에 삽입한다.

문제는 `changeStatuses()` 메서드가 같은 클래스 내에서 `changeStatus()`를 직접 호출하는 방식으로 작성되어 발생한다. 스프링 프록시는 클래스 외부에서 호출되는 경우에만 트랜잭션을 처리할 수 있으며, 자기 자신 내에서 호출하는 메서드는 프록시를 거치지 않고 호출되기 때문에 트랜잭션이 적용되지 않는다.

### 왜 내부 호출은 프록시를 거치지 않을까?

스프링 AOP에서 프록시는 외부 클라이언트가 호출할 때 동작한다. 외부에서 프록시 객체를 통해 메서드를 호출하면, 프록시는 이 호출을 가로채고 트랜잭션 등의 부가 기능을 처리한다. 그러나 동일 클래스 내에서 호출하는 경우는 외부 호출이 아니라 자기 자신의 인스턴스를 통해 메서드가 호출되는 것이기 때문에, 프록시를 거치지 않고 실제 메서드가 직접 호출된다.

이를 해결하기 위해 `@Transactional`을 외부에서 호출되는 메서드에 적용하는 것이 권장된다. 혹은 내부 메서드를 별도의 클래스로 분리해 외부에서 호출할 수 있도록 설계하는 방법도 있다.

### 마무리

@Transactional의 동작 원리에 대해 어느 정도 알고 있다고 생각했는데 이번 문제를 겪으면서 아직 명확히 정리되어 있지 않다는 것을 느끼게 되었다.

글을 작성하면서 정리되지 않고 점으로만 존재하던 지식이 선으로 연결되는 듯한 느낌을 받았다. 바쁘다고 글 쓰는 걸 미루지 말고 글로 지식과 경험을 내재화하는 습관을 가질 수 있도록 노력해야겠다.

---

**참고 자료**

- [Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)
- [In Java, why are dynamic proxies only allowed to proxy interface classes?](https://www.quora.com/In-Java-why-are-dynamic-proxies-only-allowed-to-proxy-interface-classes)
