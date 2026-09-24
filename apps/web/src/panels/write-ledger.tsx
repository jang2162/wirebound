/**
 * **나가 있는 쓰기의 장부** — 에디터 라우트보다 오래 산다.
 *
 * `panel-drafts.tsx`의 provider 는 에디터 셸 안에 선다. 그래서 **프로젝트 목록 · 다른 프로젝트 ·
 * 테마 편집기 · 로그아웃 뒤 다시 로그인**으로 가면 통째로 내려간다. 잠금을 거기 들면 잠금도 함께
 * 사라지고, 그 잠금이 막던 것이 그대로 돌아온다 — **앞 쓰기가 나가 있는 채 둘째 쓰기가 나가고,
 * 늦게 도착한 앞 쓰기가 뒤 쓰기를 덮는다.**
 *
 * **잠금을 셸에 들면**(Chrome · 첫 쓰기를 서버에 닿기 전에 붙잡고, 돌아와 둘째를 보낸 뒤 둘째 → 첫째
 * 순으로 서버에 보낸다):
 *
 * | 칸 | 입구 | 돌아온 화면 | 끝 |
 * |---|---|---|---|
 * | 설명 | 프로젝트 목록 · 다른 프로젝트 · 테마 편집기 · 로그아웃 → 다시 로그인 | 상자가 **열려** 있다 | 화면 `"둘째 저장 글"` · «설명을 저장했습니다» / **DB `"매달린 저장 글"`** (넷 다) |
 * | 새 코멘트 | 프로젝트 목록 | 상자가 열려 있다 | 화면 1행 / **DB 2행**, 번호 1 |
 * | 코멘트 수정 | 프로젝트 목록 | 수정 단추가 열려 있다 | 화면 `"둘째 수정"` / **DB `"첫째 수정"`** |
 * | (대조) 셋 다 | 옆 페이지 왕복 | 꺼져 있다(페이지에 매단 잠금 — `panel-drafts.tsx`의 머리말 3) | 둘째를 보낼 수 없다 |
 *
 * ## 그래서 잠금을 여기 든다 — `app.tsx`의 `<Routes>` 위
 *
 * 잠금의 원천은 «그 페이지의 그 칸으로 나간 쓰기가 있다»는 사실이다. 그 사실은 화면이 아니라
 * **요청**의 수명을 따른다 — 요청은 셸이 내려가도 산다. 그러니 셸보다 오래 사는 자리에 둔다.
 * **키는 (프로젝트, 페이지, 칸)**이다 — «잠금은 페이지에 매단다»(`panel-drafts.tsx`의 머리말
 * 3)를 한 층 위로 올린 것이고, 그 잠금 칸은 **여기만** 읽는다(두 벌이 아니다).
 *
 * **초안은 들지 않는다.** 여기 드는 것은 «나가 있는 쓰기»뿐이다. 초안이 에디터 밖을 넘는 길은 따로 있다 —
 * 탭의 저장소에 비춘 사본이다(`panel-drafts.tsx` 머리말 4 · `draft-store.tsx`).
 *
 * ## 응답은 **지금 그 페이지를 보고 있는 방문**에 닿는다 — provider 가 바뀌었어도
 *
 * 잠금만 남기면 반쪽이다. 돌아온 방문의 조회는 쓰기가 커밋되기 **전** 값을 읽었을 수 있고,
 * 앞 쓰기의 응답은 **내려간 provider** 의 칸에 쓰여 아무 데도 안 닿는다. 그래서 칸 쓰기는
 * 언제나 **지금 떠 있는 provider**(`Receiver`)로 간다 — 그 provider 가 같은 (프로젝트, 페이지)를
 * 보고 있을 때만 받는다. «가 → 나 → 가»에서 응답이 **돌아온 방문**에 닿는 규칙(`panel-drafts.tsx`의
 * 머리말 3)을 provider 째 갈린 방문까지 넓힌 것이다. 잠금이 남아 있는 한 돌아온 방문은 그 칸을 고칠 수
 * 없으므로 응답의 뒷일(초안 비우기·편집 칸 닫기)이 지우는 것은 언제나 **보낸 그것**이다 — **같은
 * 세션 안에서.** 세션을 넘으면 아무것도 안 닿는다(아래 «세션을 넘지 않는다»).
 *
 * 응답이 **에디터 밖에 있는 동안** 오면 받을 provider 가 없어 버려진다. 잠금은 여기서 풀리므로,
 * 돌아오면 새 방문이 조회를 걸어 **커밋된 뒤의** 값을 읽는다.
 *
 * **메뉴 트리도 받는 자리다.** 받는 자리는 칸의 종류(`Realm`)마다 하나다 — 우측 패널(`'page'`)과
 * 트리(`'tree'`). 트리 이름 변경의 판정(«바뀌지 않았습니다» · 충돌 · 다시 읽은 트리)을 쓰기를 낸 트리의 state 로만 보내면,
 * 에디터를 떠났다 돌아온 **새 트리**에서는 말이 없다. 무엇을 받고 무엇을 보는지는 `Receiver`의 계약이 갖는다 — 아래
 * «판정으로 끝난 쓰기도 전한다»가 그 위에 선다.
 *
 * ## 세션을 넘지 않는다 — 세션이 끝나면 장부를 끊는다
 *
 * 라우트 표 바깥에 서면 **로그아웃도 넘는다.** 세션으로 가르지 않으면, 같은 탭에서 앨리스가 저장 중
 * 로그아웃하고 밥이 로그인해 같은 페이지로 갈 때(Chrome) 앨리스의 쓰기가 **밥의 상자를 잠그고**, 앨리스의
 * «저장했습니다»·«저장되지 않았습니다»가 **밥의 화면에 서고**, 앨리스의 요청이 로그아웃 뒤 서버에
 * 닿아 받은 401 이 **밥을 로그인 화면으로 튕긴다**(밥의 `/me`는 200). 같은 사람이 세션 만료 뒤 다시
 * 로그인해도 같다. 원인은 셋이 겹친 것이다 — 장부가 세션으로 안 갈린다 · 키에 세션이 없다 ·
 * `Receiver.accept`가 (프로젝트, 페이지)만 본다. 장부가 셸과 함께 사라지면 없는 길이다 — 셸보다 오래 사는 대가다.
 *
 * **세션 세대**(`session/session-context.tsx` — 세션이 끝날 때마다 오른다)로 가른다. 셋이다:
 *
 * 1. **세대가 바뀌면 항목을 비운다**(렌더 중에) — «모름»으로 남은 쓰기도.
 * 2. **그 세대의 쓰기를 끊는다**(`AbortSignal`) — 서버에 아직 안 닿았으면 영영 안 가고, 끊긴 요청의
 *    응답(401 포함)은 브라우저가 버린다. 서버에 이미 닿았으면 **서버는 끝낸다** — 앞 사람의 쿠키로 나간
 *    정당한 쓰기이고 그 결과가 DB 에 남는 것은 옳다. 잠금만 풀린다.
 * 3. **지난 세대의 것은 새 장부도 칸도 못 고친다** — 항목은 낸 세대의 장부일 때만(`put`), 칸 쓰기는 지금
 *    세대일 때만(`deliver`) 닿는다. 실브라우저에서 끊긴 쓰기는 응답 자체가 안 온다 — 이것이 막는 것은
 *    **끊겨도 뒷일이 도는 판**(끊긴 판정이 «모름»으로 가며 항목을 고치는 것 · 신호를 안 보는 클라이언트의
 *    늦은 응답)과 **끊기지 않는 일**(게시 뒤의 목록 다시 받기 — 잠금 밖의 일반 읽기다. 이것은 목록 칸의
 *    «늦게 낸 조회만» 규칙도 막는다 — 겹친다: `comment-panel.tsx`의 `answered`).
 *
 * **401 → 로그인 화면(`SignedOut`)의 판정은 두 벌이 아니다** — 여전히 `api/failure.tsx`의 `toFailure`
 * 한 곳이다. 여기서 거르는 것은 그 판정에 닿을 **칸 쓰기**다: 지난 세대의 401 은 칸에 안 닿으므로 지금
 * 세션의 화면이 `SignedOut`을 그리지 않는다. 지금 세대의 쓰기가 받은 401 은 그대로 닿는다 — 그때는 지금
 * 세션이 정말 끝난 것이다.
 *
 * Chrome(계정 셋 · 같은 탭):
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
 * **대가 — 잠금이 세션을 넘지 않으므로 맨 위 표의 틈이 세션 경계에서 다시 선다.** 새 세션의 상자는 열려 있고,
 * 앞 세션의 쓰기가 서버에 이미 닿아 있었으면 그것이 **새 세션의 쓰기와 겹친다.** 바탕 없이 겹치면 서버에 선
 * 순서대로 뒤가 이기고, 서버 앞단이 순서를 바꾸면 앞 세션의 것이 뒤에 서서 덮는다 — 일반적인 보장이 아니다.
 * 받아들인 것이다 — 앞 사람의 쓰기로 다음 사람을 잠그는 것은 안 된다. **설명은 바탕이 닫는다** — 두 쓰기가 같은 바탕을
 * 싣고 오므로 뒤에 선 것은 앞의 것이 커밋한 값을 보고 409 다(덮지 않는다 — `page-description.tsx`의 «남의 저장을
 * 조용히 덮지 않는다»). 코멘트는 멱등 키가 닫는다.
 *
 * ## 시간 제한 — 넘으면 «풀림»이 아니라 «결과를 모름»이다
 *
 * 쓰기에 시간 제한이 없으면 **응답이 영영 안 올 때**(Chrome · 쓰기를 붙잡고 안 놓는다)
 * 설명·코멘트 둘 다 상자·단추가 탭·모드·옆 페이지 왕복에도 꺼진 채이고 아무 말도 없다. 프로젝트 목록을
 * 다녀와야 풀리고 친 글은 사라진다 — 그리고 **그렇게 풀면 맨 위 표의 틈으로 간다.**
 *
 * **시간이 지났다고 잠금을 풀면 틀린다.** 클라이언트가 포기해도 서버는 나중에 커밋할 수 있다 — Chrome:
 * 새로고침으로 브라우저가 끊은 코멘트 게시가 서버에서 **그대로 커밋된다**(서버가 요청을 받은 채 DB 행 잠금에
 * 5초 막혀 있던 판). 새 키로 다시 달면 두 행이다. 그래서 시간이 지나면
 * `'checking'`으로 가서 **서버에서 다시 읽어 판정한다**(`verify` — 판정의 뜻은 칸마다 다르고 그
 * 칸이 정한다. 코멘트 게시는 다시 읽지 않고 같은 키로 다시 보낸다 — 아래 «판정 뒤의 늦은 커밋»).
 * 다시 읽기도 실패하면 `'unknown'`이고, 잠금을 쥔 채 누군가 «다시 확인»을 누를 때까지
 * 기다린다(`recheck`).
 *
 * **시간이 지나면 요청을 끊는다**(`AbortSignal`). 서버에 아직 안 닿은 요청은 그걸로 영영 안
 * 간다(Chrome · 서버 앞에서 붙잡은 요청을 페이지가 끊은 뒤 놓아 주면 서버 로그에 그 요청이 없다).
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
 * ## 판정 뒤의 늦은 커밋 — 코멘트는 멱등 키가, 설명은 바탕이 닫는다
 *
 * 다시 읽은 «서버 값이 보낸 값과 다르다»(설명 · 코멘트 수정·삭제의 판정)는 **그 순간 아직** 아니라는
 * 뜻이지 영영 아니라는 뜻이 아니다. 요청이 이미 서버에 있으면 판정 뒤에 커밋될 수 있다(Chrome — 서버가
 * 받은 채 DB 행 잠금에 막힌 판: 10초에 «안 됨», 13.4초에 커밋).
 *
 * - **코멘트 — 멱등 키가 닫는다: 판정이 곧 같은 키로 다시 보내는 것이다.** 서버는 같은 키면 앞 행을 돌려주므로
 *   (`apps/api/README.md`의 «멱등 키») 다시 보낸 것의 답이 **확정**이다 — 커밋됐으면 재생(200), 아니면
 *   지금 커밋(201). 목록을 다시 읽어 «같은 노드 · 같은 글 · 내가 쓴 행»을 찾는 판정은 쓰지 않는다 — 목록을
 *   읽은 **뒤** 다른 곳에서 달린 같은 글을 이 게시로 친다. «안 달림»은 다시 보낸 것이
 *   **키를 보고 낸 거절**일 때뿐이고 그 밖은 «모름»이다(«다시 확인»이 또 보낸다) — 무엇이 어느 쪽인지와 그
 *   까닭은 `comment-panel.tsx`의 `knownRejection`이 소유한다(서버의 판정 순서에 매여 있다). Chrome(서버 안
 *   지연 16초 — 페이지 행 `FOR UPDATE`):
 *
 *   | 판 | 값 |
 *   |---|---|
 *   | 번호 있는 노드 | 10.6s 첫 게시 `ERR_ABORTED` → 11s «확인 중» · 잠김 → 16.3s 다시 보낸 것 **200(재생)** · 초안 비움 · 통지 없음 · DB 그 글 1행 |
 *   | 번호 없는 노드 | 16.1s 200(재생) · DB 1행 · «번호를 화면에 반영하지 못했습니다»(사실 — 앞 게시의 번호 변화를 못 받았다) |
 *   | 11s 에 가 → 나 → 가 | 돌아온 상자 **꺼짐** · 초안 없음(F1) · «확인 중» → 16.1s 재생 · DB 1행 |
 *   | 셸째 떠났다 옴(3s) | 16.1s 재생 · 새 셸의 번호 칸 `1` · 통지 없음 |
 *   | 첫 게시를 route 에 붙잡고(안 닿음) 목록을 읽은 뒤 다른 곳에서 같은 글 | 10.0s 끊김 → 10.1s 다시 보낸 것 **201** · DB 같은 글 **두 행**(다른 곳의 것 + 이것 — 목록으로 판정하면 이것을 잃는다) |
 *
 *   **«고치면 새 키»가 늦은 커밋 창을 다시 여는 길은 이 판정이 막는다** — 판정하는 동안 상자가 잠겨
 *   고칠 수 없고, 판정이 끝나면 이미 확정이다(위 표 첫 줄·셋째 줄). 확정 전에 «안 달림»을 내면 고쳐 단 글이
 *   두 행이 되고, 페이지 왕복 뒤 다시 치면 같은 글이 두 행이 된다(Chrome).
 *
 *   **시간 안의 모르는 실패도 판정으로 간다.** 첫 게시가 서버에 닿았는데 브라우저가 502·연결 끊김을 받을 때
 *   그것을 `'failed'`로 두면 판정을 안 지나고 초안이 열려, `"원문!"`으로 고쳐 달면 새 키 → DB `원문` · `원문!`
 *   두 행이다(Chrome route). 그래서 첫 보내기의 **모르는 실패**(무엇인지는
 *   `comment-panel.tsx`의 `knownRejection`)는 곧바로 같은 키로 다시 보내 판정한다
 *   (`TrackedWrite.uncertain`). **세션이 끝나 끊긴 실패는 뺀다**(`attempt`). 대가: 서버가 계속 모르는 실패를
 *   내면 «모름»에 잠긴다 — «다시 확인»이 있고, 떠나면 초안은 F1 대로 버려지지만 잠금과 «다시 확인»은 남아
 *   판정이 끝나면 풀린다.
 *
 *   | 판 | 값 |
 *   |---|---|
 *   | 첫 게시가 서버에 닿고(201) 브라우저에는 502 — Chrome(route) | 곧바로 같은 키로 다시 보냄 → **200(재생)** · 초안 비움 · DB 1행 |
 *   | 같은 판 · 연결 끊김 — Chrome(route) | 같음 · DB 1행 |
 *   | 게시를 행 잠금에 막아 둔 채 **api 를 죽임** — Chrome(서버 안 지연) | 첫 게시 · 다시 보낸 것 둘 다 `500 text/plain`(Vite 빈 본문) → «모름» + «다시 확인» → api 를 다시 띄우고 누름 → 7.4s **201** · 풀림 · DB 1행(죽은 첫 요청은 롤백) |
 *   | 첫 게시를 붙잡은 채 로그아웃 — Chrome(route) | 로그아웃에 `ERR_ABORTED` · **다시 보내지 않았다**(POST 1건) · DB 0행 |
 *   | 첫 게시·다시 보낸 것 둘 다 503 → 가 → 나 → 가 — Chrome(route) | 돌아온 상자 꺼짐 · 초안 없음(F1) · «다시 확인» 그대로 → 누르면 201 · 풀림 · DB 1행 |
 * - **설명 — 바탕이 닫는다.** 설명 `PATCH`가 **고치기 전 값**(`base`)을 싣고, 서버가 행 잠금
 *   안에서 지금 값과 견줘 다르면 409 다(계약: `apps/api/src/routes/pages.ts`). 그래서 판정 **뒤에** 서버에 선 쓰기도
 *   커밋 순간에 견준다 — 그 사이 남이 저장했으면 늦은 쓰기는 409 로 떨어지고 **남의 값을 덮지 않는다.** 판정은 셋이다
 *   (`api/page-meta.ts`의 `judgeMeta`): 다시 읽은 값이 내 글이면 원하던 상태 · 바탕이면 «안 저장됨»(초안을 남긴다) ·
 *   그 밖이면 **다른 사람이 바꿨다**(충돌 화면). **«안 저장됨» 뒤에 늦게 커밋되는 길은 남는다** — 판정 순간 서버 값이
 *   바탕이었고 늦은 쓰기의 바탕도 그 값이라 통과한다. 그 값은 **내 글**이라 남의 것을 덮지 않고, 다시 누르면 409 의
 *   지금 값이 내 글이라 «이미 같습니다»로 끝난다. «행 잠금이 온 순서대로 커밋한다»에는 기대지 않는다 — 서버
 *   앞단이 순서를 바꿔도 바탕이 판정한다.
 *
 * ## 떠나 있는 동안 끝난 실패 — 장부가 남기고, 돌아온 방문이 말한다
 *
 * 칸 쓰기는 **그 페이지를 보는 방문**에만 닿는다(`panel-drafts.tsx`의 2번 — 남의 페이지를 오염시키지 않으려는 거름).
 * 그래서 쓰기가 **끝난 순간** 그 페이지를 보는 방문이 없으면(옆 페이지 · 프로젝트 목록 · 테마 편집기에 가 있다) 칸
 * 쓰기만으로는 실패 통지가 버려지고, 401 도 `SignedOut`에 닿지 못한다. Chrome(칸 쓰기만 두고 · 설명·코멘트 · 저장을
 * 붙잡은 채 옆 페이지로): 500 → 나에도 · 돌아온 가에도 통지 0(보낸 글은 떠날 때 버려졌다 · DB 그대로), 401(서버가
 * 세션 행을 지움) → 나에 그대로 머물다 **다음 읽기**에서야 로그인 화면.
 *
 * **새 통지 체계를 세우지 않는다 — 이 장부가 이미 «그 페이지 그 칸의 쓰기»를 들고, 돌아온 방문의 `PendingNotice`가
 * 그것을 그린다.** 끝난 쓰기가 `'failed'`이고 그 순간 받는 방문이 그 페이지를 안 보면(`Receiver.sees`), **쓰기가
 * `settle`에서 돌려준 결말**(`WriteConclusion`)을 본다:
 *
 * - **결말이 실패가 아니면(`null`) 아무것도 안 남긴다** — 실패 응답이 곧 실패인 것은 아니다. 설명의 409
 *   `page-meta-changed`에 실린 지금 값이 내 글이면 원하던 상태다(`judgeMeta`의 `'mine'`).
 * - **401 이면 곧바로 세션을 끝낸다**(`useInvalidateSession` — `SignedOut`이 부르는 것과 같다). 세션은 페이지에 안
 *   매인다. 401 의 판정은 여전히 `toFailure` 하나다 — 쓰기가 칸에 그린 실패가 그 값이고, 여기서 상태 번호를 따로
 *   보지 않는다.
 * - **그 밖이면 실패를 남긴다**(`missed` — 키는 잠금과 같은 (프로젝트, 페이지, 칸)). 잠금이 아니다 — 칸은 열려 있다.
 *   돌아온 방문이 «이 페이지를 떠나 있는 동안 저장하지 못했습니다 — <문장>»으로 말하고(`alert`), «확인»이나 **그 칸의
 *   다음 쓰기**가 지운다. 세대가 바뀌면 장부와 함께 비워진다.
 *
 * 그 페이지를 보고 있으면 아무것도 안 남긴다 — 칸이 스스로 말한다. 세션이 끝나 끊긴 실패도 뺀다.
 *
 * **판정은 장부가 하지 않는다 — 쓰기가 한다.** 장부가 실패 응답을 `toFailure`로 곧바로 읽으면 설명의 409 가 칸의
 * 판정(`judgeMeta`)을 안 지난다 — Chrome: 붙잡은 저장 · 그 사이 남이 **같은 글**을 씀 · 옆 페이지에 가 있음 → 돌아온
 * 가에 «… 저장하지 못했습니다 — 다른 사람이 이 페이지를 먼저 바꿨습니다» · DB 는 내 글(보고 있었으면 «서버의 설명이
 * 이미 이 글과 같습니다»). 그래서 `settle`이 **칸에 그리는 바로 그 판정**의 결말을 돌려주고 장부는 그것을 남긴다 —
 * 떠나 있든 보고 있든 결말은 판정 한 자리를 지난다.
 *
 * | 떠나 있는 동안 온 설명의 409(Chrome · 저장을 붙잡은 채 떠남) | 돌아온 가 |
 * |---|---|
 * | `'mine'` — 그 사이 남이 **같은 글**을 씀 | 통지 없음 · 상자 내 글 · DB 내 글(`'done'`이 떠나 있는 동안 끝난 판과 같다) |
 * | `'other'` — 남이 다른 글 · 옆 페이지 경유 | «… 저장하지 못했습니다 — 다른 사람이 이 설명을 바꿨습니다 · 지금 저장된 설명: <그 값>» · 상자 그 값 |
 * | `'other'` · 프로젝트 목록 경유 | 같은 문장 · 상자는 남은 내 초안 → 다시 저장하면 충돌 화면(덮기 / 버리기) |
 * | `'late'` — «저장되지 않았습니다» 뒤 늦게 커밋된 내 앞 글 | «… — 지금 저장된 설명이 앞서 보낸 글과 같습니다 · 지금 저장된 설명: <앞 글>»(누가 썼는지는 말하지 않는다 — `meta-conflict.tsx`의 머리말) |
 *
 * | 판(Chrome) | 돌아온 자리 |
 * |---|---|
 * | 설명 · 옆 페이지에서 500 | 돌아온 가에 위 문장 + «서버 오류가 발생했습니다» · 나에는 없음 |
 * | 코멘트 게시 · 옆 페이지에서 500 | 같음(문장 같음) |
 * | 설명 · 코멘트 · 옆 페이지에서 401 | 1.5s 안에 `/login` |
 * | 설명 · 코멘트 · 프로젝트 목록에서 500 | 목록에서 돌아온 가에 위 문장 · 초안은 그대로(사이에 연 페이지가 없다 — `panel-drafts.tsx` 머리말 4 의 «F1 과 저장소») |
 * | 설명 · 프로젝트 목록에서 401 | `/login` |
 *
 * ## 판정으로 끝난 쓰기도 전한다 — 종류를 가리지 않는다
 *
 * `'failed'`만 남기면 시간 제한 → 다시 읽기로 **판정된** 결말(«저장되지 않았습니다» · «다른 사람이 바꿨습니다»)과 코멘트
 * 게시의 «이미 달렸고 그 뒤 고쳐졌다 · 지워졌다»(409 `idempotency-key-reused` · `idempotency-key-deleted` — 실패가 아니라
 * `'done'`·`'verified'`로 온다)는 받는 자리가 없을 때 버려진다. 특히 «지워졌다»는 목록 · 상자 · 통지가 다 비어 **말 없는 사라짐**
 * 이다. 그래서 **장부는 결말의 종류를 보지 않는다** — `settle`이 돌려준 `WriteConclusion`이 `null`이 아니면
 * 남긴다(판정은 여전히 쓰기의 몫이다). 실패가 아닌 결말은 `WriteNote`(머리 없이 그 문장만 — `pending-notice.tsx`)다.
 *
 * **«받는 자리가 그린다»는 페이지만의 일이 아니다.** 우측 패널의 본문은 탭 · 모드마다 내려가고, 칸 쓰기는
 * provider 에 닿지만 **돌아온 본문이 마운트에서 지난 통지를 지운다** — `sees`만 보면 같은 페이지의 다른 탭 · 모드에 가 있는
 * 동안 끝난 결말도 말없이 사라진다. 그래서 «그릴 수 있나»는 `sees`(그 페이지를 보나)와 `draws`(그 칸의 결말을 그리는 갈래가 떠 있나 — 그 칸의
 * `PendingNotice`가 선다: `panel-drafts.tsx`의 `PanelLock.draw`) 둘이다. **본문이 아니라 갈래다** — 본문이 떠 있어도 통지를
 * 안 그리는 갈래(설명의 viewer · 코멘트의 폼 밖 · 조기 반환)면 남긴다. 그때 칸에도 같은 결말이 쓰였으므로 받는 자리가 칸의 통지를
 * 지운다(`page-description.tsx` · `comment-panel.tsx` — 남긴 결말이 서면) — 같은 말이 두 번 서지 않게. 그 판은 머리가 «이 탭을 떠나 있는 동안 …»이다(`Missed.stayed`).
 *
 * **돌아온 자리는 말만 한다 — 충돌 화면 · 매달린 값을 다시 세우지 않는다.** 충돌은 «다른 사람이 이 설명을 바꿨습니다 · 지금
 * 저장된 설명: …»(`metaConflictSentence`)으로 말하고, 초안이 남아 있으면(같은 페이지의 다른 탭 · 프로젝트 목록 경유) 그대로 둔다
 * — 다시 저장하면 409 가 충돌 화면을 세운다. 같은 페이지의 다른 탭에서 돌아온 설명은 provider 에 충돌이 남아 있어도 세우지 않는다
 * (`page-description.tsx`의 마운트 이펙트 — 같은 말이 두 번 서지 않게). **매달린 값**(설명 초안의 `pending` · 트리의 `hanging`)은
 * 받는 자리가 없으면 버린다 — 옆 페이지 경유면 초안이 이미 떠날 때 버려졌고(F1), 트리는 그 인스턴스의 것이다. 대가: 그 뒤 늦게
 * 커밋된 내 글이 다음 409 에서 «다른 사람이 …»로 읽힐 수 있다(드물다 — 판정 **뒤** 늦은 커밋이 겹쳐야 선다).
 *
 * 받는 자리가 결말을 못 그리면 **통지 0** 이다(목록 · 상자까지 비는 판도 있다). 장부가 남기면(Chrome):
 *
 * | 판(Chrome) | 돌아온 자리 |
 * |---|---|
 * | 설명 · 옆 페이지 · 판정 `'base'` | «이 페이지를 떠나 있는 동안 저장하지 못했습니다 — 응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다» |
 * | 설명 · 옆 페이지 · 그 사이 밥이 저장(`'other'`) | «… — 다른 사람이 이 설명을 바꿨습니다 · 지금 저장된 설명: 밥 설명» · 상자 `밥 설명` |
 * | 설명 · 프로젝트 목록 경유 · `'base'` | 같은 문장 · 상자에 되살린 초안 `앨리스 설명` |
 * | 코멘트 · 옆 페이지 · 다시 보낸 것이 409 deleted | «이 글은 이미 달렸고, 그 뒤 지워졌습니다»(`status`) — 남기지 않으면 목록 · 상자 · 통지가 다 빈다 |
 * | 코멘트 · 같은 판 · 409 reused | «이 글은 이미 달렸고, 그 뒤 다른 곳에서 고쳐졌습니다 — 목록의 글이 지금 글입니다» |
 * | 트리 · 프로젝트 목록 · `'base'` · `'other'` | «이 화면을 떠나 있는 동안 이름을 바꾸지 못했습니다 — 응답이 없어 … 바뀌지 않았습니다» · «… — 다른 사람이 이 제목을 바꿨습니다 · 지금 저장된 제목: 밥의 이름» |
 * | 설명 · 같은 페이지의 코멘트 탭 · 500 | «이 탭을 떠나 있는 동안 저장하지 못했습니다 — 서버 오류가 발생했습니다» |
 * | 설명 · 편집 모드에 가 있음 · 500 · 코멘트 · 상호작용 탭 · 500 | 같은 문장 |
 *
 * ## 이것이 막지 못하는 것
 *
 * - **초안과 멱등 키가 버려지는 입구 — 이 목록이 그 입구들을 소유한다**(`comment-panel.tsx`의 머리말과
 *   `POST_KEYS`는 여기를 가리킨다). 서버가 이미 받은 게시는 끊겨도 커밋하므로, 입구를 지나 같은 글을 다시 치면
 *   **새 키**다. **초안과 키는 탭의 `sessionStorage`에 비춘다**(`draft-store.tsx` — 입구마다
 *   무엇을 하는지의 판정도 그 파일과 `panel-drafts.tsx` 머리말 4 가 갖는다). 입구마다의 값(Chrome · 서버 안 지연 —
 *   페이지 행 `FOR UPDATE` · 번호 있는 노드):
 *
 *   | 입구 | 초안·키 | 값 |
 *   |---|---|---|
 *   | 새로고침 | **산다** | 게시가 서버에 쥐인 채 1.5s 에 새로고침 → 상자에 그 글 · 같은 키 → 앞 게시가 커밋된 뒤 다시 달기 **200(재생)** · DB 1행. 비추지 않으면 키 둘 · **두 행**. **그 사이 같은 사람이 다른 탭에서 그 코멘트를 고쳤으면** 다시 달기가 409 + 이슈 코드 `idempotency-key-reused` → «이미 달렸고 그 뒤 고쳐졌습니다» · 상자 비움 · `sessionStorage` `{}` · 다시 새로고침해도 `""` · DB 고친 글 1행(그 409 를 «안 달림»으로 읽으면 새로고침마다 같은 글 · 같은 키가 돌아와 누를 때마다 409 다 — `comment-panel.tsx`의 `keyVerdict`) |
 *   | 닫은 탭 다시 열기 | **산다** | Chromium 151 — `chrome.sessions.restore()`(⌘⇧T 와 같은 복원 서비스)로 되살린 탭에 설명·코멘트 초안이 선다. **브랜드 Chrome 은 재지 못했다**(확장을 못 싣는다) |
 *   | 세션 만료(401) → 같은 사람 | **산다** | 게시가 쥐인 채 서버가 세션 행을 지움 → 목록 401 · 게시 `ERR_ABORTED` → 같은 사람 로그인 → 목록 → 그 페이지: 상자에 그 글 · 같은 키 → **200(재생)** · DB 1행. 비추지 않으면 **두 행** |
 *   | 명시적 로그아웃(단추 · 다른 탭의 로그아웃) | **지운다** | 로그아웃 직후 그 사람의 글 **0** — `sessionStorage` `{}` · `localStorage`에는 **세대 번호 표지 하나**(`draft-store.tsx`의 «표지는 세대 번호다») · 쿠키·IndexedDB·Cache 없음. 닫아 둔 탭을 그 뒤에 다시 열면 뜨자마자 `{}`. 로그아웃 **뒤** 같은 사람이 다시 들어와 친 초안은 산다 — 다른 탭이 소식을 4000ms 늦게 들어도(표지 1 그대로 · 새로고침 뒤 그 글), 시계가 10분 뒤로 가도(새로고침 뒤 그 글) |
 *   | 다른 사람(같은 탭 · 다른 탭 · 다시 선 문서의 `me()`) | **들어오는 순간 앞 사람의 칸을 지운다**(`draft-store.tsx`의 `admit`) | 앨리스 만료 → 같은 탭 밥 로그인 직후(목록) `sessionStorage` 키 0 · 밥이 가를 열면 빈 상자 · 밥의 새로고침 · `window.open` 복제 탭 · 닫은 탭 다시 열기(Chromium 151)에 앨리스 글 0. 다른 탭이 밥으로 들어오면 소식을 들은 탭의 키 0. **대가: 앨리스가 그 탭에 돌아와도 설명·코멘트 상자 `""`** |
 *
 *   **남는 틈:**
 *   - **명시적 로그아웃 뒤 같은 글** — 지우는 판정의 대가다. Chrome: 게시가 쥐인 채 로그아웃(`ERR_ABORTED`) → 같은
 *     사람이 다시 들어와 같은 글 → 새 키 → **DB 같은 글 두 행**.
 *   - **되살린 글을 고쳐 단다** — «모름»(판정 중이던 쓰기)은 담지 않는다(`draft-store.tsx`의 «무엇을 드는가»). 새로
 *     선 문서의 상자는 열려 있어 되살린 글을 고치면 새 키다. Chrome: 게시가 쥐인 채 새로고침 → `"원문"`이 돌아옴 →
 *     `"원문 고침"`으로 달기 → DB **`원문` · `원문 고침` 두 행**. 저장소가 닫는 것은 **같은 글을 다시 다는** 길뿐이다.
 *   - **탭을 닫고 새 탭으로 연다** — `sessionStorage`는 탭마다라 새 탭에는 없다.
 *   - **저장소를 못 쓰는 브라우저**(사이트 데이터 차단 · 용량 초과) — 초안과 키가 메모리에만 산다(위 입구 표의 «비추지
 *     않으면»). 로그아웃 표지(`localStorage`)를 못 적으면 닫아 둔 탭의 사본이 남는다(`draft-store.tsx`).
 *
 *   **장부(잠금)는 비추지 않는다** — 잠금은 요청의 수명을 따르고 요청은 문서와 함께 끊겼다. 되살리면 요청 없는
 *   잠금이다. 그래서 새로 선 문서의 상자는 열려 있고, 판정은 같은 글을 다시 다는 것이 한다(같은 키 → 재생).
 * - **세션 경계의 늦은 커밋** — 앞 세션의 쓰기가 서버에 이미 닿아 있었으면 새 세션의 쓰기와 겹친다(위 «세션을
 *   넘지 않는다»의 끝 — 설명은 바탕이 뒤에 선 쓰기를 409 로 떨어뜨린다). **코멘트는 세션 만료 뒤 같은 사람이면 같은
 *   키라 한 행이고, 명시적 로그아웃 뒤에는 두 행이다** — 값은 위 입구 표와 남는 틈.
 * - **다른 탭의 로그인이 알림보다 먼저 닿는 창은 서버가 막는다.** 다른 탭이 다른 사람으로 들어오면 이 탭이 그 소식을
 *   받아 **세대를 올린다**(`session/session-context.tsx`의 «탭 사이»). 소식이 없으면 앨리스 탭의 «다시 확인»이 같은 키로
 *   밥의 쿠키에 실려 201 → **DB alice · bob 두 행**이다(Chrome · 서버 안 지연 24초. 소식을 받으면 다른 탭이 로그아웃하는
 *   순간 이 탭이 로그인 화면 · 장부 `[]` → 밥이 들어오면 목록 · 머리 «bob» · «다시 확인» 없음 · DB 앨리스의 행 하나).
 *   소식만으로는 두 창이 남는다 — 다른 탭의 로그인 응답이 쿠키를 바꾼 순간부터 이 탭이 소식을 받아 커밋하기까지(수 ms)
 *   이 탭이 내는 요청은 새 사람의 쿠키로 나가고, **앱을 지나지 않는 로그인**(개발자 도구의 `fetch('/api/auth/login')`
 *   같은 것)은 소식이 없어 모른다. 그 둘은 서버가 «요청한 탭이 아는 사용자»를 쿠키의 사람과 견줘 다르면 409
 *   `session-user-changed`로 거절해 막는다(`apps/api/src/auth/plugin.ts` · 웹은 `api/known-user.tsx`).
 * - **같은 셸에서 게시 도중 WS 가 다시 붙은 판의 두 번 얹힘 — 보이는 해가 없어 그대로 둔다.** 다시 붙으면 연결 id 가
 *   바뀌는데 게시는 **보낼 때의** id 를 싣는다(첫 보내기도 같은 키 재전송도 — `comment-panel.tsx`의 `submit`). 그러면
 *   서버의 방송이 그 셸의 새 연결에 닿고, 응답의 `markerOps`도 `landed`가 얹는다 — 같은 변화가 두 번 온다. 얹는 것이
 *   같은 `add`라 끝의 문서는 같다(방송이 먼저면 `landed`가 같은 값을 다시 얹고, 뒤면 `seq <= headSeq`로 건너뛴다).
 *   그 사이 화면에 틀린 번호가 서지도 않는다 — Chrome(`routeWebSocket`으로 게시를 붙잡은 채 살아 있는 WS 를 끊어 같은
 *   셸에서 다시 붙인 뒤 놓는다 · 캔버스의 번호를 `MutationObserver`로 모두 기록): 응답의 `markerOps`(seq 9)와 새 연결의
 *   `page-changed`(seq 9)가 같은 `add`로 **두 번 오고**, 응답이 먼저든(그대로 놓음) 방송이 먼저든(응답을 1.5s 붙잡음) 번호
 *   칸의 변화는 `""` → `1` **한 번**뿐이고 «번호를 화면에 반영하지 못했습니다»도 없다. 서는 통지는 재연결 자체의 «연결이
 *   다시 붙어 페이지를 서버 상태로 다시 불러왔습니다 …» 하나다.
 * - **막는 것**(이 목록의 짝): 계정 전환(위 «세션을 넘지 않는다») · «모름»이 계정을 넘는
 *   것(같은 절) · 쓰기 뒤의 다시 받기 매달림(`comment-panel.tsx`의 `refresh`) · 판정용 다시 읽기 매달림
 *   (`attempt`) · 같은 URL 의 HTTP 캐시 잠금(`api/http-client.ts`의 `getPage`) · 시간 안의 모르는 실패 뒤 고쳐
 *   다시 단 코멘트(위 «판정 뒤의 늦은 커밋») · 셸째 떠났다 온 뒤 같은 키로 다시 보낸 게시가 커밋해도(201) 새 셸에
 *   번호가 안 서는 것(`comment-panel.tsx`의 `submit` — 다시 보낸 것이 첫 보내기의 연결을 싣는다) · 그 첫 보내기의
 *   연결 id 가 api 재기동을 넘어 **남의** 연결을 방송에서 빼는 것(서버가 막는다 — `apps/api/src/ws/broadcast.ts`의
 *   `sentBy` · `ws/connection-id.ts`) · 첫 게시 뒤 역할 강등·멤버 제외면 다시 보낸 것이 재생 대신 403·404 를 받아
 *   «안 달림»으로 확정되는 것(서버가 막는다 — `apps/api/README.md`의 «멱등 키») · 다시 보낸 것의 **api 봉투
 *   500** 을 «안 달림»으로 확정하는 것(첫 게시는 커밋됐는데 가드 앞 재생의 DB 오류를 «안 달림»으로 읽으면 고쳐 단
 *   글이 두 행이다 — `comment-panel.tsx`의 `knownRejection`).
 * - **쓰기 뒤의 목록 다시 받기가 응답하지 않는 동안** «목록을 다시 불러오는 중»에 머문다 — 잠금은 풀려
 *   있고 쓰기는 끝났다. 일반 읽기의 시간 제한이 끊는다(`api/http-client.ts`의 `READ_DEADLINE_MS` — 10초 · 두 번 뒤
 *   «서버가 응답하지 않습니다»로 목록 다시 받기의 실패가 선다). 판정용 다시 읽기는 `'checking'`에 머물지 않는다 —
 *   `attempt`의 시간 제한이 끊는다(Chrome: 10s 판정 → 그 판정도 매달려 20s 에 끊김 → «확인하지도 못했습니다» + «다시
 *   확인» → 누르면 판정).
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
import { toFailure, type Failure } from '../api/failure'
import { useInvalidateSession, useSessionEpoch } from '../session/session-context'

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
  /** 칸의 이름(`panel-drafts.tsx`의 `lockSlot` · 트리의 `RENAME_SLOT`). */
  readonly slot: string
  /** 결말을 그릴 받는 자리의 종류(`Receiver`의 계약). 키에는 안 든다 — 칸 이름이 이미 가른다. */
  readonly realm: Realm
}

/**
 * 쓰기가 끝난 모양.
 *
 * - `'done'` — 시간 안에 성공 응답을 받았다.
 * - `'failed'` — 시간 안에 실패했다(실패 응답 · 연결 실패). **결과를 안다: 안 됐다** — 쓰기가 «모르는
 *   실패»라고 한 것(`TrackedWrite.uncertain`)은 여기 안 오고 판정으로 간다. **판정용 다시 읽기가 401 이어도 여기다**
 *   (`attempt` — `caught`는 그 401 이다). 결과는 모르지만 세션이 끝났다 — 칸은 그것을 `toFailure`로 읽어 로그인 화면으로 간다.
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
   * 시간 안에 온 **실패가 결과를 모르는 실패인가** — 그렇다면 `'failed'`가 아니라 판정(`verify`)으로 간다.
   * 없으면 모든 실패가 «안 됐다»다(설명 · 코멘트 수정·삭제·재번호). 코멘트 게시만 준다 — 같은 키로 다시
   * 보내는 판정이 **안전하게 되풀이되는** 쓰기라서다(`comment-panel.tsx`의 `knownRejection`).
   */
  uncertain?(caught: unknown): boolean
  /**
   * 판정한다 — 보통은 서버에서 다시 읽고, 멱등한 쓰기는 **같은 것을 다시 보낸다**(코멘트 게시 —
   * `comment-panel.tsx`의 `submit`). 던지거나 시간이 넘으면 `'unknown'`이다. **`signal`을 요청에
   * 싣는다** — 시간이 넘으면(또는 세션이 끝나면) 끊는다.
   */
  verify(signal: AbortSignal): Promise<V>
  /**
   * 끝난 뒤의 일(응답을 칸에 쓰기 · 초안 비우기 …). **잠금을 쥔 채 돈다** — 이것이 끝나야 풀린다. 그래서
   * **여기서 네트워크를 기다리지 않는다** — 쓰기가 끝났으면 잠금은 풀려야 한다. 코멘트의 목록 다시 받기는
   * 잠금 밖에서 돈다(`comment-panel.tsx`의 `refresh` — 잠금 안에서 매달리면 게시가 커밋됐는데도 상자가 말없이
   * 꺼진 채 F5 말고는 안 풀린다).
   *
   * `ownerLive`는 **쓰기를 시작한 provider 가 아직 떠 있는가**다. 셸이 새로 섰으면 실시간 연결도
   * 새것이라 서버의 방송이 새 스토어에 닿는다 — 판정으로 끝난 코멘트 쓰기가 «번호를 못 얹었다»고
   * 말할지를 이것으로 가른다(`comment-panel.tsx`의 `perform`).
   *
   * **돌려주는 것은 이 쓰기의 결말이다**(`WriteConclusion`) — 칸에 그린 판정 그대로. 그 페이지를 보는 방문이 없으면
   * 장부가 이것을 남긴다(머리말 «떠나 있는 동안 끝난 실패»). **칸에 그리는 자리와 돌려주는 자리가 같은 판정이어야
   * 한다** — 따로 지으면 보고 있을 때와 떠나 있을 때의 말이 갈린다.
   */
  settle(outcome: WriteOutcome<T, V>, ownerLive: boolean): WriteConclusion | Promise<WriteConclusion>
}

/**
 * 끝난 쓰기의 결말 — **돌아온 자리가 말할 것.** 실패면 그 실패, 실패는 아니지만 말해야 하는 끝이면 `WriteNote`, 말할 것이
 * 없으면 `null`. 문장은 쓰기가 칸에 그린 것과 같다(`toFailure`든 칸의 판정이 지은 문장이든). 장부는 이것을 읽기만 한다 —
 * **종류를 가리지 않고 전한다**(머리말 «판정으로 끝난 쓰기도 전한다»).
 */
export type WriteConclusion = Failure | WriteNote | null

/**
 * **실패가 아닌 결말** — 쓰기는 끝났고(«안 됐다»가 아니다) 사용자가 알아야 할 것이 있다. 코멘트 게시의 «이미 달렸고 그 뒤
 * 고쳐졌다 · 지워졌다»(`comment-panel.tsx`의 `keyVerdict`)가 이것이다 — 특히 «지워졌다»는 목록 · 상자 · 통지가 다 비어
 * 이것 말고는 말할 자리가 없다. 돌아온 자리는 «… 저장하지 못했습니다» 머리 없이 이 문장만 말한다(`pending-notice.tsx`).
 */
export interface WriteNote {
  readonly kind: 'note'
  readonly message: string
}

/**
 * 장부가 남긴 결말(`Ledger.missed`) — **받는 자리가 그 결말을 그릴 수 없을 때** 끝났다. `stayed`는 «그 페이지는 보고 있었고
 * 그 칸을 그리는 본문만 내려가 있었다»(같은 페이지의 다른 탭 · 다른 모드 — `Receiver.draws`)다. 머리의 문장이 갈린다.
 */
export interface Missed {
  readonly conclusion: Failure | WriteNote
  readonly stayed: boolean
}

/**
 * 칸의 종류 — **받는 자리를 가른다**(아래 `Receiver`). `'page'`는 우측 패널(`PanelDraftsProvider` — 설명 · 코멘트), `'tree'`는
 * 메뉴 트리(`tree/use-tree-commands.tsx` — 이름 변경).
 */
export type Realm = 'page' | 'tree'

/**
 * 칸 쓰기가 닿을 곳 — **지금 떠 있는 받는 자리**(칸의 종류마다 하나).
 *
 * ## 받는 자리의 계약
 *
 * - **칸의 종류(`realm`)마다 하나다.** 장부는 종류마다 마지막으로 선 자리 하나만 든다(`receive`). 쓰기(`WriteTarget.realm`)와
 *   칸 쓰기(`deliver`의 `from.realm`)도 종류를 하나 갖는다 — 그래서 **한 쓰기를 보고 받는 자리는 많아야 하나다**(둘이 같은
 *   결말을 함께 말하는 판이 구조로 없다). 설명 · 코멘트는 `'page'` 하나다.
 * - **`accept`는 칸 쓰기를 받는다** — 자기가 그리는 자리(`at`)를 보고 있을 때만 쓰고, 아니면 버린다. 칸과 값의 모양은 받는
 *   자리의 몫이다(`panel-drafts.tsx` · 트리).
 * - **`sees`는 «이 쓰기의 결말을 지금 그릴 수 있나»다** — `accept`가 그 자리를 받는가와 **같은 판정**이어야 한다. 거짓이면
 *   장부가 결말을 남긴다(머리말 «떠나 있는 동안 끝난 실패»). 우측 패널은 (프로젝트, 페이지)를, 트리는 프로젝트를 본다 — 트리는
 *   그 프로젝트의 어느 페이지에서나 떠 있다.
 */
export interface Receiver {
  readonly token: symbol
  readonly realm: Realm
  /** `at`을 보고 있으면 그 칸에 쓴다. 칸과 값의 모양은 받는 자리의 몫이다. */
  readonly accept: (at: PageAt, key: object, update: unknown) => void
  /** 지금 `at`을 보고 있는가 — 칸 쓰기가 닿을 곳이 있는가(`accept`가 받는가와 같은 판정). */
  readonly sees: (at: PageAt) => boolean
  /**
   * **그 칸의 결말을 그리는 갈래가 지금 떠 있는가**(잠금 칸 이름 — `WriteTarget.slot` · 서는 자리는 `PendingNotice`).
   * 없으면 늘 떠 있다(트리 — 트리가 곧 그 본문이다). 우측 패널은 본문이 탭 · 모드마다 내려간다(`routes/editor.tsx`의 `RightPanel`) — 칸 쓰기는 provider 에 닿지만
   * 돌아온 본문이 마운트에서 지난 통지를 지우므로(`page-description.tsx` · `comment-panel.tsx`의 마운트 이펙트) `sees`만 보면 그 결말은
   * 말없이 사라진다(Chrome: 설명 · 코멘트의 500 이 다른 탭 · 다른 모드에 가 있는 동안 끝나면 돌아와도 통지 0).
   * 거짓이면 `sees`가 참이어도 장부가 결말을 남긴다.
   */
  readonly draws?: (slot: string) => boolean
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
   * **그 페이지를 보는 방문이 없을 때 끝난 실패**(머리말 «떠나 있는 동안 끝난 실패») — 키는 `writes`와 같다. 잠금이
   * 아니다 — 그 칸은 열려 있다. 돌아온 방문이 말하고(`PendingNotice`), 닫거나 그 칸의 다음 쓰기가 지운다.
   */
  readonly missed: ReadonlyMap<string, Missed>
  /** 남긴 실패를 지운다(«확인»). */
  dismiss(target: WriteTarget): void
  /**
   * 쓰기를 올린다. **잠겨 있는지는 부르는 쪽이 먼저 본다**(`usePanelLock`의 `locked`) — 여기서
   * 한 번 더 막지 않는다. 막을 길을 찾아 봤는데 화면에서 닿는 길이 없었다: 클릭·제출은 React 가
   * 곧바로 다시 그린 뒤에 다음 이벤트를 받으므로 둘째 클릭은 이미 꺼진 버튼을 본다. 재는 것이 없는
   * 가드를 두지 않았다.
   */
  run<T, V>(target: WriteTarget, owner: symbol, write: TrackedWrite<T, V>): Promise<void>
  /** 지금 떠 있는 받는 자리로 선다 — 같은 종류의 앞 자리를 갈아 끼운다. 돌려주는 함수가 물러난다. */
  receive(receiver: Receiver): () => void
  /**
   * 칸 쓰기를 보낸다 — **`from`과 같은 종류의 지금 떠 있는 받는 자리**로(없으면 `from`에게). **지난 세대의 것은
   * 버린다**(머리말 «세션을 넘지 않는다»).
   */
  deliver(from: Receiver, at: SlotAt, key: object, update: unknown): void
}

/** 장부 — 항목과 그것이 속한 세션 세대. 세대가 바뀌면 통째로 새것이 된다. */
interface Book {
  readonly epoch: number
  readonly writes: ReadonlyMap<string, WriteEntry>
  readonly missed: ReadonlyMap<string, Missed>
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

const NOTHING_MISSED: ReadonlyMap<string, Missed> = new Map()

export function WriteLedgerProvider(props: { children: ReactNode }): ReactElement {
  const epoch = useSessionEpoch()
  const invalidate = useInvalidateSession()
  const [book, setBook] = useState<Book>(() => ({ epoch, writes: new Map(), missed: NOTHING_MISSED }))
  /** 종류마다 지금 떠 있는 받는 자리 하나(`Receiver`의 계약). */
  const receiversRef = useRef(new Map<Realm, Receiver>())
  const liveRef = useRef<Live | null>(null)

  // **세대가 바뀌면 항목을 비운다 — 렌더 중에**(`panel-drafts.tsx`가 페이지가 바뀌면 칸을 버리는 것과
  // 같은 모양). 이펙트로 비우면 새 세대의 첫 커밋 하나 동안 앞 세션의 잠금이 그려진다.
  if (book.epoch !== epoch) setBook({ epoch, writes: new Map(), missed: NOTHING_MISSED })

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
      return { ...prev, writes }
    })
  }, [])

  /** 남긴 실패 하나를 고친다 — `put`과 같은 규칙(낸 세대의 장부일 때만). */
  const note = useCallback((at: number, key: string, entry: Missed | null) => {
    setBook((prev) => {
      if (prev.epoch !== at) return prev
      if (entry === null && !prev.missed.has(key)) return prev
      const missed = new Map(prev.missed)
      if (entry === null) missed.delete(key)
      else missed.set(key, entry)
      return { ...prev, missed }
    })
  }, [])

  const run = useCallback(
    async <T, V>(target: WriteTarget, owner: symbol, write: TrackedWrite<T, V>): Promise<void> => {
      const live = liveRef.current
      if (live === null) throw new Error('쓰기 장부가 아직 서지 않았다')
      const key = writeKey(target)
      const report = (entry: WriteEntry | null): void => put(live.epoch, key, entry)
      report(SENDING)
      // 그 칸의 새 쓰기가 나가면 앞 쓰기가 남긴 실패는 낡았다.
      note(live.epoch, key, null)
      try {
        // **세대가 바뀌면 이 쓰기를 끊는다**(머리말 «세션을 넘지 않는다») — 보내기도 판정도 낸 세대의 신호에
        // 매인다(`race`). 끊긴 거절은 «실패»로 끝나고, 그 뒷일의 칸 쓰기는 `deliver`가 지난 세대라 버린다.
        const outcome = await attempt(write, report, live.signal)
        // **그 자리를 보는 받는 자리가 있는가는 끝난 순간에 본다**(머리말 «떠나 있는 동안 끝난 실패») — 보고 있으면 칸이
        // 말한다(`settle`의 칸 쓰기가 닿는다). 세션이 끝나 끊긴 실패는 뺀다 — 앞 세션의 일이다. 보는 자리는 **그 쓰기의
        // 종류의 것 하나**다(`Receiver`의 계약).
        //
        // **결말의 종류는 가리지 않는다**(머리말 «판정으로 끝난 쓰기도 전한다»). `'failed'`만 남기면 판정으로 끝난
        // 결말(«저장되지 않았습니다» · «다른 사람이 바꿨습니다» · «이미 달렸고 그 뒤 지워졌습니다»)이 버려진다.
        const receiver = receiversRef.current.get(target.realm)
        const page = receiver?.sees(target) === true
        const drawn = page && (receiver?.draws?.(target.slot) ?? true)
        const unseen = !live.signal.aborted && !drawn
        const conclusion = await write.settle(outcome, receiver?.token === owner)
        // **판정은 쓰기가 했다**(`settle`의 결말 — 머리말 «판정은 장부가 하지 않는다»). 말할 것이 없으면(`null`) 남길 것도 없다.
        if (unseen && conclusion !== null) {
          // **세션은 페이지에 안 매인다** — 어디에 가 있든 로그인 화면으로 간다(`SignedOut`이 부르는 것과 같은 것).
          if (conclusion.kind === 'signed-out') invalidate()
          else note(live.epoch, key, { conclusion, stayed: page })
        }
      } finally {
        report(null)
      }
    },
    [put, note, invalidate],
  )

  const dismiss = useCallback((target: WriteTarget) => {
    const at = liveRef.current?.epoch
    if (at !== undefined) note(at, writeKey(target), null)
  }, [note])

  const receive = useCallback((receiver: Receiver) => {
    const receivers = receiversRef.current
    receivers.set(receiver.realm, receiver)
    return () => {
      if (receivers.get(receiver.realm) === receiver) receivers.delete(receiver.realm)
    }
  }, [])

  const deliver = useCallback((from: Receiver, at: SlotAt, key: object, update: unknown) => {
    // **지난 세대의 칸 쓰기는 버린다** — 앞 세션의 응답(통지 · 401 의 `SignedOut` · 다시 받은 목록)이 다음
    // 세션의 방문에 닿지 않는다. 401 을 로그인 화면으로 바꾸는 판정은 여전히 `api/failure.tsx` 한 곳이다 —
    // 여기는 그 판정에 닿을 **칸 쓰기**를 거른다.
    if (at.epoch !== liveRef.current?.epoch) return
    ;(receiversRef.current.get(from.realm) ?? from).accept(at, key, update)
  }, [])

  const { writes, missed } = book
  const ledger = useMemo<Ledger>(
    () => ({ writes, missed, dismiss, run, receive, deliver }),
    [writes, missed, dismiss, run, receive, deliver],
  )
  return <LedgerContext.Provider value={ledger}>{props.children}</LedgerContext.Provider>
}

/** 시간 안에 온 답, 또는 시간이 넘었다는 표지. */
type Raced<X> = { value: X } | { caught: unknown } | typeof EXPIRED

/**
 * 요청 하나를 **시간 제한 안에서** 기다린다 — 넘으면 끊고 `EXPIRED`다. 보내기와 판정이 같은 규칙을 쓴다.
 * 요청은 **낸 세대의 신호**(`session`)에도 매인다 — 세대가 바뀌면 함께 끊긴다.
 *
 * **끊긴 요청의 거절은 «실패»가 아니다.** 끊는 순간 `fetch`가 거절하지만(실제 `fetch`처럼 신호를
 * 받으면 거절하는 가짜로 케이스가 잰다) 그 거절은 아래 `then`을 한 번 더 지나 경주에 들어가므로,
 * 같은 순간에 풀린 `expired`가 먼저 선다. 그래서 시간이 되면 언제나 `EXPIRED`다.
 *
 * **끊는 것이 다음 요청보다 먼저다.** 타이머 콜백이 `resolve` 뒤에 곧바로 `abort`하고 판정은 `await` 뒤에
 * 나간다. 이 순서에 기대는 것은 없다 — 설명의 다시 읽기(`GET …/pages/:id`)는 끊긴 쓰기(`PATCH`)와
 * **같은 URL** 이라 HTTP 캐시를 지나면 쓰기가 살아 있는 동안 Chrome 의 캐시 잠금에 서는데, 그 GET 은 캐시를 안
 * 지난다(`api/http-client.ts`의 `getPage` — `no-store`). 순서는 그대로 둔다.
 */
async function race<X>(start: (signal: AbortSignal) => Promise<X>, session: AbortSignal): Promise<Raced<X>> {
  const controller = new AbortController()
  const cut = (): void => controller.abort()
  session.addEventListener('abort', cut)
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<typeof EXPIRED>((resolve) => {
    timer = setTimeout(() => {
      resolve(EXPIRED)
      controller.abort()
    }, WRITE_DEADLINE_MS)
  })
  try {
    let sent: Promise<X>
    try {
      sent = start(controller.signal)
    } catch (caught) {
      return { caught }
    }
    // 경주에서 진 쪽의 거절이 처리되지 않은 채 떠돌지 않게 붙잡는다 — 늦게 온 응답은 버린다.
    sent.catch(() => undefined)
    return await Promise.race([
      sent.then(
        (value) => ({ value }) as const,
        (caught: unknown) => ({ caught }) as const,
      ),
      expired,
    ])
  } finally {
    clearTimeout(timer)
    session.removeEventListener('abort', cut)
  }
}

/**
 * 보내고, 시간 안에 오면 그 답을, 안 오면 끊고 **판정한 답**을 낸다.
 *
 * **판정에도 시간 제한이 있다** — 없으면 다시 읽기가 응답하지 않을 때 `'checking'`에 머물고 «다시 확인»도
 * 없다. F5 말고 탈출구가 없고 초안을 잃는다. 넘으면 끊고 `'unknown'` —
 * «다시 확인»이 선다. 일반 읽기(조회 이펙트 · 쓰기 뒤의 목록 다시 받기)의 시간 제한은 따로 있다 — `api/http-client.ts`의
 * `READ_DEADLINE_MS`. 판정용 읽기는 신호를 싣고 가므로 그쪽이 안 걸고 여기가 잰다. 값은 쓰기와 같은 `WRITE_DEADLINE_MS`다 — 다시 읽기
 * GET(페이지 · 코멘트 목록)도 쓰기처럼 수십 ms 안에 끝나고(머리말 «값» 표와 같은 방법으로 다시 잰다), 게시의 판정은 쓰기 그
 * 자체다(같은 키로 다시 보낸다).
 */
async function attempt<T, V>(
  write: TrackedWrite<T, V>,
  report: (entry: WriteEntry) => void,
  session: AbortSignal,
): Promise<WriteOutcome<T, V>> {
  const first = await race((signal) => write.send(signal), session)
  if (first !== EXPIRED) {
    if ('value' in first) return { kind: 'done', value: first.value }
    // **세션이 끝나 끊긴 실패는 판정하지 않는다** — 끊긴 거절도 «연결 실패»로 읽혀, 판정으로 보내면 로그아웃
    // 뒤에 다시 보낸다(머리말 «세션을 넘지 않는다»). 그 밖의 모르는 실패만 판정으로 간다(`uncertain`).
    if (session.aborted || write.uncertain?.(first.caught) !== true) return { kind: 'failed', caught: first.caught }
  }

  // 시간 안에 응답이 없었거나 모르는 실패였다 — 결과를 모른다. 판정한다(다시 읽기 — 게시는 다시 보내기).
  for (;;) {
    report(CHECKING)
    const checked = await race((signal) => write.verify(signal), session)
    if (checked !== EXPIRED && 'value' in checked) return { kind: 'verified', verdict: checked.value }
    // **다시 읽기가 401 이면 «모름»이 아니다 — 세션이 끝났다.** 이것을 «확인하지도 못했습니다»로 삼키면 다른 탭에서
    // 로그아웃한 사람이 «다시 확인»을 눌러도 잠긴 칸 앞에 머문다(Chrome — 트리는 조작 전부가 잠긴 채). 결말은
    // `'failed'`에 그 401 을 싣는다 — 칸이 `toFailure`로 읽어 로그인 화면을 그리고, 보는 칸이 없으면 장부가 세션을 끝낸다(`run`).
    // 401 의 판정은 여전히 `toFailure` 한 곳이다. 끊긴 요청(세대가 바뀌었다)은 여기 안 온다 — 끊긴 거절은 401 이 아니다.
    if (checked !== EXPIRED && toFailure(checked.caught, '').kind === 'signed-out') return { kind: 'failed', caught: checked.caught }
    await new Promise<void>((resolve) => report({ phase: 'unknown', recheck: resolve }))
  }
}

/** 장부. **provider 가 없으면 요란하게 깨진다** — 조용히 물러나면 잠금이 셸과 함께 다시 사라진다. */
export function useWriteLedger(): Ledger {
  const ledger = useContext(LedgerContext)
  if (ledger === null) throw new Error('쓰기 장부는 WriteLedgerProvider 안에서만 쓴다')
  return ledger
}
