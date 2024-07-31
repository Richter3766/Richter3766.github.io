---
layout: post
title: 프로젝트 똑똑, Redis 문제 해결
subtitle: LocalDateTime 직렬화 불가 오류
gh-repo: Richter3766/Richter.github.io
tags: [project, knowckknowck]
comments: true
mathjax: true
author: HyeonSoo
---

## 시리즈 소개

이 시리즈는 필자가 대학교에서 진행한 팀프로젝트를 복기하고 개선점을 찾기 위한 것이다.

프로젝트 소개는 아래 링크를 참고하길 바란다. (배포 사이트의 경우 비용 문제로 현재는 내려간 상태이다.)<br>
[현대인을 위한 문해력 향상 서비스, 똑똑](https://github.com/KnowckknowcK)<br>
내가 맡은 부분을 자세히 분석할 예정이다. 시간이 된다면 내가 맡지 않은 부분도 다루고자 한다.

아래는 앞으로 다룰 내용을 개략적으로 정리한 것으로 추후 글을 작성하며 구체화해갈 예정이다.

## 개요

이 글에서는 Redis를 이용해 캐싱을 구현하던 도중 만난 문제를 해결하는 과정을 보여주고자 한다.

## 1. 문제 정의 및 동기

토론방 정보를 불러올 때 성능 개선을 위해 Redis를 활용해 Look-aside 방식으로 캐싱하기로 했다.

Redis에 저장되는 내용은 아래와 같은 DTO가 리스트로 저장된다.

```java
public class MessageResponseDto {
  private Long roomId;
  private Long messageId;
  private String profileImage;
  private String writer;
  private String position;
  private String content;

  private Long likesNum;
  private Long threadNum;
  private LocalDateTime createdTime;
}
```

해당 객체 리스트를 Redis에 저장하기 위해 `RedisTemplate` 을 활용했는데, 아래와 같은 오류가 발생했다.

```java
org.springframework.data.redis.serializer.SerializationException:
Could not write JSON: Java 8 date/time type `java.time.LocalDateTime`
not supported by default: add Module
"com.fasterxml.jackson.datatype:jackson-datatype-jsr310"
to enable handling (through reference chain:
com.knu.KnowcKKnowcK.dto.responsedto.MessageResponseDto["createdTime"])
	at org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer.serialize(GenericJackson2JsonRedisSerializer.java:223)
```

캐싱을 위해선 반드시 위 문제가 해결되어야 했으므로, 찬찬히 문제를 해결해보기로 했다.

## 2. 해결 전략 수립

로그를 봤을 때 가장 먼저 눈에 띄었던 것은 SerializationException과 LocalDateTime이었다.

정확한 원인은 잘 모르겠지만, LocalDateTime을 직렬화하는데 어떤 문제가 생긴 것 같았다.

그래서 이 지점을 중심으로 구글링을 통해 문제 해결 방법을 찾아보기로 했다.

## 3. 해결 과정

문제 해결을 위해 오류의 메인인 듯한

`Java 8 date/time type`java.time.LocalDateTime`not supported by default: add Module`

이 부분을 구글링해보았다.

그리고 나와 같은 문제를 마주한 사람들이 무수히 많았음을 알 수 있었다.

[TIL-23.06.30-레디스-캐시-적용시-직렬화에-대한-에러](https://velog.io/@wonizizi99/TIL-23.06.30-%EB%A0%88%EB%94%94%EC%8A%A4-%EC%BA%90%EC%8B%9C-%EC%A0%81%EC%9A%A9%EC%8B%9C-%EC%A7%81%EB%A0%AC%ED%99%94%EC%97%90-%EB%8C%80%ED%95%9C-%EC%97%90%EB%9F%AC)

그중에 눈에 띄었던 것은 위 글이었는데, 문제의 원인 및 해결책이 잘 드러나있어 참고하면 좋을 것 같다.

위 에러 로그에서도 볼 수 있지만, GenericJackson2JsonRedisSerializer에서 LocalDateTime을 직렬화하는 기능이 지원되지 않아 발생한 문제임을 알 수 있었다.

그리고 해결 방법은 LocalDateTime을 정상적으로 직렬화 및 역직렬화를 진행할 수 있게 모듈을 추가해주는 것이었다.

이를 위해

```java
implementation 'com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.13.3'
```

위 의존성을 build.gradle 파일에 추가하고

```java
    @JsonSerialize(using = LocalDateTimeSerializer.class)
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    @JsonFormat(shape= JsonFormat.Shape.STRING, pattern="yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
```

LocalDateTime 필드에 @JsonSerialize, @JsonDeserialize 어노테이션을 추가하여 정상적으로 직렬화를 진행할 수 있게 명시해준 후, @JsonFormat으로 저장할 형식을 명시해주었다.

## 4. 결과

위와 같이 코드를 수정한 후에는 더이상 위와 같은 오류가 나지 않음을 확인할 수 있었다.

## 참고 자료

[https://velog.io/@wonizizi99/TIL-23.06.30-레디스-캐시-적용시-직렬화에-대한-에러](https://velog.io/@wonizizi99/TIL-23.06.30-%EB%A0%88%EB%94%94%EC%8A%A4-%EC%BA%90%EC%8B%9C-%EC%A0%81%EC%9A%A9%EC%8B%9C-%EC%A7%81%EB%A0%AC%ED%99%94%EC%97%90-%EB%8C%80%ED%95%9C-%EC%97%90%EB%9F%AC)
