---
title: if-else, switch 성능 비교 (feat. JMH)
category: JAVA
thumbnail: https://www.bachelorprint.com/wp-content/uploads/2023/07/Lab-report-Definition.jpg
tags: Java
date: 2023-12-24 10:00
searchKeywords: 자바, jmh, if, switch 
description: if-else, switch 성능 비교
---

최근에 회사 팀원분의 추천으로 ['크리에이티브 프로그래머'](https://m.yes24.com/Goods/Detail/121961076)라는 책을 읽어보았는데, 비판적 사고에 대한 중요성을 강조하고 있다.

비판적 사고란 정보를 받아들일 때 단순히 수용하지 않고, 의심하고 분석하는 과정을 말한다. 
보통 새로운 기술을 강의나 책을 통해서 배울 때면, 두 기술을 단순 비교하고 상황에 따라서 적합한 기술은 무엇인지 알려주는 경우가 많은데, 
유명한 책에서 그렇다니까 '왜'라는 질문 없이 그렇구나 넘어가고는 했다.

지금부터라도 그냥 넘어갔던, 어쩌면 당연하다고 생각했던 것들에 대해서 의심해 보고 직접 확인해 보는 시간을 가져보고자 한다. 
가장 먼저 자바를 처음 배웠을 때 무심코 넘어갔던 if-else 문과 switch 문의 성능 차이에 대해서 알아보도록 하자.

## if-else, switch 바이트코드 분석

간단한 분기 문을 if-else 문과 switch 문으로 작성하였으며 1, 3, 5에 해당하는 case 값을 설정하였다.

```java
public int ifElseStatement() {
    int temp = 0;
    int num = generateRandomIntFromOneToTen();

    if (num == 1) {
        temp = 1;
    } else if (num == 3) {
        temp = 3;
    } else if (num == 5) {
        temp = 5;
    } else {
        temp = 99;
    }
    return temp;
}
```

```java
public int switchStatement() {
    int temp = 0;
    int num = generateRandomIntFromOneToTen();

    switch (num) {
        case 1:
            temp = 1;
            break;
        case 3:
            temp = 3;
            break;
        case 5:
            temp = 5;
            break;
        default:
            temp = 99;
    }

    return temp;
}
```

작성한 두 분기 문이 내부적으로 어떻게 동작하는지 자바 바이트코드를 통해 분석해 보았다.

```java
public ifElseStatement()I 
        ICONST_0 
        ISTORE 1
        ALOAD 0
        GETFIELD example/IfElseVSSwitchTest.num : Ljava/lang/Integer;
        INVOKEVIRTUAL java/lang/Integer.intValue ()I
        ICONST_1
        IF_ICMPNE L6
        ICONST_1
        ISTORE 1
        GOTO L8

        //...

        L9
        ALOAD 0
        GETFIELD example/IfElseVSSwitchTest.num : Ljava/lang/Integer;
        INVOKEVIRTUAL java/lang/Integer.intValue ()I
        ICONST_3
        IF_ICMPNE L8
        ICONST_3
        ISTORE 1
        L8
        ICONST_4
        ISTORE 1
        ILOAD 1
        IRETURN
```

if-else 문은 연속된 if와 else if 문을 통해 **차례대로** 조건을 확인한다.
바이트코드에서는 이를 `IF_ICMPNE` 명령어를 통해 구현하였으며 두 값을 비교하고 결과에 따라 분기하고 있다.

```java
public switchStatement()I
        L0
        LINENUMBER 43 L0
        ICONST_0
        ISTORE 1
        L1
        LINENUMBER 46 L1
        ALOAD 0
        INVOKEVIRTUAL example/IfElseVSSwitchTest.generateRandomIntFromOneToTen ()V
        L2
        LINENUMBER 48 L2
        ALOAD 0
        GETFIELD example/IfElseVSSwitchTest.num : Ljava/lang/Integer;
        INVOKEVIRTUAL java/lang/Integer.intValue ()I
        TABLESWITCH
        1: L3
        2: L4
        3: L5
        4: L4
        5: L6
        default: L4
        L3
        LINENUMBER 50 L3
        FRAME SAME
        ICONST_1
        ISTORE 1
        GOTO L7
        L5
        LINENUMBER 53 L5
        FRAME SAME
        ICONST_2
        ISTORE 1
        GOTO L7
        L6
        LINENUMBER 56 L6
        FRAME SAME
        ICONST_
        ISTORE 1
        GOTO L7
        L4
        LINENUMBER 59 L4
        FRAME SAME
        BIPUSH 99
        ISTORE 1
        L7
        LINENUMBER 63 L7
        FRAME SAME
        ILOAD 1
        IRETURN
        L8
        LOCALVARIABLE this Lexample/IfElseVSSwitchTest; L0 L8 0LOCALVARIABLE temp I L1 L8 1
        MAXSTACK = 2
        MAXLOCALS = 2
```

switch 문의 바이트코드를 보면 `TableSwitch`라는게 보인다.

`TableSwitch`는 정숫값에에 기반한 switch 문에 사용되며, TableSwitch 뒤에 나오는 `1: L3`, `3: L5`, `5: L6`는 각 case에 대한 정보를 나타낸다.

예를 들어, `1: L3`는 `num`이 1일 경우 `L3` 레이블로 점프하라는 의미이며 `default: L9` 또한 `num`이 1, 3, 5중 어느 값도 아니라면 
`L9` 라벨로 점프하라는 의미이다.

`L3`, `L5`, `L6` 라벨들은 각각의 case에 대한 코드 블록을 나타내며 정수 1을 스택에 푸시하고, 스택의 최상윗값을 `temp` 변수에 저장하는 것을 나타낸다. 
그다음 `GOTO L7`에서 제어를 `L7` 레이블로 이동시킨다.

그런데 한 가지 이상한 부분이 있다.

우리는 1, 3, 5에 해당하는 case만 줬지만 case들 사이의 값인 2,4 또한 default에 해당하는 control flow를 따르도록 컴파일된 것을 확인할 수 있다.

이는 `TABLESWITCH`의 특징으로, `TABLESWITCH`는 case 범위 내 모든 값을 인덱싱하여 `jump table`을 구성하고, 해당하는 인덱스의 실행 지점으로 바로 점프한다. 

별도의 비교 연산 없이 바로 이동할 수 있기 때문에 `TABLESWITCH`를 활용한 switch문은 O(1)시간이 소요된다.

하지만 `TABLESWITCH`가 모든 상황에 적합한 건 아니다.

`TABLESWITCH`는 case의 모든 범위를 인덱싱하기 때문에 case의 수가 적더라도 각 case의 범위가 넓다면 (1, 10, 100) 1 ~ 100까지의 정수를 모두 인덱싱하게 되어 과도한 jump table 생성 비용과 공간 비용이 발생한다.

이러한 비용을 줄이기 위해서 컴파일러는 case의 범위가 넓은 경우에 `LOOKUPTABLE` 방식을 선택하여 switch 문을 구현한다.

```java
LOOKUPSWITCH
        1: L3
        10: L4
        100: L5
default: L6
```

위의 바이트코드에서 볼 수 있듯, `LOOKUPTABLE`은 case값  만으로 테이블을 구성한다.

인덱스를 이용해 바로 찾아가는게 아니기 때문에 `LOOKUPTABLE`은 비교대상변수와 table에 구성된 key와의 비교연산이 필요한데, 
시간적 비용을 보완하고자 key들을 정렬하여 구성해놓고 이진탐색을 적용하여 O(logN) 시간을 보장하게 된다.

결론적으로 `if-else`문은 분기 개수(N)에 따라 최악의 경우 O(N)이 소요되며, `switch`문은 분기 개수(N)에 따라 최악의 경우에도 O(logN) 시간이 
수행된다는 것을 알 수 있었다.

이제 분석을 넘어서 실제로 switch문이 if-else문보다 더 나은 처리 속도를 보여주는지 검증해보도록 하자.

## 성능 비교

둘의 성능을 비교 측정하기위해 `JMH`를 사용하였으며 다음과 같은 시나리오에서 테스트를 진행해보았다.

```bash
jmh {  
    threads = 1  
    fork = 1  
    warmupIterations = 1  
    iterations = 1  
}
```

- if-else와 switch문 (`TABLESWITCH`)의 성능차이
- if-else와 switch문 (`LOOKUPTABLE`)의 성능차이

## if-else와 switch문 (TABLESWITCH)의 성능차이

```java
@State(Scope.Benchmark)
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
public class IfElseVSSwitchTest {

    private Integer num;

    @Setup
    public void generateRandomIntFromOneToTen() {
        Random random = new Random();
        this.num = random.nextInt(10) + 1;
    }

    @Benchmark
    public int ifElseStatement() {
        int temp = 0;

        for (int i = 0; i < 5_000; ++i) {
            generateRandomIntFromOneToTen();

            if (num == 1) {
                temp = 1;
            } else if (num == 3) {
                temp = 3;
            } else if (num == 5) {
                temp = 5;
            } else {
                temp = 99;
            }
        }
        return temp;
    }

    @Benchmark
    public int switchStatement() {
        int temp = 0;

        for (int i = 0; i < 5_000; ++i) {
            generateRandomIntFromOneToTen();

            switch (num) {
                case 1:
                    temp = 1;
                    break;
                case 3:
                    temp = 3;
                    break;
                case 5:
                    temp = 5;
                    break;
                default:
                    temp = 99;
                    break;
            }
        }
        return temp;
    }
}
```

TABLESWITCH (case: 1, 3, 5)

![스크린샷 2023-12-23 오후 9.10.43.png](https://i.imgur.com/jHuwHih.png)

실행 결과 if-else문은 0.19ms, `TABLESWITCH`를 사용한 switch문은 0.18ms 소요되는걸 확인할 수 있었다.

## if-else와 switch문 (LOOKUPSWITCH)의 성능차이

case의 범위를 넓혀서 `LOOKUPSWITCH`를 활용한 switch문과의 성능비교를 해보았다.

LOOKUPSWITCH (case: 1, 10, 100)

![스크린샷 2023-12-23 오후 9.10.43.png](https://i.imgur.com/tP9F8yG.png)

실행 결과 if-else문은 0.19ms, `LOOKUPSWITCH`를 사용한 switch문은 0.21ms 소요되는걸 확인할 수 있었다.

## 마무리

지금까지 if-else 문과 switch 문의 성능을 비교해 보았다.

이러한 성능 차이는 대부분의 경우에 있어서 실제 애플리케이션의 전체 성능에 큰 영향을 미치지는 않는다.
하지만 비판적 사고를 갖고 당연한 것에 의문을 갖는 과정 자체가 의미 있었다고 생각한다.
개인적으로 가독성 측면에서 switch 문을 사용하는 게 좀 더 직관적이라 생각하며 다양한 요소를 고려하여 if-else 또는 switch를 선택하는 것이 어떨까 싶다.

---

**참고 자료** 📚

- https://stackoverflow.com/questions/10287700/difference-between-jvms-lookupswitch-and-tableswitch
- [The Evolution Of Switch Statement From Java 7 to Java 17](https://medium.com/@javatechie/the-evolution-of-switch-statement-from-java-7-to-java-17-4b5eee8d29b7)
