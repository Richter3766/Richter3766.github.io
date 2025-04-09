---
layout: post
title: REST Docs 적용기
subtitle: 마주친 문제와 해결 과정
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

이번에 진행한 [자율 프로젝트](https://github.com/Mockin-2024)에서는 API 문서 자동화 도구로 Spring REST Docs를 선택했습니다. 테스트 코드를 반드시 작성해아 한다는 점도 매력적이고, Swagger와는 달리 컨트롤러에 설정 코드들이 없어 깔끔하기 때문입니다.

하지만 Spring REST Docs의 단점에 복잡한 초기 설정이 왜 있는 지 십분 이해할 정도로 적용에 어려움을 겪었습니다. 이번 글을 통해 적용 과정을 정리하고, 어떤 어려움을 겪었는 지, 그리고 어떻게 해결했는 지 나누고자 합니다. 실제로는 엄청 헤맸고, 많은 시행착오를 겪었지만, 문제 해결에 핵심적인 부분들만 뽑아 간략히 적고자 합니다.

저희 프로젝트 환경은 아래와 같으며, 컨트롤러에는 비동기 프로그래밍이 적용되어 있다는 점 참고바랍니다.

언어: Kotlin  
Spring Framework: 6.1.13  
Spring Boot: 3.3.4  
kotest: 5.9.1  
mockMvc: 3.0.2  
mockk: 1.13.12  
coroutine: 1.9.0

## 1. 문제 정의 및 동기

현재 프로젝트 설정이 kotest를 활용하고 있어 [이 블로그](https://medium.com/@ilboogl/generate-restful-api-documentation-using-kotlin-kotest-mockmvc-and-spring-rest-docs-53a156317320)를 참고하여 코드를 작성했습니다.

해당 글에 있는 dsl 버전으로 코드 작성 후, 실행 결과 응답 상태는 200OK가 떴지만, REST Docs 작성이 의도한 대로 되지 않았습니다. 정확히는 빌드 경로에 adoc 파일이 생성됐지만, 내부에 값이 전혀 적혀있지 않았습니다.

처음에는 REST Docs의 설정 문제인 줄 알고 관련 공식 문서를 열심히 찾았지만, 설정에는 큰 문제가 없어 보였습니다. REST Docs 문제라면 adoc 파일 생성이 안되거나 오류가 표시되야 할텐데, 어느것도 해당되지 않았거든요.

위 문제를 어떻게 해결했는 지, 그리고 이후에 또 어떤 문제를 만났는 지 차례대로 알려드리겠습니다.

## 2. 해결 과정

### 2.1. mockMvc Empty body 문제 해결

REST Docs 설정에 문제가 없음을 재차 확인한 후에는 원인이 테스트 자체에 있는 건 아닌 지 의심했습니다. 200 Ok 가 떴지만, 내부 값이 어떤 지 직접 출력해 확인해보진 않았었거든요.

실제로 확인해보니 실제로 응답이 empty body로 들어옴을 볼 수 있었습니다. 즉 mockMvc를 활용한 테스트에서 뭔가 잘못되고 있다는 점이었죠. 해결 방법을 찾기 위해 스택 오버 플로우에 유사한 사례가 있는지, 공식 문서에 적힌 예외 사례는 없는 지 찾아보았습니다.

그러던 중 [공식 문서](https://docs.spring.io/spring-framework/reference/6.0/testing/spring-mvc-test-framework/async-requests.htmll)에서 mockMvc로 비동기 요청을 위해선 따로 설정을 추가해야 한다는 부분을 발견했습니다.

현재 프로젝트는 컨트롤러가 비동기적으로 처리하기 때문에, 해당 설정의 부재가 에러의 원인이 아닐까? 하는 생각이 들었고, 아래 처럼 해당 설정의 dsl 버전을 적용했습니다.

```kotlin
...
    return this.get(uri) {
        with(authUser())
        params.forEach { (key, value) ->
            if (value != null) param(key, value.toString())
        }
    }.asyncDispatch().andExpect { // 추가한 부분
        status { isOk() }
        content {
            json(toJson(expectedDto))
        }
    }
...
```

위와 같이 수정한 이후 실행하니 정말 값을 제대로 가져옴을 볼 수 있었고, adoc 파일도 정상적으로 생성했습니다.

### 2.2. github action에서 빌드 실패 문제, 도커 빌드로 해결

위 문제를 해결한 직후 저는 spring의 정적 페이지 라우팅으로 api 문서에 접속할 수 있도록 .adoc 파일을 html 문서로 만들어 /resource/static/docs에 넣는 gradle task까지 큰 어려움 없이 작성했습니다.

그런데 문제는 생각치도 못한 곳에서 발생했습니다.

바로 github PR에서 build check 시 illegalSttateExeption을 띄우며 빌드가 실패하는 것이었습니다.

로컬에서 빌드 시 문제 없이 동작했기 때문에 문제가 발생할 것이라고 예상하지 못했는데, 이 에러를 마주하니 상당히 당황스러웠습니다.

로컬과 github action이 동작하는 가상 환경 간 어떤 차이가 있어 문제가 발생하는 것이라고 추정했는데, 정확히 어떤 부분이 달라 발생했는 지는 전혀 감이 안 왔습니다.

원인 추정이 안되니 해결책을 떠올릴 수가 없어서, 위 에러를 우회하기로 했습니다.

가장 먼저 떠올린 것은 도커로 빌드 테스트를 하자는 것이었는데요.

도커는 가상 컨테이너로 빌드하므로 로컬에서 빌드가 된다면, github action의 환경에서도 빌드 성공이 보장된다는 생각이 들었기 때문입니다.

그래서 도커 빌드에서도 같은 문제가 발생하는 지 체크해봤습니다.

다행히 빌드 오류는 나지 않았지만, 한 가지 문제가 있었습니다. 로컬 IDE에서 빌드할 경우 build 디렉토리에 adoc 파일들이 담긴 폴더가 생성되었는데요. 이상하게도 도커 빌드 시 해당 adoc 파일들이 build 디렉토리도, 작업 디렉토리도 아닌 루트 디렉토리에 생성된다는 점이었습니다.

### 2.3 도커 빌드 시 build 파일 생성 위치 오류 문제 해결

이 문제를 마추했을 때 앞선 문제들로 피로도가 쌓인 상태였으므로 우선은 동작만 되도록 하고, 원인은 나중에 찾기로 빠르게 판단했습니다. 그래서 gradle task를 수정하여, 루트 디렉토리에 있는 adoc 파일이 담긴 폴더를 원래 있어야 하는 build 디렉토리로 복사한 후, 이후 과정이 실행되도록 했습니다.

```gradle
tasks.register<Copy>("copySnippets"){
    dependsOn(tasks.test)

    from(file("../trading")) {
        into("trading")
    }
    from(file("../account")) {
        into("account")
    }
    from(file("../basic")) {
        into("basic")
    }
    into(file("./build/generated-snippets"))
}

```

위처럼 수정하자 html 파일이 /resource/static/docs 위치에 잘 들어감을 볼 수 있었습니다.

### 2.4 도커 이미지에서 api 문서 접근 시 404 에러

하지만 문제는 여기서 끝이 아니었습니다. 빌드된 도커 이미지 실행 시 404 에러와 함께 api 문서에 접근할 수 없는 현상이 생긴 것이죠. 분명 파일은 올바른 위치에 있는 것을 확인했는데도요.

404는 애초에 파일이 없다는 뜻이었기 때문에, 이때 떠올린 생각은 ‘멀티 스테이징 때문인가?’ 였습니다. 당시 활용한 도커 파일은 아래와 같이 멀티 스테이징을 활용합니다.

```docker
# 1단계: 빌드 단계
FROM azul/zulu-openjdk-alpine:17-latest AS build
WORKDIR /app
COPY . .

RUN chmod +x ./gradlew
RUN ./gradlew clean build

# 2단계: 런타임 단계
FROM azul/zulu-openjdk-alpine:17-latest
COPY --from=build /app/build/libs/*.jar app.jar

ENTRYPOINT ["java","-jar","/app.jar"]
EXPOSE 8080

```

핵심은 멀티 스테이징에서 도커 이미지 빌드에 필요한 app.jar 파일만 가져온다는 것이었습니다.

만약 서순이 잘못되어 jar이 생긴 후 html을 생성한다면, 1단계의 파일에서 html이 정상적으로 위치하더라도, 실제 실행 파일인 app.jar에는 담기지 않으므로 api 문서가 없는 것도 당연한 것이죠.

이를 위해 gradle 빌드 시 어떤 순서로 실행되는 지 살펴봤습니다.

```gradle

RUN ./gradlew build
44.0s
Starting a Gradle Daemon, 1 incompatible and 1 stopped Daemons could not be reused, use --status for details
> Task :checkKotlinGradlePluginConfigurationErrors
> Task :compileKotlinUP-TO-DATE
> Task :compileJavaNO-SOURCE
> Task :processResources
> Task :classes
> Task :resolveMainClassName
> Task :bootJar
> Task :jar
> Task :assemble
> Task :compileTestKotlinUP-TO-DATE
> Task :compileTestJavaNO-SOURCE
> Task :processTestResourcesUP-TO-DATE
> Task :testClassesUP-TO-DATE
OpenJDK 64-Bit Server VM warning:Sharing is only supported for boot loader classes because bootstrap classpath has been appended
OpenJDK 64-Bit Server VM warning:Sharing is only supported for boot loader classes because bootstrap classpath has been appended
> Task :test
```

위는 도커 빌드 때의 로그인데, jar이 생성되는 bootJar 이후에 test가 동작하죠. 이러니 app.jar이 생성될 당시에는 적절한 html 문서가 없으므로 포함되지 않았던 것입니다.

문제 해결은 단순했습니다. 중요한 건 html 생성 이후에 app.jar을 만드는 것이므로 아래와 같이 html 생성을 먼저 하도록 해주면 됐습니다.

```docker
RUN chmod +x ./gradlew
RUN ./gradlew clean asciidoctor
RUN ./gradlew build
```

위와 같이 Dockerfile을 수정한 후 빌드하니 이미지 실행 시 라우팅되고 있는 api 문서에 접근할 수 있었습니다.

그리고 다행히 위 변경 사항을 적용한 github action에서도 다른 에러 없이 성공적으로 빌드됐으며, 배포 환경에서 api 문서 접근도 문제없었습니다.

## 4. 결과

오늘은 Spring REST Docs를 적용하며 저가 마주했던 문제를 어떻게 해결했는 지 이야기했습니다.

긴 시간을 투자하고 고생했지만, 결국 성공해서 뿌듯하기도 합니다.

하지만 아쉬웠던 점도 있었는데요.

로컬에서 동작했던 빌드가 github action에서 동작하지 않았던 이유와 도커 빌드 시 adoc 파일이 build가 아닌 루트 디렉토리에 생성된 이유를 여전히 모르기 때문입니다.

윗 부분은 이후에 시간을 투자해서 찾아 해결해보기로하고 오늘은 여기서 글을 마무리 짓고자 합니다.

긴 글 읽어주셔서 감사합니다.

## 참고 자료

[Generate RESTful API documentation using Kotlin, Kotest, MockMvc and Spring REST Docs](https://medium.com/@ilboogl/generate-restful-api-documentation-using-kotlin-kotest-mockmvc-and-spring-rest-docs-53a156317320)

[Spring Boot Async Requests](https://docs.spring.io/spring-framework/reference/6.0/testing/spring-mvc-test-framework/async-requests.html)
