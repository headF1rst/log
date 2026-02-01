---
title: 통합 테스트에 @MockBean, @SpyBean을 남용하지 말자
category:
thumbnail: https://i.imgur.com/tP1wtTF.png
tags: SpringBootTest, MockBean, SpyBean
date: 2025-02-28 10:00
---

좋은 테스트에 대해 이야기할 때, FIRST 원칙이 자주 거론된다.
여기서 F는 Fast를 의미하는데, 좋은 테스트는 빠르게 동작해야하며 자주 실행할 수 있어야 한다 는 것을 의미한다.
테스트가 느리면 피드백 주기가 길어지고 실행 빈도가 줄어들게 되어 버그를 조기에 발견하기 어려워지며 개발 생산성이 떨어지게 된다.

@SpringBootTest는 ApplicationContext에 있는 모든 Bean을 띄우기 때문에 테스트 실행에 많은 시간이 소요된다.

만약 @SpringBootTest 마다 ApplicationContext를 띄우면 통합 테스트가 늘어남에 따라 테스트 실행 속도도 상당히 느려지게 될 것이다.
Spring은 이러한 문제를 해결하고자 @SpringBootTest 등을 사용한 통합 테스트에서 [ContextCaching](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)을 제공한다.

Spring은 ApplicationContext를 캐싱하여 동일한 설정을 가진 테스트에서는 기존의 캐싱된 컨텍스트를 재사용하여 테스트 실행 속도를 최적화한다.

## Context Caching 동작 방식

Spring은 컨텍스트의 key를 생성하여, 이전에 생성된 컨텍스트가 캐시에 존재 하는지 확인하고 같은 키를 가진 컨텍스트가 있으면 재사용한다.

Spring의 컨텍스트 캐싱 메커니즘은 다음과 같이 동작한다.

### 1. MergedContextConfiguration 객체 생성

테스트가 실행될 때 Spring은 해당 테스트의 설정을 기반으로 MergedContextConfiguration 객체를 생성한다.
MergedContextConfiguration은 캐시 키로 사용되는 컨텍스트 설정 정보를 포함한 객체로 다음과 같은 정보를 포함한다.

![](https://i.imgur.com/MUGHy8z.png)

만약 @MockBean이나 @SpyBean을 사용할 경우 contextCustomimizers에 MockBeanCustomizer가 추가되면서 MergedContextConfiguration의 해시코드가 달라지게 된다.
즉, ContextCache의 캐시 키가 달라지게 되면서 기존에 캐시된 ApplicationContext를 재사용하지 못하게 된다.

```java
public abstract class AbstractTestContextBootstrapper implements TestContextBootstrapper {

    private MergedContextConfiguration buildMergedContextConfiguration(
        Class<?> testClass,
        List<ContextConfigurationAttributes> configAttributesList,
        @Nullable MergedContextConfiguration parentConfig,
        CacheAwareContextLoaderDelegate cacheAwareContextLoaderDelegate,
        boolean requireLocationsClassesOrInitializers) {

        // 1. 설정 정보 수집을 위한 컨테이너
        List<String> locations = new ArrayList<>();
        List<Class<?>> classes = new ArrayList<>();
        List<Class<?>> initializers = new ArrayList<>();

        // 2. 각 설정 속성 처리
        for (ContextConfigurationAttributes configAttributes : configAttributesList) {
            ...
            }
        }

        // 3. 추가 설정 수집
        Set<ContextCustomizer> contextCustomizers = getContextCustomizers(testClass,
            Collections.unmodifiableList(configAttributesList));

        // 4. 프로퍼티 소스 처리
        MergedTestPropertySources mergedTestPropertySources =
            TestPropertySourceUtils.buildMergedTestPropertySources(testClass);

        // 5. 최종 MergedContextConfiguration 생성
        return new MergedContextConfiguration(
            testClass,
            StringUtils.toStringArray(locations),
            ClassUtils.toClassArray(classes),
            ApplicationContextInitializerUtils.resolveInitializerClasses(configAttributesList),
            ActiveProfilesUtils.resolveActiveProfiles(testClass),
            mergedTestPropertySources.getPropertySourceDescriptors(),
            mergedTestPropertySources.getProperties(),
            contextCustomizers,
            contextLoader,
            cacheAwareContextLoaderDelegate,
            parentConfig);
    }
}
```

### 2. 캐시 키 생성
MergedContextConfiguration 객체는 위의 설정 요소들을 조합하여 해시 코드를 생성하며 이 해시 코드는 캐시 키로 사용된다.

```java
public class DefaultContextCache implements ContextCache {

    private final Map<MergedContextConfiguration, ApplicationContext> contextMap =
        Collections.synchronizedMap(new LruCache(32, 0.75f));
        // ...
}
```

### 3. 캐시 저장 및 조회

새로운 테스트 실행 시, Spring은 먼저 현재 설정의 해시 키가 캐시에 존재하는지 확인한다.

동일한 키가 존재하면 캐시된 컨텍스트를 반환하고, 존재하지 않으면 새로 ApplicationContext를 생성하여 캐시에 저장한다.

```java
public class DefaultContextCache implements ContextCache {
    ...
    
    @Override
    @Nullable
    public ApplicationContext get(MergedContextConfiguration key) {
        Assert.notNull(key, "Key must not be null");
        ApplicationContext context = this.contextMap.get(key);
        if (context == null) {
            this.missCount.incrementAndGet();
        }
        else {
            this.hitCount.incrementAndGet();
        }
        return context;
    }

    @Override
    public void put(MergedContextConfiguration key, ApplicationContext context) {
        Assert.notNull(key, "Key must not be null");
        Assert.notNull(context, "ApplicationContext must not be null");

        this.contextMap.put(key, context);
        MergedContextConfiguration child = key;
        MergedContextConfiguration parent = child.getParent();
        while (parent != null) {
            Set<MergedContextConfiguration> list = this.hierarchyMap.computeIfAbsent(parent, k -> new HashSet<>());
            list.add(child);
            child = parent;
            parent = child.getParent();
        }
    }
}
```

ContextCaching이 어떻게 동작하는지 이해했다면, 정말로 CacheKey가 달라졌을때 ApplicationContext가 재사용되지 않는지 확인해보자.

## 예제 코드

위치 좌표 정보를 외부 API에서 조회하는 예제를 통해 살펴보자. 먼저 Bean으로 등록할 객체 하나와 위치 API 클라이언트 인터페이스를 정의한다.

```java
@Service
public class TransportService {

    private final String instanceId;

    public TransportService() {
        this.instanceId = java.util.UUID.randomUUID().toString();
    }

    public String getInstanceId() {
        return instanceId;
    }
}
```

```java
public interface LocationApiClient {
    
    // 주소로 위치 좌표를 조회한다
    LocationCoordinate getCoordinatesByAddress(String address);


    // 현재 API 클라이언트의 인스턴스 ID를 반환한다
    String getInstanceId();
}
```

다음으로 실제 API를 호출하는 구현체를 작성하였다.

```java
@Service
public class KakaoLocationApiClient implements LocationApiClient {

    private final RestTemplate restTemplate;
    private final String apiKey;
    private final String instanceId;

    public KakaoLocationApiClient(@Value("${kakao.api.key:SAMPLE_API_KEY}") String apiKey) {
        this.restTemplate = new RestTemplate();
        this.apiKey = apiKey;
        this.instanceId = UUID.randomUUID().toString();
    }

    @Override
    public LocationCoordinate getCoordinatesByAddress(String address) {
        // 실제 API 호출 코드
        String url = "https://dapi.kakao.com/v2/local/search/address.json?query=" + address;
        
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "KakaoAK " + apiKey);
        
        HttpEntity<String> entity = new HttpEntity<>(headers);
        
        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
            // 응답 처리 로직...
            return parseResponse(response.getBody(), address);
        } catch (Exception e) {
            throw new RuntimeException("위치 정보 조회 실패: " + e.getMessage(), e);
        }
    }

    @Override
    public String getInstanceId() {
        return instanceId;
    }
}
```

이제 ApplicationContext의 재사용 여부를 검증하기 위한 테스트를 작성해 보도록 하자.

- 첫 번째 테스트: 기본 컨텍스트 로드
- 두 번째 테스트: 동일한 설정으로 컨텍스트 재사용 확인
- 세 번째 테스트: MockBean 사용으로 컨텍스트 재생성 확인

```java
public class ContextCachingVerificationTest {

    Logger log = LoggerFactory.getLogger(ContextCachingVerificationTest.class);

    @Nested
    @SpringBootTest
    class FirstTest {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;

        @Test
        void saveFirstContextInfo() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();

            // 첫 번째 컨텍스트 정보 출력
            log.info("FirstTest - Context hash: {}", System.identityHashCode(context));
            log.info("FirstTest - TransportService instance ID: {}", transportService.getInstanceId());
        }
    }

    @Nested
    @SpringBootTest
    class SecondTest {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;

        @Test
        void verifyContextReuse() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();

            // 두 번째 컨텍스트 정보 출력
            log.info("SecondTest - Context hash: {}", System.identityHashCode(context));
            log.info("SecondTest - TransportService instance ID: {}", transportService.getInstanceId());
        }
    }

    @Nested
    @SpringBootTest
    class ThirdTestWithMockBean {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;
        
        @MockBean
        LocationApiClient locationApiClient;

        @Test
        void verifyNewContextCreation() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();
            assertThat(locationApiClient).isNotNull();

            log.info("MockTest - Context hash: {}", System.identityHashCode(context));
            log.info("MockTest - TransportService instance ID: {}", transportService.getInstanceId());
        }
    }
}
```

첫 번째 테스트와 두 번째 테스트는 동일한 설정으로 컨텍스트를 재사용하기 때문에 ApplicationContext가 재사용되는 것을 기대할 수 있다.
만약 ApplicationContext가 재사용됐다면, 첫 번째 테스트와 두 번째 테스트의 ApplicationContext 해시코드가 동일할 것이고 TransportService의 인스턴스 ID도 동일할 것이다.

세 번째 테스트는 @MockBean을 사용했기 때문에 ContextCahche에서 동일한 키를 찾지 못하여 ApplicationContext가 재사용되지 않고 새로 생성될 것이다.
즉, 첫 번째, 두 번째 테스트와는 다른 ApplicationContext가 생성될 것이고, TransportService의 인스턴스 ID도 다를 것이다.

### 테스트 실행 결과

![](https://i.imgur.com/Uxk21uj.png)

![](https://i.imgur.com/x0gCXng.png)


예상과 같이 첫 번째 테스트와 두 번째 테스트는 동일한 ApplicationContext를 재사용하고, 세 번째 테스트는 @MockBean을 사용하여 새로운 ApplicationContext가 생성되는 것을 확인할 수 있었다.

## 테스트 대역을 사용하면서 ApplicationContext를 재사용하는 방법

어떻게 하면 테스트 대역을 사용하여 실제 API를 호출하지 않으면서도 ApplicationContext를 재사용 하여 테스트 실행 속도를 개선할 수 있을까?

### Stub으로 @MockBean 대체하기

인터페이스를 구현하거나 테스트 대역 클래스를 상속받아 스텁 객체를 만들어 @MockBean을 대체할 수 있다. 이 방법은 외부 API와 같은 의존성을 테스트할 때 특히 유용하다.

테스트에서 사용할 스텁 구현체를 아래와 같이 정의한다.

```java
@Service
@Profile("test")
public class StubLocationApiClient implements LocationApiClient {

    private final String instanceId = "stub-instance-id";

    @Override
    public LocationCoordinate getCoordinatesByAddress(String address) {
        // 테스트용 고정 좌표 반환
        return new LocationCoordinate(37.5665, 126.9780, "테스트 주소: " + address);
    }

    @Override
    public String getInstanceId() {
        return instanceId;
    }
}
```

이 스텁 구현체는 실제 API를 호출하지 않고 테스트에 필요한 고정된 값을 반환한다. 이를 통해 테스트 실행 속도를 높이고 외부 의존성 없이 안정적인 테스트를 수행할 수 있다.

테스트 환경에서만 스텁 구현체를 사용하도록 @Profile을 설정하였다. `src/test/resources/application-test.yml` 파일을 생성하여 프로파일을 설정해주자.

환경변수를 주입할 수 있는 곳이 여러군데 있긴 하지만 `build.gradle`에 아래와 같이 설정해주면 편리하게 환경변수를 주입할 수 있다.

```groovy
tasks.named('test') {
    useJUnitPlatform()
    systemProperty("spring.profiles.active", "test")
}
```

이제 테스트에서 이 스텁 구현체를 사용하도록 설정한 다음 ApplicationContext를 재사용하는지 확인해보자.

```java
public class ContextCachingVerificationTest {

    Logger log = LoggerFactory.getLogger(ContextCachingVerificationTest.class);

    @Nested
    @SpringBootTest
    class FirstTest {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;

        @Test
        void saveFirstContextInfo() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();

            // 첫 번째 컨텍스트 정보 출력
            log.info("FirstTest - Context hash: {}", System.identityHashCode(context));
            log.info("FirstTest - TransportService instance ID: {}", transportService.getInstanceId());
        }
    }

    @Nested
    @SpringBootTest
    class SecondTest {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;

        @Test
        void verifyContextReuse() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();

            // 두 번째 컨텍스트 정보 출력
            log.info("SecondTest - Context hash: {}", System.identityHashCode(context));
            log.info("SecondTest - TransportService instance ID: {}", transportService.getInstanceId());
        }
    }

    @Nested
    @SpringBootTest
    class ThirdTestWithMockBean {

        @Autowired
        ApplicationContext context;
        
        @Autowired
        TransportService transportService;
        
        @Autowired
        LocationApiClient stubLocationApiClient;

        @Test
        void verifyNewContextCreation() {
            assertThat(context).isNotNull();
            assertThat(transportService).isNotNull();
            assertThat(stubLocationApiClient).isNotNull();

            log.info("MockTest - Context hash: {}", System.identityHashCode(context));
            log.info("MockTest - TransportService instance ID: {}", transportService.getInstanceId());
            log.info("MockTest - LocationApiClient instance ID: {}", stubLocationApiClient.getInstanceId());
        }
    }
}
```

### 테스트 실행 결과

![](https://i.imgur.com/LKE56mb.png)

테스트 실행 결과를 확인해보면, 스텁을 사용한 테스트가 ApplicationContext를 재사용하는 것을 확인할 수 있다.

### 마무리

@SpringBootTest를 사용한 테스트에서 @MockBean과 @SpyBean을 남용하면 ApplicationContext가 재사용되지 않아 테스트 실행 속도가 느려질 수 있으며,
메모리 사용량이 늘어나서 OOM이 발생할 수 있다.

물론 테스트가 많지 않다면 문제가 되지 않겠지만, 테스트가 많아질 경우 Stub을 사용하여 @MockBean과 @SpyBean을 대체하는 방안을 고려해보자.

### 참고 자료
- https://github.com/spring-projects/spring-boot/issues/10015
