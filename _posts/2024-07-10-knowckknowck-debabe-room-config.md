---
layout: post
title: 프로젝트 똑똑, 토론방 구현 (2)
subtitle: 웹소켓 Config 파일 설정
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

## 들어가기

이전 글에서 실시간 토론을 구현하기 위해 웹 소켓과 STOMP를 사용하기로 정했었다. 이번 글에서는 Spring에서 웹소켓과 STOMP를 활용하기 위한 Config Code를 보고자 한다. 이 코드는 Spring boot 3.1.10 버전에서 작성되었다.

## 웹소켓 Config

우선 웹소켓 설정을 위한 Config 코드는 아래와 같다.

```java
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
  @Value("${client.base.url}")
  private String clientUrl;

  @Value("${client.local.url}")
  private String clientLocalUrl;

  @Value("${client.dev.url}")
  private String clientDevUrl;

  private final JwtUtil jwtUtil;

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry
      .addEndpoint("/api/ws")
      .setAllowedOrigins(clientLocalUrl, clientUrl, clientDevUrl)
      .withSockJS();
  }

  @Override
  public void configureMessageBroker(MessageBrokerRegistry registry) {
    // 메시지를 구독하는 요청의 prefix를 설정.
    registry.enableSimpleBroker("/sub");
    // 메시지를 보내는 요청의 prefix를 설정.
    registry.setApplicationDestinationPrefixes("/pub");
  }

  @Override
  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(new JwtChannelInterceptor(jwtUtil));
  }
}
```

### 코드 분석

WebSocketMessageBrokerConfigurer의 경우 Spring docs에 따르면 아래와 같이 나와 있다.

> Defines methods for configuring message handling with simple messaging protocols (e.g. STOMP) from WebSocket clients.
> Typically used to customize the configuration provided via @EnableWebSocketMessageBroker.<BR>
> 출처: [Using WebSocket to build an interactive web application](https://spring.io/guides/gs/messaging-stomp-websocket)

요약하면 WebSocket에서 STOMP와 같은 프로토콜을 핸들링하기 위해 설정하는 인터페이스이다. 많은 메소드들이 정의되어 있지만 이번의 경우 메세지 브로커로써 사용이 주가 되므로 그와 관련된 메소드만 오버라이딩해주었다. 여기서 총 세 가지 메소드를 정의했다.

1. registerStompEndpoints
2. configureMessageBroker
3. configureClientInboundChannel

**registerStompEndpoints**의 경우 웹소켓 연결 엔드포인트를 정하는 메소드로 엔드포인트는 'api/ws'로 설정했다. 그리고 웹소켓 연결 시 CORS 정책 위반 방지를 위해 클라이언트 측 url도 추가해주었다. 현재 코드에선 총 세가지 url이 포함되어 있는데, 배포용 url 1개 및 테스팅 url 2개로 실제로 필요한 만큼 추가해주면 된다.<br>
**configureMessageBroker**는 메세지 구독 시 요청할 url의 prefix를 설정한다. 여기선 구분이 쉽도록 pub/sub을 각각 활용했다. 원하는 url 활용이 가능하며 프론트엔드에서 'pub/원하는 엔드포인트'와 같이 사용하면 된다.<br>
**configureClientInboundChannel**는 웹소켓 연결 시 JWT 인증을 위해 필요하다. 웹소켓의 경우 일반적인 REST API와는 다르게 최초 연결 시에만 JWT 인증이 가능한데, 이와 관련한 글을 작성할 예정으로 지금은 넘어가겠다.

이와 같이 설정하면 Spring에서 웹소켓을 활용할 준비는 끝났다. 다음 글에서는 Controller 레벨에서 어떻게 메세지를 실시간으로 주고받는 지 적고자 한다.
