---
title: Static 변수 저장위치와 JVM 구조의 변화
category: JAVA
thumbnail: https://i.imgur.com/5AJJwhh.png
tags: Java
date: 2022-07-11 10:00
searchKeywords: 자바, jvm, 정적 변수
description: Static 변수 저장위치와 JVM 구조의 변화
---

Static 키워드를 사용하여 정적 변수와 정적 메서드를 만들수 있는데, 이들을 정적 멤버 (혹은 클래스 멤버) 라고 합니다.

```java
class Lesson {
		static int score = 0;
		static String grade = 'F';

		static void getScore() {
			 ...
		}
}
```

Lesson 클래스(Class)는 Method Area에 생성되고, new 연산을 통해 생성한 Lesson 클래스의 객체(Object)는 Heap **영역**에 생성됩니다.

![Untitled](https://i.imgur.com/Stip2zD.png)

그렇다면 정적 멤버들은 메모리상의 어느 위치에 저장이 될까요?

정적 멤버(클래스 멤버)는 말 그대로 객체(인스턴스)에 소속된 멤버가 아니라 클래스에 고정된 멤버입니다. 

그렇기 때문에, 정적 멤버는 Class와 함께 클래스 로더에 의해서 **Method Area**에 저장되지 않을까요?

저의 이 생각은 Java 7까지는 맞지만 Java 8부터는 반만 맞는 대답이 되고 말았습니다.

왜 Java 8부터는 반만 맞는 대답인걸까요?

그 이유는 Java 7과 8의 JVM 구조에 변화가 있었기 때문입니다.

## Java 7의 HotSpot JVM 힙 그리고 static 변수

Java 7 버전까지만 해도 정적 멤버들은 Method Area를 포함하고 있는  `PermGen` 영역에 저장되었었습니다.

![스크린샷 2022-07-16 오전 11.14.55.png](https://i.imgur.com/TK8mAwL.png)

PermGen은 정적 멤버 외에도, **클래스 메타 데이터, interned String이 저장되었습니다.**

- 클래스 메타데이터 : 클래스의 이름, 생성정보, 필드정보, 메서드 정보 등

하지만 문제는 PermGen 영역이 매우 제한적인 크기를 갖고 있다는 것이었습니다.

PermGen 영역의 default 크기는, 32-bit JVM에선 64M, 64-bit에선 84M에 불과합니다.

때문에, 클래스 로딩이 많아지게 되면 사용 가능한 메모리가 부족해서 다음과 같은 에러가 발생하고는 했습니다.

```java
java.lang.OutOfMemoryError: PermGen space
```

뿐만 아니라, JVM은 PermGen 영역의 사이즈를 유지시키기 위해서 주기적으로 Garbage Collection연산을 수행하게 되는데 이는 성능 이슈를 야기했습니다.

물론 `-XX:PermSize` , `-XX:MaxPermSize` 와 같은 명령어를 통해서 사용자가 직접 PermGen영역을 설정해 주는것이 가능했습니다.

하지만 자동으로 영역의 사이즈가 늘어나지 않았고, 매모리 가용 용량을 미리 예측해서 설정하는것은 쉽지 않은 일이었습니다.

## Java 8의 Hotspot JVM 그리고 static 변수

이러한 문제를 해결하기 위해서 Java 8에선 PermGen 영역이 없어지고 `MetaSpace` 영역이 새로 생겼습니다.

Metaspace 영역은 힙이 아닌 Native 메모리 영역으로 취급됩니다.

![스크린샷 2022-07-16 오전 11.14.20.png](https://i.imgur.com/4VucRG4.png)

[https://openjdk.org/jeps/122](https://openjdk.org/jeps/122)

힙 영역은 JVM에 의해 관리되는 영역이지만 Native 메모리 영역은 OS 레벨에서 관리하는 영역입니다.

즉, Metaspace가 Native 메모리를 이용함으로써 개발자는 영역 확보의 상한을 크게 의식할 필요가 없어지게 되었습니다. (metaspace의 사이즈는 auto increase 됩니다)

`metaspace` 에서는 **클래스 메타 데이터**만을 저장하고 정적 멤버와 interned string은 힙에서 관리되게 되었습니다.

Metaspace는 클래스 메타 데이터를 native메모리에 저장하고 부족할 경우 자동으로 늘려줍니다.

덕분에 더이상 PermSize 설정을 고려할 필요가 없어졌고 MetaspaceSize, MaxMetaspaceSize가 새롭게 사용되게 되었습니다. 

만약 별도의 MetaspaceSize 설정을 하지 않으면 Native memory 자원을 최대한 사용하게 됩니다.

(Default jvm MaxMetaspaceSize = None)

## 결론

요약하자면, Java 7에서는 정적 멤버 변수가 PermGen(Method Area)에 저장되었습니다.

하지만 메모리 관리상의 문제로 인해 PermGen 영역이 사라지고 Metaspace 영역이 등장하면서, 정적 멤버 변수는 힙에 저장이 되도록 변경 되었습니다.

**참고 자료**

[JEP 122: Remove the Permanent Generation](https://openjdk.org/jeps/122)

[Where are static methods and static variables stored in Java?](https://stackoverflow.com/questions/8387989/where-are-static-methods-and-static-variables-stored-in-java)

[Java PermGen의 역사](https://blog.voidmainvoid.net/315)

[Hotspot JVM의 힙 구조](https://77loopin.github.io/java/Java-1/)

[https://www.geeksforgeeks.org/metaspace-in-java-8-with-examples/#:~:text=Method Area is a part,which leads to an OutOfMemoryError](https://www.geeksforgeeks.org/metaspace-in-java-8-with-examples/#:~:text=Method%20Area%20is%20a%20part,which%20leads%20to%20an%20OutOfMemoryError).
