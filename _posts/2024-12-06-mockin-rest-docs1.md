---
layout: post
title: REST Docs 적용기
subtitle: 왜 이 도구였는가, 그리고 마주친 현실적 문제들
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

이번에 진행하고 있는 [자율 프로젝트](https://github.com/Mockin-2024) 초반, 팀 내 협업에는 비효율이 있었습니다.

API 문서는 Postman에서만 관리되어  
실제 구현과 문서가 자주 어긋났죠.  
프론트엔드 팀원은 '이 API, 파라미터 바뀌었나요?' 같은 질문을 반복해서 할 수밖에 없었고,  
새 기능이 나올 때마다 구두나 메신저로 설명이 오갔습니다.  
테스트 단계에서는 문서와 실제 구현의 불일치 때문에 혼선이 자주 일어났습니다.

문서 최신화의 어려움, 반복적인 커뮤니케이션,  
이걸 자동화/일원화하지 않으면  
개발 효율이 절대 올라가지 않겠다는 생각이 강하게 들었습니다.

그래서 **API 문서를 자동으로 최신화하고,  
테스트를 통과한 것만 신뢰할 수 있게 만들자**라는 목표로  
문서 자동화 도구를 본격적으로 검토하게 됐습니다.

## 1. 문제 상황과 기술 선택의 기준

### 1-1. 반복되는 협업의 비효율

API 명세와 실제 구현의 불일치,  
변경사항이 실시간으로 팀에 공유되지 않아  
커뮤니케이션 비용이 계속 증가했습니다..  
이런 구조로는 팀 전체의 생산성과 품질을 높이기 어렵다고 느꼈습니다.

### 1-2. 기술 선택을 위한 비교

처음에는 익숙한 Swagger도 후보에 올렸습니다.  
Swagger는 annotation만 붙여주면 시각적이고 직관적인 문서가 자동 생성되는 장점이 있습니다.  
하지만 현 상황에서는 아래와 같은 한계가 명확했습니다.

- 컨트롤러에 Swagger-specific annotation이 늘어나며 코드가 복잡해짐
- 테스트 없이도 문서가 자동으로 생성되어,  
  실제 동작과 문서의 싱크가 어긋날 위험
- 문서의 신뢰도가 결국 "개발자의 습관"에 의존하게 됨

반면, **Spring REST Docs**는  
- **테스트를 통과한 API만 문서화**되어 문서와 구현의 싱크가 강제되고,  
- 컨트롤러 코드가 훨씬 깔끔하게 유지되며,  
- 개발자가 테스트를 작성하지 않으면 문서화도 불가해  
팀 전체 품질 기준도 자연스럽게 올라간다는 점이 매력적이었습니다.

**초기 세팅과 문서화 과정이 번거롭더라도,  
장기적으로 코드와 문서 품질을 모두 보장할 수 있다는 점이  
저와 팀이 추구하는 방향과 맞아 REST Docs를 최종 선택했습니다.**

## 2. 적용 경험 – 마주친 문제와 해결 과정

### 2-1. 비동기 컨트롤러와 MockMvc의 Empty body 문제

초기 REST Docs 설정은 여러 자료(특히 [이 블로그](https://medium.com/@ilboogl/generate-restful-api-documentation-using-kotlin-kotest-mockmvc-and-spring-rest-docs-53a156317320))를 참고해 진행했습니다.  
하지만, 비동기 컨트롤러 테스트에서 MockMvc가 empty body를 반환하며  
adoc 파일이 정상적으로 생성되지 않는 문제가 발생했습니다.

 [공식 문서](https://docs.spring.io/spring-framework/reference/6.0/testing/spring-mvc-test-framework/async-requests.html)를 찾아가며 원인을 파고들었고,  
**MockMvc에서 비동기 요청 결과를 처리하려면 asyncDispatch를 추가해야 한다**는 점을 발견해  
아래와 같이 코드를 수정했습니다.

```kotlin
...
    return this.get(uri) {
        with(authUser())
        params.forEach { (key, value) -> 
            if (value != null) param(key, value.toString())
        }
    }.asyncDispatch().andExpect { // 추가된 부분
        status { isOk() }
        content { json(toJson(expectedDto)) }
    }
...
```
위처럼 asyncDispatch를 적용하자 문서 생성이 정상적으로 이뤄졌습니다.

### 2-2. CI 환경(GitHub Actions)에서의 빌드 실패와 도커 우회

로컬에서는 빌드가 잘 됐지만,
Github PR의 빌드 체크에서 illegalStateException이 발생해
CI가 계속 실패했습니다.

에러 로그를 여러 번 뒤져도 명확한 원인을 찾지 못해,
일단 Github Actions에서 직접 gradle 빌드를 실행하는 대신
workflow 내에서 docker build를 활용하는 전략으로 우회했습니다.

- 도커 컨테이너 환경은 로컬과 거의 동일하게 맞출 수 있기 때문에,
  로컬 빌드가 성공하면 github actions 내 docker build 역시 성공할 거라는 기대가 있었습니다.

실제로 이 방식으로 Github Actions의 CI 파이프라인이 정상적으로 통과되었고,
임시로라도 빌드가 막히는 문제를 해소할 수 있었습니다.  
이때 빌드 실패의 정확한 원인은 확인하지 못했지만,
빠르게 팀 작업 흐름을 유지하는 게 더 중요하다고 판단했습니다.

### 2-3. 이후 발견한 도커/Gradle 경로 이슈

임시로 CI는 통과했지만,  
테스트/배포 환경에서 API 문서가 정상적으로 노출되지 않는 현상을 발견했습니다.  
빌드는 성공하는데, 정작 배포 링크에서는 해당 경로에 문서가 존재하지 않아
누구도 API 명세를 볼 수 없는 상황이 반복됐습니다.

원인을 역추적한 결과,  
**.adoc 파일이 의도한 build/generated-snippets가 아니라  
컨테이너의 루트 디렉토리에 생성**되고 있었습니다.  
이는 도커 컨테이너 내에서 Gradle task가 상대 경로를 잘못 해석해  
결과물이 루트에 저장되는 현상이었죠.

해결을 위해  
- Gradle task에서 루트 디렉토리에 잘못 생성된 adoc 파일을  
  build/generated-snippets로 복사하는 Copy 작업을 추가했고,  
- 이후 단계에서 이 디렉토리만 참조해  
  API 문서가 정상적으로 포함되도록 경로 처리를 마쳤습니다.

```gradle
tasks.register<Copy>("copySnippets") {
    dependsOn(tasks.test)
    from(file("../trading")) { into("trading") }
    from(file("../account")) { into("account") }
    from(file("../basic")) { into("basic") }
    into(file("./build/generated-snippets"))
}
```
이렇게 경로 문제를 조정한 뒤  
도커 빌드 로그와 실제 배포 환경 양쪽에서  
문서 파일이 정상적으로 포함되어 있음을 직접 확인할 수 있었고,  
API 문서가 노출되지 않는 문제는 일단락되는 듯했습니다.

### 2.4 도커 이미지에서 api 문서 접근 시 404 에러

하지만, 실제 도커 이미지를 배포해 서비스를 띄우자
여전히 `/static/docs` 경로에서 404 에러가 발생했습니다.    
분명 빌드 로그와 파일 복사까지는 잘 됐는데,
왜 컨테이너 실행 후엔 문서가 보이지 않을까?
라는 고민에서, 빌드·배포 파이프라인 전체의 실행 순서에 다시 주목하게 됐습니다.

컨테이너 내부의 파일 시스템을 확인했지만
멀티 스테이징 구조상 최종 런타임 이미지에는 app.jar만 들어 있어
정적 문서 파일 자체는 없었습니다.

이에 **문서 파일이 jar 빌드 시점에 포함되지 않았을 가능성**을 가설로 세우고
빌드 로그를 단계별로 재분석했습니다.
아래 로그처럼 jar 파일(bootJar)이 먼저 만들어지고
그 뒤에 test와 asciidoctor(정적 문서 변환) 태스크가 실행되고 있었습니다.

```gradle

RUN ./gradlew build
...
> Task :bootJar
> Task :jar
...
> Task :test
...
```

즉,
jar 파일 생성 시점에는 아직 HTML로 변환된 API 문서가 준비되지 않아
최종 산출물(app.jar) 안에 문서가 누락된 상태가 되어
서비스에서 404 에러가 발생했던 것입니다.

해결은 명확했습니다.
중요한 건 HTML 생성 이후에 app.jar을 만드는 순서를 보장하는 것이므로
Dockerfile에서 html 변환(asciidoctor)을 build 전에 반드시 실행하도록
명령 순서를 재설계했습니다.

```docker
RUN chmod +x ./gradlew
RUN ./gradlew clean asciidoctor
RUN ./gradlew build
```

수정 후 빌드를 다시 진행하자
컨테이너 실행 환경에서도 /static/docs에서 문서가 정상적으로 노출됨을
직접 확인할 수 있었습니다.

## 4. 돌아보며

API 문서 자동화는 단순히 문서를 만드는 작업을 넘어서,
팀과 서비스의 개발 문화와 품질 기준까지 바꿀 수 있다는 걸 몸소 경험한 시간이었습니다.

실제 적용 과정에서 생각보다 더 많은 시행착오와 문제들을 만났지만,
매번 막히는 지점에서 원인을 끝까지 파고들고,  
과정 자체를 개선하는 경험이 오히려 가장 큰 배움이었던 것 같습니다.    

특히 ‘문서와 실제 코드의 싱크’라는 요구사항을 만족하기 위해
도구의 사용법을 넘어서, 빌드/배포 파이프라인 전체를 주도적으로 개선헀던 점이 저에겐 의미 깊었습니다.

아직도 완전히 풀지 못한 의문점과, 앞으로 더 개선할 부분이 남아있지만
이 과정을 통해 문제를 끝까지 집요하게 쫓고,
팀 전체가 더 나은 협업 구조를 만들어가는 방법을 조금 더 알게 된 것 같아요.

이번 경험은 저에게 ‘자동화’의 진짜 의미와,
작은 불편함을 끝까지 해결할 때 서비스가 한 단계 성장한다는 믿음을 더해주었습니다.

긴 글 읽어주셔서 감사합니다.

---

이번 글에서 다루지 못한 세부 이슈와,
더 나은 테스트/문서화 환경을 만들어간 추가 경험은  
아래 ‘더 읽어보기’에서 이어서 확인하실 수 있습니다.  

### 더 읽어보기

- [REST Docs 경로 문제 해결기](2024-12-13-mockin_rest-docs2.md)
- [컨트롤러 테스트 코드 DSL 개선](2024-12-20-mockin-rest-docs3.md)
- [테스트 코드 json 기반 개선](2024-12-24-mockin-rest-docs4.md)

## 참고 자료

[Generate RESTful API documentation using Kotlin, Kotest, MockMvc and Spring REST Docs](https://medium.com/@ilboogl/generate-restful-api-documentation-using-kotlin-kotest-mockmvc-and-spring-rest-docs-53a156317320)

[Spring Boot Async Requests](https://docs.spring.io/spring-framework/reference/6.0/testing/spring-mvc-test-framework/async-requests.html)
