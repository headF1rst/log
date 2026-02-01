---
title: ubuntu 18.04에 Docker 설치하기
category:
thumbnail: https://www.docker.com/wp-content/uploads/2021/09/Docker-build.png
tags: infra
date: 2022-12-03 10:00
---

프로젝트를 진행하면서 도커 허브에 올라가있는 이미지를 가져와서 배포 환경에서 실행해야 하는 요구사항이 발생하였습니다. 

이를 위해서 ubuntu환경에 docker를 설치했던 과정을 공유해보겠습니다.

## Docker가 지원하는 OS

다음은 docker 공식 문서에서 지원하는 OS입니다.

저는 `ubuntu 18.04` 환경에서 진행하였습니다.

- Ubuntu Impish 21.10
- Ubuntu Hirsute 21.04
- Ubuntu Focal 20.04 (LTS)
- Ubuntu Bionic 18.04 (LTS)

## 설치 과정

- 기본 패키지들이 최신 버전인지 확인하고 갱신
    - `$ sudo apt-get update`
- apt가 HTTPS를 통해 repository를 이용하는 것을 허용할 수 있도록 해주는 패키지들을 설치
    
    ```bash
    $ sudo apt-get install \
    	ca-certificates \
    	curl \
    	gnupg \
    	lsb-release
    ```
    
- Docker 공식 GPG key 추가
    - `$ curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg`
    - 만약 아래와 같은 경고가 발생한다면 (1), (2) 과정을 순서대로 수행해 줍니다.
        - `gpg: WARNING: unsafe ownership on homedir '/home/vlastimil/.gnupg'`
    - (1) `sudo gpgconf --kill dirmngr`
    - (2) `sudo chown -R $USER ~/.gnupg`
- Docker repository 등록
    
    ```bash
    $ echo \
    	"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] [https://download.docker.com/linux/ubuntu](https://download.docker.com/linux/ubuntu) \
    	$(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    ```
    
- Docker 설치
    - `$ sudo apt-get update`
    - `$ sudo apt-get install docker-ce docker-ce-cli [containerd.i](http://containerd.io/)o`
- Docker가 재대로 설치되었는지 확인
    - `$ sudo docker version`

## Ubuntu 환경에서 sudo 권한 없이 docker 명령어 사용하기

배포 스크립트를 통해서 도커 관련 명령어가 실행되게 하기 위해서는 다음 명령어가 필요합니다.

- `$ sudo usermod -aG docker $USER`
    - usermod : 사용자 속성을 변경하는 명령어
    - G (—groups) : 새로운 그룹을 말한다.
    - a (—append) : 다른 그룹에서 삭제 없이 G 옵션에 따른 그룹에 사용자를 추가한다.
    - $USER : 현재 사용자를 가리키는 환경변수
    - 실행 후 우분투를 재기동해야 함.

---

**참고 자료** 📚

- [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository)

- [gpg: WARNING: unsafe ownership on homedir '/home/user/.gnupg'](https://unix.stackexchange.com/questions/452020/gpg-warning-unsafe-ownership-on-homedir-home-user-gnupg)
