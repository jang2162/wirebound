/**
 * **나가 있는 쓰기의 장부** — 에디터 라우트보다 오래 산다(이월 Q·R, 2026-09-21).
 *
 * `panel-drafts.tsx`의 provider 는 에디터 셸 안에 선다. 그래서 **프로젝트 목록 · 다른 프로젝트 ·
 * 테마 편집기 · 로그아웃 뒤 다시 로그인**으로 가면 통째로 내려가고, 거기 들어 있던 잠금도 함께
 * 사라졌다. 그 잠금이 막던 것이 그대로 돌아왔다 — **앞 쓰기가 나가 있는 채 둘째 쓰기가 나가고,
 * 늦게 도착한 앞 쓰기가 뒤 쓰기를 덮는다.**
 *
 * **고치기 전 실측**(Chrome · 첫 쓰기를 서버에 닿기 전에 붙잡고, 돌아와 둘째를 보낸 뒤 둘째 → 첫째
 * 순으로 서버에 보냈다):
 *
 * | 칸 | 입구 | 돌아온 화면 | 끝 |
 * |---|---|---|---|
 * | 설명 | 프로젝트 목록 · 다른 프로젝트 · 테마 편집기 · 로그아웃 → 다시 로그인 | 상자가 **열려** 있다 | 화면 `"둘째 저장 글"` · «설명을 저장했습니다» / **DB `"매달린 저장 글"`** (넷 다) |
 * | 새 코멘트 | 프로젝트 목록 | 상자가 열려 있다 | 화면 1행 / **DB 2행**, 번호 1 |
 * | 코멘트 수정 | 프로젝트 목록 | 수정 단추가 열려 있다 | 화면 `"둘째 수정"` / **DB `"첫째 수정"`** |
 * | (대조) 셋 다 | 옆 페이지 왕복 | 꺼져 있다(9차 잠금) | 둘째를 보낼 수 없다 |
 *
 * ## 그래서 잠금을 여기 든다 — `app.tsx`의 `<Routes>` 위
 *
 * 잠금의 원천은 «그 페이지의 그 칸으로 나간 쓰기가 있다»는 사실이다. 그 사실은 화면이 아니라
 * **요청**의 수명을 따른다 — 요청은 셸이 내려가도 산다. 그러니 셸보다 오래 사는 자리에 둔다.
 * **키는 (프로젝트, 페이지, 칸)**이다 — 9차의 «잠금은 페이지에 매단다»(`panel-drafts.tsx`의 머리말
 * 3)를 한 층 위로 올린 것이고, 그 잠금 칸은 이제 **여기만** 읽는다(두 벌이 아니다).
 *
 * **초안은 들지 않는다.** 여기 드는 것은 «나가 있는 쓰기»뿐이다. 초안은 에디터를 떠나면 버린다는
 * 지금 규칙 그대로다(`panel-drafts.tsx` 머리말 1).
 *
 * ## 응답은 **지금 그 페이지를 보고 있는 방문**에 닿는다 — provider 가 바뀌었어도
 *
 * 잠금만 남기면 반쪽이다. 돌아온 방문의 조회는 쓰기가 커밋되기 **전** 값을 읽었을 수 있고(리뷰
 * N-E), 앞 쓰기의 응답은 **내려간 provider** 의 칸에 쓰여 아무 데도 안 닿는다. 그래서 칸 쓰기는
 * 언제나 **지금 떠 있는 provider**(`Receiver`)로 간다 — 그 provider 가 같은 (프로젝트, 페이지)를
 * 보고 있을 때만 받는다. 9차가 «가 → 나 → 가»에서 응답을 **돌아온 방문**에 닿게 한 것과 같은
 * 규칙을 provider 째 갈린 방문까지 넓힌 것이다. 잠금이 남아 있는 한 돌아온 방문은 그 칸을 고칠 수
 * 없었으므로 응답의 뒷일(초안 비우기·편집 칸 닫기)이 지우는 것은 언제나 **보낸 그것**이다 — **같은
 * 세션 안에서.** 세션을 넘으면 아무것도 안 닿는다(아래 «세션을 넘지 않는다»).
 *
 * 응답이 **에디터 밖에 있는 동안** 오면 받을 provider 가 없어 버려진다. 잠금은 여기서 풀리므로,
 * 돌아오면 새 방문이 조회를 걸어 **커밋된 뒤의** 값을 읽는다.
 *
 * ## 세션을 넘지 않는다 — 세션이 끝나면 장부를 끊는다 (2026-09-21)
 *
 * 라우트 표 바깥에 섰더니 **로그아웃도 넘었다.** 같은 탭에서 앨리스가 저장 중 로그아웃하고 밥이
 * 로그인해 같은 페이지로 가면(리뷰 1-1, Chrome) 앨리스의 쓰기가 **밥의 상자를 잠갔고**, 앨리스의
 * «저장했습니다»·«저장되지 않았습니다»가 **밥의 화면에 섰고**, 앨리스의 요청이 로그아웃 뒤 서버에
 * 닿아 받은 401 이 **밥을 로그인 화면으로 튕겼다**(밥의 `/me`는 200). 같은 사람이 세션 만료 뒤 다시
 * 로그인해도 같았다. 원인은 셋이 겹친 것이다 — 장부가 세션으로 안 갈렸다 · 키에 세션이 없다 ·
 * `Receiver.accept`가 (프로젝트, 페이지)만 본다. `main`에는 없던 길이다(장부가 셸과 함께 사라졌다).
 *
 * **세션 세대**(`session/session-context.tsx` — 세션이 끝날 때마다 오른다)로 가른다. 셋이다:
 *
 * 1. **세대가 바뀌면 항목을 비운다**(렌더 중에) — «모름»으로 남은 쓰기도(리뷰 1-2 · 이월 9번).
 * 2. **그 세대의 쓰기를 끊는다**(`AbortSignal`) — 서버에 아직 안 닿았으면 영영 안 가고, 끊긴 요청의
 *    응답(401 포함)은 브라우저가 버린다. 서버에 이미 닿았으면 **서버는 끝낸다** — 앞 사람의 쿠키로 나간
 *    정당한 쓰기이고 그 결과가 DB 에 남는 것은 옳다. 잠금만 풀린다.
 * 3. **지난 세대의 것은 새 장부도 칸도 못 고친다** — 항목은 낸 세대의 장부일 때만(`put`), 칸 쓰기는 지금
 *    세대일 때만(`deliver`) 닿는다. 끊기지 않는 일(판정용 다시 읽기 · 게시 뒤의 목록 다시 받기)이 세션을
 *    넘어 끝날 때 이것이 막는다.
 *
 * **401 → 로그인 화면(`SignedOut`)의 판정은 두 벌이 아니다** — 여전히 `api/failure.tsx`의 `toFailure`
 * 한 곳이다. 여기서 거르는 것은 그 판정에 닿을 **칸 쓰기**다: 지난 세대의 401 은 칸에 안 닿으므로 지금
 * 세션의 화면이 `SignedOut`을 그리지 않는다. 지금 세대의 쓰기가 받은 401 은 그대로 닿는다 — 그때는 지금
 * 세션이 정말 끝난 것이다.
 *
 * Chrome(고친 뒤 · 계정 셋 · 같은 탭):
 *
 * | 판 | 다음 세션의 화면 | 서버 |
 * |---|---|---|
 * | 서버 안 지연 8초(캐시 켬) · 로그아웃 → 밥 | 로그아웃 순간 앨리스의 `PATCH` `ERR_ABORTED` · 장부 `[]` → 밥 1.7s 도착: 상자 **열림** · 통지 없음 → 13s 까지 그대로 | 8s 에 앨리스의 글 커밋 |
 * | route 에 붙잡고 안 놓음 · 로그아웃 → 밥 | 도착 열림 → 9.5 · 11 · 13s 에도 통지 없음 · 장부 `[]` | 그대로(안 닿았다) |
 * | 앨리스가 이미 «모름»(다시 읽기를 끊음) · 로그아웃 → 밥 | 장부 `[]` · 열림 · «다시 확인» 없음 | — |
 * | 붙잡힌 쓰기에 401 을 준다(설명 · 새 코멘트) — 모델링 | 로그인 화면으로 **안 간다** · 밥 `/me` 200 | — |
 * | 게시는 커밋 · 뒤의 목록 다시 받기를 붙잡았다가 401 — 모델링 | 로그인 화면으로 **안 간다** · 목록에 앨리스의 글 | 1행 |
 * | 서버가 세션을 지움 → 목록 401 → 같은 사람 재로그인 | 끊김(`ERR_ABORTED`) · 돌아온 상자 **열림** | 그대로 |
 *
 * **대가 — 잠금이 세션을 넘지 않으므로 Q 의 틈이 세션 경계에서 다시 선다.** 새 세션의 상자는 열려 있고,
 * 앞 세션의 쓰기가 서버에 이미 닿아 있었으면 그것이 **새 세션의 쓰기와 겹친다.** Chrome(같은 판에서 밥이
 * 1.9s 에 같은 설명을 저장): 밥의 `PATCH`가 같은 행 잠금 뒤에 줄을 서서 앨리스의 것 다음에 커밋됐다 —
 * 8.1s «설명을 저장했습니다» · 화면·DB `"밥이 저장한 글"`. **이 스택에서는 온 순서대로라 뒤가 이겼다.**
 * 서버 앞단이 순서를 바꾸면 앞 세션의 것이 뒤에 서서 덮는다 — 일반적인 보장이 아니다. 받아들인 것이다 —
 * 앞 사람의 쓰기로 다음 사람을 잠그는 것은 안 된다. 닫는 길은 이월 P(기대값)다.
 *
 * ## 시간 제한 — 넘으면 «풀림»이 아니라 «결과를 모름»이다 (이월 R)
 *
 * 앞 판의 쓰기에는 시간 제한이 없었다. **응답이 영영 안 오면**(Chrome · 쓰기를 붙잡고 안 놓았다)
 * 설명·코멘트 둘 다 상자·단추가 탭·모드·옆 페이지 왕복에도 꺼진 채였고 60초 동안(코멘트 30초)
 * 아무 말도 없었다. 프로젝트 목록을 다녀와야 풀렸고 친 글은 사라졌다 — 그리고 **그렇게 풀면 위 Q 로
 * 간다.**
 *
 * **시간이 지났다고 잠금을 풀면 틀린다.** 클라이언트가 포기해도 서버는 나중에 커밋할 수 있다 — 재
 * 봤다: 새로고침으로 브라우저가 끊은 코멘트 게시가 서버에서 **그대로 커밋되어** 다시 단 것과 함께 두
 * 행이 됐다(서버가 요청을 받은 채 DB 행 잠금에 5초 막혀 있던 판). 그래서 시간이 지나면
 * `'checking'`으로 가서 **서버에서 다시 읽어 판정한다**(`verify` — 판정의 뜻은 칸마다 다르고 그
 * 칸이 정한다. 코멘트 게시는 다시 읽지 않고 같은 키로 다시 보낸다 — 아래 «판정 뒤의 늦은 커밋»).
 * 다시 읽기도 실패하면 `'unknown'`이고, 잠금을 쥔 채 누군가 «다시 확인»을 누를 때까지
 * 기다린다(`recheck`).
 *
 * **시간이 지나면 요청을 끊는다**(`AbortSignal`). 서버에 아직 안 닿은 요청은 그걸로 영영 안
 * 간다(Chrome · 서버 앞에서 붙잡은 요청을 페이지가 끊은 뒤 놓아 줬더니 서버 로그에 그 요청이 없었다).
 * 이미 닿은 요청은 끊어도 서버가 끝낸다 — **그 틈은 클라이언트가 못 닫는다**(아래 «판정 뒤의 늦은
 * 커밋» — 코멘트는 서버의 멱등 키가 닫는다).
 *
 * **늦게 온 원래 응답은 버린다.** 판정은 다시 읽은 값이 한다 — 늦은 응답이 판정을 뒤집지 않는다.
 * 끊었으므로 실브라우저에서는 늦은 응답 자체가 안 오고, 신호를 안 보는 가짜 클라이언트(테스트)가
 * 늦게 풀려도 여기서 버린다.
 *
 * ### 값 — `WRITE_DEADLINE_MS`
 *
 * 이 앱의 쓰기가 실제로 걸리는 시간(Vite 프록시를 지나 · 순차 200회 · 이 기계):
 *
 * | 쓰기 | p50 | p99 | 최대 |
 * |---|---|---|---|
 * | 설명 `PATCH` | 4.3ms | 7.2ms | 11.0ms |
 * | 코멘트 `POST` | 5.8ms | 20.6ms | 47.7ms |
 * | 코멘트 `PATCH` | 5.7ms | 31.1ms | 35.3ms |
 * | 코멘트 `DELETE` | 4.9ms | 10.2ms | 11.6ms |
 * | 설명 `PATCH` 20개 동시(한 행을 다툰다) | 32.7ms | — | 42.1ms |
 *
 * **10초**는 본 최대의 200배를 넘는다. 원격 배포의 왕복이 더해도 수백 ms 이고, 10초를 넘기는 쓰기는
 * 막힌 것이다. 더 짧으면 느리지만 멀쩡한 서버에서 «모름»이 나서 아래 틈(판정 뒤 늦은 커밋)을
 * 스스로 연다. 더 길면 사용자가 꺼진 상자 앞에서 그만큼 기다린다.
 *
 * ## 판정 뒤의 늦은 커밋 — 코멘트는 서버가 닫는다, 설명은 이월 P 와 함께
 *
 * 다시 읽은 «서버 값이 보낸 값과 다르다»(설명 · 코멘트 수정·삭제의 판정)는 **그 순간 아직** 아니라는
 * 뜻이지 영영 아니라는 뜻이 아니다. 요청이 이미 서버에 있으면 판정 뒤에 커밋될 수 있다(Chrome — 서버가
 * 받은 채 DB 행 잠금에 막힌 판: 10초에 «안 됨», 13.4초에 커밋).
 *
 * - **코멘트 — 닫았다: 판정이 곧 같은 키로 다시 보내는 것이다.** 서버는 같은 키면 앞 행을 돌려주므로
 *   (`apps/api/README.md`의 «멱등 키») 다시 보낸 것의 답이 **확정**이다 — 커밋됐으면 재생(200), 아니면
 *   지금 커밋(201). 앞 판은 목록을 다시 읽어 «같은 노드 · 같은 글 · 내가 쓴 행»을 찾았고, 그래서 목록을
 *   읽은 **뒤** 다른 곳에서 달린 같은 글을 이 게시로 쳤다(리뷰 2-2). «안 달림»은 이제 서버가 다시 보낸
 *   것을 **거절(4xx)**했을 때뿐이고, 같은 키 · 같은 글의 거절이면 앞 게시도 커밋될 수 없다. 연결 실패·5xx
 *   는 «모름»이다(«다시 확인»이 또 보낸다). Chrome(서버 안 지연 16초 — 페이지 행 `FOR UPDATE`):
 *
 *   | 판 | 값 |
 *   |---|---|
 *   | 번호 있는 노드 | 10.6s 첫 게시 `ERR_ABORTED` → 11s «확인 중» · 잠김 → 16.3s 다시 보낸 것 **200(재생)** · 초안 비움 · 통지 없음 · DB 그 글 1행 |
 *   | 번호 없는 노드 | 16.1s 200(재생) · DB 1행 · «번호를 화면에 반영하지 못했습니다»(사실 — 앞 게시의 번호 변화를 못 받았다) |
 *   | 11s 에 가 → 나 → 가 | 돌아온 상자 **꺼짐** · 초안 없음(F1) · «확인 중» → 16.1s 재생 · DB 1행 |
 *   | 셸째 떠났다 옴(3s) | 16.1s 재생 · 새 셸의 번호 칸 `1` · 통지 없음 |
 *   | 첫 게시를 route 에 붙잡고(안 닿음) 목록을 읽은 뒤 다른 곳에서 같은 글 | 10.0s 끊김 → 10.1s 다시 보낸 것 **201** · DB 같은 글 **두 행**(다른 곳의 것 + 이것 — 앞 판은 이것을 잃었다) |
 *
 *   **리뷰 6(«고치면 새 키»가 늦은 커밋 창을 다시 연다)은 이 길에서 닫혔다** — 판정하는 동안 상자가 잠겨
 *   고칠 수 없고, 판정이 끝나면 이미 확정이다(위 표 첫 줄·셋째 줄. 앞 판은 11s «안 달림» 뒤 고쳐 달면 두
 *   행, 페이지 왕복 뒤 다시 치면 같은 글 두 행이었다 — 리뷰 4, Chrome). **남는 길 — 시간 안의 모르는 실패.** 첫 게시가
 *   서버에 닿았는데 브라우저가 502·연결 끊김을 받으면 `'failed'`라 판정을 안 지나고 초안이 열린다.
 *   Chrome(route — 첫 게시를 서버에 보내고 브라우저에는 502/끊김을 줬다): «서버 응답을 이해할 수
 *   없습니다»/«서버에 연결하지 못했습니다» → `"원문!"`으로 고쳐 달면 새 키 → DB `원문` · `원문!` 두 행.
 *   고치지 않고 다시 달면 같은 키라 재생이다. 닫는 길은 게시의 5xx·연결 실패도 판정(다시 보내기)으로
 *   보내는 것인데, 서버가 계속 500 이면 상자가 «모름»에 잠기는 대가가 있어 **이번에 하지 않았다**(보고).
 * - **설명 — 이번에 닫지 않는다. 이월 P(창 둘의 덮어쓰기)와 한 항목으로 넘긴다.** 닫는 길은 설명
 *   `PATCH`가 기대값을 받아 늦은 쓰기를 409로 거절하는 것인데, 그것이 이 앱의 **첫 충돌 모델**이다.
 *   남는 위험은 좁다: 이 스택에서 같은 행 쓰기는 행 잠금으로 **온 순서대로** 커밋되어 늦게 커밋된
 *   앞 쓰기가 뒤 쓰기를 못 덮는다(Chrome — 새로고침 판에서 둘째가 이겼다). 이것은 일반적인 보장이
 *   아니다 — 서버 앞단이 순서를 바꾸면 선다. 그리고 충돌 모델을 넣는다면 **설명·제목(페이지 메타
 *   전체)에 한 번에** 따로 설계해 넣을 일이라(P 가 그 자리다) 여기만 먼저 짓지 않는다.
 *
 * ## 이것이 막지 못하는 것
 *
 * - **새로고침·탭 닫기.** 이 장부는 메모리라 문서와 함께 사라지고, **초안과 멱등 키도 함께
 *   버려진다.** 서버가 이미 받은 게시는 끊겨도 커밋하므로, 돌아와 같은 글을 다시 치면 **새 키**다.
 *   Chrome(서버가 받은 채 6초 막힘 · 그 사이 새로고침 · 같은 글 다시 달기): 이미 번호가 있는 노드 —
 *   **같은 글 두 행**(키 둘). 번호가 없던 노드 — 둘째가 409(`stale` — 첫째가 번호를 붙여 `head_seq`를
 *   올렸다) · 1행. `sessionStorage`로 장부·키를 넘기지 않았다(판정: 이월) — 세션을 넘는 상태를 이 앱이
 *   처음 드는 것이 되고, 그것으로도 «서버에 이미 간 요청»은 못 막는다.
 * - **다시 읽기가 응답하지 않으면** `'checking'`에 머문다 — 읽기에는 시간 제한을 두지 않았다(판정:
 *   이월).
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useSessionEpoch } from '../session/session-context'

/** 쓰기의 시간 제한. 값의 근거는 위 머리말의 표다. */
export const WRITE_DEADLINE_MS = 10_000

/**
 * 나가 있는 쓰기의 단계.
 *
 * | 단계 | 뜻 |
 * |---|---|
 * | `'sending'` | 보냈고 응답을 기다린다 |
 * | `'checking'` | 시간 안에 응답이 없어 **서버에서 다시 읽어** 판정하는 중이다 |
 * | `'unknown'` | 다시 읽기도 실패했다 — 결과를 모른다. «다시 확인»을 기다린다 |
 */
export type WritePhase = 'sending' | 'checking' | 'unknown'

export interface WriteEntry {
  readonly phase: WritePhase
  /** `'unknown'`일 때만 있다 — 다시 읽어 판정한다. */
  readonly recheck: (() => void) | null
}

/** 쓰기가 가리키는 자리. **키가 셋인 것이 요점이다** — 셸이 바뀌어도 같은 칸을 가리킨다. */
export interface WriteTarget {
  readonly projectId: string
  readonly pageId: string | undefined
  /** 칸의 이름(`panel-drafts.tsx`의 `lockSlot`). */
  readonly slot: string
}

/**
 * 쓰기가 끝난 모양.
 *
 * - `'done'` — 시간 안에 성공 응답을 받았다.
 * - `'failed'` — 시간 안에 실패했다(실패 응답 · 연결 실패). **결과를 안다: 안 됐다.**
 * - `'verified'` — 시간 안에 응답이 없어 **다시 읽어 판정했다.** 판정의 모양은 칸이 정한다.
 */
export type WriteOutcome<T, V> =
  | { kind: 'done'; value: T }
  | { kind: 'failed'; caught: unknown }
  | { kind: 'verified'; verdict: V }

export interface TrackedWrite<T, V> {
  /** 요청을 보낸다. **`signal`을 요청에 싣는다** — 시간이 지나면 끊는다. */
  send(signal: AbortSignal): Promise<T>
  /**
   * 판정한다 — 보통은 서버에서 다시 읽고, 멱등한 쓰기는 **같은 것을 다시 보낸다**(코멘트 게시 —
   * `comment-panel.tsx`의 `submit`). 던지면 `'unknown'`이다.
   */
  verify(): Promise<V>
  /**
   * 끝난 뒤의 일(응답을 칸에 쓰기 · 목록 다시 받기 …). **잠금을 쥔 채 돈다** — 이것이 끝나야 풀린다.
   * 8차까지 코멘트의 쓰기가 다시 받기까지 잠금 안에서 했던 것과 같다.
   *
   * `ownerLive`는 **쓰기를 시작한 provider 가 아직 떠 있는가**다. 셸이 새로 섰으면 실시간 연결도
   * 새것이라 서버의 방송이 새 스토어에 닿는다 — 판정으로 끝난 코멘트 쓰기가 «번호를 못 얹었다»고
   * 말할지를 이것으로 가른다(`comment-panel.tsx`의 `perform`).
   */
  settle(outcome: WriteOutcome<T, V>, ownerLive: boolean): void | Promise<void>
}

/** 칸 쓰기가 닿을 곳 — 지금 떠 있는 `PanelDraftsProvider`. */
export interface Receiver {
  readonly token: symbol
  /** `at`의 페이지를 보고 있으면 그 칸에 쓴다. 칸과 값의 모양은 `panel-drafts.tsx`의 몫이다. */
  readonly accept: (at: PageAt, key: object, update: unknown) => void
}

export interface PageAt {
  readonly projectId: string
  readonly pageId: string | undefined
}

/**
 * 칸 쓰기의 주소 — **그 쓰기를 부른 렌더**의 페이지와 **세션 세대**(`session-context.tsx`). 페이지는
 * 받는 provider 가 보고(`accept`), 세대는 장부가 본다(`deliver`).
 */
export interface SlotAt extends PageAt {
  readonly epoch: number
}

interface Ledger {
  readonly writes: ReadonlyMap<string, WriteEntry>
  /**
   * 쓰기를 올린다. **잠겨 있는지는 부르는 쪽이 먼저 본다**(`usePanelLock`의 `locked`) — 여기서
   * 한 번 더 막지 않는다. 막을 길을 찾아 봤는데 화면에서 닿는 길이 없었다: 클릭·제출은 React 가
   * 곧바로 다시 그린 뒤에 다음 이벤트를 받으므로 둘째 클릭은 이미 꺼진 버튼을 본다. 재는 것이 없는
   * 가드를 두지 않았다.
   */
  run<T, V>(target: WriteTarget, owner: symbol, write: TrackedWrite<T, V>): Promise<void>
  /** 지금 떠 있는 provider 로 선다. 돌려주는 함수가 물러난다. */
  receive(receiver: Receiver): () => void
  /**
   * 칸 쓰기를 보낸다 — **지금 떠 있는 provider** 로(없거나 자기면 자기에게). **지난 세대의 것은
   * 버린다**(머리말 «세션을 넘지 않는다»).
   */
  deliver(from: Receiver, at: SlotAt, key: object, update: unknown): void
}

/** 장부 — 항목과 그것이 속한 세션 세대. 세대가 바뀌면 통째로 새것이 된다. */
interface Book {
  readonly epoch: number
  readonly writes: ReadonlyMap<string, WriteEntry>
}

/** 지금 세대와, 그 세대의 쓰기를 한꺼번에 끊는 신호. */
interface Live {
  readonly epoch: number
  readonly signal: AbortSignal
}

const LedgerContext = createContext<Ledger | null>(null)

export function writeKey(target: WriteTarget): string {
  return `${target.projectId}\u0000${target.pageId ?? ''}\u0000${target.slot}`
}

const SENDING: WriteEntry = { phase: 'sending', recheck: null }
const CHECKING: WriteEntry = { phase: 'checking', recheck: null }

/** 시간 제한이 먼저 왔다는 표지. */
const EXPIRED = Symbol('expired')

export function WriteLedgerProvider(props: { children: ReactNode }): ReactElement {
  const epoch = useSessionEpoch()
  const [book, setBook] = useState<Book>(() => ({ epoch, writes: new Map() }))
  const receiverRef = useRef<Receiver | null>(null)
  const liveRef = useRef<Live | null>(null)

  // **세대가 바뀌면 항목을 비운다 — 렌더 중에**(`panel-drafts.tsx`가 페이지가 바뀌면 칸을 버리는 것과
  // 같은 모양). 이펙트로 비우면 새 세대의 첫 커밋 하나 동안 앞 세션의 잠금이 그려진다.
  if (book.epoch !== epoch) setBook({ epoch, writes: new Map() })

  // **그리고 앞 세대의 요청을 끊는다**(머리말 «세션을 넘지 않는다»). 쓰기는 낸 순간의 세대의 신호를
  // 받는다(`run`) — 세대가 바뀌면 이 정리가 그 신호를 끊는다.
  useLayoutEffect(() => {
    const controller = new AbortController()
    liveRef.current = { epoch, signal: controller.signal }
    return () => controller.abort()
  }, [epoch])

  /** 항목 하나를 고친다. **그 쓰기를 낸 세대의 장부일 때만** — 지난 세대의 쓰기는 새 장부를 못 고친다. */
  const put = useCallback((at: number, key: string, entry: WriteEntry | null) => {
    setBook((prev) => {
      if (prev.epoch !== at) return prev
      if (entry === null && !prev.writes.has(key)) return prev
      const writes = new Map(prev.writes)
      if (entry === null) writes.delete(key)
      else writes.set(key, entry)
      return { epoch: prev.epoch, writes }
    })
  }, [])

  const run = useCallback(
    async <T, V>(target: WriteTarget, owner: symbol, write: TrackedWrite<T, V>): Promise<void> => {
      const live = liveRef.current
      if (live === null) throw new Error('쓰기 장부가 아직 서지 않았다')
      const key = writeKey(target)
      const report = (entry: WriteEntry | null): void => put(live.epoch, key, entry)
      // **세대가 바뀌면 이 쓰기를 끊는다**(머리말 «세션을 넘지 않는다»). 끊긴 거절은 `attempt`의 경주에서
      // «실패»로 끝나고, 그 뒷일의 칸 쓰기는 `deliver`가 지난 세대라 버린다.
      const controller = new AbortController()
      const cut = (): void => controller.abort()
      live.signal.addEventListener('abort', cut)
      report(SENDING)
      try {
        const outcome = await attempt(write, report, controller)
        await write.settle(outcome, receiverRef.current?.token === owner)
      } finally {
        live.signal.removeEventListener('abort', cut)
        report(null)
      }
    },
    [put],
  )

  const receive = useCallback((receiver: Receiver) => {
    receiverRef.current = receiver
    return () => {
      if (receiverRef.current === receiver) receiverRef.current = null
    }
  }, [])

  const deliver = useCallback((from: Receiver, at: SlotAt, key: object, update: unknown) => {
    // **지난 세대의 칸 쓰기는 버린다** — 앞 세션의 응답(통지 · 401 의 `SignedOut` · 다시 받은 목록)이 다음
    // 세션의 방문에 닿지 않는다. 401 을 로그인 화면으로 바꾸는 판정은 여전히 `api/failure.tsx` 한 곳이다 —
    // 여기는 그 판정에 닿을 **칸 쓰기**를 거른다.
    if (at.epoch !== liveRef.current?.epoch) return
    const current = receiverRef.current
    ;(current === null ? from : current).accept(at, key, update)
  }, [])

  const { writes } = book
  const ledger = useMemo<Ledger>(() => ({ writes, run, receive, deliver }), [writes, run, receive, deliver])
  return <LedgerContext.Provider value={ledger}>{props.children}</LedgerContext.Provider>
}

/**
 * 보내고, 시간 안에 오면 그 답을, 안 오면 끊고 **다시 읽어 판정한 답**을 낸다.
 *
 * **끊긴 요청의 거절은 «실패»가 아니다.** 끊는 순간 `fetch`가 거절하지만(실제 `fetch`처럼 신호를
 * 받으면 거절하는 가짜로 케이스가 잰다) 그 거절은 아래 `then`을 한 번 더 지나 경주에 들어가므로,
 * 같은 순간에 풀린 `expired`가 먼저 선다. 그래서 시간이 되면 언제나 다시 읽기로 간다.
 */
async function attempt<T, V>(
  write: TrackedWrite<T, V>,
  report: (entry: WriteEntry) => void,
  controller: AbortController,
): Promise<WriteOutcome<T, V>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof EXPIRED>((resolve) => {
    timer = setTimeout(() => {
      resolve(EXPIRED)
      controller.abort()
    }, WRITE_DEADLINE_MS)
  })
  const stop = (): void => clearTimeout(timer)

  let sent: Promise<T>
  try {
    sent = write.send(controller.signal)
  } catch (caught) {
    stop()
    return { kind: 'failed', caught }
  }
  // 경주에서 진 쪽의 거절이 처리되지 않은 채 떠돌지 않게 붙잡는다 — 늦게 온 응답은 버린다.
  sent.catch(() => undefined)

  const first = await Promise.race([
    sent.then(
      (value) => ({ value }) as const,
      (caught: unknown) => ({ caught }) as const,
    ),
    expired,
  ])
  stop()
  if (first !== EXPIRED) {
    return 'value' in first ? { kind: 'done', value: first.value } : { kind: 'failed', caught: first.caught }
  }

  // 시간 안에 응답이 없었다 — 결과를 모른다. 서버에서 다시 읽는다.
  for (;;) {
    report(CHECKING)
    try {
      return { kind: 'verified', verdict: await write.verify() }
    } catch {
      await new Promise<void>((resolve) => report({ phase: 'unknown', recheck: resolve }))
    }
  }
}

/** 장부. **provider 가 없으면 요란하게 깨진다** — 조용히 물러나면 잠금이 셸과 함께 다시 사라진다. */
export function useWriteLedger(): Ledger {
  const ledger = useContext(LedgerContext)
  if (ledger === null) throw new Error('쓰기 장부는 WriteLedgerProvider 안에서만 쓴다')
  return ledger
}
