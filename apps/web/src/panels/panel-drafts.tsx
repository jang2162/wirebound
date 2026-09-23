/**
 * 우측 패널 본문들의 **페이지에 매인 상태**를 드는 자리 — 초안과 **그 저장의 생애**.
 *
 * ## 왜 탭 목록 밖인가
 *
 * `routes/editor.tsx`의 `RightPanel`은 **안 보이는 탭을 DOM에서 뺀다**(코멘트 조회를 아끼려는
 * 판단 — 그쪽 주석). 그래서 탭 본문의 `useState`는 탭을 한 번 누르는 것만으로 죽는다.
 * 7차(`357f27c`)가 «페이지 설명»의 **초안 한 칸**을 여기로 올려 그 손실을 막았다.
 *
 * ## 초안만 올리면 안 되었다 — 저장의 생애가 마운트에 남았다 (리뷰 N1)
 *
 * 그 판에서 칸은 마운트를 넘어 살고 **저장의 수명은 마운트에 묶여 있었다.** 저장이 나가 있는
 * 동안 탭을 오가면(리뷰 실측, Chrome · PATCH 3초 지연):
 *
 * 1. 새 마운트의 저장 상태가 `idle`로 시작해 **상자와 버튼이 열린 채** 초안을 보였다 — 한 번 더
 *    보낼 수 있었다.
 * 2. 옛 마운트의 응답 처리가 부르는 셋 가운데 **초안 비우기만** 공유 칸에 닿아, 새 마운트에서
 *    **이어 친 글이 경고 없이 지워졌고**, 나머지 둘(서버 값 갈아 끼우기·통지)은 죽은 인스턴스에
 *    닿아 **화면이 낡은 서버 값을 보였다.** 7차 이전(`7053388`)에는 이어 친 글이 남았다.
 *
 * **그래서 페이지에 매인 것을 통째로 여기 든다** — 초안, 저장 진행 상태와 통지, 그리고 그
 * 응답이 갈아 끼울 **조회 값**까지. 본문이 마운트될 때 하는 일은 **조회를 거는 것**과
 * **지난 통지를 지우는 것** 둘뿐이다. 조회를 여기서 걸지 않는 것은 그 자체가 판단이다 —
 * 걸면 안 보는 탭을 위해 요청이 나가고(D6 *"한 번만 읽는다"*), 그것이 애초에 탭을 DOM에서
 * 뺀 이유다.
 *
 * ## 한 값이 두 일을 한다 — `pageId`
 *
 * **1. 페이지가 바뀌면 칸을 전부 버린다.** «페이지 설명»의 F1(*"가리키는 페이지가 곧 뜻의
 * 절반"*)과 `comment-panel.tsx`의 규칙(*"노드 id도 코멘트 id도 그 페이지 안에서만 뜻이
 * 있다"*)이 **같은 자리에서 같은 값으로** 돈다. 렌더 중에 버린다 — 이펙트로 버리면 새 페이지의
 * 첫 커밋 하나 동안 앞 페이지의 초안이 그려진다(`routes/editor.tsx`가 `openPageId`로 닫은 것과
 * 같은 부류의 창이다).
 *
 * **2. 모든 쓰기는 «그 쓰기를 부른 렌더의 페이지»를 달고 오고, 지금 페이지와 다르면 버려진다**
 * (리뷰 N2). 저장 중에 옆 페이지로 옮기면 그 응답이 **옆 페이지의 칸에 닿아** 앞 페이지의
 * 글이 옆 페이지의 서버 값처럼 보였고, 한 글자 붙여 저장하면 **옆 페이지 DB에 앞 페이지의
 * 글이 들어갔다**(리뷰 실측 — 7차 전후 같음). F1이 막으려던 *"남의 페이지에 그 글자가 저장되는
 * 것"*이 **저장 진행 중 경로**로 남아 있었던 것이다. 조회 이펙트의 `alive`와 같은 가드가
 * 저장 쪽에는 없었다.
 *
 * **둘이 같은 값을 본다는 것이 요점이다.** 버리는 판정과 막는 판정이 각자 «지금 페이지»를
 * 따로 들면 한쪽만 낡는 날이 온다.
 *
 * ## 3. 잠금만은 **그 페이지에 매단다** — 페이지를 떠나도 버리지 않는다 (9차, 리뷰 N-A)
 *
 * 위 1번은 칸을 **방문**마다 버린다. 그런데 `pageId`는 «가의 첫 방문»과 «가로 돌아온 방문»을
 * 가르지 못하고, 2번의 쓰기 가드도 둘을 같은 페이지로 본다. 8차 판에서 저장이 나가 있는 동안
 * **가 → 나 → 가**로 돌아오면(8차 = 리뷰 실측, Chrome · 쓰기 3초 지연 · jsdom 도 같은 값.
 * 9차 = jsdom 케이스 셋 — `test/panels/page-description-edit.test.tsx`·`comment-panel.test.tsx` —
 * 과 Chrome 재측(같은 3초 지연 · 쓰기 요청 각 1건). Chrome 에서는 잠긴 상자에 쳐도 글자가 안
 * 들어간다. 돌아온 상자는 잠긴 동안 **돌아와 건 조회의 값**(저장 전 서버 값)을 보이다가 응답이
 * 오면 저장된 값으로 바뀐다 — **돌아와 건 조회가 쓰기 응답보다 먼저 왔을 때만이다**(늦게 오면 아래
 * «이것이 막지 못하는 것»의 타이밍 창). 잠깐 옛 값이 보이는 것은 남는다):
 *
 * | 칸 | 8차 | 9차 |
 * |---|---|---|
 * | 설명 | 돌아온 상자가 **열려** 있다(잠금이 리셋에 버려졌다). 친 글이 앞 저장의 응답에 **경고 없이 지워지고** «저장했습니다»가 뜬다 | 상자·버튼이 **꺼진 채** 돌아온다. 응답이 오면 풀리고, 돌아와 건 조회가 쓰기 응답보다 먼저 왔으면 저장된 값이 선다 |
 * | 새 코멘트 | 돌아와 쓰던 말이 앞 응답에 `""`가 된다 | 상자·단추가 꺼진 채 돌아온다 |
 * | 코멘트 수정 | 돌아와 **다른 코멘트**를 고치던 칸이 앞 응답에 닫힌다 | 수정 단추가 꺼진 채 돌아온다 |
 * | 한 번 더 저장(ABA2) | 저장이 **둘 동시에** 나가고, 첫 응답이 둘째가 나가 있는 동안 잠금을 푼다. 그 틈에 친 글은 둘째 응답에 또 지워진다 | 둘째를 보낼 수 없다 |
 *
 * **그래서 잠금 칸(`lockSlot`)은 방문이 아니라 페이지에 든다.** 리셋이 건드리지 않고, 쓰기는
 * 2번의 가드를 지나지 않고 **그 쓰기를 부른 페이지의 잠금**을 곧바로 고친다 — 나에 머무는
 * 동안 가의 응답이 오면 가의 잠금이 풀리고(나의 칸은 그대로다), 가로 돌아와 있으면 돌아온
 * 방문의 잠금이 풀린다. 잠금이 남아 있는 한 돌아온 방문은 **그 칸을 고칠 수 없으므로**, 응답의
 * 뒷일(초안 비우기·편집 칸 닫기)이 지우는 것은 언제나 **보낸 그것**이다.
 *
 * ### 잠금은 이 provider 보다 오래 산다 — 장부에 든다 (이월 Q, 2026-09-21)
 *
 * 9차 판은 잠금을 이 provider 의 상태에 들었다. 그래서 provider 째 내려가는 길(프로젝트 목록 ·
 * 다른 프로젝트 · 테마 편집기 · 로그아웃 뒤 다시 로그인)에서는 잠금이 함께 사라졌고, 앞 쓰기가
 * 나가 있는 채 둘째 쓰기가 나가 **늦게 온 앞 쓰기가 뒤 쓰기를 덮었다**(Chrome — 값은
 * `write-ledger.tsx`의 머리말). **이제 잠금 칸의 값은 `app.tsx`의 `<Routes>` 위에 선 장부
 * (`write-ledger.tsx`)에 든다** — 키는 (프로젝트, 페이지, 칸)이고, 여기는 그것을 읽기만 한다
 * (`usePanelLock`). 위 셋째 단락의 규칙(«그 쓰기를 부른 페이지의 잠금을 곧바로 고친다»)은 장부가
 * 그대로 지킨다 — 키가 페이지를 들고 있다.
 *
 * **칸 쓰기도 «지금 떠 있는 provider»로 간다**(`usePanelSlot`) — 내려간 provider 로 시작한 쓰기의
 * 응답이, 새로 선 provider 가 같은 페이지를 보고 있으면 그 방문에 닿는다. 위 셋째 단락의 «돌아온
 * 방문의 잠금이 풀린다 · 뒷일이 지우는 것은 보낸 그것이다»를 provider 째 갈린 방문까지 넓힌 것이다.
 * 이 provider 가 떠 있는 동안은 자기 자신이 «지금 떠 있는 provider»라 아무것도 달라지지 않는다.
 *
 * **고르지 않은 둘**(리뷰가 제시한 갈래):
 *
 * - **쓰기 표지를 «방문 세대»로** — 돌아온 방문에 앞 응답이 안 닿는다. 그러면 돌아온 가는
 *   응답이 가져온 서버 값을 못 받는데, 돌아와 건 조회는 저장이 커밋되기 **전**의 값을 읽을
 *   수 있다(리뷰의 판이 그것이다) — 재조회를 하나 더 지어야 한다. 그리고 잠금이 여전히
 *   버려져 있어 아래 «동시 저장»이 그대로 남는다.
 * - **«보낸 값 === 지금 칸 값»일 때만 비운다** — 친 글은 살지만 잠금이 버려진 채라 둘째 저장이
 *   나간다. 둘이 동시에 나가면 **응답의 순서가 서버가 쓴 순서라는 보장이 없어**(나중에 보낸
 *   것이 먼저 올 수 있다) 화면이 DB 와 다른 값을 보일 수 있다 — 그때 서버에 기대값이 없었으므로
 *   화면이 그 순서를 알 길이 없었다(9차의 판단. 기대값은 2026-09-23 이월 P 가 더했다 — `page-description.tsx`의
 *   «남의 저장을 조용히 덮지 않는다». 잠금은 그대로 둔다 — 같은 바탕의 두 저장은 뒤의 것이 409 라 같은 칸에 둘을
 *   내보낼 까닭이 더 없다).
 *   이 갈래를 잠금과 **함께** 두면 비교가 도는 길이 사라진다 — 잠긴 칸은 고칠 수 없어 «보낸
 *   값»과 «지금 값»이 늘 같다. **재는 것이 없는 가드를 두지 않았다.**
 *
 * **같은 칸에 저장이 둘 동시에 나가는 것은 막는다.** 근거는 위 둘째 갈래의 순서 문제와,
 * 이 저장소가 이미 적어 둔 규칙이다 — 코멘트의 `BUSY`: *"같은 코멘트가 두 번 나가면 번호는
 * 하나인데 행이 둘이 된다."* 8차의 탭 왕복(리뷰 N1)이 막은 것도 같은 규칙이었고, 가 → 나 → 가는
 * 그 규칙을 **페이지 왕복**으로 비켜 가는 길이었다.
 *
 * **잠금이 옆 페이지를 잠그지는 않는다** — 잠금은 가에 매였으므로 나에서는 바로 쓸 수 있다
 * (2번의 케이스가 그것도 본다).
 *
 * ## 4. 저장소에 비춘다 — 셸이 죽어도 초안과 키가 산다 (이월 X, 2026-09-23)
 *
 * 이 provider 는 문서의 메모리에 산다. 그래서 새로고침 · 탭 닫기 · 세션 만료(401)에 초안과 코멘트의 멱등 키가
 * 함께 죽었고, 키가 죽어 서버에 늦게 커밋된 앞 게시와 다시 단 같은 글이 두 행이 됐다(`write-ledger.tsx`
 * «이것이 막지 못하는 것»). 이제 **칸이 `keeper`를 가지면**(`slot`의 셋째 인자) 방문을 탭의 저장소에 비춘다 —
 * 무엇에 · 무엇을 · 언제 지우는지는 `draft-store.tsx`가 소유한다. 여기서 정하는 것은 셋이다.
 *
 * - **한 방향이다.** 진실은 여전히 이 provider 의 칸이다. **쓰는 자리는 레이아웃 이펙트 하나**(칸이 바뀔 때마다
 *   방문을 옮겨 적는다), **읽는 자리는 방문을 새로 세우는 `fresh` 하나**다. 방문이 선 뒤로 칸은 저장소를 보지 않는다.
 * - **사람으로 가른다.** 방문은 선 때의 사람(`Held.writer`)의 칸에만 읽고 쓴다. 이 provider 가 떠 있는 동안
 *   사람이 바뀌는 길은 없다(문지기가 화면을 내린다) — 그래서 사람이 바뀌는 것을 따로 보지 않는다. 다른 사람이
 *   이 탭에 들어오면 앞 사람의 칸은 저장소가 지우고 그 뒤로 앞 사람의 칸에 쓰지 않는다(`draft-store.tsx`의 `admit`).
 * - **F1 을 뒤집지 않는다 — 아래.**
 *
 * ### F1 과 저장소 — «페이지»는 **연** 페이지다
 *
 * F1 은 «페이지가 바뀌면 버린다»다 — 초안의 뜻의 절반이 그 페이지라서다(`page-description.tsx`). 저장소는 **한
 * 사람에 방문 하나**, 이 탭이 마지막으로 **연** 페이지의 것만 든다. 규칙은 하나다:
 *
 * > **방문이 새로 설 때, 그 사람이 이 탭에서 마지막으로 연 페이지가 이 페이지면 이어 받는다. 다른 페이지를 열면
 * > 그 방문이 저장소를 덮는다(초안이 없으면 지운다).** 페이지를 안 연 자리(프로젝트 목록 · 로그인 화면 · 테마
 * > 편집기 · 페이지 없는 에디터 `/projects/:id`)는 페이지를 바꾸지 않는다 — 저장소를 읽지도 쓰지도 않는다.
 *
 * | 길 | 초안 | Chrome |
 * |---|---|---|
 * | 가 → 나 → 가(앱 안) | 버림 — 나를 연 순간 저장소가 나의 방문이 된다(F1 그대로) | 버림 · 칸 없음 |
 * | 가 → 나 → 나에서 새로고침 → 가 | 버림 | 같음 |
 * | 가 → 프로젝트 목록 → 다른 페이지 → 가 | 버림 | 같음 |
 * | 가 → 새로고침 · 닫은 탭 다시 열기 | 이어 받음 | 이어 받음 |
 * | 가 → 프로젝트 목록(또는 로그인 화면 · 테마 편집기) → 페이지 없는 에디터 → 가 | 이어 받음 — 사이에 연 페이지가 없다 | 이어 받음 |
 *
 * **앞 판과 갈리는 줄은 끝줄이다.** 앞 판은 그 길에서 초안을 잃었는데 **F1 때문이 아니라 메모리에 살아서였다** —
 * provider 가 내려가는 것은 새로고침과 같은 입구다. 목록을 지나는 이 길이 **세션 만료 뒤 같은 사람이 돌아오는 길**
 * 이기도 하다(로그인 화면 → 목록 → 프로젝트 → 페이지 — 로그인 뒤 원래 주소로 돌려보내는 길이 이 앱에 없다). 끝줄을
 * «버림»으로 두면 세션 만료를 살린다는 판정이 설 자리가 없다. 저장소가 없으면(아래 «이것이 막지 못하는 것») 앞
 * 판 그대로다.
 *
 * ## «대상» 가드는 따로 없다
 *
 * 저장이 도는 동안 대상은 입력을 꺼서 못 바꾸게 한다(설명의 `SAVING`, 코멘트의 `BUSY`) —
 * 그 잠금이 탭 왕복에도(칸이라서) 페이지 왕복에도(위 3번) 풀리지 않는다. 그래서 저장 도중
 * 대상이 바뀌는 길은 **다른 페이지로 가 있는 동안** 하나이고, 그때 응답은 위 2번이 버린다.
 * 새 코멘트의 대상(고른 노드)은 게시 도중에도 바뀔 수 있다 — 그래서 초안을 **노드마다** 들고
 * 응답은 **보낸 노드의 초안만** 비운다(`comment-panel.tsx`의 `DRAFTS`).
 *
 * ## 이것이 막지 못하는 것
 *
 * - ~~**남의 저장을 조용히 덮는다**(리뷰 N3)~~ — 2026-09-23 이월 P 가 닫았다. 초안(`page-description.tsx`의 `DRAFT`)이
 *   제 바탕을 들고 이 provider · 저장소에 함께 산다 — 무엇을 왜는 그 파일의 «남의 저장을 조용히 덮지 않는다»가 갖는다.
 * - **새로고침·탭 닫기의 잠금** — provider 째 내려가는 길 가운데 **장부까지 사라지는** 둘이다(문서가
 *   새로 뜬다). **초안과 키는 이제 넘는다**(위 4) — 넘지 않는 것은 잠금과 «모름»이다. 브라우저는 나가 있던
 *   요청을 끊지만 **서버가 이미 받았으면 끊겨도 커밋한다.** 그 값과 남는 틈은 `write-ledger.tsx`의 머리말이
 *   갖는다. (프로젝트 목록 · 다른 프로젝트 · 테마 편집기는 잠금도 막는다 — 위 3의 «잠금은 이 provider 보다
 *   오래 산다».)
 * - **저장소를 못 쓰는 브라우저**(사이트 데이터 차단 · 용량 초과) — 위 4 가 없던 때와 같다. 초안은 메모리에만
 *   살고, 목록 왕복·새로고침·세션 만료에 사라진다(`draft-store.tsx`의 «못 쓰면 오늘처럼»).
 * - **로그아웃·세션 만료의 잠금** — 잠금이 **일부러** 넘지 않는다. 세션이 끝나면 장부가 그 세션의 쓰기를
 *   끊고 비운다 — 앞 사람의 쓰기로 다음 사람을 잠그지 않는다(`write-ledger.tsx`의 «세션을 넘지 않는다»).
 *   대가로 서버에 이미 닿은 앞 세션의 쓰기가 새 세션의 쓰기 뒤에 늦게 커밋될 수 있다(그 절의 끝). **초안은
 *   세션 만료를 넘고 명시적 로그아웃에는 지워진다**(위 4 · `draft-store.tsx`).
 * - **응답이 늦는 쓰기의 판정 뒤 늦은 커밋** — 쓰기에 시간 제한이 생겼다(`write-ledger.tsx`의
 *   `WRITE_DEADLINE_MS`). 넘으면 끊고 서버에서 다시 읽어 판정하는데, 서버가 이미 받은 요청이면 판정
 *   **뒤에** 커밋될 수 있다. 9차 판에서는 시간 제한이 없어 잠금이 페이지·탭·모드 왕복에도 남고
 *   프로젝트 목록을 다녀와야 풀렸다(그리고 그렇게 풀면 위 첫째 길로 갔다).
 * - **타이밍 창** — 돌아와 건 조회가 **커밋 전 값을 읽고 쓰기 응답보다 늦게** 오면, 응답이 세운
 *   값을 그 조회가 덮는다. 잠금은 응답에 풀리고 조회 값을 안 건드리므로 이 창을 막지도 만들지도
 *   않는다.
 *   설명·코멘트가 각자 무엇을 보이는지는 `page-description.tsx`의 «낡은 값이 보이는 길 둘»의
 *   첫째와 `comment-panel.tsx`의 «잠금이 막지 못하던 길»이 갖는다(9차 좁은 반증, Chrome). **코멘트
 *   목록은 2026-09-22 에, 설명은 2026-09-23(이월 V)에 닫았다** — 둘 다 늦게 낸 조회의 답만 받는다(각 파일의 `answered`).
 * - ~~**다른 페이지에 가 있는 동안 저장이 실패하는 길**~~ — **2026-09-23 이월 S 가 닫았다**: 장부가 그 실패를 남기고
 *   돌아온 방문이 말한다 · 401 은 곧바로 로그인 화면(`write-ledger.tsx`의 «떠나 있는 동안 끝난 실패» — 거기가
 *   `Receiver.sees`로 «보는 방문이 없다»를 가른다. 2번의 거름과 같은 값이다). 앞 판의 말: 초안은 떠날 때 1번이 이미 버렸고
 *   실패 통지는 2번이 버린다. 돌아와도 통지가 없다(상자는 서버 값 · 열림). 돌아와 있는 동안
 *   실패하면 통지(«서버 오류»)는 서지만 상자는 서버 값이다 — 보낸 글은 떠날 때 버렸다(9차 jsdom
 *   임시 계측, 500. 9차 좁은 반증의 Chrome 도 같다 — 설명·코멘트 · 500 과 네트워크 끊김).
 *   **떠나면 버린다는 1번의 규칙**이 나가 있는 저장에도 선 것이다 — 이 판이 바꾸지 않았고
 *   보고로 올린다.
 * - ~~**다른 페이지에 가 있는 동안 쓰기가 401을 받는 길**~~(위와 같이 닫았다) — 앞 판의 말: 실패 통지를 2번이 버리므로 «로그인»
 *   화면(`SignedOut`)도 서지 않는다. 사용자는 세션이 끊긴 줄 모르고 옆 페이지에 머물고, 다음
 *   조회가 401을 받을 때에야 로그인 화면으로 간다(9차 좁은 반증, Chrome — 같은 세션을 다른
 *   탭에서 로그아웃한 판. 그 페이지에 머물러 있었으면 곧바로 로그인 화면으로 갔다).
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
import { useSessionEpoch, useSessionUser } from '../session/session-context'
import { useDraftStore, type DraftStore } from './draft-store'
import {
  useWriteLedger,
  writeKey,
  type Missed,
  type PageAt,
  type Receiver,
  type TrackedWrite,
  type WritePhase,
  type WriteTarget,
} from './write-ledger'

/**
 * 칸 하나의 선언. **모듈 최상위에 한 번 만든다** — 칸을 가리는 것은 이 객체의 정체성이다(`Held.values`의 키).
 * 이름은 사람이 읽으라고 있고, **같은 모듈이 다시 불렸을 때 같은 객체를 찾는 열쇠**다(아래 `slotsOf`).
 *
 * `initial`은 **공유되는 값**이라 고쳐 쓰지 않는다 — 쓰는 쪽은 언제나 새 값을 넣는다.
 *
 * 이 칸은 **그 방문의 것**이라 페이지가 바뀌면 버린다(위 머리말 1·2). 잠금은 칸이 아니다 —
 * `lockSlot`이고 값은 장부에 든다(머리말 3).
 */
export interface Slot<T> {
  readonly name: string
  readonly initial: T
  /** 있으면 이 칸은 저장소에 비춘다(머리말 4). */
  readonly keeper?: Keeper<T>
}

/**
 * 칸을 저장소에 비추는 법 — **칸이 스스로 말한다.** `save`는 JSON 으로 옮길 값을 내고, 비출 것이 없으면
 * (`initial`과 같은 뜻이면) `undefined`다. `load`는 읽은 값을 **믿지 않고** 모양을 보고, 틀리면 `undefined`다
 * — 그 칸만 버린다(`draft-store.tsx`의 «못 쓰면 오늘처럼»).
 */
export interface Keeper<T> {
  save(value: T): unknown
  load(raw: unknown): T | undefined
}

/** 선언한 모듈이 다시 불렸을 때 선언을 새것으로 갈아 끼우려고 — 밖에는 `Slot`(읽기 전용)으로만 나간다. */
type Declared = { name: string; initial: unknown; keeper?: Keeper<unknown> }

/**
 * 선언된 칸 전부 — **이름으로 찾는다.** 저장소에서 읽은 사본의 칸 이름을 여기서 찾고(`fresh` — 없거나 `keeper`가 없으면
 * 버린다), 같은 모듈이 다시 불리면 여기서 **같은 객체**를 돌려준다(`slotsOf`).
 */
const DECLARED = new Map<string, { module: string; slot: Declared }>()

/**
 * 모듈의 주소에서 쿼리·조각을 뗀다 — 개발 서버는 HMR 로 다시 부른 모듈에 `?t=<시각>`을 붙인다(Vite). 떼고 나면 같은
 * 파일은 같은 값이다.
 */
function moduleOf(owner: string): string {
  return owner.replace(/[?#].*$/, '')
}

/**
 * **칸을 선언하는 함수를 모듈마다 하나 받는다** — `const slot = slotsOf(import.meta.url)`. 선언한 모듈이 이름과 함께
 * 남는다.
 *
 * - **두 모듈이 같은 이름을 쓰면 던진다** — 요란하게 깨진다. 비추는 칸이면 한 사본이 두 칸으로 되살아나고, 아래 둘째
 *   줄 때문에 비추지 않는 칸이라도 두 모듈이 한 객체를 나눠 쓰게 된다.
 * - **같은 모듈이 다시 불리면(개발 서버의 HMR) 같은 객체를 돌려준다** — 선언(`initial`·`keeper`)만 새것으로 갈아 끼운다.
 *   provider 가 든 칸의 값은 이 객체를 키로 찾으므로(`Held.values`), 새 객체를 내면 **모든 칸이 첫 값으로 돌아간다**.
 *
 * (2026-09-23 — 리뷰 R4.) 앞 판은 비추는 칸의 이름이 겹치면 늘 던져, 모듈을 저장할 때마다 `Failed to reload`로 손
 * 새로고침을 해야 했다(Chrome — `comment-panel.tsx`를 `touch`). 던지는 것만 뗐더니 모듈은 다시 불렸는데 **새 객체**라
 * 코멘트 탭이 «코멘트를 불러오는 중…»에 멈추고 친 초안이 비었다(Chrome — 같은 `touch`). 그래서 이름으로 같은 객체를
 * 찾는다. 고친 뒤(Chrome): `comment-panel.tsx`·`page-description.tsx`를 `touch` → 콘솔 오류 0 · 새로고침 없음 · 코멘트
 * 상자의 글 그대로.
 *
 * **이 파일 자체가 다시 불리면 막지 못한다** — 칸 표 · provider · 컨텍스트가 전부 새것이라 화면의 칸이 첫 값이다
 * (Chrome: 콘솔 오류 0 · 코멘트·설명 상자 `""`). 저장소의 사본은 그대로라 새로고침하면 돌아온다.
 */
export function slotsOf(owner: string): <T>(name: string, initial: T, keeper?: Keeper<T>) => Slot<T> {
  const module = moduleOf(owner)
  return <T,>(name: string, initial: T, keeper?: Keeper<T>): Slot<T> => {
    const earlier = DECLARED.get(name)
    if (earlier !== undefined) {
      if (earlier.module !== module) throw new Error(`패널 칸의 이름이 겹친다: ${name}`)
      earlier.slot.initial = initial
      if (keeper === undefined) delete earlier.slot.keeper
      else earlier.slot.keeper = keeper as Keeper<unknown>
      return earlier.slot as Slot<T>
    }
    const declared: Declared = keeper === undefined ? { name, initial } : { name, initial, keeper: keeper as Keeper<unknown> }
    DECLARED.set(name, { module, slot: declared })
    return declared as Slot<T>
  }
}

/**
 * 잠금 칸 — «이 페이지의 이 칸으로 나간 쓰기가 있다». **값은 여기가 아니라 장부
 * (`write-ledger.tsx`)에 든다** — 이 provider 가 내려가도 쓰기는 살기 때문이다(머리말 3). 이름이
 * 장부의 키 셋째 자리다.
 */
export interface LockSlot {
  readonly name: string
}

export function lockSlot(name: string): LockSlot {
  return { name }
}

/** 칸에 넣을 값, 또는 앞 값으로 다음 값을 짓는 함수(`useState`의 그것과 같다). */
export type SlotUpdate<T> = T | ((prev: T) => T)

interface Held {
  /**
   * 이 칸들이 누구의 것인가 — 저장소의 칸을 사람으로 가른다(`draft-store.tsx`). `null`은 «아직 누구인지
   * 모른다»이고 그때는 저장소를 읽지도 쓰지도 않는다.
   */
  writer: string | null
  /** 이 칸들이 가리키는 프로젝트와 페이지. */
  projectId: string
  pageId: string | undefined
  /** 이 방문의 칸. 한 번도 안 쓴 칸은 여기 없다 — 읽으면 `initial`이 나온다. */
  values: ReadonlyMap<Slot<unknown>, unknown>
}

interface Box {
  held: Held
  receiver: Receiver
  /** 이 잠금 칸의 결말을 그리는 본문이 떠 있는 동안 선다 — 돌려주는 함수가 물러난다(`Receiver.draws` · `usePanelLock`). */
  draw: (slot: string) => () => void
}

const PanelDraftsContext = createContext<Box | null>(null)

function read<T>(held: Held, key: Slot<T>): T {
  return (held.values.has(key) ? held.values.get(key) : key.initial) as T
}

/**
 * **방문을 새로 세운다 — 저장소를 읽는 자리는 여기 하나다**(머리말 4). 그 사람이 이 탭에서
 * 마지막으로 연 페이지가 이 페이지면 비춰 둔 초안을 이어 받고, 아니면 빈 방문이다. 페이지를 안 연 자리
 * (`pageId`가 없다)는 읽지 않는다.
 */
function fresh(
  store: DraftStore | null,
  writer: string | null,
  projectId: string,
  pageId: string | undefined,
): Held {
  const values = new Map<Slot<unknown>, unknown>()
  if (store !== null && writer !== null && pageId !== undefined) {
    for (const [name, raw] of Object.entries(store.recall(writer, projectId, pageId))) {
      const kept = DECLARED.get(name)?.slot as Slot<unknown> | undefined
      const value = kept?.keeper?.load(raw)
      if (kept !== undefined && value !== undefined) values.set(kept, value)
    }
  }
  return { writer, projectId, pageId, values }
}

/** 방문에서 저장소에 비출 칸들 — 비출 것이 없는 칸은 뺀다. */
function kept(held: Held): Record<string, unknown> {
  const slots: Record<string, unknown> = {}
  for (const [key, value] of held.values) {
    const saved = key.keeper?.save(value)
    if (saved !== undefined) slots[key.name] = saved
  }
  return slots
}

/** `update`를 앞 값에 적용한다(`useState`의 그것과 같다). */
function apply<T>(current: T, update: SlotUpdate<T>): T {
  return typeof update === 'function' ? (update as (prev: T) => T)(current) : update
}

/**
 * 칸들을 드는 자리. **탭 목록 밖에 세운다** — 안에 세우면 탭과 함께 언마운트되어 아무것도
 * 달라지지 않는다. 드는 자리는 `routes/editor.tsx`의 `RightPanel`이고, 그것이 **언마운트를
 * 고른 컴포넌트**다. 대가를 만든 자리가 대가를 문다.
 */
export function PanelDraftsProvider(props: {
  projectId: string
  pageId: string | undefined
  children: ReactNode
}): ReactElement {
  const { projectId, pageId } = props
  const ledger = useWriteLedger()
  const store = useDraftStore()
  // 이 칸들을 쓰는 사람 — 저장소의 칸을 가른다(`Held.writer`).
  const writer = useSessionUser()?.id ?? null
  // **이 provider 가 선 때의 저장소 세대** — 그 뒤에 명시적 로그아웃이 돌았으면 이 provider 는 저장소에 못 쓴다
  // (`draft-store.tsx`의 «언제 지우는가»).
  const [since] = useState(() => store?.generation ?? 0)
  const [held, setHeld] = useState<Held>(() => fresh(store, writer, projectId, pageId))

  // **1. 페이지가 바뀌면 방문의 칸을 전부 버린다** — 렌더 중에(위 머리말). React가 이
  // 컴포넌트를 곧바로 다시 그리므로 자식은 앞 페이지의 칸을 한 번도 보지 않는다. 잠금은
  // 여기 없으므로 건드릴 것이 없다(머리말 3 — 장부에 든다). 새 방문은 저장소에서 이어 받을 것이 있으면
  // 받는다(`fresh` — 머리말 4). **사람이 바뀌는 것은 여기 안 본다** — 이 provider 가 떠 있는 동안 사람이 바뀌는
  // 길이 없다(같은 탭은 로그인 화면을 지나고, 다른 탭의 소식은 문지기가 화면을 내린다 — `routes/require-auth.tsx`).
  // 방문은 선 때의 사람(`writer`)의 칸에만 쓴다.
  if (held.projectId !== projectId || held.pageId !== pageId) {
    setHeld(fresh(store, writer, projectId, pageId))
  }

  // **저장소에 비춘다 — 쓰는 자리는 여기 하나다**(머리말 4). 한 방향이다: 칸이 바뀔 때마다
  // 이 방문을 그 사람의 칸에 옮겨 적는다. **레이아웃 이펙트로 둔다** — 커밋과 같은 작업 안에서 돌아, 커밋된 칸과
  // 저장소 사이에 다른 작업(새로고침 · 로그아웃 소식)이 끼지 않는다. **재지는 않았다** — jsdom 의 `act`는 둘을
  // 가르지 않고, 실브라우저에서 그 사이를 노리는 판을 짓지 않았다. 페이지를 안 연 자리는 쓰지 않는다 — 그 사람의
  // 마지막 페이지가 그대로 남는다(머리말 4 의 «F1 과 저장소»).
  useLayoutEffect(() => {
    if (store === null || held.writer === null || held.pageId === undefined) return
    store.keep(held.writer, { projectId: held.projectId, pageId: held.pageId, slots: kept(held) }, since)
  }, [store, held, since])

  const accept = useCallback((at: PageAt, key: object, update: unknown): void => {
    setHeld((prev) => {
      // **2. 다른 페이지를 위해 부른 쓰기는 버린다**(리뷰 N2) — 위 1번과 같은 값을 본다.
      if (prev.projectId !== at.projectId || prev.pageId !== at.pageId) return prev
      const slotKey = key as Slot<unknown>
      const current = read(prev, slotKey)
      const next = apply(current, update as SlotUpdate<unknown>)
      if (Object.is(next, current)) return prev
      const values = new Map(prev.values)
      values.set(slotKey, next)
      return { ...prev, values }
    })
  }, [])

  // **지금 보는 페이지** — `sees`가 읽는다. 커밋된 방문을 따른다(레이아웃 이펙트). `accept`의 거름(위 2번)과 같은
  // 값이다: 같은 (프로젝트, 페이지)면 칸 쓰기가 닿는다.
  const shownRef = useRef<PageAt>({ projectId: held.projectId, pageId: held.pageId })
  useLayoutEffect(() => {
    shownRef.current = { projectId: held.projectId, pageId: held.pageId }
  }, [held.projectId, held.pageId])
  const sees = useCallback(
    (at: PageAt): boolean => shownRef.current.projectId === at.projectId && shownRef.current.pageId === at.pageId,
    [],
  )

  /**
   * **떠 있는 본문이 그리는 잠금 칸**(`Receiver.draws`) — 칸 이름마다 몇 번 섰는가. 본문은 탭 · 모드마다 내려가지만 이 provider 는
   * 산다 — 그래서 «그 페이지를 본다»(`sees`)만으로는 결말이 말해질지 모른다(3차 이월 «S 의 넓이»). 세는 것은 같은 칸을 두 본문이
   * 잠깐 함께 쥐는 판(StrictMode 의 이중 마운트) 때문이다.
   */
  const drawnRef = useRef(new Map<string, number>())
  const draws = useCallback((slot: string): boolean => (drawnRef.current.get(slot) ?? 0) > 0, [])
  const draw = useCallback((slot: string) => {
    const drawn = drawnRef.current
    drawn.set(slot, (drawn.get(slot) ?? 0) + 1)
    return () => {
      const left = (drawn.get(slot) ?? 1) - 1
      if (left === 0) drawn.delete(slot)
      else drawn.set(slot, left)
    }
  }, [])

  const [token] = useState(() => Symbol('panel-drafts'))
  const receiver = useMemo<Receiver>(() => ({ token, realm: 'page', accept, sees, draws }), [token, accept, sees, draws])
  const { receive } = ledger
  // **지금 떠 있는 provider 로 선다**(머리말 3) — 내려간 provider 로 시작한 쓰기의 응답이 여기
  // 닿는다. **레이아웃 이펙트인 것이 요점이다** — 자식의 이펙트(조회 걸기)가 먼저 돌면 그 쓰기가
  // 서기 전의 자리를 찾는다.
  useLayoutEffect(() => receive(receiver), [receive, receiver])

  const box = useMemo<Box>(() => ({ held, receiver, draw }), [held, receiver, draw])
  return <PanelDraftsContext.Provider value={box}>{props.children}</PanelDraftsContext.Provider>
}

function useBox(name: string): Box {
  const box = useContext(PanelDraftsContext)
  if (box === null) {
    throw new Error(`패널 칸(${name})은 PanelDraftsProvider 안에서만 쓴다`)
  }
  return box
}

/**
 * 칸 하나를 읽고 쓴다. 돌려주는 쓰기 함수는 **이 렌더의 페이지를 단다** — 저장을 시작한
 * 클릭이 잡아 둔 그 함수는 응답이 올 때도 그 페이지를 말한다(위 머리말의 2번·3번). 그리고
 * **지금 떠 있는 provider 에 쓴다** — 이 provider 가 내려갔으면 새로 선 provider 가 같은 페이지를
 * 보고 있을 때 받는다(머리말 3).
 *
 * **provider가 없으면 요란하게 깨진다** — 조용히 로컬 상태로 물러나면 탭을 누를 때 초안이
 * 다시 사라지는데 화면은 멀쩡해 보인다(고치기 전과 똑같은 결함이 소리 없이 돌아온다).
 */
export function usePanelSlot<T>(key: Slot<T>): [T, (update: SlotUpdate<T>) => void] {
  const { held, receiver } = useBox(key.name)
  const { deliver } = useWriteLedger()
  // **세션 세대도 단다** — 앞 세션의 쓰기가 다음 세션의 방문에 닿지 않게 장부가 본다(`write-ledger.tsx`).
  const epoch = useSessionEpoch()
  const { projectId, pageId } = held
  const set = useCallback(
    (update: SlotUpdate<T>) => deliver(receiver, { projectId, pageId, epoch }, key, update),
    [deliver, receiver, projectId, pageId, epoch, key],
  )
  return [read(held, key), set]
}

/** 잠금 칸 하나 — 장부에서 읽고, 쓰기를 장부에 올린다. */
export interface PanelLock {
  /** 이 페이지의 이 칸으로 나간 쓰기가 있다. */
  readonly locked: boolean
  /** 그 쓰기의 단계(`write-ledger.tsx`). 없으면 `null`. */
  readonly phase: WritePhase | null
  /** `'unknown'`일 때만 — 서버에서 다시 읽어 판정한다. */
  readonly recheck: (() => void) | null
  /**
   * **이 칸의 결말을 그리는 본문이 없는 동안 끝난 결말**(`write-ledger.tsx`의 «떠나 있는 동안 끝난 실패» · «판정으로 끝난 쓰기도
   * 전한다»). 없으면 `null`. 잠금이 아니다 — 칸은 열려 있다.
   */
  readonly missed: Missed | null
  /** 그 실패를 지운다(«확인»). */
  readonly dismiss: () => void
  /**
   * 쓰기를 장부에 올려 보낸다. **이 렌더의 페이지를 단다.** **이미 나가 있는지는 여기서 안 본다** — 부르는
   * 쪽이 `locked`를 먼저 본다(설명의 `saving.locked` · 코멘트의 `busy`). 장부도 한 번 더 막지 않는다
   * (`write-ledger.tsx`의 `Ledger.run` — 화면에서 닿는 길이 없어 재는 것이 없는 가드를 두지 않았다).
   */
  run<T, V>(write: TrackedWrite<T, V>): Promise<void>
}

export function usePanelLock(key: LockSlot): PanelLock {
  const { held, receiver, draw } = useBox(key.name)
  // **이 칸의 결말을 그리는 본문이 여기 섰다**(`Receiver.draws`) — 이 훅을 부르는 본문이 그 칸의 `PendingNotice`를 그린다.
  // 레이아웃 이펙트다 — 받는 자리(`receive`)와 같은 까닭으로, 본문이 서는 커밋 안에서 선다.
  useLayoutEffect(() => draw(key.name), [draw, key.name])
  const ledger = useWriteLedger()
  const { projectId, pageId } = held
  const target = useMemo<WriteTarget>(() => ({ projectId, pageId, slot: key.name, realm: 'page' }), [projectId, pageId, key.name])
  const entry = ledger.writes.get(writeKey(target))
  const { run: runOnLedger, dismiss: dismissOnLedger } = ledger
  const run = useCallback(
    <T, V>(write: TrackedWrite<T, V>) => runOnLedger(target, receiver.token, write),
    [runOnLedger, target, receiver.token],
  )
  const dismiss = useCallback(() => dismissOnLedger(target), [dismissOnLedger, target])
  return {
    locked: entry !== undefined,
    phase: entry?.phase ?? null,
    recheck: entry?.recheck ?? null,
    missed: ledger.missed.get(writeKey(target)) ?? null,
    dismiss,
    run,
  }
}
