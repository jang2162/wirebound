/**
 * 뷰 모드 우측 패널의 첫째 탭 — **페이지 설명**(설계 §9). **읽고 고친다.**
 *
 * §9의 표: 편집 모드는 **속성** / 코멘트 / 상호작용, 뷰 모드는 **페이지 설명** / 코멘트 /
 * 상호작용이다. 뷰 모드에는 고른 노드의 속성을 편집할 이유가 없고(그 모드는 결과를 본다),
 * 대신 *"이 페이지가 무엇인가"*가 온다.
 *
 * ## 앞 판의 *"고칠 경로가 없다"*는 거짓이었다 (P10 — 점검 #10)
 *
 * 여기 있던 문장은 이랬다 — *"`updatePage`가 받는 것은 `title`·`menuNodeId`·`sortOrder`
 * 셋이고 `description`은 **서버 쪽에도 입구가 없다**. 편집을 만들려면 API를 넓혀야 하는데,
 * §9가 이 슬라이스에 준 것은 탭 구성이지 새 편집 경로가 아니다."*
 *
 * **재 보니 서버는 처음부터 받고 있었다.** `routes/pages.ts`의 `UpdatePageBody`에
 * `description: Description.optional()`이 있고 `repos/pages.ts`의 `updatePage`가 그것을
 * 쓴다. 막고 있던 것은 **웹 쪽 두 자리**뿐이었다 — `api/client.ts`의 `updatePage` 시그니처와
 * `api/http-client.ts`의 `BODY_KEYS.updatePage` 화이트리스트(후자가 `declaredOnly`로 그 키를
 * 조용히 떨궈 냈다). **API를 넓힌 것이 아니라 화면이 그 문을 못 찾고 있었다.** 실측 표는
 * `api/client.ts`의 `updatePage` 주석이 갖는다 — 여기 두 벌로 적지 않는다.
 *
 * ## §9는 고치는 자리를 다른 데라고 적고 있다 — 이월한다
 *
 * §9의 마지막 문단: *"페이지 설명은 **편집 모드에서 페이지 자체를 선택했을 때 속성 탭에**
 * 나타난다."* **그러니 엄밀히 이 자리는 §9가 정한 편집 자리가 아니다.** 그렇게 지어 보고
 * 되돌렸고, 되돌린 이유는 취향이 아니라 **잰 값**이다:
 *
 * 속성 패널은 편집 모드의 **첫 탭**이고 페이지를 열면 스토어가 **루트를 고른 채로**
 * 시작하므로(`store/editor-store.ts`), 거기 편집기를 붙이면 마운트되며 자기 `getPage`를
 * 부른다 — **페이지를 열 때마다 `getPage`가 둘이 된다.** 실측: 그렇게 붙였더니 *"한 번만
 * 읽는다"*를 재는 케이스 **열아홉**이 일곱 파일에서 죽었다(D6의 재연결 재조회가 지키는
 * 바로 그 불변식이다). 없애려면 페이지 메타가 셸에서 거기까지 와야 하는데, 스토어에 실으면
 * `loadPage`의 시그니처가 바뀌고 부르는 자리가 예순이다.
 *
 * **이 탭은 자기 조회를 이미 갖고 있어 요청이 하나도 늘지 않는다.** 그래서 여기 붙였고,
 * §9의 그 문장은 **보고로 올린다** — 옮길지는 이 파일이 정할 것이 아니다.
 *
 * ## 잠금을 판정하지 않는다
 *
 * §7.2의 `findLockConflict`는 **문서 안 포인터**를 보는데 `pages.description`은 문서 밖
 * 컬럼이다. **재 봤다:** 남이 그 페이지의 루트 노드를 쥔 동안에도 설명 갱신은 **200**이고
 * (`apps/api/test/pages.test.ts`의 *"남이 그 페이지의 노드를 잠근 동안에도…"*), 이 라우트는
 * `lockConflictError`를 아예 지나지 않는다. **그래서 화면이 잠금 문장을 갖지 않는다** —
 * 서버가 내지 않는 실패를 화면이 지어내면 그것이 곧 두 번째 판정이다.
 *
 * ## 즉시 저장이 아니라 저장 버튼이다
 *
 * **이 저장소의 폼이 전부 그렇다** — `projects/project-form.tsx`도 `shell/snapshots-panel.tsx`도
 * `<form>` + 제출 버튼이고, 타이핑마다 보내는 자리는 하나도 없다. 그 관례를 깰 이유를 셋
 * 재 봤고 전부 **깨지 말라** 쪽이었다:
 *
 * 1. **2000자짜리 여러 줄 글이다.** 타이핑마다 보내면 요청이 수백 개고, 서버는 그때마다
 *    행을 쓰고 `updated_at`을 민다.
 * 2. **되돌릴 길이 없다.** 구조 편집은 `useEditCommit`의 큐와 §7.3의 되돌리기가 받쳐 주지만
 *    이 경로는 `PATCH .../pages/:id` 한 방이라 큐도 undo도 없다. 즉시 저장은 오타 하나가
 *    곧 저장이라는 뜻이다.
 * 3. **`panels/tree-input.tsx`의 *"blur는 취소"*도 쓰지 않는다.** 그 규칙은 **한 줄 입력**의
 *    것이고(P2b-4 D6, `projects/project-form.tsx`가 같은 이유로 그것을 안 쓴다), 여러 줄
 *    글은 쓰는 도중 다른 곳을 누르는 일이 흔하다.
 *
 * ## 빈 칸은 `null`이다 — *"설명을 지운다"*
 *
 * **`projects/project-form.tsx`와 갈리는 자리이고, 갈리는 것이 맞다.** 그쪽은 빈 칸을
 * `undefined`로 보내(=키를 안 만든다) *"비움"과 "지움"을 가르지 못한다*는 한계를 스스로
 * 적어 뒀다 — **필드가 셋이라 그 폼의 «비었다»가 두 뜻이기 때문이다.** 여기는 필드가
 * 하나뿐이라 «비웠다»의 뜻이 하나다: 설명을 없앤다. 그래서 `null`을 값으로 싣는다.
 *
 * **빈 문자열을 보내지 않는다.** 서버는 `''`를 `''`로 저장하고 `null`과 가른다(실측 —
 * `api/client.ts`의 표). 화면에서 둘은 똑같이 보이므로, 눈에 안 보이는 차이를 만들지 않는다.
 * (충돌 모델의 **견주기는** 둘을 같게 본다 — 아래 «남의 저장을 조용히 덮지 않는다».)
 *
 * ## viewer 에게는 읽기 전용이다 (이월 M · 2026-09-23)
 *
 * **앞 판은 viewer 에게도 편집기를 열어 두었다** — 누르면 서버가 403 과 «이 작업을 수행할 권한이 없습니다»를 냈다.
 * 그 판의 근거는 *"여기만 막으면 편집 표면의 첫 역할 게이트가 되고, 같은 물음에 답하는 자리가 둘이 된다"*였다.
 * **사용자가 «숨긴다»로 판정했고**(2026-09-22 — 장부 §3.19 «판정 — 이월 다섯»), 설계 §9 가 이미 그렇게 적는다.
 *
 * **역할을 아는 자리는 여전히 하나다** — `projects/project-actions.ts`의 `projectAbilities`에 `editPageMeta`를
 * 더했고, 셸(`routes/editor.tsx`)이 그것을 이 패널(`canEdit`)과 메뉴 트리의 이름 변경에 함께 내린다. 이 패널은
 * 역할을 읽지 않는다(`test/role-access.test.ts`가 센다). **서버의 403 은 그대로다** — 화면이 숨기는 것은 입구이고,
 * 막는 것은 여전히 `projectGuard('editor')`다.
 *
 * viewer 가 보는 것: 제목과 설명의 **글**(비었으면 «아직 설명이 없습니다») — 상자 · 단추 · 글자 수가 없다.
 *
 * ## 왜 스스로 조회하나
 *
 * 셸의 `CanvasFrame`이 이미 `getPage`를 부르지만 **스키마와 `headSeq`만 스토어로 보내고
 * 나머지는 버린다.** 제목·설명을 스토어에 실으려면 `EditorStore`가 *"페이지 편집 상태"*
 * 밖의 값을 들게 되고(그 파일의 경계다), 셸까지 내려보내려면 프롭이 한 겹 더 생긴다.
 *
 * **코멘트 탭이 이미 같은 형태다** — 마운트될 때 자기 것을 조회한다. 그리고 이 패널은
 * **뷰 모드에서 그 탭을 봤을 때만 마운트된다**(`routes/editor.tsx`가 보이지 않는 탭을
 * DOM에서 뺀다). 값이 큰 것은 `schema`를 함께 받아 오는 낭비 하나다.
 *
 * **그 언마운트가 무는 대가는 낭비 하나가 아니었다** — 아래 절이 그것이다.
 *
 * ## 탭·모드를 오가도 초안이 남는다 — **패널 밖에 든다** (7차 통합)
 *
 * **결함이었다.** 초안을 이 패널의 `useState`로 들었더니, 옆 탭을 한 번 눌렀다 돌아온
 * 것만으로 친 글이 **경고 없이** 서버 값으로 돌아갔다. 원인이 둘이고 **각각은 근거가
 * 있는데 접점에서 손실이 났다**:
 *
 * 1. `routes/editor.tsx`의 `RightPanel`이 **안 보이는 탭을 DOM에서 뺀다** — 코멘트 탭의
 *    조회를 아끼려는 판단이고 그 주석에 근거가 있다. 그래서 이 패널이 언마운트된다.
 * 2. 이 상자는 **blur에 커밋하지 않는다** — 위 «즉시 저장이 아니라 저장 버튼이다»의 이유 셋.
 *
 * **실측(jsdom, 세 갈래 전부 값으로 쟀다):**
 *
 * | 갈래 | 고치기 전 | 고친 뒤 |
 * |---|---|---|
 * | 탭 왕복 (설명 → 코멘트 → 설명) | `"초안-A"` → **`"서버 값"`** · `getPage` 2→3(=재마운트) | `"초안-A"` |
 * | 모드 왕복 (뷰 → 편집 → 뷰) | `"초안-B"` → **`"서버 값"`** | `"초안-B"` |
 * | 코멘트 탭을 보다 모드 왕복 | `"초안-C"` → **`"서버 값"`** | `"초안-C"` |
 *
 * **고른 갈래와, 고르지 않은 셋의 값.**
 *
 * - **채택 — 초안을 패널 밖에 든다.** `RightPanel`의 탭 목록 **밖**에 선 provider가 든다
 *   (7차는 초안 한 칸만 든 `PageDescriptionDraftProvider`였고, 8차에 `panel-drafts.tsx`의
 *   `PanelDraftsProvider`로 넓혔다 — 아래 «초안만 올렸더니 …»). 그 컴포넌트는 탭·모드가
 *   바뀌어도 언마운트되지 않으므로 초안이 산다. **드는 자리가 언마운트를 고른 자리와
 *   같다** — 대가를 만든 곳이 대가를 문다.
 * - **버림 — 이 탭을 언마운트하지 않는다(`hidden`으로 둔다).** 재 봤다: `RightPanel`이
 *   탭 넷을 전부 그리게 하면 *"페이지를 한 번만 읽는다"*(D6)를 재는 케이스들이 **`getPage`
 *   두 번**으로 죽는다 — 위 §9 절이 적은 그 값이다. 코멘트의 *"탭을 열기 전에는 조회하지
 *   않는다"*도 죽는다(`listComments`가 늘 나간다). **몇 개가 죽는지는 적지 않는다** — 7차
 *   판이 적은 수를 리뷰가 다시 재니 달랐고(판 짓는 법 — 래퍼·`hidden`을 거는 자리 — 에 따라
 *   갈린다), 참인 것은 관계뿐이었다.
 * - **버림 — blur에 커밋한다(속성 패널 선례).** **버린 근거는 위 «즉시 저장이 아니라 저장
 *   버튼이다»의 이유 셋이다** — 2000자 여러 줄 글이 다른 곳을 누르는 것만으로 저장되고,
 *   되돌릴 길이 없다.
 *
 *   **7차 판은 여기에 *"그 선례가 이 갈래를 못 고친다 — 속성 패널도 탭을 누르면 친 글자를
 *   잃는다"*를 더했는데, 그것은 jsdom 값이었다.** `fireEvent.click`은 포커스를 옮기지 않고
 *   jsdom은 포커스된 요소가 DOM에서 빠질 때도 blur를 안 내서, `patchOps` 0건·`"옛 내용"`이
 *   나왔다. **실브라우저(Chrome)는 탭 버튼의 `mousedown`에서 입력의 포커스를 거두고
 *   (`focusout TEXTAREA → BUTTON`) 그 blur가 커밋한다** — 속성 패널은 탭을 눌러도 안 잃는다
 *   (`property-panel.tsx`의 `PropControl` 주석에 위젯 다섯 × 갈래 여덟의 표가 있다). 곧 blur
 *   커밋은 실브라우저에서는 이 갈래를 **고쳤을 것이다.** 그래도 위 이유 셋으로 버린다.
 * - **버림 — 못 살린다고 머리말을 고치고 사용자에게 알린다.** 위 채택 갈래가 **파일 둘·
 *   50줄 안**이고 테스트 사망 0이므로, 값으로 «비용이 크다»가 성립하지 않는다.
 *   §3.16이 *"친 글자는 문서와 무관해 낡지 않는다"*로 살릴 값이라 판정한 그 부류다.
 *
 * **`comment-panel.tsx`도 같은 대가를 물었다** — 코멘트 초안을 치고 속성 탭을 눌렀다 돌아오면
 * `""`였다(jsdom · Chrome 둘 다). 8차에 **같은 provider**로 고쳤다(그 파일의 머리말).
 *
 * ## 초안만 올렸더니 저장의 생애가 마운트에 남았다 — **8차: 페이지에 매인 것을 통째로 올린다**
 *
 * 7차 판은 초안 **한 칸**만 위로 올렸다. 리뷰가 저장을 늦추고 재서 둘을 찾았다(Chrome·jsdom):
 *
 * | 갈래 | `7053388`(7차 전) | `357f27c`(7차) | 8차 |
 * |---|---|---|---|
 * | **N1** 저장 중 탭 왕복 → 응답 | 이어 친 글이 남는다(초안은 탭에 이미 잃음) | 재마운트에 상자·버튼이 **열려** 한 번 더 보낼 수 있고, 응답이 오면 **이어 친 글이 지워지고 낡은 서버 값**이 보인다 | 재마운트에도 상자·버튼이 **꺼져 있다**. 응답이 오면 상자가 **저장된 값**이다 |
 * | **N2** 저장 중 옆 페이지로 → 응답 | 옆 페이지 상자가 **앞 페이지의 글**을 서버 값처럼 보이고 거짓 통지가 뜬다. 한 글자 붙여 저장하면 **옆 페이지 DB에 앞 페이지의 글** | 같음 | 응답이 **어디에도 닿지 않는다** — 옆 페이지에서 친 글이 남고 통지도 없다 |
 *
 * **무엇을 왜 드는지는 `panel-drafts.tsx`의 머리말이 갖는다**(여기 두 벌로 적지 않는다). 이
 * 파일의 몫은 칸 넷이다 — 조회 값·초안·통지·잠금. 조회 값까지 칸인 것은 **저장의 응답이 그것을
 * 갈아 끼우기 때문**이다(N1의 «낡은 서버 값»이 그 자리였다). 케이스는
 * `test/panels/page-description-edit.test.tsx`의 «저장이 나가 있는 동안 …» 절이다.
 *
 * **9차: 가 → 나 → 가**(리뷰 N-A) — 8차 판은 잠금이 페이지 리셋에 함께 버려져, 저장 중에 옆
 * 페이지를 다녀오면 상자가 열린 채 돌아왔고 거기 친 글이 앞 저장의 응답에 지워졌다. 잠금만
 * **페이지에 매다는** 까닭과 고르지 않은 갈래는 `panel-drafts.tsx`의 머리말 3이 갖는다.
 *
 * **낡은 값이 보이는 길 둘.** 8차 판은 첫째만 적었는데 둘째는 타이밍과 무관하다(리뷰 N-E — 9차에
 * 갈라 적는다). **둘째는 이월 Q 판(2026-09-21)에서 고쳤다**(아래 둘째 항목의 끝). **첫째는 이월 V(2026-09-23)가 닫았다**(첫째 항목의 끝).
 *
 * 1. **타이밍 창.** 저장이 나가 있는 동안 탭을 오가거나 옆 페이지를 다녀오면 조회를
 *    다시 건다. 그 조회가 **저장이 커밋되기 전의 값을 읽고, 저장의 응답보다 늦게** 도착하면
 *    응답이 갈아 끼운 값을 덮어 상자가 낡은 값을 보인다. 리뷰의 판(저장 요청을 늦춘다)에서는
 *    조회가 먼저 끝나 이 창에 안 들어간다. **9차 좁은 반증이 Chrome 으로 그 순서를 지었다**(가 →
 *    나 → 가로 돌아와 건 조회를 곧바로 서버에서 읽히고, 그 응답을 저장의 응답 뒤로 늦췄다):
 *    저장의 응답이 올 때 조회 값이 아직 `loading`이라 `replace`가 아무것도 안 하고 잠금만
 *    풀린다. 뒤이어 조회가 서면 상자는 **저장 전 서버 값을 «설명을 저장했습니다»와 함께** 보이고
 *    DB 는 저장한 값이다. 그때는 이 순서를 만드는 jsdom 케이스가 없었다.
 *
 *    **이월 V(2026-09-23)에서 닫았다 — 조회 칸은 늦게 *낸* 것의 답만 받는다**(`issue`·`answered` — 코멘트 목록이
 *    2026-09-22 에 닫은 규칙과 같다). 저장의 응답은 **받는 순간** 번호를 받고(그때 서버는 커밋을 마쳤다), 조회는
 *    **보낼 때** 받는다 — 응답 앞에 낸 조회는 늦게 와도 응답이 세운 값을 못 덮는다. 응답은 제목까지 실어 오므로
 *    조회가 아직 `loading`이어도 선다(`settleWith` — 앞 판의 `replace`는 `ready`에서만 갈아 끼웠다).
 *
 *    | 판(Chrome · 가 → 나 → 가) | 앞 판 | 이 판 |
 *    |---|---|---|
 *    | route — 돌아와 건 GET 을 곧바로 서버에서 읽히고 답만 저장 응답 뒤로 | 상자 `"가의 서버 값"` · «설명을 저장했습니다» · DB `"V 저장 글"` → 이어 고쳐 저장하면 **내 앞 저장을 «다른 사람이 이 설명을 바꿨습니다»**(바탕이 낡았다) | 상자 `"V 저장 글"` · «설명을 저장했습니다» · 이어 저장 200 |
 *    | 서버 안 지연 — 페이지 행 `FOR UPDATE`를 쥐었다 놓음 | 닫혀 있다 — 평 `SELECT`는 행 잠금에 안 서서 조회가 먼저 온다 | 같음 |
 *
 *    케이스는 `test/panels/write-ledger.test.tsx`의 *"돌아와 건 설명 조회가 늦게 와도 …"*다.
 * 2. **응답이 영영 안 닿는 길(리뷰 실측, Chrome).** provider 째 내려가는 조작 — 저장 중에
 *    **프로젝트를 오가거나 로그아웃 뒤 다시 로그인한다** — 이면 응답이 닿을 칸이 아예 없다. 돌아온
 *    화면의 조회가 커밋 전 값을 읽었으면 **그 낡은 값을 고칠 것이 없다**: 프로젝트 왕복 — 화면
 *    `"가의 서버 값"` · DB `"프로젝트 저장 글"`, 로그아웃 뒤 다른 계정 — 화면 `"가의 서버 값"` · DB
 *    `"설명 초안"`(앞 계정의 요청은 이미 나가 있었다. 뒤 계정의 화면에 앞 계정의 글이 새지는 않는다).
 *    **잠금(9차의 `SAVING`)도 provider 와 함께 사라진다** — 앞 저장이 아직 나가 있는 채 다시
 *    저장할 수 있다. 그때 **늦게 온 앞 저장이 뒤 저장을 덮고, 화면은 «설명을 저장했습니다»와 함께
 *    DB 에 없는 값을 보인다**(9차 좁은 반증, Chrome — 앞 저장이 나가 있는 동안 프로젝트 목록을
 *    다녀와 `"둘째 글"`을 저장하면 화면 `"둘째 글"` · «설명을 저장했습니다», 앞 저장의 응답이 온
 *    뒤 DB `"첫째 글"`. jsdom 케이스는 없다). `panel-drafts.tsx` 머리말 3이 잠금의 근거로 든 «응답의
 *    순서» 문제가 이 길로 그대로 돌아온 것이다. 코멘트에서는 한 번호에 두 행이 된다
 *    (`comment-panel.tsx`). 앞 판도 같은 부류였다(8차는 페이지 왕복으로도 동시 저장이 나갔다 —
 *    리뷰 ABA2, jsdom).
 *    **이월 Q 판(2026-09-21)에서 고쳤다** — 잠금이 provider 보다 오래 사는 장부(`write-ledger.tsx`)에
 *    들고, 응답은 **새로 선 provider** 의 방문에 닿는다. Chrome 재측(같은 판 · 입구 넷 — 프로젝트 목록 ·
 *    다른 프로젝트 · 테마 편집기 · 로그아웃 뒤 다시 로그인): 돌아온 상자가 **꺼져 있어** 둘째를 보낼 수
 *    없고, 첫째의 응답이 오면 화면 `"매달린 저장 글"` · «설명을 저장했습니다» · DB 같은 값. 남는 입구는
 *    **새로고침·탭 닫기**다 — 장부도 문서와 함께 사라진다(그 파일의 «이것이 막지 못하는 것»).
 *    **로그아웃 뒤 다시 로그인은 그 뒤 되돌렸다** — 잠금이 세션을 넘자 앞 사람의 쓰기가 다음 사람을
 *    잠그고 통지하고 401 로 튕겼다(리뷰 1-1). 이제 세션이 끝나면 장부가 그 세션의 쓰기를 끊고 비운다.
 *    돌아온 상자는 **열려** 있다 — 그 판의 값과 대가는 `write-ledger.tsx`의 «세션을 넘지 않는다».
 *
 * ## 남의 저장을 조용히 덮지 않는다 — **고치기 전 값으로 판정한다** (이월 P = AB · 2026-09-23)
 *
 * **앞 판은 나중에 저장한 쪽이 이겼다**(리뷰 N3). 내가 초안을 치는 동안 남이 같은 페이지의 설명을 저장하면 내
 * 상자는 내 초안을 계속 보였고, 누르면 **남의 설명을 경고 없이 덮었다.** 이월 X 뒤로는 새로고침도 남의 새 값을
 * 보여 주지 않았다(되살린 초안이 가렸다 — Chrome: 앨리스가 초안을 친 채 밥이 저장 → 앨리스 새로고침 → 누르면
 * DB `"앨리스의 초안"`).
 *
 * **이제 초안이 제 바탕을 든다** — 첫 글자를 친 순간의 서버 값이다(`DRAFT`의 `base`). 저장은 그것을 함께 보내고
 * (`base.description`), 서버는 행 잠금 안에서 지금 값과 견줘 다르면 409 다(계약: `apps/api/src/routes/pages.ts`).
 * **바탕은 초안과 한 칸이다** — 초안이 사는 곳(칸 · 탭의 저장소)에 함께 살고 함께 버려진다. 그래서 새로고침으로
 * 되살린 초안도 제 바탕을 들고, 그 사이 남이 저장했으면 409 로 안다(이월 X 의 (f)).
 *
 * **판정은 `api/page-meta.ts`의 `judgeMeta` 하나다** — 서버 값이 «내 값»이면 원하던 상태, «바탕»이면 안 닿음,
 * 그 밖이면 **다른 사람이 바꿨다.** 409 에 실린 지금 값도, 시간 초과 뒤 다시 읽은 값(«모름» — 아래 `verify`)도
 * 이 함수를 지난다. 다른 사람이 바꿨으면 `panels/meta-conflict.tsx`가 그 사람의 값을 보이고 고르게 한다:
 * **«내 글로 덮기»**(그 값을 새 바탕으로 다시 보낸다) · **«내 글 버리기»**(그 값을 받는다).
 *
 * **«저장되지 않았습니다» 뒤에 늦게 닿은 내 글은 «다른 사람»이 아니다**(리뷰 F2 · 2026-09-23). «모름»의 다시 읽기가
 * 바탕을 봤어도 끊긴 요청이 서버에서 늦게 커밋할 수 있다. 그 뒤 더 쳐서 저장하면 409 의 지금 값이 **내 앞 글**인데,
 * 앞 판은 그것을 «다른 사람이 이 설명을 바꿨습니다»로 보였다. 이제 그 판정의 보낸 글을 초안 칸에 **매달린 값**
 * (`Draft`의 `pending`)으로 들고, 409 의 값이 그것이면 `judgeMeta`가 `'late'`를 낸다 — 같은 충돌 화면이 «앞서 보낸
 * 설명이 늦게 저장됐습니다»로 서고 **덮기**(«지금 글로 덮기»)를 권한다.
 *
 * **빈 설명은 `''`든 `null`이든 같다**(리뷰 F3) — 저장은 둘을 가르지만 견주기는 같게 본다(`judgeMeta` · 서버가 같은
 * 함수 `samePageMeta`를 부른다). 이 화면은 `''`를 안 보내지만 남(API)이 보낼 수 있다.
 *
 * **충돌 통지는 치는 동안에도, 탭을 다녀와도 남는다** — 다른 통지와 다르다. «방금 저장했다»는 사건이지만 «남이
 * 바꿨다»는 초안과 서버 사이의 **지금 상태**라, 초안이 그대로인 한 참이다. 페이지를 옮기면 F1 대로 버린다.
 *
 * **제목도 같은 모델이다** — 메뉴 트리의 이름 변경(`tree/use-tree-commands.tsx`)이 같은 판정 · 같은 화면을 지난다.
 * **다른 창에 실시간으로 알리지는 않는다** — 그 라우트는 방송하지 않는다. 남이 바꾼 것은 저장할 때 안다.
 *
 * ## 페이지가 바뀌면 초안도 통지도 버린다 — **한 자리에서**
 *
 * **탭이 그대로면 페이지를 바꿔도 이 패널은 언마운트되지 않는다** — `routes/editor.tsx`가
 * 탭 본문을 `key` 없이 그리므로 같은 인스턴스가 산다. 그래서 조회를 다시 거는 것만으로는
 * 부족했다: 앞 페이지에 쓰던 초안이 `value = draft ?? server`에서 **이기고**, 그대로
 * 저장하면 **남의 페이지에 그 글이 들어간다.** 저장 통지도 같은 경로로 새어 아무것도
 * 저장한 적 없는 페이지에 «저장했습니다»가 떠 있었다. **지어 놓고 났던 결함이고**
 * 브라우저에서 쳐서 DB까지 확인됐다(P10 리뷰 F1).
 *
 * **`comment-panel.tsx`도 같은 것을 한다** — 초안·고치던 것·오류를 함께 버리고, 이유를
 * *"노드 id도 코멘트 id도 그 페이지 안에서만 뜻이 있다"*로 적어 뒀다. **여기도 같은 결이고,
 * 8차부터는 같은 자리다**(아래).
 *
 * **그래서 셋(조회·초안·저장)을 `usePageDescription`이 함께 내고, 셋을 버리는 것은 한
 * 자리다** — `panel-drafts.tsx`의 provider가 `pageId`가 바뀔 때 칸을 전부 버린다. 초안과
 * 통지를 따로 버리면 «페이지가 바뀌면 버린다»가 **두 벌의 처방**이 되고, 실제로 그렇게
 * 지었다가 조회 하나만 갖췄다(P10).
 *
 * **자리가 옮겨 온 내력.** P10은 셋을 이 훅의 조회 이펙트에서 버렸다. 7차는 초안을 버리는
 * 일을 위로 옮겼다 — «본문이 마운트될 때»와 «`pageId`가 바뀔 때»가 **같은 사건이 아니었기**
 * 때문이다(탭을 누르면 앞의 것만 일어난다). 8차는 나머지 둘도 올렸다. **마운트될 때 하는
 * 일은 이제 «지난 통지를 지운다» 하나다** — 그 근거는 훅의 이펙트 주석에 있다.
 *
 * ### §3.16 E의 *"친 글자를 잃지 않는다"*와 부딪히지 않는다 — **축이 다르다**
 *
 * `panels/structure-toolbar.tsx`의 «두 축을 가른다»는 *"친 글자는 살리고 고른 것은
 * 되돌아간다"*이고, **그 근거는 «친 글자는 사용자 자신의 것이고 문서와 무관해 낡을 수가
 * 없다»**였다. 갈리는 자리가 정확히 그 근거다.
 *
 * - **같은 페이지 안에서 조건이 오갈 때는 살린다** — 그 근거가 그대로 선다. 글이 무엇에
 *   대한 것인지가 안 바뀐다. 저장이 403·400으로 막혀도 친 글을 안 지우는 것이 그 자리이고
 *   (케이스 *"저장이 실패하면 …"*의 마지막 단언), **탭·모드를 오가는 것도 그 자리다**
 *   (위 «탭·모드를 오가도 …»). **7차 통합까지 이 줄은 문서만 그랬고 행동은 반대였다** —
 *   문서가 스스로 반대를 적고 있는 것을 통합 확인자가 잡았다.
 * - **페이지가 바뀌면 버린다** — 이 초안은 *"이 페이지가 무엇인가"*라서 **가리키는 페이지가
 *   곧 뜻의 절반**이다. 페이지가 바뀌는 순간 «낡을 수가 없다»가 아예 성립하지 않는다.
 *   그리고 살렸을 때 잃는 것은 «친 글자»가 아니라 **남의 페이지에 그 글자가 저장되는
 *   것**이다 — 더 나쁜 손실을 막는 쪽이 이긴다.
 */
import { useEffect, type ReactElement } from 'react'
import { PAGE_DESCRIPTION_MAX_LENGTH } from '@wirebound/schema'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import { judgeMeta, metaConflict } from '../api/page-meta'
import { MetaConflict } from './meta-conflict'
import { lockSlot, slotsOf, usePanelLock, usePanelSlot, type PanelLock } from './panel-drafts'
import { PendingNotice } from './pending-notice'

/** 이 모듈의 칸을 선언한다 — 같은 모듈이 다시 불리면(HMR) 같은 칸을 돌려준다(`panel-drafts.tsx`의 `slotsOf`). */
const slot = slotsOf(import.meta.url)

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 설명이 보입니다'
/** 설명이 비어 있을 때. **빈 자리로 두지 않는다** — 고장과 구분되지 않는다. */
const NO_DESCRIPTION = '이 페이지에는 아직 설명이 없습니다'
/** 조회가 이유 없이 실패했을 때. */
const LOAD_FAILED = '페이지 설명을 불러오지 못했습니다'
/** 저장이 이유 없이 실패했을 때. **조회 실패와 갈라 적는다** — 사용자가 할 일이 다르다. */
const SAVE_FAILED = '설명을 저장하지 못했습니다'
/** 저장이 끝났다는 통지. `snapshots-panel.tsx`의 *"저장됨"*과 같은 자리·같은 `role`이다. */
const SAVED = '설명을 저장했습니다'
/**
 * 시간 안에 응답이 없어 서버에서 다시 읽는 중(`panels/write-ledger.tsx`의 `'checking'`). **«실패»가
 * 아니다** — 저장됐을 수도 있다.
 */
const CHECKING = '응답이 없어 저장됐는지 서버에서 확인하는 중입니다'
/** 다시 읽기도 실패했다 — 결과를 모른다. 잠금은 그대로다. */
const UNKNOWN = '응답이 없고, 저장됐는지 확인하지도 못했습니다'
/** 다시 읽었더니 서버의 설명이 보낸 글과 다르다. **초안은 남긴다** — 다시 저장할 수 있다. */
const NOT_SAVED = '응답이 없어 서버를 다시 읽었더니 이 설명은 저장되지 않았습니다'
/**
 * 다시 읽었더니 서버의 설명이 보낸 글과 **같다.** «저장했습니다»라고 하지 않는다 — 다시 읽기가 아는 것은
 * **값이 같다**는 것뿐이고 **누가 썼는지**는 모른다. 남이 같은 값을 먼저 저장했고 이 쓰기는 서버에 한 번도
 * 안 닿은 판이 있다(리뷰 2-1, Chrome: 붙잡힌 저장 · 그 사이 남이 같은 값 저장 → 앞 판은 «설명을
 * 저장했습니다»). 화면의 값·서버의 값·사용자가 원한 값은 셋 다 같으므로 해는 귀속뿐이다 — 판정은 그대로
 * 두고 **문장만 사실로** 한다. «변경 없는 저장은 보내지 않는다»로는 못 막는다: 보낼 때는 서버 값과
 * 달랐다(`dirty`), 같아진 것은 그 뒤다.
 */
const MATCHED = '응답이 없어 서버를 다시 읽었더니 서버의 설명이 이 글과 같습니다'
/**
 * 409 에 실린 지금 값이 보낸 글과 **같다**(`judgeMeta`의 `'mine'`). 바탕은 달랐다 — 누가(내 앞 저장이 늦게
 * 커밋됐거나 남이) 같은 글을 먼저 저장했다. 원하던 상태라 초안을 비운다. `MATCHED`와 같은 까닭으로 «저장했습니다»라고
 * 하지 않는다.
 */
const SAME = '서버의 설명이 이미 이 글과 같습니다'

/**
 * 조회 칸. **`at`은 그 값을 낸 조회(또는 그 값을 실어 온 저장 응답)의 순서 번호다**(`issue`) — 칸은 늦게 낸 것의
 * 답만 받는다(`answered`). 까닭은 머리말 «낡은 값이 보이는 길 둘»의 1.
 */
type LoadState =
  | { status: 'loading'; at: number }
  | { status: 'ready'; at: number; title: string; description: string | null }
  | { status: 'failed'; at: number; failure: Failure }

/**
 * 조회 칸에 값을 **낸 순서**(이월 V · 2026-09-23). 돌아와 건 조회는 저장이 커밋되기 **전**에 읽고 저장의 응답보다
 * **늦게** 올 수 있다 — 도착 순서로 받으면 저장 전 값이 «설명을 저장했습니다» 옆에 선다. 그래서 낸 순서로 가른다:
 * 조회는 **보낼 때**, 저장의 응답은 **받을 때** 번호를 받는다. 응답을 받은 순간 서버는 커밋을 마쳤으므로, 그 뒤에
 * 낸 조회는 커밋 뒤의 값을 읽는다 — 그것만 응답이 세운 값을 갈아 끼울 수 있다. `comment-panel.tsx`의 `issue`·
 * `answered`와 같은 규칙이다(목록 칸 — 2026-09-22). 페이지가 바뀌면 칸이 버려지므로 번호는 한 줄로 늘기만 하면
 * 된다 — 모듈에 하나 둔다.
 */
let issued = 0
function issue(): number {
  issued += 1
  return issued
}

/** `at`에 낸 조회의 답을 칸에 쓰는 갱신 — **그보다 늦게 낸 것이 이미 서 있으면 버린다.** */
function answered(at: number, next: LoadState): (prev: LoadState) => LoadState {
  return (prev) => (at < prev.at ? prev : next)
}

/**
 * 마지막 저장의 통지. **다음 편집이 시작되면 사라진다**(아래 `onChange`).
 *
 * **«저장 중»은 여기 없다 — 그것은 통지가 아니라 잠금이다**(아래 `SAVING`). 8차 판은 둘을 한
 * 값으로 들어, 통지를 지우는 자리가 잠금까지 풀 수 있었다 — 7차 판의 마운트 한 줄이 실제로
 * 풀었고(리뷰 N1), jsdom 에서는 `onChange`도 풀었다(`fireEvent.change`는 꺼진 상자에도
 * 들어간다 — 리뷰 N-F). 9차부터는 두 칸이 **드는 곳부터 다르다** — 통지는 방문의 칸, 잠금은
 * 페이지의 칸이다(`panel-drafts.tsx`의 머리말 3).
 */
type SaveState =
  | { status: 'idle' }
  | { status: 'saved' }
  /** 다시 읽기로 판정했더니 서버 값이 같다 — «저장했다»가 아니다(`MATCHED`). */
  | { status: 'matched' }
  /** 409 의 지금 값이 보낸 글과 같다(`SAME`). */
  | { status: 'same' }
  | { status: 'failed'; failure: Failure }
  /**
   * **다른 사람이 바꿨다**(`judgeMeta`의 `'other'`) — 그 사람의 값을 들고 덮을지 버릴지 묻는다(머리말 «남의 저장을
   * 조용히 덮지 않는다»). **다른 통지와 달리 치는 동안 · 탭을 다녀와도 남는다**(아래 `keepConflict`).
   *
   * `late`면 그 값은 **앞서 보낸 내 글**이다(`judgeMeta`의 `'late'` — 아래 `Draft`의 `pending`). 같은 화면이 «다른
   * 사람»이라 말하지 않고 덮기를 권한다(`panels/meta-conflict.tsx`).
   */
  | { status: 'conflict'; theirs: string | null; late?: boolean }

/**
 * **이 탭의 칸 넷.** 넷 다 `panel-drafts.tsx`의 칸이라 탭·모드를 오가도 산다 — 이 패널이
 * 언마운트되기 때문이다(위 머리말 «탭·모드를 오가도 …»). 앞의 셋은 «그 방문의 것»이라
 * **페이지가 바뀌면 그 provider가 함께 버리고**(위 머리말 «페이지가 바뀌면 …»), 넷째인 잠금만
 * **그 페이지에 매인 채 남는다**(`SAVING`).
 */
/** 조회 값. 저장의 응답이 **여기를** 갈아 끼운다 — 그래서 조회 값도 마운트 밖에 든다. */
const LOAD = slot<LoadState>('page-description/load', { status: 'loading', at: 0 })
/**
 * 초안 — 친 글(`text`)과 **그 글의 바탕**(`base` — 첫 글자를 친 순간의 서버 값). 머리말 «남의 저장을 조용히
 * 덮지 않는다».
 *
 * **둘이 한 칸인 것이 요점이다** — 바탕은 초안과 함께 살고(칸 · 탭의 저장소) 함께 버려진다(F1 · 로그아웃 · 저장
 * 성공). 따로 들면 한쪽만 버려지는 날, 바탕 없는 초안(→ 조용히 덮음)이나 남의 초안의 바탕이 생긴다.
 */
interface Draft {
  text: string
  base: string | null
  /**
   * **매달린 내 값**(리뷰 F2) — «모름»의 판정이 «저장되지 않았습니다»(`judgeMeta`의 `'base'`)였던 쓰기가 보낸 글.
   * 끊긴 요청도 서버가 이미 받았으면 **나중에 커밋한다**(Chrome: 행 잠금에 붙잡힌 PATCH 가 풀린 뒤 커밋). 그 뒤
   * 더 쳐서 저장하면 409 의 지금 값이 이 글이다 — 들고 있지 않으면 **내 글이 «다른 사람의 값»으로** 보였다.
   * 없으면 칸째 없다. **초안과 한 칸이라** 초안과 함께 버려지고(저장 성공 · 버리기 · F1), 덮기가 바탕을 옮길 때도
   * 버려진다(그 값이 새 바탕이 된다 — 아래 `submit`).
   */
  pending?: (string | null)[]
}

/**
 * **초안은 «아직 안 쳤다»를 `null`로 든다.** 빈 문자열로 초기화하면 조회가 끝나기 전의
 * 빈 상자와 *"사용자가 지운 상자"*가 같은 값이 되어, 값이 도착할 때 지운 것을 되살린다.
 */
const DRAFT = slot<Draft | null>('page-description/draft', null, {
  // **저장소에 비춘다**(`panel-drafts.tsx`의 머리말 4) — 새로고침·세션 만료를 넘는다. 안 쳤으면(`null`)
  // 비출 것이 없다. **바탕도 함께 비춘다** — 되살린 초안이 제 바탕을 들어야 새로고침 뒤의 충돌을 잡는다.
  save: (draft) => draft ?? undefined,
  // **앞 판의 사본(글만 든 문자열)은 버린다** — 바탕을 모르는 초안을 되살리면 저장이 바탕 없이(= 조용히 덮는
  // 쪽으로) 가거나 지금 서버 값을 바탕으로 지어내야 한다. 둘 다 이 판이 막으려는 것이다. 잃는 것은 배포 직전에
  // 쳐 둔 초안 하나다(이월 X 가 같은 날 들어왔다).
  load: (raw) => {
    if (typeof raw !== 'object' || raw === null) return undefined
    const { text, base, pending } = raw as Record<string, unknown>
    if (typeof text !== 'string' || !(base === null || typeof base === 'string')) return undefined
    // 매달린 값은 **모양이 틀리면 그것만 버린다** — 초안과 바탕은 산다. 잃는 것은 귀속(늦은 내 글이 «다른 사람»으로
    // 보인다)뿐이고 조용한 덮임이 아니다.
    const hanging =
      Array.isArray(pending) && pending.every((value) => value === null || typeof value === 'string')
        ? (pending as (string | null)[])
        : undefined
    return hanging === undefined ? { text, base } : { text, base, pending: hanging }
  },
})
/** 마지막 저장의 통지. */
const SAVE = slot<SaveState>('page-description/save', { status: 'idle' })
/**
 * **저장이 나가 있다 — 상자와 버튼을 끈다.** 잠금 칸이라 페이지를 떠났다 돌아와도 그 저장이
 * 끝나기 전에는 풀리지 않는다(리뷰 N-A — 8차 판은 이것이 리셋에 버려져, 가 → 나 → 가로 돌아와
 * 친 글이 앞 저장의 응답에 지워졌고 둘째 저장이 동시에 나갔다. `panel-drafts.tsx`의 머리말 3).
 * **값은 장부에 든다**(`write-ledger.tsx`) — 에디터를 떠났다 와도 풀리지 않는다(이월 Q).
 */
const SAVING = lockSlot('page-description/saving')

const IDLE: SaveState = { status: 'idle' }

/** 통지를 지우되 **충돌은 남긴다** — 충돌은 사건이 아니라 초안과 서버 사이의 지금 상태다(`SaveState`의 `conflict`). */
function keepConflict(prev: SaveState): SaveState {
  return prev.status === 'conflict' ? prev : IDLE
}

/**
 * **그 페이지의 것 넷을 함께 낸다** — 조회(`state`)·초안(`draft`)·통지(`save`)·잠금(`saving`).
 *
 * **넷을 드는 것은 이 훅이 아니다** — `panel-drafts.tsx`의 칸이다. 이 훅이 하는 일은 넷을
 * 한 자리에서 꺼내 주는 것과, 이 본문이 **마운트될 때** 할 일 둘이다: 조회를 걸고, 지난
 * 통지를 지운다. **버리는 일은 둘로 갈린다** — 페이지가 바뀌면 방문의 칸 셋을 provider가 함께
 * 버리고, 마운트될 때는 이 훅이 **통지만** 지운다(아래 이펙트의 주석).
 *
 * `replace`는 저장이 성공했을 때 부르는 자리다. 다시 조회하지 않는 이유는 서버가 갱신된
 * 행을 응답으로 주기 때문이다(`PageDetail`) — 왕복 하나를 아끼는 것이 아니라, 다시 읽는
 * 사이에 **다른 값이 보이는 창**을 만들지 않으려는 것이다.
 */
function usePageDescription(
  projectId: string,
  pageId: string | undefined,
): {
  state: LoadState
  /** 아직 아무것도 안 쳤으면 `null`. 아래 컴포넌트의 `value`가 그것을 푼다. */
  draft: Draft | null
  setDraft: (draft: Draft | null | ((prev: Draft | null) => Draft | null)) => void
  save: SaveState
  setSave: (save: SaveState | ((prev: SaveState) => SaveState)) => void
  /** 저장이 나가 있다 — 잠금. 장부에 든다(`write-ledger.tsx`). */
  saving: PanelLock
  replace: (description: string | null) => void
  /** 서버가 알려 준 페이지 값(제목 · 설명)을 `at`의 순서로 세운다. */
  settleWith: (at: number, page: { title: string; description: string | null }) => void
} {
  const api = useApi()
  const [state, setState] = usePanelSlot(LOAD)
  const [draft, setDraft] = usePanelSlot(DRAFT)
  const [save, setSave] = usePanelSlot(SAVE)
  const saving = usePanelLock(SAVING)

  // **마운트될 때 지난 통지를 지운다 — 잠금은 지우지 않는다.**
  //
  // 통지는 «방금 저장했다»는 사건이라 탭을 다녀온 뒤에도 떠 있으면 지금 화면의 글이 저장된
  // 것처럼 보인다 — `onChange`가 통지를 지우는 것과 같은 이유다. **잠금은 통지가 아니다.**
  // 7차 판은 둘을 한 줄로 지워, 저장이 나가 있는 동안 탭을 오가면 상자와 버튼이 열렸다(리뷰
  // N1 — 한 번 더 보낼 수 있었다). 9차부터는 잠금이 다른 칸(`SAVING`)이라 이 줄이 닿지 않는다.
  //
  // **의존이 비어 있는 것이 요점이다.** 페이지가 바뀔 때 통지를 버리는 것은 provider가
  // 한다(방문의 칸 셋을 함께) — 여기서 `pageId`에도 돌면 같은 일을 두 자리가 하게 된다.
  //
  // **충돌은 남긴다**(`keepConflict`) — 탭을 다녀와도 초안이 그대로면 «남이 바꿨다»도 그대로 참이다.
  useEffect(() => {
    setSave(keepConflict)
    // 마운트될 때 한 번. 위 주석이 그 근거다.
  }, [])

  useEffect(() => {
    if (pageId === undefined) return

    // 응답이 오기 전에 다른 페이지로 옮기거나 이 본문이 내려가면 결과를 버린다
    // (`routes/editor.tsx`와 같은 가드). 페이지 쪽은 칸의 쓰기 가드도 막지만(`panel-drafts.tsx`),
    // 언마운트 쪽은 이것만 막는다 — 다음 마운트가 자기 조회를 다시 건다.
    let alive = true
    const at = issue()
    setState({ status: 'loading', at })

    async function load(openPageId: string): Promise<void> {
      try {
        const page = await api.getPage(projectId, openPageId)
        if (!alive) return
        // **늦게 낸 것의 답이 이미 섰으면 버린다**(`answered`) — 돌아와 건 이 조회는 저장이 커밋되기 전에 읽었을 수
        // 있다(머리말 «낡은 값이 보이는 길 둘»의 1).
        setState(answered(at, { status: 'ready', at, title: page.title, description: page.description }))
      } catch (caught) {
        if (!alive) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState(answered(at, { status: 'failed', at, failure: toFailure(caught, LOAD_FAILED) }))
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
    // `setState`는 이 렌더의 페이지를 단 쓰기라 `pageId`와 함께만 바뀐다.
  }, [api, projectId, pageId])

  /**
   * 서버가 알려 준 페이지 값을 조회 칸에 세운다 — 저장의 응답(`PageDetail`)과 판정용 다시 읽기가 부른다. `at`은
   * 그 값의 순서 번호다(`issue` — 응답은 받을 때, 다시 읽기는 보낼 때). **조회가 아직 안 끝났어도 선다** — 제목까지
   * 실려 오기 때문이다. 앞 판은 `ready`일 때만 갈아 끼워, 돌아와 건 조회가 도는 동안 온 응답은 아무것도 못 했다.
   */
  const settleWith = (at: number, page: { title: string; description: string | null }): void => {
    setState(answered(at, { status: 'ready', at, title: page.title, description: page.description }))
  }

  /**
   * 설명 하나만 아는 자리(409 에 실린 지금 값)가 부른다 — 제목이 없어 **조회에 성공한 상태에서만** 갈아 끼운다.
   * 번호는 새로 받는다 — 그 앞에 낸 조회가 늦게 와서 이 값을 덮지 않게.
   */
  const replace = (description: string | null): void => {
    const at = issue()
    setState((prev) => (prev.status === 'ready' ? { ...prev, at, description } : prev))
  }

  return { state, draft, setDraft, save, setSave, saving, replace, settleWith }
}

/** 뷰 모드 «페이지 설명» 탭의 본문. 읽고 고친다(위 머리말). viewer 에게는 읽기 전용이다(`canEdit`). */
export function PageDescriptionPanel(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 설명을 고칠 수 있는가 — `projectAbilities(role).editPageMeta`(셸이 내린다). **이 패널은 역할을 모른다**
   * (머리말 «viewer 에게는 읽기 전용이다»). 안 주면 고칠 수 있다 — 셸 밖에서 이 패널을 세우는 케이스들의 값이다.
   */
  canEdit?: boolean
}): ReactElement {
  const api = useApi()
  const { projectId, pageId } = props
  const canEdit = props.canEdit ?? true
  const { state, draft, setDraft, save, setSave, saving, replace, settleWith } = usePageDescription(projectId, pageId)

  const server = state.status === 'ready' ? (state.description ?? '') : ''
  const value = draft?.text ?? server

  /**
   * 초안을 보낸다. `base`는 그 초안의 바탕이다 — **«내 글로 덮기»만 다른 바탕을 준다**(충돌 화면이 보인 그 사람의
   * 값). 그때는 초안의 바탕도 그 값으로 옮긴다 — 덮기가 «모름»에 빠진 채 새로고침해도 되살린 초안이 새 바탕을 든다.
   */
  async function submit(base: string | null): Promise<void> {
    if (pageId === undefined || saving.locked || draft === null) return
    setSave(IDLE)
    // 빈 칸은 "설명을 지운다"(`null`)이고 그 밖은 친 그대로다(위 머리말).
    const next = draft.text === '' ? null : draft.text
    // **바탕을 옮기면(덮기) 매달린 값을 버린다** — 덮기의 바탕이 보인 그 값이라, 늦은 내 글이었으면 이제 바탕이다.
    const pending = base === draft.base ? (draft.pending ?? []) : []
    if (base !== draft.base) setDraft({ text: draft.text, base })
    const openPageId = pageId

    /**
     * 서버 값 하나를 판정한다 — **409 의 지금 값과 다시 읽은 값이 같은 길을 지난다**(`judgeMeta`). 그 값을 조회 칸에
     * 세우는 것은 부르는 쪽이다(409 는 `replace` · 다시 읽기는 `settleWith` — 다시 읽기만 제목을 든다).
     * `asked`는 그 값이 어디서 왔는가다: 다시 읽은 값이면(`'verified'`) «모름»의 판정이고, 409 면(`'rejected'`)
     * 서버가 바탕과 다르다고 이미 판정한 값이다.
     */
    function land(current: string | null, asked: 'verified' | 'rejected'): void {
      const verdict = judgeMeta(current, next, base, pending)
      if (verdict === 'mine') {
        setDraft(null)
        setSave({ status: asked === 'verified' ? 'matched' : 'same' })
      } else if (verdict === 'base' && asked === 'verified') {
        // **초안은 남긴다** — 서버 값만 갈아 끼웠으므로 상자는 친 글을 보이고 저장 버튼이 열린다. 다시 저장할 수
        // 있다. **보낸 글을 매달린 값으로 든다**(`Draft`의 `pending` — 리뷰 F2) — 끊긴 요청이 늦게 커밋될 수 있다.
        // 그러면 글을 안 고치고 다시 누를 때 409 의 `'mine'`(«이미 같습니다»)이고, 더 쳐서 누를 때 `'late'`다.
        setDraft((prev) => (prev === null ? prev : { ...prev, pending: [...(prev.pending ?? []), next] }))
        setSave({ status: 'failed', failure: { kind: 'message', message: NOT_SAVED } })
      } else if (verdict === 'late') {
        // **앞서 보낸 내 글이 늦게 닿았다** — «다른 사람»이 아니다. 같은 화면이 그렇게 말하고 덮기를 권한다.
        setSave({ status: 'conflict', theirs: current, late: true })
      } else {
        // 다른 사람이 바꿨다. (409 의 값은 바탕과 다르다고 서버가 판정한 값이라 `'base'`로 오지 않는다 — 와도
        // 그 사람의 값을 보이는 쪽이 안전하다.)
        setSave({ status: 'conflict', theirs: current })
      }
    }

    // **잠금은 장부가 쥐고 푼다**(`write-ledger.tsx`) — 그 페이지의 것을, 지금 어디에 가 있든
    // (머리말 3), 에디터를 떠났다 와도(이월 Q). 아래 `settle`이 끝나야 풀린다.
    await saving.run({
      // 떠나 있는 동안 실패하면 장부가 이 문장으로 남긴다(`write-ledger.tsx`의 «떠나 있는 동안 끝난 실패» — 이월 S).
      failedMessage: SAVE_FAILED,
      send: (signal) => api.updatePage(projectId, openPageId, { description: next, base: { description: base } }, { signal }),
      // **시간 안에 응답이 없으면 서버에서 다시 읽는다**(이월 R). 판정은 `land`가 한다 — 서버 값이 내 글이면
      // 원하던 상태, 바탕이면 안 닿음, 그 밖이면 **다른 사람이 바꿨다**(이월 P). 서버가 설명을 정규화하지
      // 않는다(`api/client.ts`의 `updatePage` 표: 보낸 그대로 되읽힌다).
      // 번호는 **보낼 때** 받는다(`issue`) — 그 뒤에 낸 조회가 있으면 그것이 더 새것이다.
      verify: async (signal) => {
        const at = issue()
        return { at, page: await api.getPage(projectId, openPageId, { signal }) }
      },
      settle: (outcome) => {
        // **아래는 칸에 쓴다 — 이 클릭이 난 렌더의 페이지를 달고.** 그래서 응답이 오기 전에
        // 탭을 오갔으면 **지금 떠 있는 본문**에 닿고(리뷰 N1 — 7차 판은 셋 중 초안 비우기만
        // 닿았다), 페이지를 옮겼으면 **어디에도 안 닿는다**(리뷰 N2 — `panel-drafts.tsx`).
        // 가 → 나 → 가로 돌아와 있으면 돌아온 방문에 닿고, 에디터를 떠났다 돌아와 있으면 **새로
        // 선 provider** 의 방문에 닿는다(이월 Q). 두 방문 다 잠금이 남아 있어 초안을 칠 수
        // 없었으므로 비우는 것은 **보낸 그것**뿐이다(리뷰 N-A — 머리말 3).
        if (outcome.kind === 'failed') {
          const clash = metaConflict(outcome.caught, 'description')
          if (clash !== null) {
            replace(clash.current)
            land(clash.current, 'rejected')
          }
          else setSave({ status: 'failed', failure: toFailure(outcome.caught, SAVE_FAILED) })
          return
        }
        if (outcome.kind === 'verified') {
          settleWith(outcome.verdict.at, outcome.verdict.page)
          land(outcome.verdict.page.description, 'verified')
          return
        }
        // **서버가 준 값을 쓴다** — 보낸 것이 아니라. 서버가 정규화하면 화면이 그것을 본다. 번호는 **받은 지금**이다 —
        // 그 앞에 낸 조회(돌아와 건 것)가 늦게 와도 이 값을 덮지 못한다(이월 V).
        settleWith(issue(), outcome.value)
        setDraft(null)
        setSave({ status: 'saved' })
      },
    })
  }

  /** «내 글 버리기» — 그 사람의 값을 받는다. 서버 값은 충돌이 이미 그 값으로 갈아 끼웠다(`land`). */
  function discard(): void {
    setDraft(null)
    setSave(IDLE)
  }

  if (pageId === undefined) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }
  if (state.status === 'loading') {
    return <p className="wb-shell-panel-notice" role="status">불러오는 중…</p>
  }
  if (state.status === 'failed') {
    // 세션이 끊겼으면 오류 문장이 아니라 로그인이다(D5) — 조회 실패 자리들과 같은 규칙이다.
    if (state.failure.kind === 'signed-out') return <SignedOut />
    return <p className="wb-shell-panel-notice" role="alert">{state.failure.message}</p>
  }

  // **viewer 는 읽는다**(머리말 «viewer 에게는 읽기 전용이다»). 상자·단추가 없으므로 초안·통지도 그리지 않는다.
  if (!canEdit) {
    return (
      <>
        <h2 className="wb-shell-panel-title">{state.title}</h2>
        {state.description === null || state.description === '' ? (
          <p className="wb-shell-panel-notice">{NO_DESCRIPTION}</p>
        ) : (
          <p className="wb-shell-page-description">{state.description}</p>
        )}
      </>
    )
  }

  // 저장 도중 세션이 끊긴 것도 같은 규칙이다 — 오류 문장이 아니라 로그인이다.
  const saveFailure = save.status === 'failed' ? save.failure : null
  if (saveFailure?.kind === 'signed-out') return <SignedOut />

  // **바꾼 것이 없으면 보내지 않는다.** 서버가 빈 본문에 400을 내는 것과는 다른 이유다 —
  // 이 본문은 키가 하나라 비지 않는다. 누를 것이 없을 때 눌리는 버튼을 두지 않는 것뿐이다.
  const dirty = value !== server
  // 첫 글자를 친 순간의 서버 값이 이 초안의 바탕이다 — 이미 초안이 있으면 그 바탕을 그대로 든다.
  const startedFrom = state.description

  return (
    <>
      <h2 className="wb-shell-panel-title">{state.title}</h2>
      <form
        className="wb-shell-page-description-form"
        // **폼의 이름은 «저장»이고 입력의 이름은 «페이지 설명»이다.** 둘을 같게 두면 접근성
        // 이름이 겹쳐 «페이지 설명»으로 찾은 것이 폼인지 상자인지 갈리지 않는다
        // (`snapshots-panel.tsx`의 `aria-label="스냅샷 저장"`과 같은 결).
        aria-label="페이지 설명 저장"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft !== null) void submit(draft.base)
        }}
      >
        <label className="wb-shell-page-description-field" htmlFor="wb-page-description">
          <span>페이지 설명</span>
          <textarea
            id="wb-page-description"
            className="wb-shell-page-description-input"
            name="description"
            rows={8}
            // **빈 상자를 빈 자리로 두지 않는다.** 앞 판은 읽기 전용이라 *"아직 설명이
            // 없습니다"*를 문장으로 적었는데, 고칠 수 있게 된 지금 그 자리는 **여기 쓰라는
            // 안내**가 되는 것이 맞다 — 문장만 남기면 어디에 쓰는지가 안 보인다.
            placeholder={NO_DESCRIPTION}
            // **수를 박지 않는다** — 상한의 소유자는 `@wirebound/schema`이고 서버의
            // `Description`도 같은 것을 쓴다. 박으면 상한이 바뀌는 날 화면만 낡는다.
            maxLength={PAGE_DESCRIPTION_MAX_LENGTH}
            value={value}
            disabled={saving.locked}
            onChange={(event) => {
              const text = event.target.value
              // 바탕과 매달린 값은 **첫 글자 때의 것을 그대로 든다** — 글만 갈아 끼운다.
              setDraft((prev) => (prev === null ? { text, base: startedFrom } : { ...prev, text }))
              // **친 순간 앞의 통지를 지운다.** 남겨 두면 고치는 중에 "저장했습니다"가
              // 떠 있어, 지금 화면의 글이 저장된 것처럼 보인다. 잠금(`SAVING`)은 건드리지 않는다.
              // **충돌은 남긴다** — 고쳐 쓰는 동안 그 사람의 값을 보며 쓸 수 있게(`keepConflict`).
              setSave(keepConflict)
            }}
          />
        </label>
        {/* **글자 수를 보인다.** `maxLength`가 조용히 잘라 내므로(브라우저가 더 못 치게
            막는다) 세는 것이 없으면 사용자는 왜 안 쳐지는지 모른다. 한 줄 입력들
            (`snapshots-panel.tsx`)은 눈으로 어림되지만 여러 줄 상자는 그렇지 않다. */}
        <p className="wb-shell-page-description-count">
          {value.length} / {PAGE_DESCRIPTION_MAX_LENGTH}
        </p>
        <button type="submit" className="wb-shell-page-description-save" disabled={saving.locked || !dirty}>
          설명 저장
        </button>
      </form>
      <PendingNotice lock={saving} checking={CHECKING} unknown={UNKNOWN} />
      {save.status === 'saved' && (
        <p className="wb-shell-page-description-saved" role="status">{SAVED}</p>
      )}
      {save.status === 'matched' && (
        <p className="wb-shell-page-description-saved" role="status">{MATCHED}</p>
      )}
      {save.status === 'same' && (
        <p className="wb-shell-page-description-saved" role="status">{SAME}</p>
      )}
      {save.status === 'conflict' && (
        <MetaConflict
          what="설명"
          theirs={save.theirs}
          late={save.late}
          disabled={saving.locked}
          onOverwrite={() => void submit(save.theirs)}
          onDiscard={discard}
        />
      )}
      {saveFailure !== null && (
        // 서버 문장 그대로다(`api/failure.tsx`) — 400의 상한 문장·403의 권한 문장이 여기 온다.
        <p className="wb-shell-page-description-error" role="alert">{saveFailure.message}</p>
      )}
    </>
  )
}
