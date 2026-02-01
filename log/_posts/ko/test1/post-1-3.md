---
title: Fixture Monkey With Kotlin
category: test
thumbnail: https://i.imgur.com/J5SIYtU.png
tags: test
date: 2024-03-03 10:00
searchKeywords: fixture monkey, test, fixture
description: fixtureMonkey
---

테스트를 작성하다보면 프로덕션 코드를 작성하는 시간보다 테스트를 위한 픽스처를 만드는데 더 많은 시간이 소요될 때가 있다.

테스트를 작성하는데 시간이 많이 들고 번거로울 수록 테스트 코드를 생략하게 되고 결국 결함에 취약한 시스템을 구현할 위험이 있다.

주문 관련 로직을 테스트 하기위해서 `Order` 픽스처를 만들어야했었는데 `Order` 객체 내부에 필드가 24개 였을뿐더러 내부 객체의 필드까지 합하면 정의해줘야 하는 필드가 수 없이 많았다.

심지어 케이스마다 다른 상태값을 갖고있는 `Order` 픽스처를 추가로 만들어줘야 했기 때문에 테스트 준비에 많은 시간이 소요됐던 경험이 있다.

그러던중 `Fixture Monkey`라는 PBT(Property Based Testing) 라이브러리를 알게되었고, `Fixture Monkey`를 사용하여 테스트를 편리하게 작성할 수 있었던 경험이 있었는데, 개인적으로 유용하게 사용했던 핵심 내용만 간략하게 소개하고자 한다.

## FixtureMonkey의 주요 기능

- 렌덤하고 복잡한 제약조건을 갖는 객체를 생성해준다.
- 설정한 제약조건을 검증할 수 있다.
- 테스트케이스마다 다르게 객체 제어가 가능하다.

`FixtureMonkey`는 엔티티 필드에 지정된 Bean validation 어노테이션에 따라 유효한 속성값을 갖는 객체를 생성한다.

실패 테스트 작성과 같이 특정 테스트 케이스에서 조건을 추가하거나 조건에 벗어난 필드를 설정해야할 경우에는 `ArbitraryBuilder`를 사용하여 fixture를 제어할 수 있다.

`ArbitraryBuilder`는 빌더 패턴을 사용하여 객체의 필드값을 원하는 값으로 설정하여 객체를 생성하는게 가능하다.

## 예제

### Without FixtureMonkey Test

`FixtureMonkey`의 편리한 기능을 살펴보기에 앞서서 이전 방식으로 테스트를 작성해보았다.

다음은 주문 과정에서 입력된 배송지 주소가 유효한지 검증하는 테스트이다.

```kotlin
data class Order(  
    val product: List<Product>,  
    val purchaserName: String,  
    val receiver: Receiver,  
    val totalPrice: Long,  
    val coupon: List<Coupon>,  
    val delivery: Delivery,  
)
```

```kotlin
class OrderFixture {  
    companion object {  
        fun create(  
            id: Long = 1L,  
            product: List<Product> = listOf(  
                Product(name = "초콜릿", price = 300L),  
                Product(name = "키보드", price = 20000L),  
            ),  
            purchaserName: String = "홍길동",  
            receiver: Receiver = Receiver(name = "홍길동", "01012341234"),  
            totalPrice: Long = 20300L,  
            coupon: List<Coupon> = listOf(Coupon()),  
            delivery: Delivery = Delivery("경기도", "203동 1023호", true),  
        ): Order {  
            return Order(  
                id = id,  
                product = product,  
                purchaserName = purchaserName,  
                receiver = receiver,  
                totalPrice = totalPrice,  
                coupon = coupon,  
                delivery = delivery,  
            )  
        }  
    }  
}
```

```kotlin
class OrderServiceTestWithOutFixtureMonkey : DescribeSpec({  
    val sut = OrderService()  
    val log = LoggerFactory.getLogger(this.javaClass)  
  
    describe("배송 주소 유효성 검사") {  
        it("유효성 검증을 통과한다.") {  
            val order = OrderFixture.create()  
  
            shouldNotThrowAny {  
                sut.validateDeliveryAddress(order)  
            }  
        }  
        it("지번 주소를 입력받았을 경우, 상세 주소가 없으면 안 된다") {  
            val order = OrderFixture.create(delivery = Delivery(baseAddress = "경기도", road = false, detailAddress = null))  
  
            val exception = shouldThrow<IllegalArgumentException> {  
                sut.validateDeliveryAddress(order)  
            }  
  
            exception.message shouldBe "지번 주소에는 상세 주소가 반드시 필요합니다."  
        }  
    }})
```

테스트 성공과 실패 케이스를 위한 `OrderFixture` 객체를 정의하여 사용하였다.
`Order` 객체에 정의된 필드 뿐만 아니라 연관된 객체의 필드값들도 함께 정의해줘야하기 때문에 꽤나 번거로운 작업일 수 있다.

만약 연관된 엔티티가 더 많고 정의해줘야하는 필드 수가 훨씬 많아진다면 테스트를 위한 fixture를 정의하는데 큰 비용이 소모되게 된다.

### FixtureMonkey Test

이번엔 `FixtureMonkey`를 사용하여 간단하게 fixture를 생성하여 테스트를 작성해보도록 하겠다.

먼저 `build.gradle.kts`에 의존성을 추가해주었다.
```gradle
// fixture monkey  
testImplementation("com.navercorp.fixturemonkey:fixture-monkey-starter-kotlin:1.0.14")  
testImplementation("com.navercorp.fixturemonkey:fixture-monkey-jakarta-validation:0.6.3")  
testImplementation("com.navercorp.fixturemonkey:fixture-monkey-jackson:0.6.3")
```

**DefaultMonkeyCreator**
```kotlin
fun monkey() : FixtureMonkey {  
    return FixtureMonkey.builder()  
        .plugin(KotlinPlugin())  
        .build()  
}
```

**FixtureBuilders**
```kotlin
fun <T> defaultFixtureBuilder(clazz: Class<T>): ArbitraryBuilder<T> {  
    return monkey().giveMeBuilder(clazz)  
}
```

```kotlin
class OrderServiceTestWithFixtureMonkey: DescribeSpec({  
    val sut = OrderService()  
    val log = LoggerFactory.getLogger(this.javaClass)  
  
    describe("배송 주소 유효성 검사") {  
        it("유효성 검증을 통과한다.") {  
            val order = defaultFixtureBuilder(Order::class.java)  
                .setExp(  
                    Order::delivery,  
                    Delivery(baseAddress = "경기도", detailAddress = null, road = true))  
                .sample()  
  
            shouldNotThrowAny {  
                sut.validateDeliveryAddress(order)  
            }  
        }  
        it("지번 주소를 입력받았을 경우, 상세 주소가 없으면 안 된다") {  
            val order = defaultFixtureBuilder(Order::class.java)  
                .setExp(  
                    Order::delivery,  
                    Delivery(baseAddress = "경기도", detailAddress = null, road = false))  
                .sample()  
  
            val exception = shouldThrow<IllegalArgumentException> {  
                sut.validateDeliveryAddress(order)  
            }  
  
            exception.message shouldBe "지번 주소에는 상세 주소가 반드시 필요합니다."  
        }  
    }})
```

이처럼 `FixtureMonkey`를 사용하면 랜덤한 필드값을 갖는 fixture 객체를 생성하여 사용할 수 있다.

`setter`를 통해서 객체를 제어할 수 있는데, 테스트하고자 하는 필드를 명확히 표현하기 때문에 테스트 관심사를 바로 파악할 수 있다는 장점도 있다.
