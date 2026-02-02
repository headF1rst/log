---
title: "[오브젝트] 1장 - 객체, 설계"
category: object
thumbnail: https://wikibook.co.kr/images/cover/m/9791158391409.png
tags: object
date: 2022-08-22 10:00
---

`패러다임` - 한 시대의 사회 전체가 공유하는 이론 혹은 방법.
절차형 → 객체지향으로 패러다임 전환을 맞았다.

프로그래밍 패러다임은 과거의 패러다임을 폐기시키는 혁명적 패러다임이 아니라 과거의 패러다임을 개선하는 `발전적 패러다임`이다.

객체지향이 적합하지 않은 상황에서는 언제라도 다른 패러다임을 적용할 수 있는 시야와 지식을 길러야한다.

## 티켓 판매 애플리케이션

작은 소극장을 운영하고 있으며 무료로 관람할 수 있는 초대장을 발송하는 이벤트를 열었다.

- 이벤트 당첨 관람객과 일반 관람객을 구분해야한다.

- **일반 관람객**
    - 티켓을 매표소에서 구매하여 입장
- **당첨 관람객**
    - 매표소에서 초대장과 티켓을 교환하여 입장.

``` java
// 초대장 객체
public class Invitation{
    private LocalDateTime when;
}

// 티켓 객체
public class Ticket{
    private Long fee;
    
    public Long getFee(){
        return fee;
    }
}
```

관람객은 초대장, 현금, 티켓 3가지 소지품을 가방에 갖고 있다.

``` java
public class Bag{
    private Long amount;
    private Invitation invitation;
    private Ticket ticket;
    
    public boolean hasInvitation() {
        return invitaion != null;
    }
    
    public boolean hasTicket(){
        return ticket != null;
    }

    public void setTicket(Ticket ticket) {
        this.ticket = ticket;
    }

    public void minusAmount(Long amount) {
        this.amoun -= amount;
    }

    public void plusAmount(Long amount) {
        this.account += account;
    }
}
```

가방에 초대장이 있는 경우와 없는 두가지 경우가 있을 수 있기 때문에 Bag의 인스턴스 생성 시점에 해당 제약을 강제할 수 있도록 생성자를 추가한다.

``` java
public class Bag{
    public Bag(long amount){
        this(null, amount);
    }

    public Bag(Invitation invitation, long amount) {
        this.invitation = invitation;
        this.amount = amount;
    }
}
```

관람객이 가방을 갖는걸 표현하면 다음과 같다.

``` java
// 관람객 객체
public class Audience{
    private Bag bag;

    public Audience(Bag bag) {
        this.bag = bag;
    }
    
    public Bag getBag() {
        return bag;
    }
}
```

매표소에는 관람객에게 판매할 티켓과 티켓 판매 금액을 갖고 있어야 한다.

``` java
// 매표소 객체
public class TicketOffice{
    private Long amount;
    private List<Ticket> tickets = new ArrayList<>();

    public TicketOffice(Long amount, Ticket... tickets) {
        this.amount = amount;
        this.tickets.addAll(Arrays.asList(tickets));
    }
    
    public Ticket getTicket() {
        return tickets.remove(0);
    }

    public void minusAmount(Long amount) {
        this.amount -= amount;
    }

    public void plusAmount(Long amount) {
        this.amount += amount;
    }
}
```

- 판매원은 매표소에서 초대장을 티켓으로 교환해 주거나 티켓을 판매하는 역할을 수행.

- 판매원은 자신이 일하는 매표소를 알고 있어야 한다.

``` java
public class TicketSeller{
    private TicketOffice ticketOffice;

    public TicketSeller(TicketOffice ticketOffice) {
        this.ticketOffice = ticketOffice;
    }
    
    public TicketOffice getTicketOffice() {
        return ticketOffice;
    }
}
```

소극장은 관람객을 맞이하는 역할을 수행할 수 있어야 한다.

``` java
public class Theater{
    private TicketSeller ticketSeller;

    public Theater(TicketSeller ticketSeller) {
        this.ticketSeller = ticketSeller;
    }

    public void enter(Audience audience) {
        if (audience.getBag().hasInvitation()) {
            Ticket ticket = ticketSeller.getTicketOffice().getTicket();
            audience.getBag().setTicket(ticket);
        } else {
            Ticket ticket = ticketSeller.getTicketOffice().getTicket();
            audience.getBag().minusAmount(ticket.getFee());
            ticketSeller.getTicketOffice().plusAmount(ticket.getFee());
            audience.getBag().setTicket(ticket);
        }
    }
}
```

## 2. 무엇이 문제인가

### 모듈이 가져야 하는 3가지 기능
- 제대로 실행되어야 한다.
- 변경이 용이해야 한다.
- 이해하기 쉬워야 한다.

티켓 판패 애플리케이션은 제대로 실행되어야 한다는 모듈의 기능을 만족하지만 나머지 두 기능은 만족하지 못한다.

`Theater` 클래스의 `enter()` 메서드를 글로 설명하자면 다음과 같다.

- `소극장` 은 `관람객` 의 가방 을 열어서 초대장이 있는지 확인
    - 가방에 초대장이 있으면 `판매원`은 매표소의 티켓을 관람객의 가방으로 옮김.
    - 가방안에 초대장이 없으면 관람객의 가방에서 티켓 금액만큼의 현금을 꺼내 매표소에 적립
        - 매표소에 보관돼 있는 티켓을 관람객 가방으로 옮김

### 이해하기 쉬운가?

일반적으로 소극장은 관객과 소통을한다. 때문에 소극장이 관객에게 가방에 티켓이 있는지 확인하도록 메세지를 던지면, 관객은 자신이 들고 있는 가방 객체로 부터 티켓 포함 여부를 확인하는 메세지를 던져야한다.

하지만 지금 소극장 객체가 행하는 행위인 `enter()` 는 소극장이 관람객의 가방을 가져가서 안에 티켓이 있는지 확인하는 행위를 하는것과 같다.

판매원의 경우에도 마찬가지이다.
소극장이 판매자의 허락도 없이 매표소의 티켓과 현금에 마음대로 접근한다.

``` java
audience.getBag().hasInvitation();
ticketSeller.getTicketOffice().getTicket();
```

사람의 상식과 전혀 다르게 동작하는 코드는 코드를 읽는 사람에게 이해에 어려움을 준다.

뿐만 아니라 `enter()`메서드를 이해하기 위해서는 관람객이 가방을 가지고 있고 가방에는 현금과 티켓이 있어야하는 등의 정보를 코드를읽는 개발자가 모두 기억하고 있어야만 한다.

때문에 해당 코드는 코드를 작성하고 읽는 사람 모두에게 큰 부담을 주게 된다.


### 변경에 용의한가?

지금의 구조는 결합도가 너무 높다.

> 결합도 (Coupling) - > 객체 사이의 의존성을 의미.
> 객체 사이의 의존성이 너무 높을 경우 결합도가 높다고 한다.

관람객이 가방을 들고 다니지 않는 구조로 변경 되었을 경우.
`Audience` 클래스에서 `Bag`을 제거하는건 당연하고 Audience의 Bag에 직접 접근하는 `Theater`의 `enter()` 메서드도 같이 수정되어야 한다.

이는 Theater가 `관람객이 가방을 들고 있다는 사실` , `판매원이 메표소에서만 티켓을 판매한다는 사실`에 지나치게 의존해서 동작하기 때문이다.

애플리케이션 구동에 필요한 최소한의 의존성만 유지하고 불필요한 의존성을 제거하여 객체간의 결합도를 낮추는 설계를 목표로 해야한다.

## 3. 설계 개선하기

기존의 코드는 이해하기 어렵고 변경에 용이하지 않다.

이는 `Theater`가 관람객의 가방에, 판매원의 매표소에 직접 접근하기 때문이다.

이는 객체의 자유도를 해치며 행위를 규제한다.

객체가 자신의 행위를 스스로 결정할 수 있도록 자율성을 높이는 구조로 개선해야 한다.

- `Audience`가 직접 Bag를 처리.
- `TicketSeller`가 TicketOffice를 직접 처리.

- 캡슐화 (encapsulation)
  객체 내부의 세부적인 사항을 감추는 것.
    - 캡슐화의 목적은 변경하기 쉬운 객체를 만드는것.
    - 캡슐화로 객체 내부 접근을 제한하면 결합도를 낮출 수 있다.

객체들간에는 오직 **메시지**를 통해서 상호작용해야한다.
다른 객체가 어떤 객체의 내부에 대해서 알아서는 안된다.
(Theater는 Audience의 내부에 Bag 객체가 있다는 것을 알고있다. ⛔️)

객체는 상대 객체가 메시지를 이해하고 응답할 수 있는지 여부만을 알 수 있다.

- 응집도 (Cohesioin)
  자신과 연관된 작업만을 수행하고 연관없는 작업은 다른 객체에 위임하는 행위
    - 응집도를 높이기 위해 객체 스스로 자신의 데이터를 책임해야한다.
    - 객체는 전달받은 메시지를 스스로 처리하는 자율적인 존재여야 한다.

외부의 간섭을 최대한 배제하고 메시지를 통해서만 협력하도록 한다.

설계에 있어서, 객체가 어떤 데이터를 가지느냐보다는 객체에 어떤 책임을 할당할 것이냐에 초점을 맞추자.

가능한 객체의 내부에 접근하는 로직은 캡슐화를 시키자.
(public메서드를 private으로 변경)

설계는 트레이드오프의 산물이며 모든 사람들을 만족시킬 수 있는 설계를 만들 수는 없다.

OOP의 핵심은 무생물을 의인화하여 스스로 생각하고 행동하는, 능동적이고 자유로운 생명체로 인식하는 것이다. (엘리스가 경험했던 이상한 나라의 생명체들 처럼)

## 4. 객체지향 설계

설계란 코드를 배제하는것

오늘 요구하는 기능을 온전히 수행하면서 내일의 변경은 유연하게 수용해야한다.
모든 요구사항을 한번에 수집하는것은 불가능하며 개발 진행에서 요구사항 변경은 불가피하다.

따라서 변경에 유연한 코드작성은 필수적.

### 변경에 유연한 코드란?

- 이해하기 쉬운 코드
- 협력하는 객체 사이의 의존성을 적절하게 관리한 설계
- 객체간 결합도는 낮추고 응집도는 높인 코드

### 느낀점

"설계는 트레이드 오프의 산물"이라는 말이 인상깊었다.

1절에서도 "객체지향이 적합하지 않은 상황에서는 언제라도 다른 패러다임을 적용할 수 있는 시야와 지식을 길러야한다." 라는 구절이 있었는데 기술이나 패러다임은 주어진 문제를 해결해 주는 수단일 뿐이지 정답이 될 수는 없다는 생각이 들었다.

기술이나 패러다임에 매몰되는 개발자가 되지 않기 위해서 서로 피드백을 꺼리낌 없이 나눌 수 있는 동료가 될 수 있도록 소프트스킬에도 신경을 써야겠다.

### 생각해본 주제
- 디미터의 법칙
- 객체지향 생활 체조 원칙 (한 줄에 점 하나만 찍는다.)
