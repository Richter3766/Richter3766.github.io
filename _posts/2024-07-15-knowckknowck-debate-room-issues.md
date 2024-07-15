---
layout: post
title: 프로젝트 똑똑, 토론방 구현 (4)
subtitle: 웹소켓 JWT 인증 추가
gh-repo: Richter3766/Richter.github.io
tags: [project, knowckknowck]
comments: true
mathjax: true
author: HyeonSoo
---

## 시리즈 소개

이 시리즈는 필자가 대학교에서 진행한 팀프로젝트를 복기하고 개선점을 찾기 위한 것이다. <br>
프로젝트 소개는 아래 링크를 참고하길 바란다. (배포 사이트의 경우 비용 문제로 현재는 내려간 상태이다.)<br>
[현대인을 위한 문해력 향상 서비스, 똑똑](https://github.com/KnowckknowcK)<br>
내가 맡은 부분을 자세히 분석할 예정이다. 시간이 된다면 내가 맡지 않은 부분도 다루고자 한다.

## 개요

토론방에 메세지를 보낼 때 사용자를 인증하기 위해 JWT를 활용하기로 했다.
일반적인 REST API를 활용할 경우 매 요청의 header에 authorization 필드에 JWT 토큰을 넣어 보낸다.

반면 웹소켓의 경우 최초 연결 후 통신이 끊어지지 않는 한 계속 연결이 유지된다.
이 때문에 메세지 보내기 요청마다 헤더에 JWT 인증을 넣는 것이 비효율적이며 불필요하다.
그래서 이번 글에서는 웹소켓 최초 연결 시 JWT 인증을 하는 로직에 대해 다뤄보고자 한다.

## 채널 인터셉터

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtChannelInterceptor implements ChannelInterceptor {
  private final JwtUtil jwtUtil;

  @Override
  public Message<?> preSend(
    final Message<?> message,
    final MessageChannel channel
  ) {
    StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
      message,
      StompHeaderAccessor.class
    );
    // WebSocket 연결 시 인증 수행
    if (
      nonNull(accessor) && StompCommand.CONNECT.equals(accessor.getCommand())
    ) {
      try {
        String token = null;
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
        // 토큰 검증 및 인증 처리
        if (nonNull(token) && jwtUtil.validateToken(token)) {
          Authentication auth = jwtUtil.getAuthentication(token);
          accessor.setUser(auth);
          return message;
        } else {
          // 유효하지 않은 토큰의 경우 연결 거부
          throw new CustomException(TOKEN_INVALID);
        }
      } catch (Exception e) {
        log.warn("Authentication failed: {}", e.getMessage());
        throw new CustomException(TOKEN_INVALID);
      }
    }
    return message;
  }
}
```

위 클래스에서 구현한 **ChannelInterceptor**는 Spring WebSocket 모듈에서 제공하는 인터페이스로, 웹 소켓 채널 생성, 메시지 송/수신, 채널 닫힘 등의 이벤트에 대해 개발자가 직접 처리할 수 있게 해준다.

위의 경우 presend() 함수를 오버라이딩하여 메세지가 채널로 전송되기 전에 JWT 인증을 진행한 후 성공한 경우에만 메세지가 보내지도록 구현되었다.

**ChannelInterceptor**의 경우 여기선 presend()만 오버라이딩 하였다.
그러나 더 조사했을 때 메세지 전송 완료 전/후, 메세지 수신 전/후 등 웹 소켓 아래에서 일어나는 통신 과정에 로깅이나 추가 로직 구현이 자유로움을 알 수 있었다.
때문에 만약 다음에 기회가 된다면 더 자세히 공부하고자 한다.

## 프론트엔드의 경우

이전 글에서 프론트엔드에서 웹소켓 연결 요청 시 header에 JWT 토큰을 넣었었다.

```javascript
const headers = {
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
}
```

그리고 이후 메세지 보내기 등 웹 소켓 연결 아래에서 일어나는 모든 요청에 대해서는 따로 header를 지정하지 않음을 알 수 있다.

```javascript
function sendMessage() {
  if (stompClient) {
    stompClient.send(
      url,
      {},
      JSON.stringify({ roomId: roomId, content: message }),
    )
    setMessage('')
  }
}
```

## 마무리

이번 글에서는 웹 소켓 연결 시 JWT 인증을 왜 최초 연결 시에만 진행하는 지 가볍게 짚으며, 기능 구현을 위한 인터셉터 코드를 살펴보았다.

다음 글에서는 토론방 정보를 가져오는 과정에서 발생한 N + 1 문제를 살펴보고 해결하기 위한 JPQL 활용 예시를 다룰려고 한다.
