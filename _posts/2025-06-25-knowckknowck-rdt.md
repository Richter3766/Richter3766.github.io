---
layout: post
title: 똑똑 – 신뢰성 메시징 구조, 실전 실험과 트레이드오프
subtitle: Pub/Sub에서 Redis Streams까지, 신뢰성 메시징 구조 전환기
gh-repo: Richter3766/Richter.github.io
tags: [project, knowckknowck]
comments: true
mathjax: true
author: HyeonSoo
---

## 현대인의 문해력 향상 실시간 토론 서비스, **똑똑(KnowckknowcK)**

### Pub/Sub에서 Redis Streams까지, 신뢰성 메시징 구조 전환기

### 1. 프로젝트 개요  
[똑똑(KnowckknowcK)](https://github.com/KnowckknowcK)은
현대인의 문해력 향상을 목표로 한 실시간 토론 서비스입니다.

저는 이전에 이 프로젝트에서 웹소켓 기반의 실시간 토론방을 설계하고 개발하는 역할을 맡았었습니다.
그때는 **실시간 시스템**을 구현하는 데에만 집중했던 만큼,
실제 서비스 상황에서 여러 한계와 문제점이 분명하게 드러났죠.

이번에는 과거에 미처 해결하지 못했던 실시간 메시징의 신뢰성과 성능 문제가 무엇인지 이를 어떻게
데이터와 실험, 구조적 리팩토링을 통해 근본적으로 해결하려고 헀는지 저가 시도한 과정을 보여드리겠습니다.

### 2. 문제 인식과 리팩토링 계기

처음 서비스를 지인들에게 배포했을 때,
**10명만 동시 접속해도 메시지 유실 현상**이 빈번히 발생했습니다.

당시엔

* 왜 메시지가 사라지는지?
* 병목이 어디에서 생기는지?

등 체계적으로 파악하거나 재현할 수 있는 환경이 부족해
  문제를 방치한 채 넘어가야만 했습니다.

그래서 이번 리팩토링의 목표는
**"실제 현장에서 맞닥뜨린 한계를 데이터와 실험으로 근본적으로 해결하자"** 였습니다.

### 3. 실험과 개선의 여정

#### 3-1. 부하 시뮬레이터 구현하기

실시간 메시징의 신뢰성 문제를 제대로 검증하려면, **현실적인 부하 환경**을 최대한 비슷하게 재현하는 게 우선이라고 생각했습니다.

처음에는 K6 같은 기존 부하 테스트 도구를 활용하려 했지만,
- 웹소켓을 네이티브하게 지원하지 않거나
- 수백 명의 클라이언트를 동시에 연결하면 
도구 자체(즉, K6 실행 환경)의 부하 때문에 
서버/클라이언트의 문제와 도구의 한계를 구분하기가 어려웠습니다.
    
그래서 더 깊게 사례를 찾아보다가 [카카오의 실시간 댓글 개발기](https://tech.kakao.com/posts/391)를 발견했습니다.  
저도 해당 글에 따라 
'직접 부하 시뮬레이터를 만들어 실서비스에 가까운 환경을 재현해보자'는 결론에 이르러,
Go를 활용해 부하시뮬레이터를 구현했습니다.

- [만든 부하시뮬레이터 repo >](https://github.com/Richter3766/ws-loadtest)

이 시뮬레이터를 활용해
동접자 수 10명 → 50명 → 100명까지 단계적으로 확장하며
실시간 메시지의 유실, 지연, 병목 현상을 체계적으로 실험할 수 있었습니다.

실제 실험 결과,
불과 100명만 동시 접속해도 아래와 같이 메시지 손실률이 45%에 달할 정도로
심각한 품질 문제가 그대로 드러났습니다.
<!-- 이미지 추가 필요 -->
> 리팩토링 전 메시지 지표(손실률이 45%)  
![alt error](../assets/image/rdt/리팩토링%20전_지표png.png)


하지만 정확히 어디서 손실이 일어나는지는 여전히 추적이 어려웠습니다.

#### 3-2. 실시간 모니터링과 병목 진단

부하 시뮬레이터로 메시지 손실 현상 자체는 쉽게 재현할 수 있었지만, 정작 **어디서** 문제가 생기는지는 여전히 불투명했습니다.

단순 로그나 육안 관찰만으로는 한계가 명확했기 때문에, 이번엔 **서버의 리소스 상태와 트래픽 변화를 실시간으로 모니터링**하기로 했습니다.

그래서

- **Prometheus**로 주요 지표(메모리, CPU 등)를 수집하고
- **Grafana**로 실시간 시각화를 적용해
    
실험 단계별(10, 20, 50, 100명)로 서버 상태를 분석했습니다.
    

> 100명 기준 서버 리소스 지표
(*JVM 메모리 및 CPU 사용량이 모두 20~30% 이내로 안정적*)  
![alt error](../assets/image/rdt/100명%20기준%20메모리,CPU.png)


<!-- 서버 리소스  이미지 추가 필요 -->

이렇게 데이터로 시스템을 바라보니, **서버 자원(CPU, 메모리)에는 병목이 없다는 사실**을 명확히 확인할 수 있었습니다.
또한 **클라이언트 쪽(연결·수신 처리)이 메시지 손실의 진짜 원인**임이 점차 드러났습니다.

#### 3-3. 신뢰성 보장을 위한 구조적 선택과 실제 구현

실험과 모니터링을 거듭할수록 단순 코드 수정이나 서버 증설만으로는 **실시간 메시지 손실 문제의 근본 원인**을 해결할 수 없다는 점이 분명해졌습니다.

특히 기존 Pub/Sub 구조에서는

- 메시지가 발신된 뒤 **누가 실제로 수신했는지 추적할 수 없고**
- 메시지 유실 시 **복구 자체가 불가능** fire-and-forget 특유의 한계가 있었습니다.
    
메시지 유실을 막고 서비스 품질을 향상하려면  단순히 메시지 단위가 아니라 **사용자 단위에서 누가 어떤 메시지를 언제 송신, 수신, ACK했는지** 정확히 추적할 수 있는 구조가 반드시 필요했습니다.
그래서 Redis Streams와 세션 매니저 구조를 도입하기로 결정했습니다.

#### Redis Streams + 세션 매니저 조합을 선택한 이유

**Redis Streams**는 

- 메시지의 생성, 소비, 확인(ACK) 과정을 모두 추적할 수 있는 **Pub/Sub을 확장한 고급 메시징 자료구조입니다.**
- 각 메시지를 여러 ‘컨슈머 그룹’(예: 사용자별)로 관리하며, 누가 어떤 메시지를 언제 읽고, ACK했는지까지 서버에서 기록합니다.

이 구조는 실시간 메시징에서 기존 Pub/Sub에 비해 다음과 같은 장점을 가집니다.

1. **컨슈머 그룹(=사용자 단위)별로 메시지 소비/수신 상태를 정밀하게 추적**
2. 누락·지연·미수신 등 모든 상태 변화를 명확하게 데이터로 남겨 장애 대응이나 복구(재전송) 로직을 설계하기에 유리
3. 메시지의 전달·소비·ACK의 모든 과정을 서버에서 관리 및 분석 가능

반면 Streams만으로는 실제 사용자별 연결상태, 송수신 내역, ACK 미도달 등 **세밀한 상태 변화를 실시간으로 관리·진단하기에는 한계**가 있기 때문에 이를 보완하기 위해 **세션 매니저와 양방향 인덱스 구조**를 함께 도입했습니다.

- **세션 매니저**:
    - 사용자별 연결 상태와 송·수신·ACK 내역을 실시간으로 관리
- **양방향 인덱스 구조**:
    - “사용자 → 보낸 메시지”, “사용자 → ACK 받은 메시지” 모두를 별도로 기록하여 특정 사용자의 메시지 손실, ACK 미도달 등 **모든 상태 변화와 문제 상황**을 빠짐없이 추적

이 조합을 통해
- 누가 언제 어떤 메시지를 송수신·ACK했는지
- 어디서 손실·지연이 발생했는지 **데이터 기반으로 실시간 진단 및 자동 복구**가 가능해졌습니다.
    

물론 인덱스/세션 데이터가 많아질수록 **저장소 부담과 성능 저하**가 생길 수 있다는 트레이드오프도 분명히 존재했습니다.  
그러나 현재는 실시간 신뢰성, 문제 진단 및 복구의 정확성이 복잡성과 성능 부담보다 중요하다고 판단해 최종적으로 이 구조를 도입하게 되었습니다. 

 > [Redis Streams 구조 리팩토링 커밋 >](
    https://github.com/Richter3766/KnowckKnowck-BE/commit/53c526
 )  
> [ACK 및 세션 관리 기능 커밋 > ](https://github.com/Richter3766/KnowckKnowck-BE/commit/92a5162)

#### 3-4. 시행착오와 데이터 기반 원인 분석

Streams+ACK 구조 도입 후,
손실률 5% 이내까지 성능이 크게 개선되었지만,
여전히 '손실률 0%'에는 도달하지 못했습니다.

> ACK 도입 후 200명 지표(*손실률 5% 이내, 평균 2~3회 재전송*)  
![alt error](../assets/image/rdt/리팩토링%20후_지표.png)

이를 해결하기 위해
Prometheus와 Grafana로 실시간 서버 지표를 수집하고
Redis 내부의 사용자별 메시지 데이터까지 세밀하게 추적했습니다.

> [지표 수집 커밋 > ](https://github.com/Richter3766/KnowckKnowck-BE/commit/9b21f4)

#### 주요 데이터 분석

지표 분석 결과,
서버에서는 모든 메시지가 정상적으로 송신된 것처럼 보였으나
실제로는 일부 클라이언트가 메시지를 수신/ACK하지 못하는 현상이 지속적으로 발생했습니다.

> **메시지 지표**  
![alt error](../assets/image/rdt/메세지%20지표.png)
초록색은 손실 메시지. 초반 급증 후 꾸준히 0으로 감소.

> **전송/ACK 지표:**
![alt error](../assets/image/rdt/전송,ACK%20지표.png)
전체 전송량(400) 대비 ACK 수(398)가 미세하게 부족

> **사용자별 집합 크기:**  
![alt error](../assets/image/rdt/사용자별%20집합%20크기.png)   
Redis에 기록된 사용자별 전송 메시지 수 불일치
    
이러한 모순의 원인을 역추적한 끝에,
테스트 시나리오에 구조적 맹점이 있음을 발견했습니다.  
바로 모든 클라이언트가 완전히 연결되기 전에 메시지 송신이 시작되어
아직 연결되지 않은 사용자는 메시지를 수신하거나 ACK할 기회조차 없었던 것입니다.

#### 잘못된 테스트 개선

이 문제를 해결하기 위해
테스트 시나리오를 전면 보완하여
모든 클라이언트가 완전히 연결된 후에만 메시지 송신이 시작되도록 구조를 변경했습니다.  
그 결과,
이전까지 남아 있던 손실률이 0%로 개선되는 성과를 얻을 수 있었습니다.

### 4. 최종 성과

이렇게
- Redis Streams, ACK, 사용자별 메시지 추적 구조
- 그리고 보완된 테스트 시나리오

를 모두 적용한 상태에서
실제 1,000명 동시 연결 환경에서 대규모 실험을 진행했습니다.

그 결과,
- **총 745명**이 정상적으로 연결되어
- **55만여 건**의 메시지 송수신에서 **메시지 손실률 0%**라는 목표를 달성할 수 있었습니다.

하지만 동시에

- **255건의 연결 실패**와
- 대량 트래픽 상황에서 **높은 메시지 지연**이라는 새로운 한계도 확인하게 되었습니다.

> 1,000명 테스트 결과:  
![alt error](../assets/image/rdt/1천명%20테스트%20결과.png)  
*손실률 0%, 하지만 255건 연결 실패 & 높은 지연율 존재*


<!--  여기서부터 다시 보기 -->

### 마무리하며: 실험으로 배운 것

마지막 실험에서 신뢰성 구조와 성능의 트레이드오프를 직접 눈으로 확인할 수 있었습니다.  

초기에는 신뢰성 구조 없이 속도만 빠른 메시징 시스템을 구현했지만, 이 경우에는 메시지가 유실될 때 복구할 방법이 전혀 없다는 문제가 있었습니다.  
반면, Redis Streams와 ACK 구조를 적용하자 메시지 유실은 사라졌지만, 재전송·확인 과정에서 응답 속도가 다소 느려지는 결과가 나왔죠.

이처럼 신뢰성과 성능은 언제나 맞바꿔야 하는 관계임을 이번 실험을 통해 실제로 체감할 수 있었는데요.  
여기에 정답이란 없으며 상황과 목적에 따라 적절한 구조를 합리적으로 선택하는 것이 중요하갰더는 사실을 다시금 깨달았던 것 같습니다.

만약 실무에서 이처럼 응답 속도가 지나치게 느려지는 상황이 온다면 모든 메시지와 세션을 단일 서버에 집중시키지 않고 분산 처리(스케일아웃)로 관리하는 것이 해답이 될 수 있다고 생각합니다. 실제로 1,000명 이상의 메시지는 병목이 생겼지만, 100명 단위에서는 속도와 신뢰성을 모두 만족할 수 있었으니까요.

언제 시스템을 분산해야 할지, 얼마나 리소스를 할당해야 할지 이런 결정 또한 막연한 감이 아니라 실험과 모니터링, 그리고 데이터로 측정된 지표에 근거해 합리적으로 내리는 것이 맞다는 생각이 들었습니다.

#### 마무리 글

이번 경험을 통해 단순히 구현의 성공/실패를 넘어, 내가 왜 이 구조를 택했는지, 무엇을 포기하고 무엇을 얻으려 했는지 깊이 있게 고민하는 과정을 가질 수 있었던 것 같습니다.

혹시 비슷한 고민을 하고 계시거나 더 좋은 구조에 대해 이야기 나누고 싶으신 분이 있다면 이메일을 통해 언제든 의견 주셔도 좋겠습니다.

앞으로도 **실험과 데이터, 그리고 본질을 향한 끊임없는 질문** 그 자체를 두려워하지 않는 개발자로 계속 성장해나가겠습니다.

읽어주셔서 감사합니다.

#### Reference

> * [똑똑 백엔드 레포지토리](https://github.com/Richter3766/KnowckKnowck-BE)
> * [실시간 댓글 개발기(part.2) - 험난했지만 유익했던 웹소켓 스트레스 테스트 및 안정화 작업](https://tech.kakao.com/posts/391)
> * [Go 부하시뮬레이터](https://github.com/Richter3766/ws-loadtest)
