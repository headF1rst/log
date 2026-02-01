---
title: Gson 라이브러리 InaccessibleObjectException
category: java
thumbnail: https://media.techmaster.vn/api/static/bq0a8rs51co78aldi4p0/lsRpW5hr
tags: gson, java
date: 2024-07-02 10:00
searchKeywords: gson, java
description: gson
---

Spring Boot 2.5.x 버전에서 3.2.x 버전으로 마이그레이션 하는 과정에서 InaccessibleObjectException이 발생하였다. Gson 라이브러리를 사용하는 쪽에서 발생한 문제였는데, 이에 대한 트러블 슈팅 과정을 정리해 보고자 한다.

## Gson 라이브러리 란?

구글이 만든 자바 기반 라이브러리로, 자바 객체를 JSON으로 직렬화(Serialization)하거나 JSON을 자바 객체로 역직렬화(Deserialization)하는 작업을 쉽게 할 수 있도록 도와준다.

### 직렬화 과정 내부 동작

`Gson.toJson(Object)` 메서드는 객체를 전달받아, 인자로 전달된 객체를 Json으로 변환하여 반환한다.

```java
Gson gson = new Gson();
String json = gson.toJson(myObject);
```

`toJson(Object src)` 메서드는 내부적으로 객체의 타입을 추론한 후 `toJson(Object src, Type typeOfSrc, Appendable writer)` 메서드를 호출한다.

호출된 `toJson` 메서드는 주어진 객체 타입에 맞는 `TypeAdapter`를 찾고, 이를 사용하여 객체를 JSON으로 변환한다. 이때 객체 타입에 맞는 TypeAdapter를 찾기 위해 `getAdapter(TypeToken)` 메서드를 호출한다.

```java
public void toJson(Object src, Type typeOfSrc, JsonWriter writer) throws JsonIOException {  
    TypeAdapter<Object> adapter = (TypeAdapter<Object>) getAdapter(TypeToken.get(typeOfSrc));
    // ...
}
```

`getAdapter(TypeToken)` 메서드는 주어진 타입에 대한 `TypeAdapter`를 먼저 캐시에서 찾고, 없으면 `TypeAdapterFactory` 리스트를 순회하면서 각 팩토리에 대해 `create` 메서드를 호출하여 주어진 타입에 대한 `TypeAdapter`를 생성할 수 있는지 확인한다.

```java
public <T> TypeAdapter<T> getAdapter(TypeToken<T> type) {  
  TypeAdapter<?> cached = typeTokenCache.get(type);  
  if (cached != null) {  
    TypeAdapter<T> adapter = (TypeAdapter<T>) cached;  
    return adapter;  
  }  

  // ...
  
  TypeAdapter<T> candidate = null;  
  try {  
    FutureTypeAdapter<T> call = new FutureTypeAdapter<>();  
    threadCalls.put(type, call);  
  
    for (TypeAdapterFactory factory : factories) {  
      candidate = factory.create(this, type);  
      if (candidate != null) {  
        call.setDelegate(candidate);  
        // Replace future adapter with actual adapter  
        threadCalls.put(type, candidate);  
        break;  
      }  
    }  
  } 
  // ...
  return candidate;  
}
```

TypeAdapterFactory 리스트를 순회하면서, 먼저 사용자 정의 또는 특수한 TypeAdapterFactory를 확인하고, 적절한 TypeAdapter를 찾지 못하면 **ReflectiveTypeAdapterFactory**를 사용하여 객체의 필드에 접근하고 JSON으로 직렬화 한다.

## 문제 원인

> Unable to make field private final java.time.LocalDate java.time.LocalDateTime.date accessible: module java.base does not "opens java.time" to unnamed module.

로그인 시에 `ValidToken` 객체를 직렬화하여 Redis에 저장하는 과정에서 Gson 라이브러리를 사용하는데, 위와 같은 예외가 발생했다.

Spring Boot 3.2.x로 버전업하면서 Java 버전 또한 11에서 17로 업그레이드 하였다.
Java 17 이상 부터는 모듈화된 애플리케이션에서 리플렉션을 통해 다른 모듈의 private 필드에 접근하는 것이 제한되도록 변경 되었기 때문에, Gson 라이브러리를 사용하여 TypeAdapterFactory 리스트를 순회하는 과정에서 문제가 발생하는것 이었다.

Gson은 먼저 사용자 정의 또는 특수한 `TypeAdapterFactory`를 확인하고, 적절한 `TypeAdapter`를 찾지 못하면 `ReflectiveTypeAdapterFactory`를 사용하게 된다.

`ReflectiveTypeAdapterFactory`는 객체의 필드를 탐색하고, `field.setAccessible(true)`를 호출하여 private 필드를 접근 가능하도록 설정한다. 하지만 Java 17 이상의 모듈 시스템에서는 모듈화된 
애플리케이션에서 이러한 호출이 기본적으로 제한되기 때문에 `ReflectiveTypeAdapterFactory`가 private 필드에 접근할 수 없게 되어, 결과적으로 직렬화 및 역직렬화 과정에서 예외가 발생하게 되는 것이다.

## 해결방법

private 필드를 가진 클래스 타입에 대한 직렬화 및 역직렬화 로직이 구현된 커스텀 TypeAdapter를 구현한면 Gson이 TypeAdapterFactory 리스트를 순회할 때, 정의한 커스텀 TypeAdapter가 ReflectiveTypeAdapterFactory 보다 우선순위를 갖기 때문에 문제를 해결할 수 있다.

```java
public class LocalDateTimeAdapter extends TypeAdapter<LocalDateTime> {

    private static final DateTimeFormatter formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    @Override
    public void write(JsonWriter jsonWriter, LocalDateTime localDateTime) throws IOException {
        jsonWriter.value(localDateTime.format(formatter));
    }

    @Override
    public LocalDateTime read(JsonReader jsonReader) throws IOException {
        return LocalDateTime.parse(jsonReader.nextString(), formatter);
    }
}
```

## 참고 자료
- [Error reflection JDK 17 and gson](https://github.com/google/gson/issues/1979)
- [Gson 공식 트러블 슈팅 가이드 문서](https://github.com/google/gson/blob/main/Troubleshooting.md#reflection-inaccessible)
