---
layout: post
title: 테스트 코드 추가 개선하기
subtitle: json 파일로 dto 초기화하기
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

[이전 글](./2024-12-13-mockin_rest-docs2.md)에서 Kotlin DSL을 활용하여 Spring Rest Docs를 위한 코드를 쉽고 직관적으로 변경했었습니다.

하지만 여전히 아쉬움이 남았었던 부분이 있었는데요.

바로 컨트롤러 요청을 위한 요청 dto와 응답 dto를 정의하는 부분과 Rest Docs를 작성하는 방법이었습니다.

이번 글에서는 위 아쉬움을 채우기 위해 어떤 아이디어를 활용했는지 그리고 그 결과는 어떤 지 말씀드리고자 합니다.

## 1. 문제 정의 및 동기

```kotlin
    "GET /trading/ccnl" {
        val uri = "${baseUri}/ccnl"
        val requestParams = CCNLRequestParameterDto(
            orderStartDate = "20241010",
            orderEndDate = "20241015",
            email = "test@naver.com"
        )
        val expectedDto = KISCCNLResponseDto(
            successFailureStatus = "0",
            messageCode = "test",
            responseMessage = "test success!",
            continuousQuerySearchCondition200 = "",
            continuousQueryKey200 = "listOf()",
            output = listOf()
        )

        coEvery { tradingService.getCCNL(any())} returns expectedDto
        val response = mockMvc.getWithParams(uri, requestParams, expectedDto)

        response.makeDocument(
            uri,
            parameters(
                "orderStartDate" means "주문시작일자",
                "orderEndDate" means "주문종료일자",
                "email" means "이메일"
            ),
            responseBody(
                "rt_cd" type STRING means "성공 여부",
                "msg_cd" type STRING means "응답 코드",
                "msg1" type STRING means "응답 메세지",
                "ctx_area_fk200" type STRING means "연속조회검색조건200",
                "ctx_area_nk200" type STRING means "연속조회키200",
                "output" type ARRAY isOptional true means "응답상세3"
            )
        )
    }
```

위는 Spring Rest Docs를 위해 작성한 컨트롤러 테스트 코드입니다.

훌륭하게 동작하지만, dto 생성과 `makeDocument`를 위해 파라미터 값들을 손으로 일일이 작성해야 하는 큰 번거로움이 있었습니다.

게다가 dto의 필드가 충분히 많은 경우(약 20개 정도) 줄을 끝없이 내려야 할 정도로 가독성이 좋지 않았습니다. 수정하기 힘든 건 말할 것도 없었구요.

위 문제를 해결할 경우 테스트 코드 가독성이 향상될 뿐만 아니라, dto 객체 수정이 쉬워지고, 재사용성이 높아질 것으로 판단되어 해결하기로 했습니다.

## 2. 해결 전략 수립

이번 개선의 아이디어는 카카오 테크 블로그의 [한 글](https://tech.kakaopay.com/post/given-test-code/)을 읽다 우연히 접하게 되었습니다.

이 글을 쓰신 분도 저와 비슷한 고민을 하신 것 같았습니다. 그리고 본인의 해결책도 알려주셨죠. 이와 같은 좋은 아이디어를 글로 써주셔서 정말 감사하다는 말씀을 드리고 싶습니다.

아무튼 위 글에 따라 저희에게 필요한 객체들을 json으로 정의하여 읽어와 활용하는 방식을 사용하기로 했습니다.

## 3. 해결 과정

가장 먼저 해야했던 일은 json을 읽어와 원하는 객체로 변환하는 것이었습니다.

따라서 각 테스트마다 json 작성이 필수였는데, 이때 저는 추후 테스트 작성에 유리했으면 했습니다.

그래서 json 파일의 위치를 해당 컨트롤러 테스트에 해당하는 uri 위치로 정의했습니다. 예를 들면, 매핑 uri가 `/trading/ccnl`이라면, `/resources/trading/ccnl`에 해당 json을 두는 것이죠.

그리고 테스트 추가가 용이하도록 모든 json 파일의 이름을 통일했습니다. 즉, 요청 dto는 requestDto.json으로 응답 dto는 responseDto.json으로 정의하는 식입니다.

위와 같이 정의하니 파일 이름이 같아도, 폴더 위치가 어떤 api를 테스트하는 것인지 표시해주기 때문에 헷갈릴 염려가 적었습니다. 또한 테스트 복사 붙여넣기 시 파일 이름에서 수정할 부분이 없어서 굉장히 편했죠.

이후 저는 아래와 같이 json을 읽어오는 코드를 작성했습니다.

```kotlin
    fun readjsonFile(dirPath: String, fileName: String): String {
        val resource = ClassPathResource("json/$dirPath/$fileName") // test 폴더 하위 resources
        return Files.readString(resource.file.toPath())
    }
```

여기서 `ClassPathResource`는 Spring 프레임워크에서 제공하는 클래스로, json 등의 리소스를 어플리케이션의 클래스 패스로부터 찾을 때 활용할 수 있습니다.

이제 json을 성공적으로 읽어왔으니, 원하는 Dto로 변환만 해주면 충분했습니다.  
저는 infix 함수가 직관적으로 쉽게 표현하는 듯해서 infix 함수로 작성했습니다.

```kotlin
infix fun <T> String.toDto(dto: Class<T>): T {
    val objectMapper = ObjectMapper()
    return objectMapper.readValue(this, dto)
}
```

위 함수는 json 문자열과 함께 원하는 클래스 타입을 넘겨주면, 해당 클래스로 변환하여 반환해줍니다.

두 함수의 추가로 코드가 어떻게 개선됐을까요?

```kotlin
        // 변경 이전
        val requestParams = CCNLRequestParameterDto(
            orderStartDate = "20241010",
            orderEndDate = "20241015",
            email = "test@naver.com"
        )
        val expectedDto = KISCCNLResponseDto(
            successFailureStatus = "0",
            messageCode = "test",
            responseMessage = "test success!",
            continuousQuerySearchCondition200 = "",
            continuousQueryKey200 = "listOf()",
            output = listOf()
        )
```

```kotlin
	    // 변경 이후
    	val requestParams = readjsonFile(uri, "requestDto.json") toDto CCNLRequestParameterDto::class.java
        val expectedDto = readjsonFile(uri, "responseDto.json") toDto KISCCNLResponseDto::class.java

```

dto의 필드 수만큼 길었던 코드가 단 한 줄로 개선됐습니다!

그리고 특정 dto의 필드를 바꾸어 테스트할 때에도 json만 수정하면 되므로 향후 유지보수 및 활용성도 훌륭하다는 생각이 들었습니다.

위와 같이 수정하고 나니 Rest Docs 작성을 위한 부분도 json을 활용해 개선할 수 있을 것 같았습니다.  
현재 `makeDocument`에서 요청, 응답 필드 작성 시 아래와 같은 형식을 가집니다.

```kotlin
// 파라미터의 경우
"orderStartDate" means "주문시작일자",
// 바디인 경우
"rt_cd" type STRING means "성공 여부",
```

현재 api에 활용되는 거의 모든 필드는 STRING 타입만을 가지기 때문에, 충분히 json을 통해 해당 부분을 분리할 수 있을 것 같았습니다.

그래서 requestDtoDescription.json, responseDtoDescription.json을 각각 생성하고,
`{“필드 이름”: “설명”}`과 같은 형식으로 통일했습니다.

그리고 이를 읽어와 `makeDocument`의 인자로 넘겨주도록 구현했습니다.  
아래는 해당 부분을 구현한 함수입니다.

```kotlin
fun String.toPairs(): List<Pair<String, String>> {
        val jsonNode: jsonNode = objectMapper.readTree(this)
        return jsonNode.fieldNames().asSequence().map { fieldName ->
            fieldName to jsonNode[fieldName].asText()
        }.toList()
    }

```

파라미터의 경우 `Pair<String, String>`으로 docs 작성이 가능하여 어렵지 않게 구현했습니다.

그러나 바디 형식의 경우 타입이 반드시 명시가 되어야 했기 때문에 살짝 더 복잡하게 구현해야만 했습니다.

```kotlin
fun String.toBody(): List<Pair<Field, String>> {
        val jsonNode: jsonNode = objectMapper.readTree(this)
        val fieldDescriptions = mutableListOf<Pair<Field, String>>()

        jsonNode.fieldNames().forEach { fieldName ->
            if (fieldName.contains("output") || fieldName.contains("outblock")) {
                fieldDescriptions.addAll(jsonNode[fieldName].processOutput(fieldName))
            }else{
                if(fieldName in listOf("expire_in")){
                    fieldDescriptions.add(fieldName type NUMBER means jsonNode[fieldName].asText())
                }
                else fieldDescriptions.add(fieldName type STRING means jsonNode[fieldName].asText())
            }
        }

        return fieldDescriptions
    }

 private fun jsonNode?.processOutput(name: String): List<Pair<Field, String>> {
        val fieldDescriptions = mutableListOf<Pair<Field, String>>()
        if (this != null) {
            if (this.isArray) {
                fieldDescriptions.add(name type ARRAY means "$name 상세")
                val firstItem = this.firstOrNull()
                firstItem?.fieldNames()?.forEach { fieldName ->
                    fieldDescriptions.add("$name[0].$fieldName" type STRING means firstItem[fieldName].asText())
                }
            } else {
                fieldDescriptions.add(name type OBJECT means "$name 상세")
                this.fieldNames().forEach { fieldName ->
                    fieldDescriptions.add("$name.$fieldName" type STRING means this[fieldName].asText())
                }
            }
        }
        return fieldDescriptions
    }
```

응답 필드 대부분이 STRING 형식을 갖고 있지만, object나 array 타입의 필드를 반드시 한 개 갖고 있었습니다. 이에 따라 이름에 output이 포함한 경우 해당 필드의 타입에 따라 적절하게 처리하도록 `processOutput`을 따로 구현했습니다.

또 `expire_in` 필드만 NUMBER 타입이었으므로 해당 부분만 따로 처리하도록 분기를 뒀습니다.

나머지의 경우 전부 STRING 타입으로 처리했습니다.  
그리고 위에서 만든 List를 Rest Docs에서 적절히 활용할 수 있도록 함수를 추가했습니다.

```kotlin
// get 요청인 경우
fun parameters(params: List<Pair<String, String>>): List<ParameterDescriptor> {
    return params.map { (name, description) ->
        RequestDocumentation.parameterWithName(name).description(description) }
}

// post 요청일 경우
fun requestBody(bodies: List<Pair<Field, String>>): List<FieldDescriptor>{
    return bodies.map{ (field, description) ->
        field.descriptor.description(description)
    }
}

// 응답 필드
fun responseBody(bodies: List<Pair<Field, String>>): List<FieldDescriptor>{
    return bodies.map{ (field, description) ->
        field.descriptor.description(description)
    }
}
```

위 코드에서 requestBody와 responseBody의 내부 구현은 같지만, `makeDocument`에서 활용 시 이름으로 해당 부분이 요청인지, 응답인지 직관적으로 알 수 있도록 하기 위해 따로 함수를 두었습니다.

위 변화를 통해 기존 코드가 어떻게 개선됐을까요?

```kotlin
        // 기존 코드
        response.makeDocument(
            uri,
            parameters(
                "orderStartDate" means "주문시작일자",
                "orderEndDate" means "주문종료일자",
                "email" means "이메일"
            ),
            responseBody(
                "rt_cd" type STRING means "성공 여부",
                "msg_cd" type STRING means "응답 코드",
                "msg1" type STRING means "응답 메세지",
                "ctx_area_fk200" type STRING means "연속조회검색조건200",
                "ctx_area_nk200" type STRING means "연속조회키200",
                "output" type ARRAY isOptional true means "응답상세3"
            )
        )
```

```kotlin
        // 개선 코드
        response.makeDocument(
            uri,
            parameters(readjsonFile(uri, "requestDtoDescription.json").toPairs()),
            responseBody(readjsonFile(uri, "responseDtoDescription.json").toBody())
        )
```

확실히 코드가 깔끔해진 것이 체감되지 않나요?  
필드명 및 설명 변경이 필요한 경우 해당 uri 위치의 json만 바꾸면 되므로, 이전에 비해 수정도 쉬워졌습니다.

## 4. 결과

이번 글을 통해 개선된 코드 전체는 아래와 같습니다.

```kotlin
    "GET /trading/ccnl" {
        val uri = "${baseUri}/ccnl"
        val requestParams = readjsonFile(uri, "requestDto.json") toDto CCNLRequestParameterDto::class.java
        val expectedDto = readjsonFile(uri, "responseDto.json") toDto KISCCNLResponseDto::class.java

        coEvery { tradingService.getCCNL(any()) } returns expectedDto

        val response = mockMvc.getWithParams(uri, requestParams, expectedDto)

        response.makeDocument(
            uri,
            parameters(readjsonFile(uri, "requestDtoDescription.json").toPairs()),
            responseBody(readjsonFile(uri, "responseDtoDescription.json").toBody())
        )
    }
```

이번 개선으로 dto 선언 및 Rest Docs 작성을 코드로 직접 쓰는 대신 json 파일로 작성하게 되었고, 덕분에 전반적인 가독성 및 테스트 코드 작성이 훨씬 쉬워졌습니다.

특히 dto 필드가 많은 테스트 코드에서 체감이 훨씬 컸습니다. 스크롤을 한참 내리던 걸 조금만 내려도 원하는 부분을 쉽게 찾을 수 있었기 때문입니다.

다만 저처럼 Rest Docs 작성을 단순화한 방법을 적용할 때 유의해야 할 점이 있습니다.  
저가 구현한 함수는 테스트 코드를 빠르게 작성할 수 있는 장점이 있지만, 문서에 포함될 설명을 충분히 구체적으로 표현하기 어려운 경우가 많습니다.  
즉, 테스트 코드 작성의 속도와 Rest Docs의 내용 구체성 사이에서 트레이드오프가 발생하는 것입니다.

그리고 위처럼 Rest Docs 작성을 단순화하는 접근이 가능했던 주요한 이유는 현재 API에서 대부분의 필드가 String 타입이라는 점입니다.

그러나 다양한 자료형이 존재하거나, 상세한 설명이 필요할 경우에는 json으로 정의하는 방법보다 코드가 길어지는 것을 감수하고 각 필드를 일일이 작성하는 방안을 고려하는 게 좋을 거 같습니다.

혹은 json 작성 시 rest docs 부분만 변경하여 json 객체를 담는 식으로 개선해볼 수도 있을 것 같기도 합니다.

```json
{
  "필드명": "설명"
}
```

이 아니라

```json
{
  "필드명": {
    "설명": "예시1",
    "또 다른 필드": "예시2"
  }
}
```

형식으로 작성하고, 해당 필드에 대해 Rest Docs를 작성하도록 함수를 구현하는 것이죠.  
이 부분은 추후에 여유가 된다면 시도해보도록 하겠습니다.

긴 글 읽어주셔서 감사합니다.

## 참고 자료

[실무에서 적용하는 테스트 코드 작성 방법과 노하우 Part 3: Given 지옥에서 벗어나기 - 객체 기반 데이터 셋업의 한계](https://tech.kakaopay.com/post/given-test-code/)
