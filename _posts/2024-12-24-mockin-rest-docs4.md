---
layout: post
title: REST Docs 경로 문제 해결
subtitle: / 하나가 만들어낸 눈덩이
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

이전 [Rest Docs 적용기](/2024-12-06-mockin-rest-docs1)에서 로컬에서 동작했던 빌드가 github action에서 동작하지 않았던 것과 도커 빌드 시 adoc 파일이 build가 아닌 루트 디렉토리에 생성된 이유를 모른 채 넘어갔었습니다.

그러다 한참이 지난 후 jacoco 테스트 커버리지 리포트를 적용하는 과정에서 뜬금없이 이 문제의 원인을 찾아 해결할 수 있었는데요.

이번 글에서는 그 문제의 원인을 어디서 찾았고, 무엇이 문제였으며, 어떻게 해결했는지 보여드릴려고 합니다.

## 1. 문제 정의 및 동기

해당 문제를 처음 마주했을 당시, 로컬과 github action 의 알 수 없는 환경 차이일 것이라고 생각하고 해결하기보다 도커를 이용해 빌드 체크를 하는 방식으로 우회했었습니다.

하지만 현재 목표는 jacoco report를 PR 코맨트에 넣는 것이었고, 이 부분은 도커 빌드로는 지원이 힘들어 보였습니다. 왜냐하면 PR 코맨트 추가를 위해 github action에서 제공하는 `madrapps/jacoco-report@v1.7.1` 를 활용해야 했기 때문입니다.

따라서 로컬에서 동작했던 빌드가 github action에서 왜 동작하지 않았는 지 해당 문제를 깊이 들여다 보기로 했습니다.

## 2. 해결 전략 수립

먼저 github action 테스트를 위해 github에 계속 커밋을 넣는 건 굉장히 불편하고, 비효율적이라 판단했습니다. 그래서 저는 github action을 로컬에서 동작할 수 있게 해주는 act-cli를 활용하기로 했습니다.

act-cli는 도커 컨테이너를 활용하여, github action을 로컬에서 돌릴 수 있도록 도와주는 도구입니다. 저는 [해당 자료](https://www.freecodecamp.org/news/how-to-run-github-actions-locally/)를 참고했습니다.

그리고 gradle build 시 —info 옵션을 추가하면 상세 정보를 볼 수 있다는 점을 이용해, 왜 illegalSttateExeption이 발생하는 지 보기로 했습니다. (처음 해당 문제를 마주했을 때 이 방법을 몰랐었습니다..)

## 3. 해결 과정

`—info` 옵션을 추가하고 act를 활용해 github action을 돌리자 이전에 만났던 에러를 조금 더 자세히 볼 수 있었습니다. 에러는 모두 아래와 같은 형식의 내용이었습니다.

```kotlin
com.knu.mockin.controller.quotations.basic.real.BasicRealControllerTest > GET /quotations/basic/inquire-time-itemchartprice FAILED
    java.lang.IllegalStateException: Failed to create directory '/quotations/basic/inquire-time-itemchartprice'
        at org.springframework.restdocs.snippet.StandardWriterResolver.createDirectoriesIfNecessary(StandardWriterResolver.java:103)
        at org.springframework.restdocs.snippet.StandardWriterResolver.resolve(StandardWriterResolver.java:72)
        at org.springframework.restdocs.snippet.TemplatedSnippet.document(TemplatedSnippet.java:77)
        at org.springframework.restdocs.generate.RestDocumentationGenerator.handle(RestDocumentationGenerator.java:191)
```

자세히 보니 directory url이 잘못되었다는 내용 같아서 해당 부분을 더 자세히 보기로 했습니다.
`val baseUri = "/quotations/basic"`

처음 uri는 위처럼 설정되어 있었습니다. 그런데 문득 uri의 시작이 ‘/’로 하는 게 문제가 아닐까 하는 생각이 들었습니다. 그래서 해당 부분을 `"quotations/basic"` 와 같이 바꾸자 정말로 정상 동작함을 볼 수 있었습니다.

황당하게도 위 문제가 해결되자, 도커 빌드 시 adoc 파일이 build 디렉토리에 정상적으로 들어감을 확인할 수 있었습니다. 알고보니 두 문제의 원인이 같았던 것입니다!

## 4. 결과

결국 문제의 원인은 '/'로 시작하는 경우 루트 디렉토리에서부터 표현되는 절대 경로라는 점을 간과한 저의 실수였습니다.

이처럼 매우 기본적인 내용이었지만, 이런 작은 부분이 큰 문제로 이어진 경험은 처음이라 당황스러웠습니다. 이 사건을 통해 작은 부분도 놓치지 말아야 한다는 경각심을 가지게 되었습니다.

이 에러를 해결하기 위해 1주일 넘게 고민했지만, 마침내 문제를 해결하니 속이 시원했습니다.  
또, 개선 이후 도커 빌드 시 adoc 파일이 build 디렉토리에 정상적으로 생성되면서, 빌드마다 상위 디렉토리에서 build 파일을 복사해오는 gradle task도 정리할 수 있었습니다.  
덕분에 build.gradle 파일은 꼭 필요한 task만 남아 훨씬 깔끔해졌습니다.

이후 jacoco report 결과를 PR 코멘트에 추가하는 작업도 어렵지 않게 완료할 수 있었습니다.

처음 문제가 발생했을 때 원인을 정확히 정의하고 하나씩 해결했더라면, 좀 더 빨리 문제를 해결하고 다시 고민하지 않아도 되었을 것 같아 아쉬움이 남습니다.  
하지만 이번 경험을 통해 다시는 같은 실수를 반복하지 않도록 노력하려고 합니다.  
읽어주셔서 감사합니다.

## 참고 자료

[How to Run GitHub Actions Locally Using the act CLI Tool](https://www.freecodecamp.org/news/how-to-run-github-actions-locally/)
