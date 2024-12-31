---
layout: post
title: 비동기 컨트롤러 테스트 인증 문제 해결
subtitle: mockMvc -> WebTestClient 마이그레이션하기
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

현재 컨트롤러 테스트에서 `mockMvc`를 활용하여 테스트를 진행하고 있습니다. 프로젝트는 코루틴을 사용한 비동기 프로그래밍으로 구성되어 있으며, 그동안 `mockMvc`의 `asyncDispatch`를 통해 원활하게 동작해왔습니다.

하지만 JWT 인증을 위해 Spring Security를 적용 후 테스트 코드에서 새로운 문제가 발생했습니다. Security 인증이 의도한 대로 동작하지 않았던 것인데요.

이 글에서는 인증 정보를 포함하는 과정에서 마주한 문제와 이를 해결한 방법을 소개하겠습니다. 또 해결 과정에서 `mockMvc` 대신 `webTestClient`로 마이그레이션해야 했는데, 그 이유에 대해서도 설명드리겠습니다.

## 1. 문제 정의 및 동기

프로젝트에 JWT 인증을 위해 Security를 추가한 이후 테스트 코드를 수정해야 했습니다.

현재 `mockMvc`에는 security 관련 설정이 추가되어 있지 않아, 테스트 실행 시 `authentication`이 null로 나오는 문제가 있었기 때문입니다.

그래서 아래와 같이 설정을 추가했습니다.

```kotlin
    return mockMvcBuilders
        .webAppContextSetup(webApplicationContext)
        .apply<DefaultmockMvcBuilder>(
            mockMvcRestDocumentation.documentationConfiguration(restDocumentation)
            .operationPreprocessors()
            .withRequestDefaults(Preprocessors.prettyPrint())
            .withResponseDefaults(Preprocessors.prettyPrint()))
        .apply<DefaultmockMvcBuilder>(springSecurity()) // 추가된 부분
        .build()
```

그리고

```kotlin
fun authUser(): RequestPostProcessor {
    return user("test@naver.com").password("1111").roles("USER").authorities()
}

fun <T> mockMvc.postWithBody(uri: String, requestBody: T, expectedDto: T): ResultActionsDsl{
    return this.post(uri){
        with(authUser()) // 추가된 부분
        ...
    }
}
```

와 같이 인증된 사용자 정보를 요청에 추가했습니다.

위처럼 수정한 이후 코드가 정상 동작할 것이라고 기대했지만, 실제로는 새로운 에러가 저를 반겼습니다.

```kotlin
Async not started
java.lang.AssertionError: Async not started
```

지금까지는 비동기 요청도 `mockMvc`로 잘 처리했었어서, 처음 `async not start` 즉, 비동기 자체가 시작되지 않았다는 에러가 나왔을 때 적잖히 당황스러웠습니다.

그래서 먼저 이 에러의 원인을 고민해봤는데요. 확실치는 않지만 아래의 이유로 추정했습니다.

1. 지금 프로젝트에 적용 중인 Security는 동기적 방식의 `SecurityFilterChain`이 아닌 비동기 방식을 지원하는 `SecurityWebFilterChain`이다.
2. 현재 `mockMvc`에 적용한 security는 동기적 방식의 `SecurityFilterChain`이다.

→ 이는 `mockMvc`가 동기적 security를 적용한다는 뜻인데, 우리는 비동기적 Security chain이므로 비동기적 인증 절차가 실행이 안되어 오류가 발생했을 것이다.

추정한 원인이 맞다면 위 문제를 어떻게 해결할 수 있을까요?

## 2. 해결 전략 수립

해결 방법에 대해 고민해본 결과, `mockMvc`가 동기적 프로그래밍에 최적화되어 있어 문제가 발생했다면, 비동기 프로그래밍을 지원하는 테스트 객체를 사용하면 된다는 결론을 내렸습니다.

이에 따라 `webTestClient`를 도입하기로 결정했습니다.

`webTestClient`는 Spring WebFlux의 일부로, 비동기적이고 논블로킹 방식으로 HTTP 요청을 수행할 수 있는 클라이언트입니다. `mockMvc`와는 달리 별다른 설정이 없어도 비동기 요청을 잘 처리해줍니다.

동시에 `SecurityWebFilterChain`에서 인증이 정상적으로 이루어질 수 있도록, 토큰 인증 절차를 Test용으로 따로 만들기로 했습니다. 그리고 검증을 모킹하여 인증을 통과할 수 있도록 하자고 계획했습니다..

## 3. 해결 과정

먼저 `SecurityWebFilterChain`을 테스트용으로 따로 작성했습니다.

```kotlin
@EnableWebFluxSecurity
@EnableReactiveMethodSecurity
@TestConfiguration
@ComponentScan(basePackages = ["com.knu.mockin.security"])
class SecurityTestConfig {
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    fun springSecurityFilterChainTest(
        converter: JwtServerAuthenticationConverter,
        http: ServerHttpSecurity,
        authManager: JwtAuthenticationManager
    ): SecurityWebFilterChain {
        val filter = AuthenticationWebFilter(authManager)
        filter.setServerAuthenticationConverter(converter)

        http
            .authorizeExchange { authorize ->
                authorize
                    .pathMatchers(HttpMethod.POST, "/auth/**").permitAll()
                    .pathMatchers("/docs/**", "/health").permitAll()
                    .anyExchange().authenticated()
            }
            .addFilterAt(filter, SecurityWebFiltersOrder.AUTHENTICATION)
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .csrf { it.disable() }

        return http.build()
    }
}

```

`@TestConfiguration`으로 테스트 설정임을 표시하고, `ComponentScan`으로 해당 패키지가 Spring context에서 빈으로 등록하는 데에 문제 없도록 했습니다.

이와 같이 한 이유는, 메인의 Security 설정과 분리하는 것이 테스트 안정성을 높이는 데 도움이 된다고 판단했기 때문입니다. 그리고 테스트에만 필요한 설정이 있을 경우 해당 부분이 메인 코드에 영향을 주지 않길 바랐습니다.

위 설정을 활용하기 위해 모든 컨트롤러 테스트에 아래 어노테이션을 추가했습니다.

```kotlin
@WebFluxTest(controllers = [TradingController::class])
@Import(SecurityTestConfig::class)
```

또한 JWT 인증을 모킹하기 위해 `JwtUtil`을 `@MockkBean`으로 등록하였으며, 인증 절차는 항상 성공하도록 설정했습니다.

```kotlin
    @MockkBean
    val jwtUtil: JwtUtil = mockk<JwtUtil>(),
    ...

        beforeTest {
        webTestClient = buildWebTestClient(context, restDocumentation)
        restDocumentation.beforeTest(TradingControllerTest::class.java, it.name.testName)

        val user = readJsonFile("setting", "user.json") toDto User::class.java
        coEvery { userRepository.findByEmail(user.email) } returns Mono.just(user)
        coEvery { jwtUtil.getUsername(any()) } returns user.email
        coEvery { jwtUtil.isValid(any(), any()) } returns true
    }
```

위와 같이 인증 절차에 대한 모킹이 끝났으니, `mockMvc`에서 `webTestClient`로 마이그레이션하는 일만 남았습니다. 처음에 이 일을 시작할 당시 바꿔야할 코드가 너무 많을까봐 걱정했었는데, 생각보다 변화는 많지 않았습니다.

가장 먼저 바꿨던 것은 `mockMvc`를 빌드하던 함수를 `webTestClient`로 빌드하도록 바꾼 것입니다.

```kotlin
fun buildWebTestClient(
    context: ApplicationContext,
    restDocumentation: ManualRestDocumentation
): WebTestClient{
    return WebTestClient
        .bindToApplicationContext(context)
        .apply(SecurityMockServerConfigurers.springSecurity())
        .configureClient()
        .filter(WebTestClientRestDocumentation
            .documentationConfiguration(restDocumentation)
            .operationPreprocessors()
            .withRequestDefaults(Preprocessors.prettyPrint())
            .withResponseDefaults(Preprocessors.prettyPrint()))
        .build()
}
```

그리고 get, post 요청 등 테스트를 진행하는 확장함수를 `webTestClient`에 맞도록 변경했습니다.

```kotlin
fun <T: Any> WebTestClient.getWithParams(uri: String, requestParams: T, expectedDto: T): BodyContentSpec{
    val targetUri = buildUriString(uri, requestParams)

    return this.get()
        .uri("/$targetUri")
        .accept(MediaType.APPLICATION_JSON)
        .header("Authorization", authHeader)
        .exchange()
        .expectStatus()
        .isOk
        .expectBody()
        .json(toJson(expectedDto))
}

fun <T: Any> WebTestClient.postWithBody(uri: String, requestBody: T, expectedDto: T): BodyContentSpec{
    return this.post()
        .uri("/$uri")
        .contentType(MediaType.APPLICATION_JSON)
        .accept(MediaType.APPLICATION_JSON)
        .header("Authorization", authHeader)
        .bodyValue(requestBody)
        .exchange()
        .expectStatus()
        .isOk
        .expectBody()
        .json(toJson(expectedDto))
}
```

`mockMvc`의 경우 `ResultActionsDsl`을 반환해야 했는데, `webTestClient`는 `BodyContentSpec`을 반환해야 한다는 점과, 설정 방식이 살짝 다른 점 말고는 크게 다르지 않았습니다.

해당 내용은 [공식 문서](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)를 참고하여 진행했습니다.

그리고 Rest Docs의 경우 아래와 같이

```kotlin

// 수정 이전
fun ResultActionsDsl.makeDocument(
    identifier:String,
    parameters: List<ParameterDescriptor>,
    responseBody: List<FieldDescriptor>
): ResultActionsDsl {
    return this.andDo {
        handle(
            `mockMvc`RestDocumentation.document(
                identifier,
                queryParameters(parameters),
                responseFields(responseBody)
            )
        )
    }
}
```

```kotlin
 // 수정 후
 fun BodyContentSpec.makeDocument(
    identifier:String,
    parameters: List<ParameterDescriptor>,
    responseBody: List<FieldDescriptor>,
): BodyContentSpec {
    return this.consumeWith(document(
        identifier,
        RequestDocumentation.queryParameters(parameters),
        PayloadDocumentation.responseFields(responseBody)
    ))
}
```

정말 큰 코드 변화 없이 마이그레이션을 마칠 수 있었습니다.

위처럼 수정하자 테스트 코드가 다행히 정상 동작함을 볼 수 있었습니다.

## 4. 결과

이렇게 Reactive Spring Security 적용 이후 발생한 문제를 적절한 모킹과 webTestClient를 통해 해결해봤습니다.

늘 동기 프로그래밍만 고집하다, 비동기 프로그래밍으로 진행하니 생각치 못한 곳에서 오류가 발생하는 걸 많이 보는 것 같습니다. 그만큼 저가 아직 모르는 것이 많고, 배워야할 것도 산처럼 쌓여 있다는 뜻이겠죠.

동기 부여를 받으며, 오늘은 여기까지 마치도록 하겠습니다. 다음에는 더 좋은 경험과 글로 찾아오겠습니다.

긴 글 읽어주셔서 감사합니다!

## 참고 자료

[Spring-WebTestClient](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)
