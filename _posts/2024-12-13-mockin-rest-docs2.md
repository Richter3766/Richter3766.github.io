---
layout: post
title: 컨트롤러 테스트 코드 개선하기
subtitle: 코틀린 DSL을 활용해 중복 코드를 줄이고, 사용하기 쉽게 만들기
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

이번 [자율 프로젝트](https://github.com/Mockin-2024/backend)에서 Spring Rest Docs를 적용하면서 모든 컨트롤러에 대한 테스트 작성이 필수적이었습니다.
이때 컨트롤러 코드의 특성 상 중복되는 부분이 많아 테스트는 대부분 복사 붙여넣기를 활용하는 구조였죠.

하지만 테스트가 증가함에 따라 중복 코드가 늘어나고, 이로 인해 코드가 복잡해지며 수정해야 할 부분이 직관적이지 않다는 문제가 발생했습니다.
특히 이 문제는 다른 백엔드 팀원이 테스트 작성에 익숙하지 않았기 때문에 더욱 중요했습니다.

따라서 앞으로도 지속적으로 테스트 코드를 작성해야 하는 만큼 이 부분을 개선할 필요성이 있다고 판단했습니다.

이 글에서는 그 과정과 결과를 이야기하고자 합니다.

## 1. 문제 정의 및 동기

원래의 코드는 아래와 같았습니다.

```kotlin
 ...
        val uri = "${baseUri}/psamount"
        val response = mockMvc.get(uri) {
					param("overseasExchangeCode", "SZAA")
					param("overseasOrderUnitPrice", "100")
					param("itemCode", "1380")
					param("email", "test@gmail.com")
				}

        response.andExpect {
            status { is2xxSuccessful() }
        }.andDo {
            handle(
                MockMvcRestDocumentation.document(
                    uri,
                    queryParameters(
                        parameterWithName("overseasExchangeCode").description("거래소 코드"),
                        parameterWithName("overseasOrderUnitPrice").description("주당 가격"),
                        parameterWithName("itemCode").description("종목 코드"),
                        parameterWithName("email").description("사용자 이메일")
                    ),
                )
            )
        }
 ...
```

저가 위 코드를 기반으로 새로운 테스트를 작성할 때 불편했던 점은 크게 두 가지였습니다.

1. `mockMvc`로 특정 컨트롤러를 테스트할 때 GET 요청의 경우 파라미터를 일일이 작성해야 했습니다.
2. Rest Docs의 `queryParameters`가 많아질 경우 가독성이 떨어졌습니다.

그래서 이번 개선을 통해 얻고자 하는 것 또한 두 가지였습니다.

1. `mockMvc`로 요청을 보낼 때 GET의 파라미터나, post의 body를 직접 작성하는 일이 없도록 하자.
2. Rest Docs의 query Parameter의 가독성을 올려보자.

## 2. 해결 전략 수립

해당 문제를 해결하는 데 정말 큰 아이디어와 함께 도움을 받았던 것은 [토스의 한 글](https://toss.tech/article/kotlin-dsl-restdocs)이었습니다.

위 글에서는 Kotlin DSL을 활용해 Rest Docs를 더 보기 좋게 작성하는 방법에 대한 아이디어와 과정을 보여주고 있었습니다.

여기서 아이디어를 얻어 DSL을 활용해 `mockMvc`로 테스트 하는 부분을 깔끔하고 직관적으로 사용할 수 있도록 개선하기로 했습니다.

## 3. 해결 과정

저는 처음의 코드를 확장함수로 간편하게 쓸 수 있길 바랐습니다. 때문에 `mockMvc`로 테스트를 하는 부분과 rest docs를 작성하는 부분, 크게 두 부분을 함수로 나누어 구현하기로 했습니다.

### mockMvc 테스트 구현

먼저 get 요청을 확장함수로 묶고 파라미터를 일일이 작성하지 않으려면 주어진 dto의 필드명과 필드값을 가져오는 게 필요했습니다.

그래야 `param(”필드명”. “필드값”)` 를 dto의 모든 필드에 대해 적용할 수 있으니까요. 그래서 저는 Kotlin Reflection을 활용하기로 했습니다.

여기서 Reflection은 런타임 중에 클래스나 객체의 내부 값을 가져오게 도와주는 기능입니다. 남용하면 성능 저하의 위험이 있지만, 지금은 요청 한번당 한번의 리플렉션을 사용하므로 그 위험보다 이점이 크다고 판단했습니다.

이를 통해 작성한 get 요청 코드입니다.

```kotlin
fun <T> MockMvc.getWithParams(uri: String, requestParams: T, expectedDto: T): ResultActionsDsl {
    val params = requestParams!!::class.java.kotlin.memberProperties
        .associate { it.name to it.call(requestParams)?.toString() }

    return this.get(uri) {
        params.forEach { (key, value) ->
            if (value != null) param(key, value.toString())
        }
    }.asyncDispatch().andExpect {
        status { isOk() }
        content {
            json(toJson(expectedDto))
        }
    }
}
```

어떤 객체든 상관없이 쓸 수 있도록 제네릭을 활용하고, 리턴값으로 Rest Docs 생성 등 다른 작업을 진행할 수 있도록 `ResultActionsDsl`을 반환하도록 헀습니다.

여기서 `ResultActionsDsl`은 mockMvc에서 http 요청 후 반환하는 `ResultActions`의 Kotlin dsl 버전입니다. dsl 답게 더 간결하고 좋은 가독성을 제공해줍니다.

post 요청의 경우 get 요청과는 다르게 필드명을 가져올 필요가 없었습니다. 그래서 바로 요청 객체를 json으로 만들어 주는 식으로 어렵지 않게 구현할 수 있었습니다.

```bash
fun <T> MockMvc.postWithBody(uri: String, requestBody: T, expectedDto: T): ResultActionsDsl{
    return this.post(uri){
        contentType = APPLICATION_JSON
        content = toJson(requestBody)
    }.asyncDispatch().andExpect {
        status { isOk() }
        content {
            json(toJson(expectedDto))
        }
    }
}
```

위 변경 사항을 적용한 코드 상황입니다.

```kotlin
      	val uri = "${baseUri}/psamount"
        val response = mockMvc.getWithParams(uri, requestParams, expectedDto)

        response.andDo {
            handle(
                MockMvcRestDocumentation.document(
                    uri,
                    queryParameters(
                        parameterWithName("overseasExchangeCode").description("거래소 코드"),
                        parameterWithName("overseasOrderUnitPrice").description("주당 가격"),
                        parameterWithName("itemCode").description("종목 코드"),
                        parameterWithName("email").description("사용자 이메일")
                    ),
                )
            )
        }
```

보기에도 안 좋고, 파라미터를 일일이 써야해서 불편했던 코드가 간결하진 모습이 보이시나요? 이제 GET 요청 시 파라미터를 직접 작성해야 하는 귀찮음이 줄고, 작은 오타로 에러를 일으킬 걱정도 없어졌습니다.

그렇지만 아직 Rest Docs 쪽이 남았습니다.

### Rest Docs 개선

Rest Docs 개선의 경우 토스에서 굉장히 자세히 다루고 있고, 코드도 제공을 해주셔서 해당 부분을 그대로 적용하기로 했습니다. 물론 저가 새로운 방식을 고안할 수 있을지도 모르지만, ‘바퀴를 다시 발명하지 마라’는 격언도 있잖아요?

토스에서는 infix 함수와 코틀린 DSL을 활용해서 Rest Docs에서 필요한 `DocsFieldType`과 `FieldDescriptor` 선언 및 작성을 간소화 하고 있었습니다. 자세한 내용은 [해당 글](https://toss.tech/article/kotlin-dsl-restdocs)을 참고하시면 좋을 것 같습니다. 좋은 경험을 글로 나눠주시는 토스 개발자 분께 감사드립니다.

먼저 Rest Docs 생성을 위한 확장 함수를 아래와 같이 구현했습니다.

```kotlin
fun ResultActionsDsl.makeDocument(
    identifier:String,
    parameters: List<ParameterDescriptor>
): ResultActionsDsl {
    return this.andExpect {
        status { is2xxSuccessful() }
    }.andDo {
        handle(
            MockMvcRestDocumentation.document(
                identifier,
                queryParameters(
                    parameters
                )
            )
        )
    }
}

fun setParameters(vararg params: Pair<String, String>): List<ParameterDescriptor> {
    return params.map { (name, description) ->
        parameterWithName(name).description(description) }
}
```

그리고 토스의 방식과 위 함수를 활용하면 아래와 같이 코드가 개선됩니다.

```kotlin
        response.makeDocument(
            uri,
            setParameters(
                "overseasExchangeCode" means "거래소 코드",
                "overseasOrderUnitPrice" means "주당 가격",
                "itemCode" means "종목 코드",
                "email" means "사용자 이메일"
            )
       )


```

확실히 이전에 비해 가독성이 향상 된 것이 느껴집니다.

## 4. 결과

위 개선이 모두 포함된 최종 코드는 아래와 같습니다.

```kotlin
        val uri = "${baseUri}/psamount"
        val response = mockMvc.getWithParams(uri, requestParams, expectedDto)

        response.makeDocument(
            uri,
            setParameters(
                "overseasExchangeCode" means "거래소 코드",
                "overseasOrderUnitPrice" means "주당 가격",
                "itemCode" means "종목 코드",
                "email" means "사용자 이메일"
            )
       )
```

최초 코드와 비교했을 때 가독성과 재사용성이 크게 향상되었으며, 코드가 직관적이어서 활용과 수정이 용이해졌습니다.
이로 인해 테스트 작성에 소요되는 시간과 불편함이 현저히 줄어들었습니다. 또한 테스트에 익숙하지 않은 팀원도 코드 작성을 어렵지 않게 진행할 수 있었습니다.

특히, 이번 변경 중 GET 요청 시 파라미터를 일일이 작성하지 않아도 되는 점이 팀원이 코드를 작성할 때의 불편함을 크게 줄여주어 많은 도움이 되었다고 합니다

이러한 긍정적인 피드백을 바탕으로, `makeDocument`의 매개변수 부분도 개선하여 저희가 일일이 입력하지 않아도 되도록 할 계획입니다.
이에 대한 자세한 내용은 다음 글에서 공유하겠습니다

긴 글 읽어주셔서 감사합니다.

## 참고 자료

[Kotlin으로 DSL 만들기: 반복적이고 지루한 REST Docs 벗어나기](https://toss.tech/article/kotlin-dsl-restdocs)
