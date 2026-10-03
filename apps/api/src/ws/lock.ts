/**
 * `lock`·`unlock` 프레임 하나를 처리한다 — 설계서 「소프트 잠금」의 *"노드를 선택하면 그 서브트리에 잠금을
 * 건다"*가 서버에 닿는 자리다.
 *
 * # 편집 채널에 얹지 않는다
 *
 * `patch`는 `clientOpId`로 답과 짝지어지고, 연결이 끊기면 기다리던 것이 **전부 실패한다.**
 * 잠금은 그 셋이 다 다르다:
 *
 * | | `patch` | 잠금 |
 * |---|---|---|
 * | 답 | `patch-ack`/`patch-error`를 **낸 사람에게만** | 받으면 `locks` 목록을 **룸 전체에** · 거절하면 `lock-denied`를 **낸 사람에게만** |
 * | 짝짓기 | `clientOpId` | 받으면 없다 — 목록이 곧 답이다. 거절은 `pageId`·받지 않은 `nodeIds`와 그 프레임의 `lockId`를 싣는다(아래) |
 * | 끊겼을 때 | 기다리던 편집을 실패로 끝낸다 | **서버가 알아서 놓는다**(「소프트 잠금」) |
 *
 * 같은 채널에 얹으면 `failInFlight`의 뜻이 갈래마다 달라진다.
 *
 * # 서버가 획득을 거절한다
 *
 * **남이 이미 쥔 자리(또는 겹치는 서브트리)는 받지 않고, 낸 연결에 그 노드를 `lock-denied`로 답한다.** 겹침의 판정은 「소프트 잠금」의
 * «선택 = 서브트리 claim» 그대로 — 화면의 1차 방어가 부르는 **스키마의 같은 함수**다(`lock/check.ts`의 `selectionVerdict`).
 *
 * # 집합을 갈아 끼운다 — 프레임마다 집합 전부를 판정한다
 *
 * `lock` 프레임은 «이 연결의 잠금을 이 집합으로»다(`protocol.ts`의 `LockFrame` — 하나짜리 `nodeId`는 `[nodeId]`다). 끝을 지을 때
 * **집합의 노드 전부를 판정하고**, 막힌 노드만 `lock-denied`에 실은 채 나머지로 집합을 갈아 끼운다 — 앞 집합에서 빠진 것은 놓인다.
 * 이미 쥔 노드도, 같은 집합을 다시 보내는 하트비트도 판정을 지난다(만료가 미뤄지는 것은 그 뒤다).
 *
 * **이미 쥔 노드도 다시 판정하는 까닭 — 쥔 뒤에 문서가 바뀐다.** «쥔 동안 남의 겹치는 잠금은 서지 못했다»는 문서가 그대로일 때만
 * 참이다. 스냅샷 복원(`services/restore.ts`)은 잠금을 안 보고 문서를 통째로 갈아 끼워 이미 선 두 사람의 잠금을 조상/자손으로 만든다
 * (설계서 「소프트 잠금」의 «거치지 않는 입구»). 쥔 노드를 판정하지 않으면 그 겹침은 둘 중 하나가 놓을 때까지 서고, 서로의 편집을
 * 2차 방어(`lockConflictOfOps`)가 423 으로 막는다 — 한 사람은 고른 노드를 못 고치고 다른 사람은 제 노드를 못 지운다. 다시 판정하면
 * **먼저 하트비트를 보낸 쪽이 겹친 노드를 거절받아 놓고**, 뒤에 보낸 쪽은 그것이 놓인 뒤라 그대로 선다(판정과 `hold`가 한 틱이다 —
 * 아래). 거절받은 화면은 부분이면 그 노드를 선택에서 빼고 한 줄, 전부면 «잡지 않은 선택»에 선다(`apps/web`의 `lock-channel.ts`).
 * 재는 자리: `test/ws-lock-set.test.ts`의 «복원이 두 사람의 잠금을 조상/자손으로 만들면 …» · «겹친 두 잠금의 하트비트가 행에 함께 줄
 * 서도 …».
 *
 * **대가는 하트비트의 문서 조회다** — 같은 페이지에 남의 잠금이 있는 동안 하트비트(웹은 편집마다 보낸다)도 머리 문서를 읽고 집합
 * 전부의 겹침을 묻는다. 남의 잠금이 없으면 읽지 않는 것은 그대로다(아래 «비용은 작다»). [api] 200 노드 집합을 쥔 연결이 같은 집합을 다시
 * 보내고(같은 페이지에 남의 잠금 하나 · 뿌리 아래 Text N 개) 보낸 순간부터 `hold`가 불리기까지를 30번 재면 N 200(문서 15KB) p50 8.6ms ·
 * N 2000(153KB) 9.5ms · N 7000(538KB) 15.6ms 이고, 그 가운데 판정(읽은 뒤의 `liveIn` → `hold`)은 1.5–3ms 다. 쥔 것을 판정하지 않으면
 * 같은 하트비트가 3–4ms 다(문서를 안 읽는다) — 그 차가 대가다.
 *
 * **판정은 문서를 한 번 돈다**(`@wirebound/schema`의 `selectionConflicts` «문서를 한 번만 돈다») — 판정은 동기라 그동안 이벤트 루프 전체가
 * 서고 페이지 행(`KEY SHARE`)을 쥔 트랜잭션 안이라 같은 페이지의 편집도 줄 선다. 노드마다 남의 잠금마다 문서를 훑으면 비용이 «고른 수 ×
 * 남의 잠금 수»로 늘어 하트비트마다 초 단위가 된다. [api] Text 7000 · 고른 200 · 남의 잠금 801(넷이 200 개씩 + 하나)에서 하트비트 열 번의
 * «보낸 순간 → `hold`»가 최대 15–17ms · 이벤트 루프 멈춤 최대 7–9ms 이고, 쥔 사람 다섯이 1s 마다 하트비트를 보내는 동안 남의 편집 왕복이
 * 최대 96–104ms 다(노드마다 따로 물으면 하트비트 한 번 4.2s · 같은 편집이 초 단위 · 503). 다시 재는 법과 상한: `test/ws-lock-cost.test.ts`.
 * **자기 집합 안의 겹침(조상과 자손)은 견주지 않는다** — 같은 사람의 잠금은 서로 막지 않는다(다른 탭과 같은 규칙).
 *
 * **겹친 잠금을 «둘 다 서로를 못 고치는» 보수적인 결과로 두지 않는다.** 겹치면 둘 다 막혀 누구도 못 고치고, 친 글은
 * 423 으로 사라진다 — 그리고 겹침은 드물지 않다(Chrome 두 화면에서 난다): 끊겼다 다시 붙는 화면의 재알림이 그 사이 남이
 * 잡은 자리를 다시 잡고, 승격 뒤 첫 편집의 잡기와 editor 둘의 보통 경합도 겹친다. 클라이언트가 «내 것이 섰나»를 목록으로
 * 추정하면(`observe`) 목록이 거꾸로 닿는 창에서 거짓 잃음이 난다. 뿌리는 하나다 — **판정하는 자리가 서버에 있어야 한다.**
 *
 * **비용은 작다** — *"막으려면 선택 하나마다 문서를 읽어야 한다"*가 아니다. 문서를 읽는 것은 **같은 페이지에 남의 잠금이 있을 때뿐이다** — 혼자 고르는 흔한
 * 판은 페이지 행을 `KEY SHARE`로 잡는 조회 하나다(아래 «판정과 잡기는 같은 틱이다»).
 *
 * # 무엇을 답하나 — 판마다
 *
 * | 판 | 답 | 까닭 |
 * |---|---|---|
 * | 집합의 노드의 겹치는 자리를 **다른 사람**이 쥐었다 — 쥔 뒤 문서가 바뀌어 겹친 것도 | 그 노드만 `lock-denied` · 나머지는 쥔다 · 빠지는 것은 놓는다 | 집합을 갈아 끼우는 것이라 앞 집합에서 빠진 것은 어느 판이든 놓는다. 거절이 집합째면 남이 하나를 쥔 사이 나머지 고른 것까지 잃는다 |
 * | **같은 사람의 다른 탭**이 쥐었다 | 받는다(둘 다 쥔다) | 소유자는 사람이다. 편집의 2차 방어도 같은 사람을 막지 않는다(`lockConflictError`). 두 판정이 갈리면 화면이 잡은 자리를 서버가 편집에서 막는다 |
 * | **같은 연결이 같은 집합을 다시 보냈다**(하트비트 · 재알림) | 판정한다 — 겹치지 않으면 만료만 미룬다(목록은 안 흐른다) · 겹치면 윗줄 | 쥔 사이 복원이 문서를 갈아 끼워 남의 잠금과 겹쳤을 수 있다(위 «집합을 갈아 끼운다») |
 * | 남의 잠금이 **TTL 을 넘겼다** | 받는다 | `liveIn`이 읽으며 걷는다(`lock/store.ts`) — 판정은 살아 있는 것만 본다 |
 * | 자격을 보는 사이 멤버십이 **잠금을 쥘 수 없게** 바뀌었다(viewer · 제거 — `membershipEpoch`) | 프레임의 노드 전부 `lock-denied` · 이 연결이 쥔 것을 다 놓는다 | 읽은 자격이 바뀌기 전의 것이다. 조용히 버리면 **화면은 쥔 줄 안다.** 답을 받은 화면은 «잡지 않은 선택»에 서고 다음 편집이 다시 보낸다. **편집 권한이 그대로인 변경(editor↔owner · 같은 역할)은 세대를 안 올린다** — 올리면 그 사이의 하트비트 하나가 정당한 잠금을 놓는다. 올리는 판정은 `ws/notify.ts`의 `canHold` 하나다 |
 * | 끝나는 순간 연결이 **룸에 없다**(닫혔다 · 회수됐다) | 답 없음 · 잡지 않는다 | 닫힘의 해제(`releaseLocksOf`)는 이미 지나갔다 — 여기서 잡으면 아무도 안 놓는 잠금이 TTL 까지 선다 |
 * | viewer 가 보냈다 | 답 없음(`ws/routes.ts`) | 웹은 viewer 로 보내지 않는다. 강등이 끼면 `membership-changed`가 가고 화면이 놓는다 |
 * | 이 연결이 **뒤에 보낸** `lock`·`unlock`이 있다 | 답 없음 · 아무것도 안 한다 | 아래 «뒤에 온 것이 이긴다» |
 * | **빈 집합**이다 | 답 없음 · 다 놓는다(트랜잭션을 안 연다) | `unlock`과 같다 — 놓기는 판정이 필요 없다 |
 * | **DB 오류로 끝내지 못했다**(풀 대기 초과 · 연결 잃음 — 자격 확인이든 이 트랜잭션이든) | 프레임의 노드 전부 `lock-denied` · 이 연결이 쥔 것을 다 놓는다(`ws/routes.ts`의 `catch` → `denyLock`) | 서버는 아무것도 안 쥐었는데 답이 없으면 **화면은 쥔 줄 안다** — 남의 화면에는 배지가 없어 그 자리를 잡고 고칠 수 있다. 거절을 받은 화면은 «잡지 않은 선택»에 서고 다음 편집이 다시 보낸다. 뒤 프레임이 있으면 답하지 않는다(윗줄) |
 * | **페이지 행을 한도(`LOCK_ROW_WAIT_MS`) 넘게 기다렸다** | 프레임의 노드 전부 `lock-denied` · 이 연결이 쥔 것을 다 놓는다(`handleLockFrame`) | 행이 오래 쥐인 동안 함께 고르는 연결마다 풀 칸을 쥐고 서면 서버 전체가 503 이다(그 상수의 표). 답은 윗줄과 같다 |
 *
 * **거절은 그 `lock` 프레임과 짝지어진다.** 프레임이 `lockId`를 실어 오면 `lock-denied`가 그것을 되돌려준다 — 화면은 **마지막으로
 * 보낸 `lock`의 거절만** 받아들인다(`apps/web`의 `lock-channel.ts` 「거절은 그 `lock` 프레임과 짝짓는다」).
 *
 * # 뒤에 온 것이 이긴다
 *
 * 프레임마다 자격을 보는 await(DB 둘)가 있고 거기에 문서 조회가 더해질 수 있어, **한 연결의 `lock`·`unlock` 둘이 받은 순서와
 * 다르게 끝날 수 있다** — `lock A`(조회 중) 뒤의 `unlock`이 먼저 끝나면 뒤이어 A 가 서서 화면이 놓은 자리가 TTL 까지 남는다.
 * 그래서 받는 순간 차례를 매기고(`ws/routes.ts`), 끝나는 순간 **더 뒤에 받은 것이 있으면 아무것도 안 한다**(`LockTurn`).
 * 끝난 것만 이긴다 — 뒤의 것이 끝나며 자기 판정을 한다.
 *
 * # 연결 하나가 쥐는 풀 칸은 하나다
 *
 * **한 연결의 `lock` 트랜잭션은 한 번에 하나만 돈다**(`LockLane`). 도는 동안 온 프레임은 «다음에 할 것» 한 칸을 갈아 끼우고(마지막
 * 것만 남는다), 앞 것이 끝나면 그것을 돈다. 트랜잭션마다 풀 칸 하나를 쥔 채 페이지 행을 기다리므로(아래), 클릭마다 트랜잭션을 열면
 * 행이 몇 초 쥐인 동안(큰 복원 · 고아 트랜잭션) **한 사람의 선택 훑기가 풀을 채워 무관한 프로젝트의 요청까지 503 이 된다** — [api]
 * 테스트 트랜잭션이 페이지 행을 `FOR UPDATE`로 8s 쥔 채 한 연결이 16ms 간격으로 `lock` 60 을 보내고 1.2s 에 다른 사람의 다른
 * 프로젝트를 `GET` 하면(풀 10칸 · 대기 5s), 줄을 두지 않은 판은 Lock 대기 9 · 그 `GET` 503 · 답 없는 `lock` 51 · 줄을 둔 판은 대기 1 ·
 * 200 · 0. 성질은 `test/ws-lock.test.ts` 「연결 하나의 `lock`은 풀 칸 하나로 줄 선다」가 잠근다(대기하는 트랜잭션 수). 편집이
 * 클라이언트당 하나씩 나가는 것(웹의 in-flight 펌프)과 같은 자세다.
 *
 * `LockTurn`과 겹치지 않는다 — 차례는 **뜻**을, 줄은 **칸**을 정한다. 차례를 보는 자리가 셋이다: 줄에 들어올 때(뒤 프레임이 이미
 * 왔으면 세우지 않는다 — 자격 확인이 늦게 끝난 앞 프레임이 기다리던 뒤 프레임을 밀어내지 못하게), 돌 차례(트랜잭션을 안 연다),
 * 끝날 때(`settle` — 윗절). 밀려난 프레임은 답이 없다 — 위 표의 «뒤에 보낸 것이 있다» 줄이다. **줄은 행을 건너뛰는 길이 아니다**:
 * 도는 프레임은 전부 아래 «페이지 행 안»을 지난다.
 *
 * **줄은 연결마다다.** 같은 페이지에서 여럿이 함께 고르면 사람 수만큼 칸을 쥔다 — 그 칸을 오래 쥐지 않게 하는 것이 행 대기의
 * 한도다(`LOCK_ROW_WAIT_MS`).
 *
 * # 판정과 잡기는 같은 틱이다 — 그리고 페이지 행 안이다
 *
 * 문서를 읽는 await 뒤에 **목록을 다시 읽어** 판정하고 그 자리에서 잡는다(`selectionVerdict`는 동기다). 두 연결이 같은
 * 자리를 두고 함께 읽었어도 먼저 돌아온 쪽이 잡고, 뒤에 돌아온 쪽은 그것을 보고 거절된다.
 *
 * **모든 `lock`은 페이지 행을 `KEY SHARE`로 잡고, 판정과 `hold`는 그 행을 쥔 채 한다**(`lock/check.ts`의 «판정은 페이지 행 안에서»
 * — 표와 까닭이 거기 있다). 편집도 그 행을 `FOR UPDATE`로 잡고 판정하고 커밋하므로 둘이 한 점에 줄 선다. 행 없이 잡는 길을 두면
 * 둘이 새어 나간다 — 판정을 지난 편집의 커밋 **전** 문서로 잠금을 판정하는 겹침(들여쓰기 · 새 노드), 그리고 남의 잠금이 없는
 * 페이지에서 **판정을 지난 편집이 새 잠금 아래로 커밋**되는 것(배지가 선 뒤 몇 ms 에 남의 편집이 그 노드를 바꾼다). [api] 획득과 같은 노드 편집을 −3…+8ms 간격으로 경주시켜 **잠금
 * 트랜잭션이 행을 쥔 순간 읽은 `head_seq`가 받아들여진 그 편집의 seq 보다 작은 판**(= 잠금 뒤에 커밋된 편집)을 세면, 행 잠금
 * (`lockPageShared`의 `FOR KEY SHARE`)을 뗀 판은 ack 된 편집 171 중 125 · 붙인 판은 0. 화면 순서(자기 `locks` 뒤에 그 편집의
 * `page-changed`가 옴)로 세면 붙인 판에서도 150 중 1–2 가 난다 — 잠금 **전**에 커밋된 편집의 방송이 늦게 나가 순서만 뒤집힌
 * 것이라 이 결함이 아니다(그 판은 전부 두 seq 가 같다). 트랜잭션이 쥐는 행은 이 하나뿐이라 쥔 채 기다리는 것이 없다 — 고리가
 * 설 수 없다.
 *
 * 남는 것:
 *
 * - **화면의 목록이 낡은 창.** 남의 `locks`가 닿기 전에 고른 화면은 거절을 받고서야 안다(배지는 곧 온다). 그 사이 첫 편집을
 *   냈으면 그 `patch`는 2차 방어(`lockConflictError`)가 423 으로 막는다.
 * - **이기는 것은 도착 순서가 아니라 판정이 끝난 순서다.** 문서를 읽어야 하는 요청(같은 페이지에 남의 잠금이 있다)은 읽지 않아도
 *   되는 요청에 뒤질 수 있다 — 어느 쪽이든 하나만 선다(코드로 판단한 것이다 — 따로 재지 않는다).
 * - **`lock`이 행을 기다린다.** 같은 페이지의 편집 · 코멘트 게시 · 복원처럼 그 행을 `FOR UPDATE`로 쥔 쓰기가 끝날 때까지 줄
 *   선다 — 큰 문서면 그 편집의 문서 조회만큼이다. 반대로 문서 조회 경로의 `lock`이 행을 쥔 동안(문서를 읽는 동안) 그 페이지의
 *   편집이 줄 선다.
 */
import type { WbNode } from '@wirebound/schema'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { DatabaseError } from 'pg'
import { withTransaction } from '../db/tx'
import { readSelectionRoot, selectionVerdict } from '../lock/check'
import { lockPageShared } from '../repos/pages'
import type { ClientFrame, ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

export type LockFrame = Extract<ClientFrame, { type: 'lock' }>

/**
 * **`lock` 트랜잭션이 페이지 행을 기다리는 한도(ms).** 넘으면 그 `lock`은 `lock-denied`다(위 표의 «행을 한도 넘게 기다렸다»).
 *
 * **왜 두는가 — 한 페이지에서 여럿이 함께 고르면 풀이 찬다.** 줄은 연결마다라(위 «연결 하나가 쥐는 풀 칸은 하나다») 행이 쥐인 동안
 * 아홉 연결이 함께 고르면 아홉 칸이 행을 기다린다. [api] 테스트 트랜잭션이 페이지 행을 `FOR UPDATE`로 8s 쥔 채 editor 아홉이 같은
 * 페이지에서 `lock`을 보내고 1.2s 에 다른 사람이 다른 프로젝트를 `GET` 하면(풀 10칸 · 대기 5s):
 *
 * | 한도 | 그 `GET` | `lock` 아홉의 답 |
 * |---|---|---|
 * | 없음 | **503 · 5.0s** | 행이 풀린 8.0s 에 거절 여덟 |
 * | 500 | 200 · 4ms | 0.5s 에 거절 아홉 |
 * | 1000 | 200 · 6ms | 1.0s 에 거절 아홉 |
 * | **2000** | 200 · 0.8s | 2.0s 에 거절 아홉 |
 * | 3000 | 200 · 1.8s | 3.0s 에 거절 아홉 |
 *
 * **값은 정당한 기다림의 위에 둔다.** 같은 페이지의 편집 하나가 행을 쥐는 시간은 문서 800KB(노드 7000)에서 요청 통째로 p50 38ms ·
 * 최대 60ms 다(같은 노드의 `PATCH .../ops` 15번). 2000 은 그 30배 넘게 여유를 두고 풀 대기(5s — `db/client.ts`의 `createPool`)의 절반
 * 아래라, 풀이 차도 남의 요청은 한도 안에 칸을 얻는다. 넘는 기다림은 복원 같은 큰 쓰기다 — 그때 거절된 화면은 «잡지 않은 선택»에 서고
 * 다음 편집이 다시 보낸다(편집 자신은 한도 없이 줄 선다).
 *
 * **서버 전체에 걸지 않는다** — 편집 · 게시의 정당한 줄까지 끊는다(`db/client.ts`의 `createPool` 머리말 표의 `lock_timeout` 줄). 이
 * 트랜잭션에만 건다(`set_config(…, true)` — 트랜잭션이 끝나면 사라진다).
 */
export const LOCK_ROW_WAIT_MS = 2000

/** Postgres `lock_not_available` — `lock_timeout`을 넘긴 잠금 대기가 받는 SQLSTATE. */
const LOCK_NOT_AVAILABLE = '55P03'

/**
 * 프레임 하나가 **끝나는 순간** 아직 뜻이 있는가 — 받는 순간 `ws/routes.ts`가 매겨 넘긴다(위 «뒤에 온 것이 이긴다» · 표의
 * 멤버십 줄).
 */
export interface LockTurn {
  /** 자격을 보기 **전에** 읽은 멤버십 세대(`RoomConnection.membershipEpoch`). */
  epoch: number
  /** 이 연결이 이 프레임 **뒤에** 받은 `lock`·`unlock`이 없는가. */
  current(): boolean
}

/**
 * 잠금 목록이 바뀌었으면 룸에 알린다. **던지지 않는다** — 알림이 실패해도 잠금 자체는 섰다
 * (`ws/notify.ts`가 같은 자세를 적었다).
 */
function announce(app: FastifyInstance, projectId: string, changed: boolean): void {
  if (!changed) return
  void app.realtime.broadcast.announceLocks(projectId).catch((error: unknown) => {
    app.log.error({ err: error, projectId }, 'locks 알림 실패')
  })
}

/** 낸 연결에만 — 받지 않은 노드와 프레임의 `lockId`(위 «거절은 그 프레임과 짝지어진다»). 빈 목록이면 안 보낸다. */
function sendDenied(connection: RoomConnection, frame: LockFrame, nodeIds: string[]): void {
  if (nodeIds.length === 0) return
  const denied: ServerFrame = {
    type: 'lock-denied',
    projectId: connection.projectId,
    pageId: frame.pageId,
    nodeIds,
    ...(frame.lockId !== undefined ? { lockId: frame.lockId } : {}),
  }
  connection.send(JSON.stringify(denied))
}

/**
 * 프레임째 받지 않았다 — 이 연결이 쥔 것을 다 놓고(위 표) 프레임의 노드 전부를 낸 연결에만 답한다. 판정의 부분 거절은 이것이 아니다
 * (`settle`).
 *
 * **끝내지 못한 `lock`도 이 답이다** — DB 오류(풀 대기 초과 · 연결 잃음)로 판정까지 못 간 프레임에 `ws/routes.ts`의 `catch`가 부른다
 * (위 표). 그 프레임이 아직 마지막일 때만 부른다 — 뒤 프레임이 있으면 그것이 자기 답을 한다. 빈 집합이면 놓기만 한다.
 */
export function denyLock(app: FastifyInstance, connection: RoomConnection, frame: LockFrame): void {
  releaseLocksOf(app, connection)
  sendDenied(connection, frame, frame.nodeIds)
}

/** 연결이 아직 룸에 있는가 — 닫힘 · 회수가 룸에서 뺀 **뒤에** 놓는다(`ws/routes.ts`). */
function inRoom(app: FastifyInstance, connection: RoomConnection): boolean {
  return app.realtime.rooms.membersOf(connection.projectId).includes(connection)
}

/**
 * 끝을 짓는다 — **동기다.** 뜻이 없어졌으면(뒤 프레임 · 룸에 없음) 아무것도 안 하고, 세대가 바뀌었으면 거절하고, 아니면 집합 전부를
 * 판정해 막힌 것을 뺀 나머지로 갈아 끼우고 막힌 것만 거절한다(위 «집합을 갈아 끼운다»). 문서가 필요하면 `needs-document`를 돌려준다(아무것도
 * 안 했다).
 */
function settle(
  app: FastifyInstance,
  connection: RoomConnection,
  frame: LockFrame,
  turn: LockTurn,
  root: WbNode | null | undefined,
): 'settled' | 'needs-document' {
  if (!turn.current()) return 'settled'
  if (!inRoom(app, connection)) return 'settled'
  if (connection.membershipEpoch !== turn.epoch) {
    denyLock(app, connection, frame)
    return 'settled'
  }
  const base = { projectId: connection.projectId, pageId: frame.pageId, userId: connection.userId }
  const verdict = selectionVerdict(app, { ...base, nodeIds: frame.nodeIds }, root)
  if (verdict === 'needs-document') return verdict
  const denied = new Set(verdict.held)
  const changed = app.realtime.locks.hold({
    ...base,
    nodeIds: frame.nodeIds.filter((nodeId) => !denied.has(nodeId)),
    connectionId: connection.id,
    // **연결이 든다** — 프레임이 실어 온 값이 아니다(`ws/patch.ts`의 actor와 같은 이유).
    userName: connection.userName,
  })
  announce(app, connection.projectId, changed)
  sendDenied(connection, frame, verdict.held)
  return 'settled'
}

/**
 * 한 연결의 `lock` 트랜잭션 줄(위 «연결 하나가 쥐는 풀 칸은 하나다»). 연결마다 하나를 `ws/routes.ts`가 만든다.
 */
export interface LockLane {
  /**
   * 이 프레임을 돈다 — **트랜잭션은 한 번에 하나다.** 앞 프레임이 돌고 있으면 «다음에 할 것»으로 기다리고, 이미 기다리던 것은
   * **돌지 않고** 끝난다(마지막 것만 남는다). 받을 때나 돌 차례에 뒤 프레임이 이미 있으면(`turn.current()` 거짓) 트랜잭션을 열지
   * 않고 끝난다. **트랜잭션이 던지면 그대로 던진다** — 답(`lock-denied`)은 부르는 쪽의 `catch`가 한다(`denyLock`).
   */
  run(frame: LockFrame, turn: LockTurn): Promise<void>
}

export function createLockLane(app: FastifyInstance, connection: RoomConnection): LockLane {
  interface Job {
    frame: LockFrame
    turn: LockTurn
    resolve: () => void
    reject: (error: unknown) => void
  }
  let busy = false
  let next: Job | null = null

  /** 줄을 비울 때까지 돈다. **던지지 않는다** — 실패는 그 프레임의 `Promise`로 간다. */
  const drain = async (first: Job): Promise<void> => {
    busy = true
    let job: Job | null = first
    while (job !== null) {
      try {
        // **닫힌 연결의 «다음에 할 것»은 트랜잭션을 안 연다** — 닫힘의 해제는 이미 지나갔고 잡아도 `settle`이 버린다(룸에 없다). 열면
        // 풀 칸 하나가 행을 기다린다.
        if (job.turn.current() && inRoom(app, connection)) await handleLockFrame(app, connection, job.frame, job.turn)
        job.resolve()
      } catch (error: unknown) {
        job.reject(error)
      }
      job = next
      next = null
    }
    busy = false
  }

  return {
    run: (frame, turn) =>
      new Promise<void>((resolve, reject) => {
        // **뒤 프레임이 이미 왔으면 줄에 세우지 않는다.** 자격을 보는 await 가 받은 순서와 다르게 끝나므로 앞 프레임이 뒤
        // 프레임보다 늦게 닿을 수 있다 — 세우면 기다리던 뒤 프레임을 밀어내 **마지막 선택이 영영 안 돈다.**
        if (!turn.current()) {
          resolve()
          return
        }
        const job: Job = { frame, turn, resolve, reject }
        if (busy) {
          next?.resolve()
          next = job
          return
        }
        void drain(job)
      }),
  }
}

/**
 * `lock` 하나. **같은 집합을 다시 보내는 것이 하트비트다** — 그때는 목록이 안 바뀌어 조용하다. **빈 집합은 트랜잭션을 안 열고
 * 놓는다**(`unlock`과 같다 — 위 표).
 *
 * **페이지 행을 `KEY SHARE`로 잡고** 문서 없이 묻는다. 문서가 필요하면(같은 페이지에 남의 잠금이 있다) 그 행을 쥔 채 머리 문서를
 * 읽고 처음부터 다시 묻는다(위 «판정과 잡기는 같은 틱이다»). 읽은 뒤의 판정은 `needs-document`를 내지 않는다. 그 프로젝트에 없는
 * 페이지면 문서가 없는 것으로 판정한다(«막지 않는다» — `lock/check.ts`의 `selectionVerdict`).
 */
export async function handleLockFrame(
  app: FastifyInstance,
  connection: RoomConnection,
  frame: LockFrame,
  turn: LockTurn,
): Promise<void> {
  if (frame.nodeIds.length === 0) {
    if (turn.current() && inRoom(app, connection)) releaseLocksOf(app, connection)
    return
  }
  try {
    await withTransaction(app.db, async (trx) => {
      await sql`select set_config('lock_timeout', ${`${LOCK_ROW_WAIT_MS}ms`}, true)`.execute(trx)
      const page = await lockPageShared(trx, connection.projectId, frame.pageId)
      if (settle(app, connection, frame, turn, page ? undefined : null) === 'settled') return
      settle(app, connection, frame, turn, await readSelectionRoot(trx, connection.projectId, frame.pageId))
    })
  } catch (error) {
    // **행을 한도 넘게 기다렸다**(`LOCK_ROW_WAIT_MS`) — 예외가 아니라 판정이다. 끝내지 못한 `lock`과 같은 답이고 같은 조건이다
    // (위 표 · `ws/routes.ts`의 `catch` — 뒤 프레임이 없을 때만). 룸에 없으면 답할 곳이 없다.
    if (!(error instanceof DatabaseError && error.code === LOCK_NOT_AVAILABLE)) throw error
    if (turn.current() && inRoom(app, connection)) denyLock(app, connection, frame)
  }
}

/**
 * 이 연결이 든 것을 놓는다. 놓을 것이 없었으면 조용하다.
 *
 * **`unlock` 프레임과 연결 종료가 같은 함수를 부른다.** 둘은 같은 일이고(설계서 「소프트 잠금」이 *"연결 종료
 * 시 즉시 해제"*라고 적은 그 해제다), 갈라 두면 한쪽만 알리는 날이 온다 — 그러면 배지가
 * 남는다. **거절(`denyLock`)도 같은 함수다.**
 */
export function releaseLocksOf(app: FastifyInstance, connection: RoomConnection): void {
  announce(app, connection.projectId, app.realtime.locks.release(connection.id))
}
