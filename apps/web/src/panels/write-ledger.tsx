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
 * **초안은 들지 않는다.** 여기 드는 것은 «나가 있는 쓰기»뿐이다. 초안이 에디터 밖을 넘는 길은 따로 있다 —
 * 탭의 저장소에 비춘 사본이다(`panel-drafts.tsx` 머리말 4 · `draft-store.tsx`).
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
 * 앞 사람의 쓰기로 다음 사람을 잠그는 것은 안 된다. **설명은 이월 P(2026-09-23)가 닫았다** — 두 쓰기가 같은 바탕을
 * 싣고 오므로 뒤에 선 것은 앞의 것이 커밋한 값을 보고 409 다(덮지 않는다 — `page-description.tsx`의 «남의 저장을
 * 조용히 덮지 않는다»). 코멘트는 멱등 키가 닫는다.
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
 * ## 판정 뒤의 늦은 커밋 — 코멘트는 멱등 키가, 설명은 바탕이 닫는다
 *
 * 다시 읽은 «서버 값이 보낸 값과 다르다»(설명 · 코멘트 수정·삭제의 판정)는 **그 순간 아직** 아니라는
 * 뜻이지 영영 아니라는 뜻이 아니다. 요청이 이미 서버에 있으면 판정 뒤에 커밋될 수 있다(Chrome — 서버가
 * 받은 채 DB 행 잠금에 막힌 판: 10초에 «안 됨», 13.4초에 커밋).
 *
 * - **코멘트 — 닫았다: 판정이 곧 같은 키로 다시 보내는 것이다.** 서버는 같은 키면 앞 행을 돌려주므로
 *   (`apps/api/README.md`의 «멱등 키») 다시 보낸 것의 답이 **확정**이다 — 커밋됐으면 재생(200), 아니면
 *   지금 커밋(201). 앞 판은 목록을 다시 읽어 «같은 노드 · 같은 글 · 내가 쓴 행»을 찾았고, 그래서 목록을
 *   읽은 **뒤** 다른 곳에서 달린 같은 글을 이 게시로 쳤다(리뷰 2-2). «안 달림»은 이제 다시 보낸 것이
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
 *   | 첫 게시를 route 에 붙잡고(안 닿음) 목록을 읽은 뒤 다른 곳에서 같은 글 | 10.0s 끊김 → 10.1s 다시 보낸 것 **201** · DB 같은 글 **두 행**(다른 곳의 것 + 이것 — 앞 판은 이것을 잃었다) |
 *
 *   **리뷰 6(«고치면 새 키»가 늦은 커밋 창을 다시 연다)은 이 길에서 닫혔다** — 판정하는 동안 상자가 잠겨
 *   고칠 수 없고, 판정이 끝나면 이미 확정이다(위 표 첫 줄·셋째 줄. 앞 판은 11s «안 달림» 뒤 고쳐 달면 두
 *   행, 페이지 왕복 뒤 다시 치면 같은 글 두 행이었다 — 리뷰 4, Chrome).
 *
 *   **시간 안의 모르는 실패도 닫았다**(2026-09-22 — 코디네이터 판정). 앞 판은 첫 게시가 서버에 닿았는데
 *   브라우저가 502·연결 끊김을 받으면 `'failed'`라 판정을 안 지나고 초안이 열려, `"원문!"`으로 고쳐 달면 새
 *   키 → DB `원문` · `원문!` 두 행이었다(Chrome route). 이제 첫 보내기의 **모르는 실패**(무엇인지는
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
 * - **설명 — 바탕이 닫는다(이월 P · 2026-09-23).** 설명 `PATCH`가 **고치기 전 값**(`base`)을 싣고, 서버가 행 잠금
 *   안에서 지금 값과 견줘 다르면 409 다(계약: `apps/api/src/routes/pages.ts`). 그래서 판정 **뒤에** 서버에 선 쓰기도
 *   커밋 순간에 견준다 — 그 사이 남이 저장했으면 늦은 쓰기는 409 로 떨어지고 **남의 값을 덮지 않는다.** 판정은 셋이다
 *   (`api/page-meta.ts`의 `judgeMeta`): 다시 읽은 값이 내 글이면 원하던 상태 · 바탕이면 «안 저장됨»(초안을 남긴다) ·
 *   그 밖이면 **다른 사람이 바꿨다**(충돌 화면). **«안 저장됨» 뒤에 늦게 커밋되는 길은 남는다** — 판정 순간 서버 값이
 *   바탕이었고 늦은 쓰기의 바탕도 그 값이라 통과한다. 그 값은 **내 글**이라 남의 것을 덮지 않고, 다시 누르면 409 의
 *   지금 값이 내 글이라 «이미 같습니다»로 끝난다. 앞 판에서 이 틈을 좁게 만들던 «행 잠금이 온 순서대로 커밋한다»는
 *   이제 하중이 아니다 — 서버 앞단이 순서를 바꿔도 바탕이 판정한다.
 *
 * ## 떠나 있는 동안 끝난 실패 — 장부가 남기고, 돌아온 방문이 말한다 (이월 S · 2026-09-23)
 *
 * 칸 쓰기는 **그 페이지를 보는 방문**에만 닿는다(`panel-drafts.tsx`의 2번 — 남의 페이지를 오염시키지 않으려는 거름).
 * 그래서 쓰기가 **끝난 순간** 그 페이지를 보는 방문이 없으면(옆 페이지 · 프로젝트 목록 · 테마 편집기에 가 있다) 실패
 * 통지는 버려졌고, 401 도 `SignedOut`에 닿지 못했다. Chrome(앞 판 · 설명·코멘트 · 저장을 붙잡은 채 옆 페이지로):
 * 500 → 나에도 · 돌아온 가에도 통지 0(보낸 글은 떠날 때 버려졌다 · DB 그대로), 401(서버가 세션 행을 지움) → 나에
 * 그대로 머물다 **다음 읽기**에서야 로그인 화면.
 *
 * **새 통지 체계를 세우지 않았다 — 이 장부가 이미 «그 페이지 그 칸의 쓰기»를 들고, 돌아온 방문의 `PendingNotice`가
 * 그것을 그린다.** 끝난 쓰기가 `'failed'`이고 그 순간 받는 방문이 그 페이지를 안 보면(`Receiver.sees`):
 *
 * - **401 이면 곧바로 세션을 끝낸다**(`useInvalidateSession` — `SignedOut`이 부르는 것과 같다). 세션은 페이지에 안
 *   매인다. 401 의 판정은 여전히 `toFailure` 하나다 — 여기서 상태 번호를 따로 보지 않는다.
 * - **그 밖이면 실패를 남긴다**(`missed` — 키는 잠금과 같은 (프로젝트, 페이지, 칸)). 잠금이 아니다 — 칸은 열려 있다.
 *   돌아온 방문이 «이 페이지를 떠나 있는 동안 저장하지 못했습니다 — <문장>»으로 말하고(`alert`), «확인»이나 **그 칸의
 *   다음 쓰기**가 지운다. 세대가 바뀌면 장부와 함께 비워진다.
 *
 * 그 페이지를 보고 있으면 아무것도 안 남긴다 — 칸이 스스로 말한다(앞 판 그대로). 세션이 끝나 끊긴 실패도 뺀다.
 *
 * | 판(Chrome) | 앞 판 | 이 판 |
 * |---|---|---|
 * | 설명 · 옆 페이지에서 500 | 통지 0 · 돌아온 상자 서버 값 | 돌아온 가에 위 문장 + «서버 오류가 발생했습니다» · 나에는 없음 |
 * | 코멘트 게시 · 옆 페이지에서 500 | 통지 0 | 같음(문장 같음) |
 * | 설명 · 코멘트 · 옆 페이지에서 401 | 나에 머묾 → 다음 읽기에 로그인 | 1.5s 안에 `/login` |
 * | 설명 · 코멘트 · 프로젝트 목록에서 500 | 통지 0 | 목록에서 돌아온 가에 위 문장 · 초안은 그대로(이월 X — 사이에 연 페이지가 없다) |
 * | 설명 · 프로젝트 목록에서 401 | 목록에 머묾 | `/login` |
 *
 * **판정으로 끝난 쓰기는 남기지 않는다**(`'verified'` — «저장되지 않았습니다» · «다른 사람이 바꿨습니다» 같은 판정의 뜻은
 * 칸이 정한다). 떠나 있는 동안 판정이 끝나면 그 판정은 여전히 버려진다 — 남는 틈이다(판정이 가는 길은 시간 초과 ·
 * 모르는 실패뿐이라 드물다).
 *
 * ## 이것이 막지 못하는 것
 *
 * - **초안과 멱등 키가 버려지는 입구 — 이 목록이 그 입구들을 소유한다**(`comment-panel.tsx`의 머리말과
 *   `POST_KEYS`는 여기를 가리킨다). 서버가 이미 받은 게시는 끊겨도 커밋하므로, 입구를 지나 같은 글을 다시 치면
 *   **새 키**다. **2026-09-23(이월 X)부터 초안과 키는 탭의 `sessionStorage`에 비춘다**(`draft-store.tsx` — 입구마다
 *   무엇을 하는지의 판정도 그 파일과 `panel-drafts.tsx` 머리말 4 가 갖는다). 입구마다의 값(Chrome · 서버 안 지연 —
 *   페이지 행 `FOR UPDATE` · 번호 있는 노드):
 *
 *   | 입구 | 초안·키 | 값 |
 *   |---|---|---|
 *   | 새로고침 | **산다** | 게시가 서버에 쥐인 채 1.5s 에 새로고침 → 상자에 그 글 · 같은 키 → 앞 게시가 커밋된 뒤 다시 달기 **200(재생)** · DB 1행. 앞 판: 키 둘 · **두 행**. **그 사이 같은 사람이 다른 탭에서 그 코멘트를 고쳤으면** 다시 달기가 409 + 이슈 코드 `idempotency-key-reused` → «이미 달렸고 그 뒤 고쳐졌습니다» · 상자 비움 · `sessionStorage` `{}` · 다시 새로고침해도 `""` · DB 고친 글 1행(2026-09-23 — 리뷰 R1. 앞 판은 409 가 «안 달림»이라 새로고침마다 같은 글 · 같은 키가 돌아와 누를 때마다 409 — `comment-panel.tsx`의 `reusedKey`) |
 *   | 닫은 탭 다시 열기 | **산다** | Chromium 151 — `chrome.sessions.restore()`(⌘⇧T 와 같은 복원 서비스)로 되살린 탭에 설명·코멘트 초안이 선다. **브랜드 Chrome 은 재지 못했다**(확장을 못 싣는다) |
 *   | 세션 만료(401) → 같은 사람 | **산다** | 게시가 쥐인 채 서버가 세션 행을 지움 → 목록 401 · 게시 `ERR_ABORTED` → 같은 사람 로그인 → 목록 → 그 페이지: 상자에 그 글 · 같은 키 → **200(재생)** · DB 1행. 앞 판: **두 행**(좁은 반증 3차) |
 *   | 명시적 로그아웃(단추 · 다른 탭의 로그아웃) | **지운다** | 로그아웃 직후 그 사람의 글 **0** — `sessionStorage` `{}` · `localStorage`에는 **세대 번호 표지 하나**(2026-09-23 전에는 시각 — 리뷰 R2·R3, `draft-store.tsx`의 «표지는 세대 번호다») · 쿠키·IndexedDB·Cache 없음. 닫아 둔 탭을 그 뒤에 다시 열면 뜨자마자 `{}`. 로그아웃 **뒤** 같은 사람이 다시 들어와 친 초안은 산다 — 다른 탭이 소식을 4000ms 늦게 들어도(표지 1 그대로 · 새로고침 뒤 그 글), 시계가 10분 뒤로 가도(새로고침 뒤 그 글) |
 *   | 다른 사람(같은 탭 · 다른 탭 · 다시 선 문서의 `me()`) | **들어오는 순간 앞 사람의 칸을 지운다**(`draft-store.tsx`의 `admit` — 리뷰 (c)) | 앨리스 만료 → 같은 탭 밥 로그인 직후(목록) `sessionStorage` 키 0 · 밥이 가를 열면 빈 상자 · 밥의 새로고침 · `window.open` 복제 탭 · 닫은 탭 다시 열기(Chromium 151)에 앨리스 글 0. 다른 탭이 밥으로 들어오면 소식을 들은 탭의 키 0. **대가: 앨리스가 그 탭에 돌아와도 설명·코멘트 상자 `""`** |
 *
 *   **남는 틈:**
 *   - **명시적 로그아웃 뒤 같은 글** — 지우는 판정의 대가다. Chrome: 게시가 쥐인 채 로그아웃(`ERR_ABORTED`) → 같은
 *     사람이 다시 들어와 같은 글 → 새 키 → **DB 같은 글 두 행**.
 *   - **되살린 글을 고쳐 단다** — «모름»(판정 중이던 쓰기)은 담지 않는다(`draft-store.tsx`의 «무엇을 드는가»). 새로
 *     선 문서의 상자는 열려 있어 되살린 글을 고치면 새 키다. Chrome: 게시가 쥐인 채 새로고침 → `"원문"`이 돌아옴 →
 *     `"원문 고침"`으로 달기 → DB **`원문` · `원문 고침` 두 행**. 앞 판도 같은 길이었다(새로고침 뒤에는 무엇을 쳐도
 *     새 키) — 이 일이 닫은 것은 **같은 글을 다시 다는** 길이다.
 *   - **탭을 닫고 새 탭으로 연다** — `sessionStorage`는 탭마다라 새 탭에는 없다.
 *   - **저장소를 못 쓰는 브라우저**(사이트 데이터 차단 · 용량 초과) — 이 판 앞과 같다. 로그아웃 표지(`localStorage`)를 못 적으면
 *     닫아 둔 탭의 사본이 남는다(`draft-store.tsx`).
 *
 *   **장부(잠금)는 비추지 않는다** — 잠금은 요청의 수명을 따르고 요청은 문서와 함께 끊겼다. 되살리면 요청 없는
 *   잠금이다. 그래서 새로 선 문서의 상자는 열려 있고, 판정은 같은 글을 다시 다는 것이 한다(같은 키 → 재생).
 * - **세션 경계의 늦은 커밋** — 앞 세션의 쓰기가 서버에 이미 닿아 있었으면 새 세션의 쓰기와 겹친다(위 «세션을
 *   넘지 않는다»의 끝 — 설명은 이 스택에서 온 순서대로라 뒤가 이겼다). **코멘트는 세션 만료 뒤 같은 사람이면 같은
 *   키라 한 행이고, 명시적 로그아웃 뒤에는 두 행이다** — 값은 위 입구 표와 남는 틈.
 * - **다른 탭의 로그인이 알림보다 먼저 닿는 창**(이월 Y 를 닫은 뒤 남은 것). 다른 탭이 다른 사람으로 들어오면 이 탭이
 *   그 소식을 받아 **세대를 올린다**(`session/session-context.tsx`의 «탭 사이» — 이월 Y 는 거기서 닫혔다. Chrome · 서버 안
 *   지연 24초: 앞 판은 앨리스 탭의 «다시 확인»이 같은 키로 201 → **DB alice · bob 두 행**, 고친 뒤는 다른 탭이 로그아웃하는
 *   순간 이 탭이 로그인 화면 · 장부 `[]` → 밥이 들어오면 목록 · 머리 «bob» · «다시 확인» 없음 · DB 앨리스의 행 하나).
 *   **닫지 못한 것은 둘이다** — 다른 탭의 로그인 응답이 쿠키를 바꾼 순간부터 이 탭이 소식을 받아 커밋하기까지(수 ms ·
 *   값은 이 슬라이스의 보고서) 이 탭이 내는 요청은 새 사람의 쿠키로 나가고, **앱을 지나지 않는 로그인**(개발자 도구의
 *   `fetch('/api/auth/login')` 같은 것)은 소식이 없어 모른다. 둘 다 서버가 «요청한 탭이 아는 사용자»를 확인해야 닫힌다.
 * - **같은 셸에서 게시 도중 WS 가 다시 붙은 판의 두 번 얹힘**(코드 읽기 · 재지 않음 — 이월). 다시 붙으면 연결 id 가
 *   바뀌는데 게시는 **보낼 때의** id 를 싣는다(첫 보내기도 같은 키 재전송도 — `comment-panel.tsx`의 `submit`). 그러면
 *   서버의 방송이 그 셸의 새 연결에 닿고, 응답의 `markerOps`도 `landed`가 얹는다 — 같은 변화가 두 번 온다. 첫 보내기
 *   때부터 있던 모양이다. 얹는 것이 같은 `add`라 끝의 문서는 같다고 읽힌다(방송이 먼저면 `landed`가 같은 값을 다시
 *   얹고, 뒤면 `seq <= headSeq`로 건너뛴다). **그 사이 화면에 잠깐이라도 틀린 번호가 보이는지는 모른다.**
 * - **닫은 것**(리뷰 7번이 이 목록에 없다고 짚은 것): 계정 전환(위 «세션을 넘지 않는다») · «모름»이 계정을 넘는
 *   것(같은 절) · 쓰기 뒤의 다시 받기 매달림(`comment-panel.tsx`의 `refresh`) · 판정용 다시 읽기 매달림
 *   (`attempt`) · 같은 URL 의 HTTP 캐시 잠금(`api/http-client.ts`의 `getPage`) · 시간 안의 모르는 실패 뒤 고쳐
 *   다시 단 코멘트(위 «판정 뒤의 늦은 커밋») · 셸째 떠났다 온 뒤 같은 키로 다시 보낸 게시가 커밋하면(201) 새 셸에
 *   번호가 안 서던 것(`comment-panel.tsx`의 `submit` — 다시 보낸 것이 첫 보내기의 연결을 싣는다) · 그 첫 보내기의
 *   연결 id 가 api 재기동을 넘어 **남의** 연결을 방송에서 빼던 것(서버가 닫았다 — `apps/api/src/ws/broadcast.ts`의
 *   `sentBy` · `ws/connection-id.ts`) · 첫 게시 뒤 역할 강등·멤버 제외면 다시 보낸 것이 재생 대신 403·404 를 받아
 *   «안 달림»으로 확정되던 것(서버가 닫았다 — `apps/api/README.md`의 «멱등 키») · 다시 보낸 것의 **api 봉투
 *   500** 을 «안 달림»으로 확정하던 것(좁은 반증 4차 — 첫 게시는 커밋됐는데 가드 앞 재생의 DB 오류로 고쳐 달면
 *   두 행이었다. `comment-panel.tsx`의 `knownRejection`).
 * - **쓰기 뒤의 목록 다시 받기가 응답하지 않으면** «목록을 다시 불러오는 중»에 머문다 — 잠금은 풀려
 *   있고 쓰기는 끝났다. 일반 읽기에는 시간 제한을 두지 않는다(판정용 읽기에만 둔다 — `attempt`). 앞 판의
 *   «다시 읽기가 응답하지 않으면 `'checking'`에 머문다»는 닫았다(`attempt`의 주석 — Chrome: 10s 판정 →
 *   그 판정도 매달려 20s 에 끊김 → «확인하지도 못했습니다» + «다시 확인» → 누르면 판정).
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
  /** 칸의 이름(`panel-drafts.tsx`의 `lockSlot`). */
  readonly slot: string
}

/**
 * 쓰기가 끝난 모양.
 *
 * - `'done'` — 시간 안에 성공 응답을 받았다.
 * - `'failed'` — 시간 안에 실패했다(실패 응답 · 연결 실패). **결과를 안다: 안 됐다** — 쓰기가 «모르는
 *   실패»라고 한 것(`TrackedWrite.uncertain`)은 여기 안 오고 판정으로 간다.
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
   * 이유 없는 실패의 문장(`toFailure`의 둘째 인자) — **그 페이지를 보는 방문이 없을 때 끝난 실패**를 장부가 남길 때
   * 쓴다(아래 머리말 «떠나 있는 동안 끝난 실패»). 칸이 보이는 실패 문장과 같게 준다. 없으면 `UNSAVED`다.
   */
  readonly failedMessage?: string
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
   * 잠금 밖에서 돈다(`comment-panel.tsx`의 `refresh` — 리뷰 2-4 (b): 앞 판은 이것이 잠금 안에서 매달리면
   * 게시가 커밋됐는데도 상자가 말없이 꺼진 채 F5 말고는 안 풀렸다).
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
  /** 지금 `at`의 페이지를 보고 있는가 — 칸 쓰기가 닿을 곳이 있는가(`accept`가 받는가와 같은 판정). */
  readonly sees: (at: PageAt) => boolean
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
  readonly missed: ReadonlyMap<string, Failure>
  /** 남긴 실패를 지운다(«확인»). */
  dismiss(target: WriteTarget): void
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
  readonly missed: ReadonlyMap<string, Failure>
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

/** 쓰기가 실패 문장을 안 줬을 때(`TrackedWrite.failedMessage`). */
const UNSAVED = '저장하지 못했습니다'

const NOTHING_MISSED: ReadonlyMap<string, Failure> = new Map()

export function WriteLedgerProvider(props: { children: ReactNode }): ReactElement {
  const epoch = useSessionEpoch()
  const invalidate = useInvalidateSession()
  const [book, setBook] = useState<Book>(() => ({ epoch, writes: new Map(), missed: NOTHING_MISSED }))
  const receiverRef = useRef<Receiver | null>(null)
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
  const note = useCallback((at: number, key: string, failure: Failure | null) => {
    setBook((prev) => {
      if (prev.epoch !== at) return prev
      if (failure === null && !prev.missed.has(key)) return prev
      const missed = new Map(prev.missed)
      if (failure === null) missed.delete(key)
      else missed.set(key, failure)
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
        // **그 페이지를 보는 방문이 있는가는 끝난 순간에 본다**(머리말 «떠나 있는 동안 끝난 실패») — 보고 있으면 칸이
        // 말한다(`settle`의 칸 쓰기가 닿는다). 세션이 끝나 끊긴 실패는 뺀다 — 앞 세션의 일이다.
        const unseen =
          outcome.kind === 'failed' && !live.signal.aborted && receiverRef.current?.sees(target) !== true
        await write.settle(outcome, receiverRef.current?.token === owner)
        if (unseen) {
          // **판정은 `toFailure` 하나다**(`api/failure.tsx`) — 여기서 401 을 따로 알아보지 않는다.
          const failure = toFailure(outcome.caught, write.failedMessage ?? UNSAVED)
          // **세션은 페이지에 안 매인다** — 어디에 가 있든 로그인 화면으로 간다(`SignedOut`이 부르는 것과 같은 것).
          if (failure.kind === 'signed-out') invalidate()
          else note(live.epoch, key, failure)
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
 * 나간다. 앞 판에서는 이 순서가 하중이었다 — 설명의 다시 읽기(`GET …/pages/:id`)는 끊긴 쓰기(`PATCH`)와
 * **같은 URL** 이라 쓰기가 살아 있으면 Chrome 의 HTTP 캐시 잠금에 섰다(리뷰 1-3). 이제 그 GET 은 캐시를 안
 * 지나므로(`api/http-client.ts`의 `getPage` — `no-store`) 이 순서에 기대지 않는다. 순서는 그대로 둔다.
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
 * **판정에도 시간 제한이 있다**(리뷰 2-4 (a) — 앞 판은 다시 읽기가 응답하지 않으면 `'checking'`에
 * 머물렀고 «다시 확인»도 없었다. F5 말고 탈출구가 없었고 초안을 잃었다). 넘으면 끊고 `'unknown'` —
 * «다시 확인»이 선다. **판정용 읽기에만 둔다** — 일반 읽기(조회 이펙트 · 쓰기 뒤의 목록 다시 받기)에는
 * 여전히 없다. 값은 쓰기와 같은 `WRITE_DEADLINE_MS`다 — 다시 읽기 GET 은 페이지 p99 6.7ms · 코멘트
 * 목록 p99 11.8ms 였고(이월 R 의 실측), 게시의 판정은 쓰기 그 자체다(같은 키로 다시 보낸다).
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
    await new Promise<void>((resolve) => report({ phase: 'unknown', recheck: resolve }))
  }
}

/** 장부. **provider 가 없으면 요란하게 깨진다** — 조용히 물러나면 잠금이 셸과 함께 다시 사라진다. */
export function useWriteLedger(): Ledger {
  const ledger = useContext(LedgerContext)
  if (ledger === null) throw new Error('쓰기 장부는 WriteLedgerProvider 안에서만 쓴다')
  return ledger
}
