---
title: 조인 테이블이 왜 생기지? @JoinColumn으로 해결하는 연관관계 매핑의 비밀
category: JPA
thumbnail: https://velog.velcdn.com/images/wooyong99/post/6fdebd14-5fe8-4959-b085-74edb6bc4d46/image.png
tags: JPA
date: 2024-10-10 10:00
searchKeywords: jpa, JoinColumn, 외래 키, 외래 키 제약 조건
description: JoinColumn
---

`@JoinColumn`은 외래키를 매핑할 때 사용한다. 즉, 한 엔티티에서 다른 엔티티를 참조(조인)하는데 사용되는 필드를 지정하는 역할을 한다.

```java
@Entity  
@Table(name = "orders")  
@Getter
@NoArgsConstructor  
public class Order {  
  
    @Id  
    @GeneratedValue(strategy = GenerationType.IDENTITY)  
    private Long id;  
  
    @ManyToOne  
    @JoinColumn(name = "customer_id") // 외래 키로 지정
    private Customer customer;
  
    public Order(Customer customer) {  
        this.customer = customer;  
    }  
}
```

```java
@Entity  
@Getter  
@NoArgsConstructor  
public class Customer {  
  
    @Id  
    @GeneratedValue(strategy = GenerationType.IDENTITY)  
    private Long id;  
  
    private String name;  
  
    public Customer(String name) {  
        this.name = name;  
    }  
}
```

`@JoinColumn(name = "customer_id")`는 Order 테이블에서 `customer_id`라는 컬럼을 통해 `Customer` 엔티티를 참조하는 외래 키를 정의한다.

`@ManyToOne`의 기본 FetchType이 EAGER이기 때문에, Order 조회시 연관된 Customer 엔티티도 함께 `@JoinColumn`에 명시된 필드를 통해 참조(조인)하여 가져오는걸 볼 수 있다.

```java
@SpringBootTest  
class OrderTest {  
  
    @Autowired  
    private OrderRepository orderRepository;  
    @Autowired  
    private CustomerRepository customerRepository;  
  
    @Test  
    void joinColumnTest() {  
        var customer = customerRepository.save( new Customer("John Doe"));  
        var order = orderRepository.save(new Order(customer));  
  
        Order result = orderRepository.findById(order.getId()).get();  
    }
}
```

```
Hibernate: 
    select
        o1_0.id,
        c1_0.id,
        c1_0.name 
    from
        orders o1_0 
    left join
        customer c1_0 
            on c1_0.id=o1_0.customer_id 
    where
        o1_0.id=?
```

`@JoinColumn`은 ConstraintMode 옵션 값을 통해서 외래 키 제약 조건을 걸 수 있다.

- **ConstraintMode.PROVIDER_DEFAULT** (기본값): JPA Provider의 외래 키 제약 조건 생성 전략을 따른다. Hibernate는 이 옵션 값에서 외래 키 제약 조건을 설정한다.
- **ConstraintMode.CONSTRAINT**: 해당 외래 키 컬럼에 데이터베이스 레벨에서 외래 키 제약 조건을 설정한다.
- **ConstraintMode.NO_CONSTRAIN**: DB에 외래키 제약조건을 걸지 않는다.
    - 외래 키 컬럼은 생성되지만 DB가 그 컬럼의 값을 검증하거나 무결성을 유지하지는 않는다.

# @JoinColumn은 생략해도 될까

단방향 `@ManyToOne` 에선 `@JoinColumn`을 생략 할 수 있다. `@JoinColumn`을 생략하면 외래 키를 찾을 때 기본 전략을 사용한다. 실제로 앞의 예제 코드에서 `@JoinColumn`을 생략하고 테스트를 실행했을때 동일한 로그가 출력되는걸 확인할 수 있었다.

> 기본 전략: 필드명 + _ + 참조하는 테이블의 컬럼명
> 
> ex) customer + _ + id -> customer_id

그러나 단방향 `@OneToMany` 연관관계에서 `@JoinColumn`을 생략할 경우, JPA는 조인 테이블을 생성하여 엔티티간의 관계를 관리한다.

```java
@Entity  
@Table(name = "orders")  
@Getter  
@NoArgsConstructor  
public class Order {  
  
    @Id  
    @GeneratedValue(strategy = GenerationType.IDENTITY)  
    private Long id;  

	@Column(name = "customer_id")
    private Long customerId;  
  
    public Order(Long customerId) {  
        this.customerId = customerId;  
    }  
}
```

```java
@Entity  
@Getter  
@NoArgsConstructor  
public class Customer {  
  
    @Id  
    @GeneratedValue(strategy = GenerationType.IDENTITY)  
    private Long id;  
  
    @OneToMany(cascade = CascadeType.ALL)  
    private List<Order> orders = new ArrayList<>();
  
    private String name;  
  
    public Customer(String name) {  
        this.name = name;  
    }  
}
```

```java
@SpringBootTest  
class OrderTest {  
  
    @Autowired  
    private OrderRepository orderRepository;  
    @Autowired  
    private CustomerRepository customerRepository;  
  
    @Test  
	@Transactional  
	public void joinColumnTest() {  
	    Customer customer = new Customer("John Doe");  
	    List<Order> orders = List.of(
		    new Order(customer.getId()), 
		    new Order(customer.getId())
		);
	    customer.getOrders().addAll(orders);  
  
	    customerRepository.save(customer);  
	    orderRepository.saveAll(orders);  
	}
}
```

테스트 실행 후 로그를 확인해보면 `customer_orders` 조인 테이블이 생성된것을 확인할 수 있다.

![log](https://i.imgur.com/v332oJ2.png)

# 왜 조인 테이블이 생성될까?

단방향 `@OneToMany` 관계에서는 JPA가 어느 테이블에 외래 키를 두어야 할지 명확하지 않기 때문에, 중간 조인 테이블을 생성하여 관계를 관리한다.

조인 테이블이 생성되는 것을 방지하고 싶다면, `@JoinColumn`을 명시적으로 설정하여 외래 키를 직접 관리하도록 해야 한다.
아래와 같이 `@JoinColumn(name = "customer_id"...)`를 설정하여 외래키를 Order 테이블에 설정할 수 있다.

```java
@Entity  
@Getter  
@NoArgsConstructor  
public class Customer {  
	//...
	
    @OneToMany(cascade = CascadeType.ALL)  
    @JoinColumn(name = "customer_id", foreignKey = @ForeignKey(ConstraintMode.NO_CONSTRAINT))  
    private List<Order> orders = new ArrayList<>();  
  
    //...
}
```

다시 테스트를 실행하고 로그를 확인해 보면 조인 테이블이 생성되지 않은걸 확인할 수 있다.

![log](https://i.imgur.com/1RLHtIp.png)

---

**참고 자료**
- [@ManyToOne을 사용할 때 @JoinColumn 생략](https://hyeon9mak.github.io/omit-join-column-when-using-many-to-one/)

