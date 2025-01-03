---
layout: post
title: 비동기 처리의 시간 효율성 탐구
subtitle: Redis 삭제 로직을 비동기로 처리하기
gh-repo: Richter3766/Richter.github.io
tags: [project, Mockin]
comments: true
mathjax: true
author: HyeonSoo
---

## 개요

이번 자율 프로젝트에서 동일한 API 요청의 응답 시간을 줄이기 위해 Redis를 활용하여 캐시를 적용했습니다. Redis 키의 형식은 ‘이메일-API-키1-키2’입니다.

그리고 특정 API 호출 시 캐시 값이 오래되어 삭제가 필요했습니다. 이를 위해 keys() 메서드를 사용하여 키 집합을 가져오고, 와일드 카드를 활용해 해당 값을 삭제하고 있습니다.

이때 키가 많아지면 삭제 시 걸리는 시간이 길어질 것을 우려해, 코루틴을 활용해 비동기적으로 삭제를 진행하도록 구현했는데요.

문득 이렇게 Redis 삭제를 비동기로 처리했을 때 속도 향상이 어느정도나 될지 궁금해졌습니다.

그래서 이번 글에서는 간단한 테스트를 통해 속도 차이를 직접 측정한 과정과 결과를 탐구한 과정을 알려드릴려고 합니다.

## 1. 테스트할 코드

```kotlin
    // Redis 삭제 함수
    fun deleteByPattern(pattern: String){
        val keys = redisTemplate.keys(pattern)
        keys.forEach { key ->
            deleteData(key)
        }
    }
```

위는 특정 문자열 패턴을 받으면, 해당 패턴을 포함하고 있는 모든 Redis key set을 찾아 하나씩 삭제하는 간단한 함수입니다.

```kotlin
// 테스트를 진행할 함수
suspend fun postOrder(
        bodyDto: OrderRequestBodyDto,
        email: String
    ):KISOrderResponseDto {
        val userWithMockKey = getUser(email)

        val headerDto = createHeader(userWithMockKey, bodyDto.transactionId)
        val kisOrderRequestBodyDto = bodyDto.asDomain(userWithMockKey.accountNumber)

        RedisUtil.deleteByPattern(email tag "getNCCS" tag "*")
        RedisUtil.deleteByPattern(email tag "getCCNL" tag "*")
        RedisUtil.deleteByPattern(email tag "getPresentBalance" tag "*")

        return kisTradingClient
            .postOrder(headerDto, kisOrderRequestBodyDto)
            .awaitSingle()
    }
```

위 코드는 Redis 삭제 로직이 적용되어 있는 함수 중 하나입니다. 여기서는 삭제 로직이 동기적으로 하나씩 진행되고 있습니다.

## 2. 테스트 진행

### Dispatcher.IO 스레드의 효율성

먼저 저는 코루틴에서 제공하는 Dispatcher.IO 스레드가 얼마나 시간 효율적인지 알고 싶었습니다.

그래서 아래와 같이 코드를 변경했습니다.

```kotlin
    // 변경된 코드
    suspend fun deleteByPattern(pattern: String) {
        withContext(Dispatchers.IO) {
            val keys = redisTemplate.keys(pattern)
            keys.forEach { key ->
                deleteData(key)
            }
        }
    }
```

그리고 위와 같이 수정했을 때와 그렇지 않은 때 deleteByPattern의 동작 속도에서 차이가 나는 지 테스트해보기로 했습니다.

```kotlin
    // 테스트 코드 세팅
    val user = readJsonFile("setting", "userWithKeyPair.json") toDto UserWithKeyPair::class.java
    val pattern = "test@naver.com-*"

    beforeTest {
        RedisUtil.init(redisTemplate)
        storeDataFromJson("setting/redis", "input.json", 60L)
        every { userRepository.findByEmailWithMockKey(user.email) } returns Mono.just(user)
    }

    afterTest {
        RedisUtil.deleteByPattern(pattern)
    }
```

위처럼 테스트 환경을 세팅했는데요. 유의미한 속도 차이를 보기 위해, Redis에 100개의 데이터를 저장하도록 input.json 파일을 생성했습니다. 여기서 모든 데이터는 ‘test@naver.com’를 prefix로 가집니다.

그리고 아래와 같이 속도를 측정하기 위한 테스트 코드를 작성했습니다.

```kotlin
    // Redis 삭제 테스트 코드
    Context("Redis에서 삭제 로직 실행 시 시간 측정"){
        Given("먼저 시작 시간을 측정하고"){
            val startTime = System.currentTimeMillis()

            When("Redis에서 삭제 로직을 실행한 후"){
                RedisUtil.deleteByPattern(pattern)

                Then("종료 시간을 측정하고, 출력한다."){
                    val endTime = System.currentTimeMillis()
                    val duration = endTime - startTime

                    println("삭제 시간: ${duration}ms")
                }
            }
        }
    }
```

위 코드의 실행 결과는 어떻게 나왔을까요?

- 수정 전

![Redis1_전](https://github.com/user-attachments/assets/0353b3f5-14b4-43db-af62-342a8167dcc4)

- 수정 후

![Redis1_후](https://github.com/user-attachments/assets/73239244-795a-4f16-9ee8-fc92345903db)

네. 생각보다 큰 차이 없었습니다. 혹시 몰라 여러번 테스트해봤지만, 위 시간과 똑같거나 크게 다르지 않았습니다.

왜 그럴까 하는 의문을 품고 검색을 해봤더니, Redis가 동작하는 방식 때문같습니다. 기본적으로 Redis는 단일 스레드로 클라이언트의 요청을 처리합니다. 그러니 삭제 함수를 비동기적으로 변경해도 Redis에서는 단일 스레드로 순차 처리를 하기 때문에, 차이가 나지 않는 것이었죠.

첫 테스트는 실망스러웠지만, 아직 끝이 아닙니다.

### 삭제 로직, 비동기 병렬 실행의 효율성

삭제 로직이 적용된 곳은 연달아 세 번의 삭제가 일어나므로, 이 부분을 코루틴을 통해 비동기로 동작하도록 하면 어떤 차이가 있을 지 보기로 했습니다.

데이터는 같은 input.json을 활용하고, 삭제 로직이 있는 부분을 launch를 통해 실행을 하도록 변경했습니다.

```kotlin
        ...
        // 바뀐 부분
        CoroutineScope(Dispatchers.IO).launch {
            RedisUtil.deleteByPattern(email tag "getNCCS" tag "*")
            RedisUtil.deleteByPattern(email tag "getCCNL" tag "*")
            RedisUtil.deleteByPattern(email tag "getPresentBalance" tag "*")
        }
        ...
```

deleteByPattern에서 Dispathcer.IO를 활용하고 있으므로 Scope로 해당 정보를 알려줬습니다.

그리고 아래와 같이 기존 Service Test에 있는 코드를 그대로 들고와서 Redis를 모킹하는 대신, 실제 Redis를 활용하도록 바꾸고 시간 측정 코드를 추가했습니다.

```kotlin
// 테스트 코드
val baseUri = "/trading"
    Context("postOrder 함수의 경우 Redis를 실제로 활용할 때"){
        val tradingService = TradingService(kisTradingClient, userRepository)
        val uri = "$baseUri/order"

        Given("요청이 들어오면"){
            val startTime = System.currentTimeMillis()

            val bodyDto = readJsonFile(uri, "requestDto.json") toDto OrderRequestBodyDto::class.java
            val requestDto = bodyDto.asDomain(user.accountNumber)
            val headerDto = createHeader(user, bodyDto.transactionId)
            val expectedDto = readJsonFile(uri, "responseDto.json") toDto KISOrderResponseDto::class.java

            When("KIS API로 요청을 보낸 후"){
                every { kisTradingClient.postOrder(headerDto, requestDto) } returns Mono.just(expectedDto)

                Then("redis 캐시를 비우고, 응답 DTO를 정상적으로 받아야 한다."){
                    var result = tradingService.postOrder(bodyDto, user.email)
                    val endTime = System.currentTimeMillis()
                    val duration = endTime - startTime

                    println("삭제 시간: ${duration}ms")
                    result shouldBe expectedDto
                }
            }
        }
    }
```

과연 결과는 어떻게 나왔을까요?

- launch 추가 전

![Redis2_전](https://github.com/user-attachments/assets/de780027-4a2e-4702-b747-4b73361ae0c5)

- launch 추가 후

![Redis2_후](https://github.com/user-attachments/assets/83235e9d-d7fe-4d3b-bc4a-969bd304da28)

오 이번엔 이전과 다르게 확실히 시간 차이가 납니다. 여러번 동작해봐도 launch를 추가한 경우가 아닌 경우보다 확실히 빨랐습니다. 그럼 이번처럼 삭제 로직에 비동기 처리를 했을 때 왜 더 빨랐을까요?

먼저 비동기 처리를 안했을 경우 세 개의 삭제 로직이 순차적으로 실행되고, 끝날 때까지 기다리게 됩니다.

‘삭제1 시작 → 삭제1 종료 → 삭제2 시작 → 삭제2 종료 → 삭제3 시작 → 삭제3 종료’

그리고 위 모든 로직이 끝난 후에야 코드 아랫부분을 진행하게 되므로 최종 코드 실행까지 긴 시간이 걸리게 됩니다.

근데 비동기 처리를 했을 경우 세 개의 삭제 로직이 동시에 Redis에 보내집니다.

‘삭제1, 삭제2, 삭제3 시작 → 삭제1 종료 → 삭제2 종료 → 삭제3 종료’

그리고 위 삭제 로직이 끝날 때까지 기다리지 않고 다음 코드를 실행하므로 처음의 경우보다 훨씬 빠르게 최종 코드가 실행됩니다. 이 때문에 비동기로 동작했을 때 시간이 빨랐던 것입니다.

또한 Redis의 경우 단일 스레드로 작업을 처리하긴 하지만, 요청을 미리 받아두면 네트워크 지연 시간도 줄일 수 있으므로 훨씬 효율적으로 보여집니다.

## 3. 결과

이번 글에서는 Redis 삭제를 진행할 때 코루틴의 Dispatcher.IO 스레드와 launch를 활용하여 비동기적으로 처리했을 때, 동기 처리와 비교해 시간 효율성이 얼마나 개선되는지를 테스트한 경험을 적었습니다. 이 과정을 통해 배운 점은 다음과 같습니다.

1. Redis는 단일 스레드로 요청을 처리합니다. 따라서 클라이언트에서 요청을 동시에 보내도, Redis 내부에서는 순차 처리되므로 속도 향상 기대가 어렵습니다.
2. 삭제 로직을 비동기적으로 처리하는 것은 시간 효율성 측면에서 의미있습니다. 이는 삭제 로직이 끝날 때까지 기다리지 않고 다음 로직이 비동기적으로 실행되기 때문입니다.

비동기적인 동작이 시간적으로 유의미한 이유와 그 효과를 직접 확인할 수 있는 테스트여서 흥미롭게 진행했던 것 같습니다.

이번 글은 여기까지 입니다.
읽어주셔서 감사합니다.

## 참고 자료

[Dispatchers.Default vs Dispatchers.IO in kotlin Coroutine](https://medium.com/@appdevinsights/dispatchers-default-vs-dispatchers-io-in-kotlin-coroutine-21a88e2fb41b)
