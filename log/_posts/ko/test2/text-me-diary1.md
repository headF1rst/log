---
title: GitHub Actions를 통해 CI/CD 구축하기 (feat. Docker, Jib)
category:
thumbnail: https://miro.medium.com/max/1400/1*DmFbJvnRIiQIyi5xBuIXlQ.png
tags: 프로젝트
date: 2022-12-06 10:00
---

저희 `Text Me` 서비스의 베타 버전이 배포되고 난 뒤에, 사용자들로 부터 수많은 피드백을 받을 수 있었습니다. 
사용자 피드백을 빠르게 반영하다 보니 프로젝트의 빌드 및 배포 주기가 짧아졌고 이러한 과정이 서서히 번거롭게 느껴지기 시작했습니다.

사용자의 피드백을 빠르게 반영하기 위해서는 하루에 많게는 20번의 배포가 이루어져야했기 때문에 프로젝트의 빌드 및 배포과정을 자동화 하기로 하였습니다. 
(하루에 1,000번 이상의 크고 작은 배포가 이뤄지는 테크 기업에 비하면 귀여운 수준이지만 말이죠… )

이번 글에서는 저희가 CI/CD 도구 중 GitHub Actions를 사용하는 이유와 동작원리에 대해서 공유하겠습니다.

## 1. GitHub Actions의 장점

GitHub Actoins를 CI 솔루션으로 채택하게 된 이유는 다음과 같습니다.

- GitHub와 통일된 환경에서 CI 수행이 가능하다.
- 중앙에서 관리하는 `GitHub Actions Runner` 에 지속적으로 트러블슈팅하여 원활한 CI 환경 구성이 가능하다.
- 프로젝트마다 개별 Runner를 통한 빌드 테스트가 가능하다.
- 친숙한 문법의 YAML 파일로 파이프라인 구성이 간단하다.

- GitHub Actions Runner란?
    - GitHub Actions를 기동하는 Runner
    - GitHub는 퍼블릭 쪽의 GitHub Actions Runner를 클라우드에서 제공해 주고 있다.
        - 덕분에 직접 프로비저닝할 필요 없이 Runner를 바로 사용하는 것이 가능하다.

## 2. Github Action의 구성 요소

- workflow
    - 한개 이상의 `job` 을 실행할 수 있는 자동화된 작업
    - `YAML` 파일로 작성된다.
    - `event` 에 의해서 실행된다.
- event
    - `workflow` 를 실행시키는 특정 활동
    - 깃허브에서 발생하는 대부분의 작업을 event로 정의 가능.
        - ex) `push event` , `pull request event` , `issue event`
- jobs
    - 한가지 `runner` 안에서 실행되는 여러 `step` 들의 모음
    - 각 `step` 들은 일종의 `shell script` 처럼 실행된다.
    - step들은 순서에 따라 실행되며 step끼리 데이터 공유가 가능하다
    - job은 다른 job에 의존관계를 가질 수 있으며 `병렬 실행` 이 가능하다.
- actions
    - 반복 작업을 정의한 커스텀 어플리케이션
    - workflow 파일에서 자주 반복되는 코드를 미리 정의할 수 있다.
        - 코드 양을 줄이는 이점
    - 깃허브 마켓플레이스를 통해 다른 사람이 만든 action 사용 가능

더 자세한 GitHub Actions workflow syntax는 [해당 포스트](https://jinmay.github.io/2020/05/13/git/github-action-syntax/)를 참고하면 도움이 되실 것 같습니다.

![먀](https://i.imgur.com/9tu0sgH.png)

## 3. Github Action으로 CI/CD 파이프라인 구축하기

다음과 같은 순서로 파이프라인이 구동되도록 workflow를 작성하였습니다.

1. Github Action이 트리거되면 jib로 이미지를 빌드한다.
2. 만들어진 이미지를 DockerHub에 push한다.
3. 서버에 접속해서 도커 이미지를 pull 한다.

`.github/workflows` 디렉토리를 프로젝트에 생성하고, 거기에 gradle 빌드를 위한 `build_backend.yml` 을 생성하였습니다.

### 3.1 build_backend.yml

다음 `jobs` 가 실제로 CI를 수행하는 과정이며 `steps` 단계로 jobs가 진행되게 됩니다.

```yaml
name: Build Backend Image

on:
  pull_request:
    branches:
      - production
      - master
    paths:
      - "backend/**"
  workflow_dispatch:

defaults:
  run:
    working-directory: "backend/text-me"

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Set up JDK 11
        uses: actions/setup-java@v1
        with:
          java-version: '11'
          distribution: 'temurin'

      - name: Set environment variables
          run:|
            echo "::set-env name=DB_URL::${{ secrets.DB_URL }}"
            echo "::set-env name=DB_USERNAME::${{ secrets.DB_USERNAME }}"
            echo "::set-env name=DB_PASSWORD::${{ secrets.DB_PASSWORD }}"
            echo "::set-env name=JWT_KEY::${{ secrets.JWT_KEY }}"
            echo "::set-env name=JWT_EXPIRY::${{ secrets.JWT_EXPIRY }}"
            echo "::set-env name=REFRESH_EXPIRY::${{ secrets.REFRESH_EXPIRY }}"
            echo "::set-env name=AWS_ACCESS_KEY_ID::${{ secrets.AWS_ACCESS_KEY_ID }}"
            echo "::set-env name=AWS_SECRET_ACCESS_KEY::${{ secrets.AWS_SECRET_ACCESS_KEY }}"

      - name: Login to Docker Hub
        uses: docker/login-action@v2.1.0
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_PASSWORD }}

      - name: Grant execute permission for gradlew
        run: chmod +x gradlew
        shell: bash

      - name: Build with jib
        run: |
          ./gradlew jib \
          -Djib.to.auth.username=${{ secrets.DOCKERHUB_USERNAME }} \
          -Djib.to.auth.password=${{ secrets.DOCKERHUB_PASSWORD }} \
          -Djib.to.image="${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/}"

      - name: Get current time
        uses: 1466587594/get-current-time@v2
        id: current-time
        with:
          format: YYYY-MM-DDTHH-mm-ss
          utcOffset: "+09:00"

      - name: Show Current Time
        run: echo "CurrentTime=${{steps.current-time.outputs.formattedTime}}"
        shell: bash
```

빌드 스크립트에 작성된 내용을 좀 더 자세히 살펴보겠습니다.

- `jobs: build: runs-on: ubuntu-latest`
  - 작성한 스크립트가 작동될 OS 환경을 지정합니다.
  - text me 서비스는 우분투 18.04에서 동작하기 때문에 `ubuntu-latest` 로 지정해 주었습니다.
    ![d](https://i.imgur.com/mRZU1aq.png)
    
- `steps: uses`
    - 마켓 플레이스에 사전 정의된 내용을 이용하여 step을 수행합니다.
    - 사전 작업을 위한 환경 설정용.
      ![d](https://i.imgur.com/xZ8nmau.png)

- `steps: run`
    - 개발자가 직접 정의한 커맨드를 수행합니다.
    - 실제 수행용.

- `-Djib.to.image="${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/}"`
  - Jib를 통해 도커 이미지를 빌드해서 도커 허브에 push 합니다.

**도커 컨테이너 이미지와 JIB**

스프링 프로젝트를 컨테이너 이미지로 만들기 위해서는 다양한 방법들이 존재합니다.

- **로컬 환경에서 jar 파일 빌드 , jar 파일을 이미지에 복사 후 실행**
  - 프로젝트 폴더로 들어가서 gradlew clean build를 통해 grdlew로 jar 파일 빌드
    - `./gradlew clean build`
  - 프로젝트 테스트 코드들이 실행되고 모든 테스트가 통과하면 `./build/libs` 에 실행 가능한 jar 파일이 생성된다.
  - jar 파일을 바탕으로 도커 이미지를 생성하기 위한 Dockerfile을 작성

      ```yaml
      FROM openjdk:11
      ARG JAR_FILE=./build/libs/jpashop-0.0.1-SNAPSHOT.jar
      COPY ${JAR_FILE} app.jar
      ENTRYPOINT ["java","-Djava.security.egd=file:/dev/./urandom","-jar","/app.jar"]
      ```

  - 해당 Dockerfile을 프로젝트 폴더에 넣은 후 docker build . -t 태그 이름 명령어를 실행하면 컨테이너 이미지 생성
  - java11의 실행환경을 제공하는 openjdk:11 이미지 위에서 폴더에 있는 jar 파일을 이미지 내부로 복사 후 java 명령어를 통해 실행

![d](https://cloud.google.com/java/images/docker_build_flow.png)

하지만 jar 파일을 빌드하고 추가로 이미지에 복사하여 실행하는 방법은 소스코드에 조금의 변화만 생기더라도 변경된 부분과 의존성이 연결된 jar 파일 전체가 새로운 이미지로 인식되어 전체 파일이 다시 빌드되기 때문에 Docker layer의 장점을 살릴 수 없습니다.

이를 해결하기 위해서 layer를 나누는 방법도 있지만 Google Cloud에서 제공해주는 jib를 통해서 이미지 빌드를 최적화하는 방법을 선택하였습니다.

- **JIB를 통한 이미지 빌드**
  - Jib는 **Dockerfile, Docker에 의존하지 않고** gradle, maven에서 Jib 플러그인을 사용해서 컨테이너 이미지를 빌드하고 허브에 푸시하는 방법.
  - 어플리케이션을 **(종속 항목, 리소스, 클래스 등)** 별개의 레이어로 구성하고 Docker 이미지 레이어 캐싱을 활용해서 **변경사항만 다시 빌드**함으로써 빌드를 빠르게 유지
  - jib 레이어 구성과 작은 기본 이미지는 전체 이미지 크기를 작게 유지시키며 빌드 속도를 향상 시킴

![d](https://cloud.google.com/java/images/jib_build_flow.png)

**Gradle에 jib 플러그인 추가 및 환경 변수 등록**

```bash
plugins {
    id 'com.google.cloud.tools.jib' version '3.3.1'
}

jib {
	to {
		image = "sanha1998/text-me-docker-repo"
	}
	from {
		image = "eclipse-temurin:11-jre"
	}
	container {
		jvmFlags = ["-Xms128m", "-Xmx128m"]
		environment = [
				'DB_URL': System.getenv('DB_URL'),
				'DB_USERNAME': System.getenv('DB_USERNAME'),
				'DB_PASSWORD': System.getenv('DB_PASSWORD'),
				'JWT_KEY': System.getenv('JWT_KEY'),
				'JWT_EXPIRY': System.getenv('JWT_EXPIRY'),
				'REFRESH_EXPIRY': System.getenv('REFRESH_EXPIRY'),
				'AWS_ACCESS_KEY_ID': System.getenv('AWS_ACCESS_KEY_ID'),
				'AWS_SECRET_ACCESS_KEY': System.getenv('AWS_SECRET_ACCESS_KEY')
		]
	}
}
```

**환경 변수 주입**

스프링 부트 프로젝트의 빌드가 시작되면`application.yml` 혹은 `application.properties` 
내에 설정된 환경변수 값들이 주입됩니다. 이때 AWS 계정 정보와 같은 민감 정보를 application.yml에 노출시키지 않기 위해서 Secrete 환경 변수를 깃허브에 등록해줘야 합니다.

![스크린샷 2022-12-17 오후 9.19.33.png](https://i.imgur.com/VPtkmpm.png)

깃허브에 등록한 secrets 환경 변수들을 사용하기 위해서 다음과 같은 작업을 수행해주었습니다.

```yaml
- name: Set environment variables
  run:|
    echo "::set-env name=DB_URL::${{ secrets.DB_URL }}"
    echo "::set-env name=DB_USERNAME::${{ secrets.DB_USERNAME }}"
    echo "::set-env name=DB_PASSWORD::${{ secrets.DB_PASSWORD }}"
    echo "::set-env name=JWT_KEY::${{ secrets.JWT_KEY }}"
    echo "::set-env name=JWT_EXPIRY::${{ secrets.JWT_EXPIRY }}"
    echo "::set-env name=REFRESH_EXPIRY::${{ secrets.REFRESH_EXPIRY }}"
    echo "::set-env name=AWS_ACCESS_KEY_ID::${{ secrets.AWS_ACCESS_KEY_ID }}"
    echo "::set-env name=AWS_SECRET_ACCESS_KEY::${{ secrets.AWS_SECRET_ACCESS_KEY }}"
```

### 3.2 deploy-backend

이제 운영 서버에서 도커 허브에 올린 이미지를 pull한 다음, 실행시켜 주면 됩니다.

 docker 관련 명령어를 사용하기 위해서 [운영 서버에 docker를 설치](https://headf1rst.github.io/TIL/infra-1)해 주었습니다.

docker가 운영 서버에 정상적으로 설치되었다면, 이미지를 가져와서 실행시키는 스크립트를 작성하여 배포를 자동화 시켜 보도록 하겠습니다.

```yaml
name: Deploy Backend

on:
  push:
    branches:
      - production
  workflow_dispatch:

defaults:
  run:
    working-directory: "backend/text-me"

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Set up JDK 11
        uses: actions/setup-java@v1
        with:
          java-version: '11'
          distribution: 'temurin'

      - name: SSH setting
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USER_NAME }}
          key: ${{ secrets.PRIVATE_KEY }}
          envs: GITHUB_SHA
          script: |
            whoami
            docker pull ${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/}
            docker tag ${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/} ${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/}
            docker stop text-me-api
            docker run -d --rm --name text-me-api -p 8080:8080 ${{ secrets.DOCKERHUB_USERNAME }}/text-me-docker-repo:${GITHUB_REF##*/}
```

배포 스크립트에서 눈여겨 볼 부분은 원격 서버에 접근하기 위한 SSH setting 부분입니다. ([ssh-action](https://github.com/appleboy/ssh-action)) 

로컬 서버를 열고 터미널에 다음 명령어를 입력하여 ssh 키를 생성해 주었습니다.

- `ssh-keygen -t rsa -b 4096 -C "내이메일@gmail.com"`

![d](https://i.imgur.com/s7q725G.png)

ssh 키를 `./authorized_keys2` 경로에 저장하고 다음 명령어를 통해서 ssh 키값을 확인해 줍니다.

- `vim ./ssh/authorized_keys2.pub`

ssh 키를 GITHUB SECRET의 PRIVATE_KEY로 등록해주었습니다.

![d](https://i.imgur.com/wJ7mdpG.png)

모든 과정이 마무리되었다면 직접 docker hub에 접속해서 이미지를 pull 받아올 필요 없이 자동으로 이미지를 가져와서 운영 서버에 띄워주게됩니다.

## 마치며

지금까지 기프터즈팀이 GitHub Actions를 사용하는 이유와 동작원리에 대해 설명드렸습니다.

시간이 된다면 프론트 빌드 및 배포 과정도 포스팅 해보도록 하겠습니다. 감사합니다.

---

**참고 자료** 📚

- [GitHub Action으로 CI/CD 구축하기](https://velog.io/@sgwon1996/GitHub-Action%EC%9C%BC%EB%A1%9C-CICD-%EA%B5%AC%EC%B6%95%ED%95%98%EA%B8%B0)

- [카카오엔터프라이즈가 GitHub Actions를 사용하는 이유](https://tech.kakao.com/2022/05/06/github-actions/)

- [Github actions를 이용한 CICD - 2](https://itcoin.tistory.com/685)

- [[Github]깃허브의 CI툴인 Actions의 문법 간단 정리](https://jinmay.github.io/2020/05/13/git/github-action-syntax/)

- [쿠버네티스 환경에 스프링 어플리케이션 배포하기](https://velog.io/@sgwon1996/%EC%BF%A0%EB%B2%84%EB%84%A4%ED%8B%B0%EC%8A%A4-%ED%99%98%EA%B2%BD%EC%97%90-%EC%8A%A4%ED%94%84%EB%A7%81-%EC%96%B4%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%B0%B0%ED%8F%AC%ED%95%98%EA%B8%B0)
