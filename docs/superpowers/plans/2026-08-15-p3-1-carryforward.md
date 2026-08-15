# P3-1 이월 — 주 독자는 **P3-2**

P3-1이 세운 것은 *"서버가 알린다"*다. **P3-2는 그 위에 *"클라이언트가 보낸다"*를 얹는다** —
WS 편집 전송 · ack · 리베이스(§7.1의 나머지 절반).

아래는 **이 슬라이스가 남긴 자리**다. 짐작이 아니라 잰 것만 적는다.

---

## 1. P3-2가 곧바로 쓸 수 있는 것

| 있는 것 | 어디 | P3-2가 무엇에 쓰나 |
|---|---|---|
| 붙어 있는 연결·룸 | `apps/api/src/ws/` | patch 프레임을 받을 소켓이 이미 있다 |
| **프레임 수신 시 권한 재확인** | `ws/routes.ts`의 `socket.on('message')` | §10의 *"각 patch 수신 시 한 번"*이 **그 자리 그대로** 덮인다 — 그 검사는 프레임 종류와 무관하게 **먼저** 돈다 |
| `applyEdit` | `services/edit-pipeline.ts` | 그대로 부른다. `warnings`를 실어야 한다 |
| 브로드캐스트 | `ws/notify.ts` | WS로 들어온 편집도 같은 함수를 부른다 |
| 인구조사 | `test/broadcast-census.test.ts` | **새 호출자를 만들면 먼저 죽는다.** 그때 표에 줄을 더하며 판정한다 |
| 실커밋 + 실포트 하네스 | `test/helpers.ts`의 `withRealApi` | 연결 둘을 여는 케이스가 그대로 선다 |
| WS 프로브 | `test/ws-client.ts` | `waitFor`·`waitForCount`·`quiet`·`waitClosed` |

**`ws/protocol.ts`의 `ClientFrame`이 오늘 `ping` 하나다.** P3-2가 `patch`를 더할 때
`parseClientFrame`을 zod로 옮길지 판정해야 한다 — 그 함수 주석에 *"갈래가 늘면
`http/patch-ops.ts`가 그랬듯 zod로 옮긴다"*고 적어 두었다. **`http/patch-ops.ts`가 이미
REST 본문의 zod 경계를 갖고 있고 그 파일 머리말이 P3가 그것을 그대로 import한다고 적었다.**

---

## 2. P3-2가 **반드시** 다시 판정해야 하는 것

### 2.1 `x-wb-connection-id` 헤더는 P3-2에서 필요 없어진다

P3-1은 편집이 REST로 나가므로 서버가 *"이 요청이 어느 WS 연결의 것인가"*를 알 수 없었다.
그래서 헤더로 알린다(`ws/notify.ts`의 `CONNECTION_ID_HEADER`, `apps/web/src/api/http-client.ts`).

**P3-2에서 편집이 WS로 들어오면 그 연결이 곧 발신자다** — 헤더가 필요 없다. 다만
**REST 경로는 남는다**(§7.4 — MCP는 REST로 들어온다). 그러니 **지우지 말고**, WS 경로는
연결 자체를 `exceptConnectionId`로 넘기면 된다.

### 2.2 D6의 *"미룬다"*를 리베이스로 갈아 끼운다

`EditorStore.applyRemoteChange`의 `'deferred'` 갈래가 그 자리다
(`apps/web/src/store/editor-store.ts`). 오늘은 pending이 있으면 **안 얹고 화면이 낡았다고
말한다.** §7.1의 답은 *"자기 pending 위에 리베이스 적용"*이고 그것이 P3-2다.

**갈아 끼울 때 함께 보라:**

- `remoteStale`의 `'pending'` 갈래가 사라지면 `shell/remote-alert.tsx`의 그 문장도 사라져야
  한다. **`'diverged'`·`'restored'`는 남는다.**
- **미룬 ops를 쌓아 두지 않은 것이 P3-1의 판정이다** — REST 전송이 `baseSeq` 일치를
  요구하므로 저절로 수렴하기 때문이다. **WS 전송이 그 전제를 바꾸면 이 판정도 바뀐다.**
- `test/store/remote-change.test.ts`의 `'deferred'` 케이스들이 그때 죽는다. 죽는 것이 맞다.

### 2.3 복원 프레임은 아직 화면이 **말하기만** 한다

`restored`를 받으면 `markRestored()`가 낡음만 표시하고 **다시 읽지 않는다.** 자동
재조회를 넣을지는 P3-2 이후의 판정이다 — 복원은 페이지가 사라지기도 하는 사건이라
*"어느 페이지를 다시 읽나"*가 그 자체로 물음이다(열려 있던 페이지가 없어졌을 수 있다).

---

## 3. 잰 값으로 남기는 것 — 다음 사람이 다시 재지 않게

- **`@fastify/websocket`은 업그레이드 요청을 평범한 라우트로 태우고 훅을 전부 돌린 뒤에야
  소켓을 넘긴다.** 그래서 `projectGuard`를 그대로 preHandler로 쓸 수 있다. `auth/roles.ts`가
  예상했던 *"P3는 자기 껍데기를 만든다"*는 **거짓이었다**(그 파일 주석을 고쳤다).
- **Node 22의 전역 `WebSocket`은 `{ headers }` 옵션을 받고 그것이 실제로 핸드셰이크에
  실린다.** 테스트 클라이언트에 새 의존이 필요 없다.
- **브라우저 `WebSocket`은 프로토콜 ping을 보낼 수 없다.** 서버가 보낸 ping에 자동으로
  pong하지만 그 반대가 없다 — 그래서 앱 수준 `ping`/`pong`이 있다.
- **jsdom에도 `WebSocket`이 있다.** 화면 테스트가 실수로 붙지 않게 하는 것은
  `RealtimeProvider`가 없으면 안 붙는다는 계약이다(`realtime/context.tsx`).

---

## 4. 이 슬라이스가 드러낸 **다른** 자리 — P3-2의 일이 아닐 수 있다

### 4.1 코멘트 라우트 셋이 REST 응답에 `warnings`를 안 싣는다

`services/edit-pipeline.ts`가 *"성공 결과의 `warnings`를 호출자가 실어야 한다"*를 계약으로
적었고(P4a-3 Task 1), `routes/pages.ts`의 둘은 그것을 지킨다. **`routes/comments.ts`의 셋은
안 지킨다** — `POST .../comments`·`DELETE .../comments/:id`·`POST .../comments/renumber`가
`{ comment, marker, seq, markerOps }` / `{ seq, markerOps }`만 낸다.

**P3-1이 그 자리를 반쯤 메웠다:** 브로드캐스트는 그 `warnings`를 싣는다(D4가 요구했다).
**그래서 지금은 이렇게 갈린다 — 남이 코멘트를 달아 생긴 경고를 *"편집을 낸 사람"*만 못
본다.** 사실 2가 막으려던 갈라짐이 *"접속 방식"*에서 *"누가 냈느냐"*로 옮겨 앉았다.

**고치는 것은 응답에 `warnings`를 더하는 것이고**, 그러면 `apps/web/src/api/types.ts`의
`CommentCreated`·`MarkerChange`와 `README.md`의 표가 함께 움직인다. **이 슬라이스의 범위가
아니라고 판정해 남긴다** — D4가 코멘트를 이 슬라이스 밖에 뒀다.

### 4.2 `presence`를 서버가 보내는데 화면이 안 쓴다

D4의 셋째(연결·참가·이탈)를 서버가 낸다. `apps/api/test/ws-broadcast.test.ts`가 참가자
목록이 늘고 주는 것을 잰다. **화면은 그 프레임을 무시한다**(`use-realtime.ts`의 `default`
갈래). §7.2의 소프트 잠금(P3-3)이 그 위에 서므로 **일부러 남겼다** — 지금 화면에 그리면
잠금이 오기 전에 *"누가 접속 중"*만 있는 UI를 만들게 되고, 잠금이 오면 그 자리가 다시
갈린다.

### 4.3 `RealtimeConnection.close()`의 `stopped`가 0 사망이다

보고서에 진단을 적었다. **오늘 그것만 지우는 케이스가 없고**, 그 이유는 `close()`의 다른
두 줄(예약 취소·핸들러 떼기)이 같은 경로를 이미 막기 때문이다. **남긴 근거와 언제 그것이
유일한 방벽이 되는지를 소스에 적었다** — 지워도 되는 신호로 읽히지 않게.

### 4.4 인구조사가 `false`로 판정한 두 자리

| 자리 | 오늘의 판정 | 언제 다시 보나 |
|---|---|---|
| `services/restore.ts`의 페이지 문서 쓰기 | 안 알린다 — 복원은 `restored` 한 프레임이다 | 받는 쪽이 복원에 어떻게 반응할지 정할 때(§2.3) |
| `services/page-import.ts`의 첫 문서 쓰기 | 안 알린다 — 한순간 전까지 없던 페이지다 | **페이지 CRUD를 알릴 때.** 그때 필요한 것은 `page-changed`가 아니라 *"페이지가 생겼다"*이다 |

---

## 5. 다중 인스턴스 — 교체 비용의 목록

D7이 요구한 대로 **단일 인스턴스 가정이 박히는 자리를 `ws/rooms.ts` 머리말의 표에
적었다.** 요지: 넷 중 **둘은 `RoomRegistry` 인터페이스 밖이다**(전송 직전 재확인의 조회 수,
`connectionId`의 유일성 범위). Redis 구현을 끼우는 것만으로는 부족하다.

**지금 하지 마라.** §7.2가 잠금에 대해 정한 것과 같은 자세다 — 인터페이스만 갈라 두고
실제 교체는 필요해질 때 한다.
