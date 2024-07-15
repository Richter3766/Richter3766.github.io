---
layout: post
title: 프로젝트 똑똑, 토론방 구현 (3)
subtitle: 토론방 메세지 Controller 설정
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

이전 글에서 실시간 토론을 구현하기 위해 웹 소켓과 STOMP를 사용하기 위해 Spring에서 제공하는 인터페이스를 구현한 Config 코드에 대해 살펴보았었다. 이 글에서는 그 웹소켓 설정을 기반으로 어떻게 Controller에서 프론트엔드 요청을 처리하는 지 보고자 한다.

## 코드

먼저 프론트엔드에서 웹소켓 연결을 요청하는 코드를 간단히 살펴보자.
리액트에서는 SockJS와 Stompjs를 통해 웹소켓 활용을 지원한다.
아래는 react에서 javascript를 활용해 작성한 코드이다.

```javascript
const connect = () => {
  const socket = new SockJS(`${api}/api/ws`)
  const stompClient = Stomp.over(socket)
  const headers = {
    Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  }
  stompClient.connect(
    headers,
    () => {
      console.log('WebSocket Connected')
      setStompClient(stompClient)
    },
    () => {
      console.log('Connection error, scheduling reconnect')
      scheduleReconnect()
    },
  )
}
```

connect 함수 호출을 통해 웹소켓 연결을 시도하며 실패시 재시도하는 로직이 담겨있다.
headers에 토큰을 넘음으로써 최초 연결 시 jwt 인증을 할 수 있도록 제공하고 있다.

그럼 메세지는 어떻게 보낼 수 있을까?
이 기능은 커스텀 훅으로 만들었다.

```javascript
export function usePublish(roomId, isThread, messageId) {
  const stompClient = useStomp()
  const [message, setMessage] = useState('')

  const url = isThread ? `/pub/message/${messageId}` : `/pub/message`
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

  return { message, setMessage, sendMessage }
}
```

메세지를 보내기 위해 pub을 prefix로 하여 보내게 된다.
메세지와 메세지 스레드 두 종류가 존재하여 props으로 그 여부를 받도록 했다.

이렇게 프론트엔드에서 메세지를 보냈을 때 백엔드에서는 어떻게 요청을 받을까?
아래 코드를 보자.

```java
@Controller
@RequiredArgsConstructor
@CrossOrigin
public class PubSubController {
  private final SimpMessagingTemplate template;
  private final MessageService messageService;
  private final MemberRepository memberRepository;
  private Member member;

  @MessageMapping(value = "/message")
  @Operation(
    summary = "메세지 보내기",
    description = "클라이언트가 토론방에 메세지를 보낼 때 요청하는 API"
  )
  @Parameters(
    {
      @Parameter(
        name = "MessageRequestDto",
        description = "보낼 메세지 요청 바디",
        example = "{'roomId': 3, 'content': '보내길 원하는 메세지 내용'}"
      ),
    }
  )
  public void sendMessage(
    MessageRequestDto messageRequestDto,
    SimpMessageHeaderAccessor headerAccessor
  ) {
    Authentication auth = (Authentication) headerAccessor.getUser();
    member =
      memberRepository
        .findByEmail(auth.getName())
        .orElseThrow(() -> new CustomException(ErrorCode.INVALID_INPUT));
    MessageResponseDto messageResponseDto = messageService.saveAndReturnMessage(
      member,
      messageRequestDto
    );
    template.convertAndSend(
      "/sub/room/" + messageRequestDto.getRoomId(),
      messageResponseDto
    );
  }

  @MessageMapping(value = "/message/{messageId}")
  @Operation(
    summary = "스레드에 메세지 보내기",
    description = "클라이언트가 메세지 스레드에 댓글을 달 때 요청하는 API"
  )
  @Parameters(
    {
      @Parameter(
        name = "messageId",
        description = "메세지 스레드를 추가하길 바라는 메세지 ID",
        example = "3"
      ),
      @Parameter(
        name = "MessageThreadRequestDto",
        description = "보낼 메세지 스레드 요청 바디",
        example = "{'roomId': 3, 'content': '보내길 원하는 메세지 스레드 내용'}"
      ),
    }
  )
  public void sendMessageThread(
    @DestinationVariable Long messageId,
    MessageThreadRequestDto messageThreadRequestDto,
    SimpMessageHeaderAccessor headerAccessor
  ) {
    Authentication auth = (Authentication) headerAccessor.getUser();
    member =
      memberRepository
        .findByEmail(auth.getName())
        .orElseThrow(() -> new CustomException(ErrorCode.INVALID_INPUT));

    MessageThreadResponseDto messageThread = messageService.saveAndReturnMessageThread(
      member,
      messageId,
      messageThreadRequestDto
    );
    template.convertAndSend(
      "/sub/room/" + messageThreadRequestDto.getRoomId() + "/" + messageId,
      messageThread
    );
  }
}
```

pub prefix는 웹소켓 config 파일에서 지정해주었다. 이후 남은 url은 위처럼 messageMapping을 통해 컨트롤러가 적절하게 처리한다.

여기서 **SimpMessagingTemplate**는 Spring에서 WebSocket 메시지를 전송하기 위해 사용하는 템플릿 클래스이다.
주로 STOMP 프로토콜을 사용하여 서버에서 클라이언트로 메시지를 보내는 데 사용된다.
여기서는 convertAndSend라는 함수를 이용하여 메세지를 보내는데, sub url과 보낼 내용이 인자로 들어간다.
이를 통해 해당 url을 구독한 모든 클라이언트가 해당 메세지를 받게 된다.

또 **SimpMessageHeaderAccessor**는 WebSocket 메시지의 헤더 정보를 접근하고 조작하기 위한 유틸리티 클래스이다.
STOMP 메시지의 헤더를 다루는 데 유용한데, 여기서는 jwt 인증한 사용자 정보를 가져오는데 사용하고 있다.

**messageService**는 사용자가 보낼 메세지를 적절하게 도메인 클래스로 바꾼 후 db에 저장하는 역할을 하는 서비스 계층 클래스이다.

마지막으로 위 컨트롤러에서 보낸 메세지를 받는 방법에 대해 알아보자.
프론트엔드에서 특정 url을 구독하기 위한 코드는 아래와 같다.
메세지를 보낼 때와 마찬가지로 커스텀 훅으로 만들어두었다.

```javascript
export function useSubscribe(roomId, updateMessages) {
  const stompClient = useStomp()
  useEffect(() => {
    if (!stompClient) {
      return
    }
    const url = `/sub/room/${roomId}`
    console.log(`subscribe the room: ${roomId}`)
    // 구독 로직
    const subscription = stompClient.subscribe(url, (chat) => {
      const message = JSON.parse(chat.body)
      updateMessages(message)
    })

    // 구독 해제, 컴포넌트가 언마운트 되거나 roomId가 변경될 때 호출
    return () => {
      if (subscription) {
        console.log(`Unsubscribing from room: ${roomId}`)
        subscription.unsubscribe()
      }
    }
  }, [stompClient, roomId])
}
```

위처럼 특정 url을 구독해두면 해당 url로 메세지가 보내지면 구독한 모든 클라이언트가 같은 메세지를 실시간으로 받게 된다.

## 마치며

지금까지 프론트엔드와 백엔드에서 어떻게 웹소켓을 연결하여 메세지 보내기 요청을 보내는 지 살펴보았다.
다음 글에서는 웹소켓 연결에 JWT 인증을 넣은 과정에 대해 다루고자 한다.
