---
title: PWA 환경에서 푸시 알림 구현하기 (Spring Boot, FCM, Redis)
category:
thumbnail: https://www.pushengage.com/wp-content/uploads/2021/11/Best-FREE-Push-Notification-Services.png
tags: 프로젝트
date: 2023-01-03 10:00
---

푸시 알림이란 사용자가 서비스를 사용하고 있지 않은 상황에서도 사용자에게 알림을 보내는 방법입니다.

푸시 알림을 구현하는 방법에는 `Server-Sent Events (SSE)` 를 사용하는 방식과 `Firebase Cloud Messaging (FCM)` 을 사용하는 방식이 있습니다.

두 방식 중 현재 요구사항에 더 적합한 방식은 무엇인지 알아보고, 이를 구현하여 편지가 도착했다는 알람을 받을 수 있도록 해보겠습니다.

## 1. SSE vs FCM

### SSE(Server Side Event)
SSE는 실시간으로(real-time) 서버에서 클라이언트로 데이터를 전송하는 스트림 방식의 프로토콜이며 **HTTP/2.0**부터 추가되었습니다.

일반적인 HTTP 통신의 경우에는 클라이언트가 서버에 요청을 보내야만 서버에서 요청에 대한 응답을 보내줄 수 있습니다. 하지만 현재 구현하고자 하는 알림 시스템의
경우에는 클라이언트로부터 요청이 없더라도 서버에 편지가 도착했다는 이벤트가 발생했을 때 그에 대한 응답을 보내줘야만 합니다.

가장 단순한 방법으로는 주기적으로 서버에 편지 도착 여부를 묻는 HTTP 요청을 보내는 것입니다. 이를 **Polling**방식이라고 합니다. 하지만 이런 polling
방식의 경우, 일정한 텀을 두고 요청을 보내기 때문에 엄격히 말하면 실시간이라고 볼 수 없습니다. 또한 HTTP의 connectionless 한 성격 때문에 서버에 편지가 도착한
이벤트가 발생하지 않더라고 연결을 맺고 끊는 과정을 거치게 됩니다. 이를 개선한 방식으로 **Long Polling**방식이 있지만 HTTP connectionless 한
성격으로 인한 문제점은 그대로입니다.

다음으로 고려해볼 수 있는 방법이 바로 SSE 방식입니다. SSE 방식은 요청에 대한 응답 이후에 연결을 끊지 않고 유지하고 있다가 추가로
서버에서 이벤트가 발생했을 때 응답을 보내주는 방식입니다. 서버에서 클라이언트로 실시간으로 데이터를 보내주기 때문에 구현하고자 하는 편지 도착 알림과 같은 시나리오에 유용합니다.

### FCM(Firebase Cloud Messaging)

반면 FCM은 안드로이드, iOS, 웹을 포함한 다양한 플랫폼의 사용자에게 메시지를 보낼 수 있는 더 완전한 기능의 크로스 플랫폼 메시징 솔루션입니다.
특정 장치 또는 주제(특정 주제에 가입된 장치 그룹)로 메시지를 보내는 기능을 포함하여 메시지를 전달하기 위한 다양한 옵션을 제공합니다.
FCM은 또한 우선순위가 높거나 낮은 메시지를 보내거나 오프라인 상태인 장치에 메시지를 보내고 다시 온라인 상태가 되면 메시지를 전송하는 등 다양한 전송 옵션을 지원합니다.

SSE는 구현이 간단하고 real-time 서비스이지만 몇 가지 제한이 존재합니다. SSE 통신 방식을 지원하지 않는 브라우저에서는 사용할 수 없으며 payload 크기가
제한적이기 때문에 알림에 많은 데이터를 담을 수 없으며 지원되지 않는 브라우저를 사용하는 사용자의 경우에는 중요한 알림을 아예 받지 못할 가능성이 존재했습니다.

반면 FCM의 경우, SSE에 비해서 별도의 설정이 추가로 필요하며 real-time 서비스이긴 하지만 장치 연결 상태, 메시지의 크기와 포맷, 그리고 네트워크 상태 등 전송 시간이 지연될 수 있는 요소들이 존재합니다.
하지만 심각한 지연이 발생하지는 않으며 SSE의 실시간성에 비해서 느린 편이기 때문에 연성 실시간(soft real-time) 시스템에 적합합니다.

## 2. 현재 서비스에 더 적합한 쪽은?

현재 구현하고자 하는 기능은 푸시 알림이며, 가능한 빨리 전달되어야 하지만 시스템에 높은 부하가 걸렸을 때 약간의 지연은 무방합니다. 또한 iOS, 안드로이드, 데스크톱을 지원해야 합니다. 

이러한 요구사항을 종합해 보았을 때 다양한 플랫폼을 지원하며 연성 실시간 시스템이어도 문제가 없는 FCM을 사용하여 알림 기능을 구현하는 방향을 선택하였습니다. 

## 3. 푸시 알림을 위한 3가지 컴포넌트

![IMG_68FC117D3621-1.jpeg](https://i.imgur.com/aQq4OJ4.jpg)

- **알림 제공자**
    
    알림 요청(notification request)을 만들어 푸시 알림 서비스(FCM)로 보내주는 주체.
    
    알림 요청을 만들기 위해서는 다음과 같은 데이터가 필요하다.
    
    - 단말 토큰 (device token)
        - 알림 요청을 보내는 데 필요한 고유 식별자.
    - 페이로드 (payload)
        - 알림 내용을 담은 JSON 딕셔너리
- **FCM**
    - 구글이 제공하는 원격 서비스. 푸시 알림을 다양한 플랫폼으로 보내는 역할을 담당
- **디바이스 장치**
    - 푸시 알림을 수신하는 사용자 단말

## 4. FCM의 동작 원리

알림 제공자가 알림 요청을 만들어 HTTP 통신을 통해 전송할 경우, 요청이 처리되는 과정을 그림으로 나타내보면 다음과 같습니다.

![스크린샷 2023-01-06 오후 12.35.19.png](https://i.imgur.com/EGJQ13w.png)

1_ 알림 제공자(서비스 어플리케이션)는 FCM에 단말 토큰과 페이로드를 담아서 HTTP POST 요청을 보낸다.

2_ 요청을 받은 FCM은 요청을 통해 받은 정보의 이상 유무에 따라 알림 제공자에게 적절한 응답을 보낸다. 

3_ FCM은 메시지 우선순위, 수신 단말과의 통신 가능 여부 등을 고려하여 메시지를 수신 단말에 보낸다.

4_ 수신 단말은 정보 이상 유무에 따라 FCM에 적절한 응답을 보낸다.

이전에 구현해보았던 이메일 인증 로직과 유사한 부분이 많아서 HTTP 요청을 `비동기 방식`으로 처리해야겠다는 생각을 쉽게 떠올릴 수 있었습니다.

### 4.1 Sync vs Async & Blocking vs Non-Blocking

병목 지점 없는 안정적인 푸시 알림을 구현하기 위해서는 동기와 비동기, Blocking과 Non-Blocking에 대한 개념을 이해해야 합니다. 자세한 내용은 [블로킹 Vs. 논 블로킹, 동기 Vs. 비동기](https://velog.io/@nittre/%EB%B8%94%EB%A1%9C%ED%82%B9-Vs.-%EB%85%BC%EB%B8%94%EB%A1%9C%ED%82%B9-%EB%8F%99%EA%B8%B0-Vs.-%EB%B9%84%EB%8F%99%EA%B8%B0) 포스트를 참고해주세요.

요약하자면 다음과 같습니다.

- `동기 - 비동기`란 특정 주체가 호출되는 함수의 **작업 완료 여부를 신경 쓰는지**의 여부 차이다.
- `Blocking - Nonblocking`이란 특정 주체가 **함수를 호출할 때 제어권을 양도하는지**의 여부 차이다.


- **SyncExample.js**

```jsx
function a() {
    let result = b();
    console.log(result);
    console.log("a finished");
}

function b() {
    return 11;
}

/*
실행 결과
11
a finished
*/
```

Synchronous(동기)란 작업을 요청한 후 작업의 결과가 나올 때까지 기다린 후 처리하는 것을 의미합니다. a 함수가 b 함수를 호출했을 때, a 함수가 b 함수의 수행 결과 및 종료를 신경 쓰는 경우를 예로 들 수 있습니다. 일반적인 경우 blocking과 동일한 의미로 사용될 수 있습니다.

- **AsyncExample.js**

```jsx
function a() {
    fetch(url, options)
      .then(response => console.log("response arrives"))
      .catch(error => console.log("error thrown"));
    console.log("a is done");
}

/*
실행 결과
a is done
response arrives
*/
```

반면 Asynchronous(비동기)란 두 주체가 서로의 시작/종료 시간과는 관계없이 별도의 수행 시작/종료 시간을 가지고 있는 것을 의미합니다. 
a 함수가 b 함수를 호출했을 때, 호출된 함수의 수행 결과 및 종료를 호출된 함수 혼자 직접 신경 쓰고 처리하는 경우를 예로 들 수 있습니다. 
대게 결과를 돌려주었을 때 순서와 결과(처리)에 관심이 있는지 아닌지로 판단할 수 있습니다.

![Untitled](https://i.imgur.com/Rjm9qEh.png)

비동기를 사용하면 두 개의 요청을 동시에 보내기 때문에 더 빠른 응답 속도를 보여줄 수 있습니다. 또한 현재 스레드가 Blocking 되지 않고 다른 작업을 수행할 수 있기 때문에 더 적은 수의 리소스(스레드)로 더 많은 양의 요청을 처리할 수 있습니다.
    
## 5. 알림 시스템 아키텍처

알림 제공자 역할을 하는 별도의 인스턴스를 생성하여 어플리케이션 서버와 알림 서버를 분리해야 할지, 어플리케이션 서버에 알림 기능을 추가해야 할지 고민이 되었습니다.

푸시 알림 시스템이 대량의 요청을 처리할 것으로 예상되거나 높은 수준의 가용성이 필요한 경우, 효과적으로 작동하는 데 필요한 리소스와 용량을 확보하기 위해 다음과 같이 별도의 인스턴스를 사용하는 것이 유용할 수 있습니다. 

![스크린샷 2023-01-02 오후 10.44.34.png](https://i.imgur.com/zBICeHZ.png)

또한 별도의 인스턴스를 사용하면 푸시 알림 시스템에 대한 격리 및 제어 기능을 더 많이 제공할 수 있으므로 보안 및 규정 준수 목적에 유용할 수 있습니다.

반면, 푸시 알림 시스템의 workload가 크지 않은 경우 기존 응용프로그램과 동일한 인스턴스를 사용하는 것이 비용 측면에서 효율적일 수 있습니다. 이렇게 하면 관리 및 유지해야 하는 인스턴스 수를 줄일 수 있어 리소스를 절약하고 복잡성을 줄일 수 있습니다.

저희 서비스의 경우 사용자가 편지를 받는 경우에만 알림 요청이 발생하고 아직 사용자가 많지 않은 점, 그리고 비용적인 측면을 고려하여 기존 응용프로그램과 동일한 인스턴스를 사용하기로 결정하였습니다. (서비스가 대박이 나서 아키텍처 수정하는 날이 오면 좋겠습니다)

![스크린샷 2023-01-02 오후 10.45.48.png](https://i.imgur.com/eb0TAnG.png)

## 6. FCM을 Spring Boot 프로젝트에 적용하기

먼저 FCM을 사용할 프로젝트에 `firebase-admin` 의존성을 추가해주었습니다.

### 6.1 의존성 추가

- **build.gradle**

```bash
dependencies {
	//FCM
	implementation 'com.google.firebase:firebase-admin:7.1.1'
}
```

### 6.2 Firebase 프로젝트, 비공개 키 생성

[Firebase 콘솔](https://console.firebase.google.com/u/0/)에 접속하여 프로젝트를 생성하고, `프로젝트 설정 → 서비스 계정 항목`에서 비공개 키를 생성하였습니다.

![스크린샷 2023-01-02 오후 11.54.08.png](https://i.imgur.com/A4pqklA.png)

json 파일로 생성된 `admin sdk` 를 프로젝트의 resouces 디렉토리로 이동시켜 주었습니다. 비밀키 파일은 깃허브와 같은 공개된 장소에 올라가는게 안전하지 않기 때문에 .gitignore 목록에 추가한 다음 @Value를 사용하여 불러오도록 하였습니다.

`개요 → 앱 추가 → 웹 앱에 Firebase 추가`를 선택하고 스니펫을 복사하여 어플리케이션 HTML에 추가하였습니다.

- **templates/firebase-snippet.html**

```html
<script type="module">
    // Import the functions you need from the SDKs you need
    import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
    import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js";
    // TODO: Add SDKs for Firebase products that you want to use
    // https://firebase.google.com/docs/web/setup#available-libraries

    // Your web app's Firebase configuration
    // For Firebase JS SDK v7.20.0 and later, measurementId is optional
    const firebaseConfig = {
        apiKey: "AIzaSyAhGBd-3pzg1HzHvGJ6poVatZ9t4fcRC7g",
        authDomain: "text-me-917f5.firebaseapp.com",
        projectId: "text-me-917f5",
        storageBucket: "text-me-917f5.appspot.com",
        messagingSenderId: "357915322625",
        appId: "1:357915322625:web:694139cec2a5c263b81300",
        measurementId: "G-WXZEPBL34M"
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
</script>
```

### 6.3 FCM 초기화

어플리케이션이 실행되는 시점에 비공개 키 파일의 인증정보를 이용해 FirebaseApp을 초기화하는 객체를 구현해주었습니다.

```java
@Slf4j
@Component
public class FCMInitializer {

    @Value("${fcm.certification}")
    private String googleApplicationCredentials;

    @PostConstruct
    public void initialize() throws IOException {
        ClassPathResource resource = new ClassPathResource(googleApplicationCredentials);

        try (InputStream is = resource.getInputStream()) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(is))
                    .build();

            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(options);
                log.info("FirebaseApp initialization complete");
            }
        }
    }
}

```
 

빈 객체가 생성되고 의존성 주입이 완료된 후에 초기화가 실행될 수 있도록 @PostConstruct 설정을 해주었습니다.

### 6.4 토큰 관리 저장소

로그인 시에 클라이언트는 FCM 토큰(단말 토큰)을 서버에 전달하게 되는데 서버는 해당 토큰을 스토리지에 저장한 다음, 활성 토큰의 목록을 유지해야 합니다. FCM 공식 문서에 있는 [토큰 관리 Best practice](https://firebase.google.com/docs/cloud-messaging/manage-tokens?hl=ko)에 따르면 토큰의 신선도 보장을 위해서 2개월 이상 사용되지 않은 토큰은 삭제하는 것을 권장하고 있습니다.

처음에는 현재 사용하고 있는 RDS의 유저 테이블에 FCM 토큰 필드를 추가하는 방식을 고려하였습니다. 하지만 토큰 갱신 및 삭제 연산이 빈번하게 발생하고 토큰의 데이터가 key-value 형태라는 점, 그리고 타임 스탬프를 통해서 토큰의 신선도를 관리해줘야 하는 요구사항에 더 적합한 스토리지가 `Redis`라고 생각되었기 때문에 Redis를 토큰 관리 저장소로 선택하게 되었습니다.

Redis 설치방법과 Config 파일 작성에 대한 내용은 다루지 않고 넘어가도록 하겠습니다.

```java
@Repository
@RequiredArgsConstructor
public class FCMTokenDao {

    private final StringRedisTemplate tokenRedisTemplate;

    public void saveToken(LoginRequest loginRequest) {
        tokenRedisTemplate.opsForValue()
                .set(loginRequest.getEmail(), loginRequest.getToken());
    }

    public String getToken(String email) {
        return tokenRedisTemplate.opsForValue().get(email);
    }

    public void deleteToken(String email) {
        tokenRedisTemplate.delete(email);
    }

    public boolean hasKey(String email) {
        return tokenRedisTemplate.hasKey(email);
    }
}

```

```java
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final FCMService fcmService;
    private final AesUtils aesUtils;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody @Valid final LoginRequest request) {
        LoginResponse loginResponse = userService.login(request);
        fcmService.saveToken(request);
        return ResponseEntity.ok().body(loginResponse);
    }

    @DeleteMapping("/logout")
    public void logout(@JwtAuth String email) {
        fcmService.deleteToken(email);
    }
    //...
}

```
### 6.5 편지 전송 시 편지 수신 유저에게 알림 전송하기

FCMService를 구현하기에 앞서 NotificationService 인터페이스를 구현하여 상속받도록 해주었는데 그 이유는 FCM뿐만 아니라 iOS 푸시 알림을 위한 APNs도 사용해야 하기 때문입니다. (iOS 웹 푸시는 현재 지원되지 않기 때문에 apple wallet을 통한 편법을 사용해야 합니다.)

```java
@Service
@RequiredArgsConstructor
public class FCMService implements NotificationService {

    private final FCMTokenDao fcmTokenDao;

    @Override
    public void sendLetterReceivedNotification(String email) {
        if (!hasKey(email)) {
            return;
        }
        String token = getToken(email);
        Message message = Message.builder()
                .putData("title", "편지 도착 알림")
                .putData("content", "편지가 도착했습니다.")
                .setToken(token)
                .build();
        send(message);
    }

    public void saveToken(LoginRequest loginRequest) {
        fcmTokenDao.saveToken(loginRequest);
    }

    public void deleteToken(String email) {
        fcmTokenDao.deleteToken(email);
    }

    private void send(Message message) {
        FirebaseMessaging.getInstance().sendAsync(message);
    }

    private String getToken(String email) {
        return fcmTokenDao.getToken(email);
    }

    private boolean hasKey(String email) {
        return fcmTokenDao.hasKey(email);
    }
}

```

fcm 서버로 메시지를 전송할 때, 서버가 메시지의 응답을 기다리는 동안 블로킹으로 인한 성능 저하를 방지하고자 `sendAsync()` 를 사용하여 메시지를 비동기적으로 처리하였습니다.

```java
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class LetterService {
    
    private final UserRepository userRepository;
    private final LetterRepository letterRepository;
    private final FCMService fcmService;
    private final AesUtils aesUtils;

    @Transactional
    public LetterResponse makeLetter(LetterRequest request) {
        String decryptedId = aesUtils.decryption(request.getReceiverId());
        Long userId = Long.valueOf(decryptedId);
        User receiver = userRepository.findById(userId).orElseThrow(UserNotFoundException::new);
        Letter letter = Letter.of(receiver, request.getSenderName(), request.getContents(), request.getImageUrl());
        letterRepository.save(letter);
        fcmService.sendLetterReceivedNotification(receiver.getEmail());
        return new LetterResponse(letter.getId(), receiver.getName(),
                request.getSenderName(), request.getContents(), request.getImageUrl());
    }
    //...
}
```

## 7. 마치며

지금까지 FCM을 사용한 푸시 알림을 구현해 보았습니다. 알림 기능을 구현하면서 많은 기술적 고민을 하였고 대안을 검토해 보았습니다. 저의 얕은 지식으로 현시점에 가장 좋은 옵션을 고려해보았는데, 다양한 의견들을 댓글을 통해서 공유해주시면 감사하겠습니다. 

---

**참고 자료** 📚

- [FCM 등록 토큰 관리 모범 사례 | Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging/manage-tokens?hl=ko)

- [[Firebase] FCM을 도입할 때 고려할 것들](https://seungwoolog.tistory.com/88)

- [알림 기능을 구현해보자 - SSE(Server-Sent-Events)!](https://gilssang97.tistory.com/69)

- [FCM, Spring Boot를 사용하여 웹 푸시 기능 구현하기](https://velog.io/@skygl/FCM-Spring-Boot%EB%A5%BC-%EC%82%AC%EC%9A%A9%ED%95%98%EC%97%AC-%EC%9B%B9-%ED%91%B8%EC%8B%9C-%EA%B8%B0%EB%8A%A5-%EA%B5%AC%ED%98%84%ED%95%98%EA%B8%B0)

- [Spring Boot 프로젝트에서 FCM을 이용한 웹 푸시 구현하기](https://kerobero.tistory.com/38)
