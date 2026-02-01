---
title: JPA 트랜잭션과 영속성 컨텍스트
category:
thumbnail: https://images.velog.io/images/dnjscksdn98/post/14072bd8-850b-4d2b-8476-cb5385bbcd36/jpa.png
tags: JPA
date: 2024-01-07 10:00
searchKeywords: jpa, entitymanager, 영속성 컨텍스트, 트랜잭션
description: JPA 트랜잭션과 영속성 컨텍스트
---

최근 구현한 테스트 코드에서 `@Transactional` 여부에 따라 테스트 결과가 달라지는 문제를 만나게 되었다.

타 서비스로부터 송장 접수 결과에 대한 카프카 메세지를 소비한 다음, 송장 접수에 실패했다면 택배 등록 여부를 실패로 변경하는 로직에 대한 테스트 코드였는데 당시 상황을 간단하게 재현해 보았다.

```kotlin
@Entity  
@Table(name = "orders")  
class Order (  
    val shippingLabel: String,  
    var parcelStatus: Boolean = true,  
  
    @Id  
    @GeneratedValue(strategy = GenerationType.IDENTITY)  
    val id: Long? = null,  
) {  
    fun isParcelRegister(): Boolean {  
        return parcelStatus  
    }  
  
    fun updateParcelStatus(registerSuccess: Boolean) {  
        parcelStatus = registerSuccess  
    }  
}
```

```kotlin
@Service  
class OrderStatusService(  
    private val orderRepository: OrderRepository,  
) {  
    
    @Transactional  
    fun checkOrderSubmissionStatus(message: OutSourcingResultMessage) {  
        val order = orderRepository.findByShippingLabel(message.shippingLabel)  
        order.updateParcelStatus(message.registerSuccess)  
    }  
}
```

```kotlin
@SpringBootTest  
class OrderStatusChangeServiceTest @Autowired constructor(  
    private val orderStatusService: OrderStatusService,  
    private val orderRepository: OrderRepository,  
) {  
  
    @Test  
    @DisplayName("송장접수에 실패하면 택배등록 여부를 실패 표시 해야한다.")  
    fun checkOrderSubmissionStatusTest() {  
        val order = Order(shippingLabel = "12345")  
        val savedOrder = orderRepository.save(order)  
        val failureMessage = OutSourcingResultMessage(  
            shippingLabel = savedOrder.shippingLabel,  
            registerSuccess = false  
        )  
  
        orderStatusService.checkOrderSubmissionStatus(failureMessage)  
  
        order.isParcelRegister() shouldBe false  
    }  
}
```

OrderStatusChangeService의 checkOrderSubmissionStatus(failureMessage) 메서드에 `@Transactional`이 걸려있고 order의 `parcelStatus`를 true에서 **false**로 변경한다.

이때 JPA 더티 체킹을 활용하여 데이터베이스 컬럼값을 변경하기 때문에 checkOrderSubmissionStatus 메서드가 종료되는 시점에 checkOrderSubmissionstatus의 트랜잭션이 커밋 되면서 영속성 컨텍스트의 변경 사항이 데이터베이스로 flush 될 것이기 때문에 테스트는 성공할 것이라 예상된다.

하지만 테스트 실행 결과, 테스트가 실패한 것을 확인할 수 있었다.

![[스크린샷 2024-01-06 오후 9.20.22.png]](https://i.imgur.com/lTvSdwQ.png)

이때 checkOrderSubmissionStatus를 호출하는 테스트 코드에 `@Transactional`을 걸어주면 테스트는 성공한다.

왜 테스트 코드의 `@Transactional` 여부에 따라서 테스트 결과가 달라지는 것일까?
## 테스트 코드의 엔티티는 영속성 컨텍스트에 관리되지 않는다

스프링 컨테이너는 기본적으로 트랜잭션 범위의 영속성 컨텍스트 전략을 사용한다.

즉, 트랜잭션 범위와 영속성 컨텍스트의 생명 주기가 같다는 뜻으로 트랜잭션을 시작할 때 영속성 컨텍스트를 생성하고 트랜잭션 커밋 시점에 영속성 컨텍스트를 flush하고 종료한다.

```kotlin
@SpringBootTest  
class OrderStatusChangeServiceTest @Autowired constructor(  
    private val orderStatusService: OrderStatusService,  
    private val orderRepository: OrderRepository,  
    private val entityManager: EntityManager,  
) {  
  
    @Test  
    @DisplayName("송장접수에 실패하면 택배등록 여부를 실패 표시 해야한다.")  
    fun checkOrderSubmissionStatusTest() {  
        val order = Order(shippingLabel = "12345")  
        val savedOrder = orderRepository.save(order)  
        val failureMessage = OutSourcingResultMessage(  
            shippingLabel = savedOrder.shippingLabel,  
            registerSuccess = false  
        )  
  
        println(entityManager.contains(savedOrder)) // false  
        orderStatusService.checkOrderSubmissionStatus(failureMessage)  
  
        order.isParcelRegister() shouldBe false  
    }  
}
```

위의 결과에서 볼 수 있듯 테스트 코드의 엔티티는 트랜잭션 범위 밖이기 때문에 영속성 컨텍스트에 등록이 되어있지 않다. `checkOrderSubmissionStatus` 메서드 내에서 조회해 온 Order는 트랜잭션 범위이기 때문에 영속성 컨텍스트에 의해 관리되고 있지만 테스트 코드에서 검증의 대상이 되는 Order는 트랜잭션 범위 밖에서 조회된, **영속성 컨텍스트에 의해 관리되지 않는** Order를 대상으로 데이터 변경 **검증이 이루어진다**.

때문에 실제 데이터베이스의 컬럼값은 의도한 대로 true에서 false로 변경되었지만, 테스트 코드의 Order는
영속성 컨텍스트의 1차 캐시에 관리되지 않기 때문에 당연하게도 더티 체킹의 효과를 볼 수 없는 것이다.

테스트 코드에 `@Transactional`을 붙여준다면 테스트 코드의 엔티티가 영속성 컨텍스트에 의해 관리되게 되고 1차 캐시에 의해 더티 체킹 대상이 되기 때문에 테스트가 성공하게 된다.
## JpaTransactionManager는 트랜잭션 단위로 EntityManager를 관리한다

위 사례를 통해서 더티 체킹은 영속성 컨텍스트가 관리하는 영속 상태의 엔티티에만 적용되며, 영속성 컨텍스트는 트랜잭션 단위로 생성, 삭제된다는 것을 알 수 있었다.

JPA가 트랜잭션 단위로 영속성 컨텍스트를 생성, 관리하는 부분의 코드를 한번 살펴보았다.

먼저 스프링의 표준 트랙잭션 워크플로우를 구현하는 `AbstractPlatformTransactionManager` 클래스를 살펴보면 `startTransaction()` 메서드에서 
`TransactionManager`의 `doBegin()` 메서드를 호출하는것을 볼 수 있다.

![[스크린샷 2024-01-07 오후 6.59.49.png]](https://i.imgur.com/l4sY5Fz.png)

`doBegin()` 메서드는 `TransactionManager`를 구현하는 `JpaTransactionManager`에서 확인할 수 있다.

![[스크린샷 2024-01-07 오후 7.26.00.png]](https://i.imgur.com/7Qm3pOV.png)

이때  새로 시작된 트랜잭션이라면 EntityManager를 생성하고 `JpaTransactionObject`에 저장한다.

`JpaTransactionObject`는 현재 트랜잭션의 상태를 추적하는 데 사용되며, 트랜잭션 범위 내에서 사용되는 EntityManager를 `EntityManagerHolder`를 통해서 관리하고 있다.

이러한 로직을 통해서 트랜잭션 범위 내에서 동일한 EntityManager가 사용될 수 있던 것이다.

## 마무리

지금까지 트랜잭션 범위와 영속성 컨텍스트의 생명 주기가 어떻게 관리되는지 알아보았다.

사실 영속성 컨텍스트의 생존 범위가 항상 트랜잭션 범위내인 것은 아니다.
OSIV(Open Session In View)를 사용하면 영속성 컨텍스트의 범위를 트랜잭션 범위 밖까지 확장 할 수 있다.