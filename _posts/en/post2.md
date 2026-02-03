---
title: "Understanding and Resolving the N+1 Query Problem in JPA"
section: tech
date: "2025-05-05"
tags: "JPA, Hibernate, N+1 Problem"
thumbnail: "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fsrf6chohgt3athvqj7u1.png"
description: "Learn what causes the N+1 query problem in JPA, how to identify it, and practical solutions using fetch joins, EntityGraph, and QueryDSL"
searchKeywords: "JPA, N+1, Hibernate, performance, optimization, fetch join, EntityGraph, QueryDSL"
---

The **N+1 query problem** arises when one initial query (1) is followed by N additional queries—one for each result row from the first query. While this might not be an issue for small datasets, it can lead to serious performance degradation at scale.

## Why It Happens in JPA

JPA's N+1 problem is closely related to how entity relationships are fetched using JPQL, which is an object-oriented abstraction over SQL. JPQL queries typically only target the root entity and **ignore related entities unless explicitly fetched**.

Even Spring Data JPA's query methods and QueryDSL ultimately execute JPQL under the hood, so understanding this behavior is essential.

When a related entity is needed during entity access (based on the `FetchType`), Hibernate performs **additional queries** to retrieve them. Let's see how this works in practice.

## Code Example: The N+1 in Action

### Entity Definitions

```java
@Entity
@Getter
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Transport {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_id")
    private Driver driver;

    public static Transport from(Driver driver) {
        return new Transport(null, driver);
    }
}
```

```java
@Entity
@Getter
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Driver {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    public static Driver from(String name) {
        return new Driver(null, name);
    }
}
```

### Test Code to Observe N+1 Behavior

```java
@SpringBootTest
@Transactional
class TransportRepositoryTest {

    @Autowired 
    private TransportRepository transportRepository;
    @Autowired 
    private DriverRepository driverRepository;
    @Autowired 
    private EntityManager entityManager;

    @Test
    void testNPlusOneQueryProblem() {
        int driverCount = 3;
        for (int i = 0; i < driverCount; i++) {
            Driver driver = Driver.from("Driver " + i);
            driverRepository.save(driver);
        }

        List<Driver> allDrivers = driverRepository.findAll();
        for (Driver driver : allDrivers) {
            transportRepository.save(Transport.from(driver));
        }

        entityManager.flush();
        entityManager.clear();

        System.out.println("=== Finding all transports ===");
        List<Transport> allTransports = transportRepository.findAll();

        System.out.println("=== Accessing driver properties (will trigger N+1 queries) ===");
        for (Transport transport : allTransports) {
            System.out.println("Transport ID: " + transport.getId() + ", Driver Name: " + transport.getDriver().getName());
        }
    }
}
```

### Why Do We Flush and Clear?

We explicitly call `flush()` and `clear()` on the `EntityManager` to prevent the persistence context (first-level cache) from returning entities already in memory. This ensures all queries are sent to the database, and we can accurately observe the N+1 behavior.

### Console Output (Simplified)

```
=== Finding all transports ===
select t1_0.id, t1_0.driver_id from transport t1_0

=== Accessing driver properties (will trigger N+1 queries) ===
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
```

## What Happens If We Change to `FetchType.EAGER`?

```java
@ManyToOne(fetch = FetchType.EAGER)
@JoinColumn(name = "driver_id")
private Driver driver;
```

With EAGER loading, one might expect JPA to load both Transport and Driver in a single query. But in reality, the result looks like this:

```
=== Finding all transports ===
select t1_0.id, t1_0.driver_id from transport t1_0
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
select d1_0.id, d1_0.name from driver d1_0 where d1_0.id=?
```

JPA still executes one query for each related `Driver`. Why?

> JPQL does **not** automatically join associated entities, even with EAGER fetch settings. Unless explicitly specified, related entities are still queried separately.

## It Happens with Both `LAZY` and `EAGER`

* **Lazy Loading**: With `FetchType.LAZY`, JPA proxies the `driver` reference. When accessed (e.g., `transport.getDriver().getName()`), Hibernate fetches it on demand.
* **Eager Loading**: With `FetchType.EAGER`, JPA loads the parent entity first, then executes separate queries for the related entities—especially when JPQL is used without joins.

Even default JPA repository methods like `findAll()` or `findById()` use Hibernate-generated SQL, and will still cause N+1 issues when navigating relationships.

## Solutions to the N+1 Problem

### Use JPQL `fetch join`

```java
@Query("SELECT t FROM Transport t JOIN FETCH t.driver")
List<Transport> findAllWithDriver();
```

This instructs JPA to fetch the associated `Driver` in a single query, avoiding lazy-loading altogether.

### Use QueryDSL `fetchJoin()`

```java
public List<Transport> findAllWithDriverUsingQuerydsl() {
    QTransport transport = QTransport.transport;
    QDriver driver = QDriver.driver;

    return queryFactory
        .selectFrom(transport)
        .leftJoin(transport.driver, driver).fetchJoin()
        .fetch();
}
```

This approach uses QueryDSL's fluent API to explicitly instruct Hibernate to perform a join fetch between `Transport` and its associated `Driver`.

### Use `@EntityGraph`

```java
@EntityGraph(attributePaths = "driver")
List<Transport> findAll();
```

This achieves the same result as a `fetch join` but integrates cleanly with Spring Data JPA method names.

## The Role of Hibernate SQL Generation

Hibernate may choose between different fetching strategies depending on the access path:

* `EntityManager.find()` may result in join queries.
* JPQL ignores fetch type unless a fetch join is explicitly declared.
* `FetchType.EAGER` is not always honored as a join.

> You control your query performance by **being explicit** about your fetching strategy.

## Summary

* N+1 = 1 initial query + N individual queries per entity
* Occurs regardless of `FetchType`
* JPQL ignores associations unless `JOIN FETCH` is used
* Solved using fetch joins, entity graphs, or QueryDSL fetch joins
* Always validate with real query logs

Understanding N+1 isn't just a theory—it's something you can test and observe. Armed with the right strategy, you can eliminate it and make your JPA application truly production-grade.
