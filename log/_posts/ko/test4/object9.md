---
title: "[오브젝트] 9장 - 유연한 설계"
category: object
thumbnail: https://wikibook.co.kr/images/cover/m/9791158391409.png
tags: object
date: 2022-11-02 10:00
---

## 1. 개방-폐쇄 원칙 (Open-Closed Principle)

- 개체는 확장에 대해 열려있어야 하고, 수정에 대해서는 닫혀 있어야한다.
    - 확장에 열려있다.
        - 새로운 동작을 추가해서 어플리케이션의 기능을 확장할 수 있다.
    - 수정에 닫혀있다.
        - 기존 코드를 수정하지 않고도 어플리케이션 동작을 추가하거나 변경할 수 있다.

### OCP원칙을 지키는 방법

- 컴파일타임 의존성을 고정시키고 런타임 의존성을 변경하라.
    - 런타임 의존성
        - 실행시에 협력에 참여하는 객체들 사이의 관계
    - 컴파일타임 의존성
        - 코드에서 드러나는 클래스들 사이의 관계
    - 컴파일타임 의존성을 런타임 의존성으로 대체하라

- 추상화에 의존하라
    - 추상화
        - 핵심적인 부분만 남기고 불필요한 부분을 생략하여 복잡성을 낮추는 기법
    - 추상화 부분은 수정에 닫혀 있다.
    - 추상화를 통해 생략된 부분은 확장의 여지를 남긴다.
    - 변하지 않는 부분을 추상화해서 고정하고 변하는 부분을 생략하는 추상화 메커니즘이 OCP의 기반이 된다.

## 2. 객체에 대한 생성과 사용을 분리하라

- 객체 생성에 대한 지식은 결합도를 증가시킨다.
    - 객체의 타입과 생성자에 전달해야 하는 인자에 대한 과도한 지식은 코드를 문맥에 강하게 결합시킨다.
- 동일 클래스 안에서 객체 생성과 사용이 공존해서는 안된다.

### 사용으로부터 생성을 분리하는 방법

- 객체를 생성할 책임을 클라이언트가 갖도록 하라
    - `Movie`객체에게 어떤 할인 정책을 적용할지를 알고 있는 것은 Movie와 협력할 클라이언트이다.
    - Movie의 클라이언트가 적절한 할인정책 인스턴스를 생성한 후 Movie에게 전달하도록 한다.
    - Movie는 특정 클라이언트에 결합되지 않고 독립적일 수 있게 된다
- 객체 생성만을 담당하는 Factory 객체를 추가하라 ⭐️ (PURE FABRICATION 객체)
    - 객체 생성에 대한 책임만을 담당하는 팩토리 객체를 추가하고 클라이언트는 팩토리 객체를 사용하도록 한다.

   ```java
   public class Factory {

      public Movie createAvatarMovie() {
          return new Movie("아바타",
                          new AmountDiscountPolicy(...));
      }
  }
  ```

    ``` java
    public class Client {
      
            private Factory factory;
                
            public Client(Factory factory) {
                this.factory = factory;
            }
            
            public Money getAvatarFee() {
                Movie avatar = factory.createAvatarMovie();
                return avatar.getFee();
            }
    }
    ```

- 순수한 가공물에게 책임을 할당하라
    - 시스템을 객체로 분해하는 두가지 방식
        - 표현적 분해
            - 도메인 모델의 개념을 이용해 시스템을 분해하는 것.
            - 객체지향 설계를 위한 가장 기본적인 접근법
            - (도메인 모델은 어디까지나 설계를 위한 출발점에 불과하다.)
            - 모든 책임을 도메인 객체에 할당하면 캡슐화가 위반된다.
            - 설계자가 임의로 만들어낸 가공의 객체에 책임을 할당하여 문제를 해결한다.
            - `PURE FABRICATION`: 도메인과 무관한 인공적인 객체
        - 행위적 분해
            - 특정한 행동을 표현하기 위해 시스템을 분해하는 것.
            - 어떤 행동을 책임질 도메인이 존재하지 않는다면 PURE FABRICATION을 추가하고 책임을 할당하라.

    - 설계자의 역할은 도메인 추상화를 기반으로 어플리케이션 로직을 설계하는 동시에 품질 측면에서 균형을 맞추는 데 필요한 객체들을 창조하는 것.

## 3. 의존성 주입 (Dependency Injection)

- 외부에서 의존성의 대상을 해결한 후 이를 사용하는 객체 쪽으로 주입하는 기법

- 생성과 사용을 분리하고 나면, 객체는 인스턴스를 사용하는 책임만 갖게된다.
    - 즉, 외부의 다른 객체가 인스턴스를 생성하여 전달해야 한다.

### 의존성 주입 방법

- 생성자 주입
    - 객체를 생성하는 시점에 생성자를 통한 의존성 해결
    - 객체의 생명주기 전체에 걸쳐 의존성 관계를 유지
- Setter 주입
    - 객체 생성 후 setter 메서드를 통한 의존성 해결
    - 런타임에 의존성의 대상을 변경할 수 있다.
    - 객체가 생성되기 위해 어떤 의존성이 필수적인지 명시할 수 없다.
- 메서드 주입
    - 메서드 실행 시 인자를 이용한 의존성 해결

### Service Locator 패턴 (Anti)

- 의존성을 해결할 객체들을 보관하는 일종의 저장소.
- 객체가 직접 Service Locator에게 의존성 해결을 요청

- 인스턴스를 등록하고 반환할 수 있는 메서드를 구현한 저장소.

```java
public class ServiceLocator {

	private static ServiceLocator soleInstance = new ServiceLocator();
	private DiscountPolicy discountPolicy;

	public static DiscountPolicy discountPolicy() {
		return soleInstance.discountPolicy;
	}

	public static void provide(DiscountPolicy discountPolicy) {
		soleInstance.discountPolicy = discountPolicy;
	}

	private ServiceLocator() {
	}
}
```

- `Movie`의 인스턴스가 `AmountDiscountPolicy`의 인스턴스에 의존하기를 원하는 경우
    - ServiceLocator에 인스턴스를 등록한 후 Movie를 생성

```java
ServiceLocator.provide(new AmountDiscountPolicy(...));
Movie avatar = new Movie("아바타",
						Money.wons(10000));
```

### 숨겨진 의존성은 나쁘다

ServiceLocator 패턴은 의존성을 감춘다는 단점이 있다.

```java
Movie avatar = new Movie("아바타",
						Money.wons(10000));
						
avatar.calculateMovieFee(screening); // NPE!!!
```

개발자는 위 코드가 Movie를 온전히 생성해 줄 것이라고 예상하지만 인스턴스에 접근하는 순간 인스턴스 변수인 discountPolicy가 null이라는 것을 알게 된다.

- 의존성을 구현 내부로 감추는 것의 문제점
    - 의존성 문제가 런타임에 가서야 발견된다.
    - 단위 테스트 작성이 어렵다.
    - 의존성을 이해하기 위해 코드의 내부 구현을 이해할 것을 강요한다.
        - 캡슐화를 위반하게 된다.

- 가능한 의존성 주입을 사용하라.
    - 필요한 의존성은 클래스의 퍼블릭 인터페이스에 명시적으로 드러난다.
    - 코드 내부를 읽을 필요가 없으므로 캡슐화를 지킨다.
    - 가급적 의존성을 객체의 퍼블릭 인터페이스에 노출하라.

- 의존성을 명시적으로 표현할 수 있는 기법을 사용하라 (의존성 주입)

## 4. 의존성 역전 원칙 (Dependency Inversion Principle)

- 협력의 본질을 담고 있는 것은 상위 수준의 정책이다.
    - 협력에서 중요한 의사결정, 비즈니스의 본질을 담고 있는 것은 상위 수준의 클래스다.
- 상위 수준의 클래스는 하위 수준의 클래스에 의존해서는 안된다.
- 모든 의존성의 방향이 추상화를 바라보도록 해라.
    - 하위 수준 클래스의 변경으로 상위 수준 클래스가 영향을 받는것을 방지 할 수 있다.
    - 상위 수준을 재사용할 때 하위 수준의 클래스에 얽매이지 않고도 다양한 컨텍스트에 재사용이 가능

### 의존성 역전 원칙과 패키지

- 객체지향 프로그래밍 언어에서 어떤 구성 요소의 소유권을 결정하는 것은 `모듈` (패키지)이다.

- 인터페이스가 서버 모듈 쪽에 위치하는 전통적 모듈 구조
  (Movie), (DiscountPolicy, AmountDiscountPolicy, PercentDiscountPolicy)
    - Movie는 DiscountPolicy에 의존한다.
        - Movie를 정상적으로 컴파일하기 위해서는 DiscountPolicy가 필요.
    - DiscountPolicy가 포함된 패키지 내, 클래스가 수정되면 패키지 전체가 재배포 돼야한다.
    - DiscountPolicy가 속한 패키지에 의존하는 Movie가 포함된 패키지 역시 재컴파일돼야 한다.
    - Movie에 의존하는 또 다른 패키지도 재컴파일이 되야하며 어플리케이션 전체로 번지게 되며 빌드 시간이 상승한다.

- 인터페이스와 소유권을 역전시킨 객체지향적인 모듈 구조
    - Movie의 재사용을 위해 필요한 것이 DiscountPolicy 뿐이라면 둘을 같은 패키지로 모은다.
    - AmountDiscountPolicy, PercentDiscountPolicy는 별도의 패키지로 하여 의존성 문제를 해결.
    - Movie를 다른 컨텍스트에서 재사용하기 위해서는 Movie와 DiscountPolicy가 포함된 패키지만 재사용하면 된다.

## 5. 그럼에도 역할, 책임, 협력이 가장 중요하다

- 유연한 설계
    - 동일한 컴파일 타임 의존성으로부터 다양한 런타임 의존성을 만들 수 있는 코드 구조를 가지는 설계
- 불필요한 유연성은 불필요한 복잡성을 낳는다.
- 로직을 처리하기 위해 책임을 할당하고 협력의 균형을 맞추는것을 우선시 하라
- 객체 생성 메커니즘을 결정하고 객체 생성 책임을 담당할 객체를 찾는것을 최대한 미뤄라

## 느낀점

"객체지향은 현실 세계의 모방이다."라는 말을 처음 객체지향 프로그래밍을 접했을때 들었던 기억이 있다. 객체지향을 처음 접하는 사람들이 조금은 쉽게 이해할
수 있기 위해 한 표현이라고 생각된다. 이번 장에서 저자가 말하듯, 우리가 애플리케이션을 구축하는 것은 사용자들이 원하는 기능을 제공하기 위함이지,
실세계를 모방하기 위함이 아니다라는 것을 다시 한번 생각하게 되었다.

패키지 구조에 대한 내용도 인상 깊었다. 그동안 찾기 쉽게 비슷한 도메인을 패키지로 묶어서 관리했었다. 이번에 의존성 역전 원칙과 패키지 구조에 대해 알고나서
모듈화에 대해서 조금 더 관심을 갖는 계기가 되었다. 그럼, 이번 장에서 인상 깊었던 구절로 마무리 하도록 하겠다. 우리 모두 훌륭한 설계 역량을 가진 개발자로 성장해보자!

"도메인을 반영하는 어플리케이션의 구조라는 제약 안에서 실용적인 창조성을 발휘할 수 있는 능력은 훌륭한 설계자가 갖춰야 할 기본 역량이다."
