---
title: 객체 생성 비용이 정말 비싼가? (직접 측정해보기)
category: java
thumbnail: https://image.zdnet.co.kr/2015/05/15/ICeGlK2DZK2VnBEIz2VP.jpg
tags: java, object, jmh
date: 2024-11-03 10:00
searchKeywords: java, jmh, object
description: 객체 생성 비용이 정말 비싼가? (직접 측정해보기)
---

자바를 비롯한 많은 프로그래밍 언어에서 객체를 생성하는 것은 자연스러운 일이다. 

하지만 개발자라면 한 번쯤은 "객체 생성 비용을 줄여야 한다"라는 말을 들어본 적이 있을 것이다.
Effective Java 같은 권위 있는 자료에서도 **"불필요한 객체 생성을 피하라"** 라는 조언이 등장한다. 그렇다면 실제로 객체 생성이 얼마나 비싼 일일까? 
오늘은 그 궁금증을 풀기 위해 `JMH`를 사용해 객체 생성 비용을 직접 측정해 보고, 언제 객체 생성 최적화를 고려해야 하는지 살펴보겠다.

# 왜 객체 생성 비용이 문제인가?

과거 JVM의 메모리 관리 방식은 현재만큼 효율적이지 않았다. 그 당시에는 객체 생성과 메모리 회수(Garbage Collection)가 무거웠기 때문에 불필요한 객체 생성이 성능에 큰 영향을 미쳤다. 
따라서 Effective Java에서도 **"불필요한 객체 생성을 피하라"** 는 조언을 하며, 특히 짧은 시간 동안 대량의 객체가 생성되고 사라지는 상황을 피할 것을 권장한다.

하지만 시간이 지나면서 JVM이 최적화되었고, 지금은 짧은 생명 주기를 가지는 가벼운 객체는 성능에 큰 부담을 주지 않게 되었다. 그렇다면 객체 생성 비용이 높아지는 경우는 언제일까? 
또, 성능에 영향을 줄 만큼 비싼 작업이라면 어떻게 최적화할 수 있을까? 이를 확인하기 위해 실제 객체 생성 비용을 측정해 보자.

# JMH로 객체 생성 비용 측정하기

객체 생성 비용을 정확히 측정하기 위해, 마이크로벤치마크 도구인 **JMH(Java Microbenchmark Harness)** 를 사용해 보겠다. JMH는 JVM의 성능 특성을 고려한 신뢰성 높은 벤치마크 도구로, 객체 생성과 관련된 비용을 정확히 파악하는 데 유용하다.

## 측정 코드 작성하기

아래 코드는 JMH를 사용하여 간단한 객체(Object) 생성과 상대적으로 무거운 객체(MyObject) 생성 비용을 비교하는 예제이다.

```java
import org.openjdk.jmh.annotations.*;
import java.util.concurrent.TimeUnit;
import java.time.LocalDateTime;

@State(Scope.Benchmark)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 5)
@Measurement(iterations = 5)
@Fork(1)
public class ObjectCreationBenchmark {

    @Benchmark
    public Object createNewObject() {
        return new Object();
    }

    @Benchmark
    public MyObject createNewMyObject() {
        return new MyObject();
    }

    @Benchmark
    public MyObject reuseMyObject() {
        return myObject;
    }

    private MyObject myObject = new MyObject();

    public static class MyObject {
        private String name = "MyObject";
        private int value = 77;
        private LocalDateTime time = LocalDateTime.now();
    }
}
```

### 코드 설명

- `createNewObject`: 가벼운 객체인 Object를 매번 새로 생성한다.
- `createNewMyObject`: MyObject라는 사용자 정의 객체를 새로 생성한다. 이 객체는 String, int, 그리고 LocalDateTime 필드를 가지고 있어, Object보다 초기화 비용이 더 크다.
- `reuseMyObject`: 이미 생성된 MyObject를 재사용하는 방식을 측정한다.

### 측정 결과 분석

JMH로 벤치마크를 실행한 결과는 다음과 같다.

```bash
Benchmark                                  Mode  Cnt   Score   Error  Units
ObjectCreationBenchmark.createNewObject    avgt    5   0.930 ± 0.127  ns/op
ObjectCreationBenchmark.createNewMyObject  avgt    5  65.090 ± 1.490  ns/op
ObjectCreationBenchmark.reuseMyObject      avgt    5   0.426 ± 0.006  ns/op
```

- `createNewObject`: 가벼운 Object의 생성 비용은 0.93 ns로 매우 낮다. JVM이 가벼운 객체 생성에 대해 상당히 최적화되어 있음을 보여준다.
- `createNewMyObject`: MyObject는 65.09 ns로, Object보다 훨씬 많은 리소스를 사용하고 있음을 알 수 있다. 이 객체는 필드 초기화와 LocalDateTime.now() 호출을 포함해 무거운 초기화 작업이 있어 비용이 높아진다.
- `reuseMyObject`: 객체를 재사용할 경우 0.426 ns로, 가장 빠른 결과를 보여준다. 이처럼 객체 재사용은 생성 및 초기화 비용을 피할 수 있어 성능에 유리하다.

# 객체 생성 최적화 방법: 언제 고려해야 할까?

객체 생성 비용이 큰 상황에서는 불필요한 객체 생성을 줄이는 것이 성능에 큰 도움이 된다. 예를 들어 다음과 같은 상황에서 객체 생성 비용 최적화를 고려할 수 있다.

### 1. 대량의 객체를 반복적으로 생성하는 경우

HTTP 요청/응답 처리처럼 요청당 새로운 객체를 생성해야 하는 경우, 불필요한 객체 생성을 줄이면 성능을 개선할 수 있다.

### 2. 비용이 큰 리소스 또는 외부 연결 객체

파일 핸들, 데이터베이스 연결, 소켓 등 시스템 리소스를 사용하는 객체의 경우 매번 생성하는 것보다는 풀링하여 재사용하는 것이 좋다.

### 3. 객체 풀링(Object Pooling)의 장단점

객체 생성 비용이 높다면 객체 풀링을 통해 재사용할 수 있다. 하지만 풀 관리 비용이 추가되고 메모리 누수의 위험도 있으므로 모든 객체에 적용할 필요는 없다. 풀링이 필요하다면 실제 성능 개선이 있는지를 확인하는 것이 좋다.

```java
Queue<MyObject> objectPool = new LinkedList<>();

public MyObject getFromPool() {
    MyObject obj = objectPool.poll();
    
    if (obj == null) {
        obj = new MyObject();
    }
    
    objectPool.offer(obj);
    return obj;
}
```

# JVM 메모리 관리와 GC의 영향
자바의 가비지 컬렉션(GC)은 객체를 메모리에서 자동으로 회수해 준다. 대량의 객체를 짧은 시간 안에 생성하고 회수할 경우, GC 작업이 많아져 전체 시스템의 성능이 저하될 수 있다. 
예를 들어 대규모 요청을 받는 서버에서는, 짧은 생명 주기를 가진 객체를 대량으로 생성하고 삭제하면 GC가 자주 발생하여 응답 시간이 지연될 수 있다. 이를 완화하기 위해 객체 생성을 줄이는 전략을 사용할 수 있다.

# 마치며: 언제 객체 생성 비용을 고려해야 할까?

이번 실험을 통해 가벼운 객체는 JVM의 최적화 덕분에 성능에 큰 영향을 미치지 않지만, 무거운 초기화 작업이 있는 객체나 대량의 객체가 생성되는 경우에는 불필요한 객체 생성을 줄이는 것이 성능 최적화에 유리함을 알 수 있었다. 
특히 짧은 시간 내에 여러 차례 생성되는 객체의 경우, 재사용 가능한 방식으로 설계하는 것이 좋다.

하지만 코드의 가독성과 유지보수성을 고려할 때, 객체 생성을 무조건 줄이는 것보다는 필요에 따라 최적화를 적용하는 것이 좋다고 생각한다. 성능 문제는 성능 프로파일링 도구를 통해 병목 구간을 파악한 후 객체 생성 최적화 전략을 고려하는 것이 효과적이다. 
성능과 코드 유지보수성 사이의 균형을 유지하면서 필요할 때만 최적화를 적용하는 것이 바람직할 것 같다.
