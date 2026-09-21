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
 *
 * ## 권한을 화면이 판정하지 않는다
 *
 * viewer가 보내면 서버가 403과 문장을 준다(`permission-matrix.test.ts`의 *"페이지 수정"*
 * 행이 그 축을 소유한다). **화면이 역할을 다시 보지 않는 것은 D5다** — `useEditCommit`을
 * 지나는 구조 편집도 역할을 안 보고 서버 문장을 그대로 옮긴다. 규칙을 두 곳에 두면 어긋난다.
 *
 * ### viewer에게 «열린 편집기»를 주는 것 — **그대로 둔다**(P10 리뷰 F7)
 *
 * 리뷰가 물었다: 뷰 모드는 viewer가 가장 자주 오는 자리인데, 칠 수 있게 해 두고 누르면
 * 막는 것이 맞는가. **재고 «그대로 둔다»로 정했다. 근거는 값이다:**
 *
 * | 물음 | 잰 것 |
 * |---|---|
 * | 화면이 역할을 아는가 | `test/role-access.test.ts`가 `.role`을 읽는 자리를 **네 파일로 못박는다**. `panels/`는 없다 |
 * | 페이지 편집을 여는 판정이 있는가 | **없다.** `projectAbilities`의 필드 여섯 중 페이지 **내용**을 고치는 것이 하나도 없다 |
 * | 구조 편집이 역할을 보는가 | **안 본다.** `structureAbilities(document, nodeId, lock)`의 인자에 역할이 없다 |
 * | 그래서 viewer가 편집 모드를 열면 | **페이지를 바꾸는 버튼이 전부 활성이다**(실측 — `이름 변경`·`삭제`·`아래로`·`안에 추가`·`패턴 넣기`·`프리셋`·`페이지 JSON 가져오기`. 역할로 꺼지는 것이 하나도 없다) |
 * | 모드 토글이 역할을 보는가 | **안 본다.** viewer가 «편집 모드»를 누르는 것을 막는 것이 없다 |
 *
 * **그러므로 여기만 읽기 전용으로 만들면 그것이 편집 표면의 첫 역할 게이트가 된다.**
 * `ProjectAbilities`에 일곱째 필드를 더해야 하는데 그 소비자가 이 패널 하나이고, **같은
 * 물음(«viewer가 페이지를 고칠 수 있는가»)에 답하는 자리가 그 필드와 서버의
 * `projectGuard('editor')` 둘이 된다** — §7.2의 *"판정이 두 벌이면 갈린다"* 그대로다.
 * 바로 옆 버튼 일곱이 그 필드를 안 보는 채로 열려 있으니 **갈리는 것이 가정이 아니라
 * 오늘의 상태다.**
 *
 * **«뷰 모드가 viewer의 자리»는 관례이지 강제가 아니다**(위 표의 마지막 줄). 뷰 모드만
 * 잠그면 viewer를 지키는 것이 아니라 **두 모드가 서로 다른 말을 하게** 된다.
 *
 * **그대로 두어 잃는 것은 잰 만큼이다** — 누르면 서버 문장 «이 작업을 수행할 권한이
 * 없습니다»가 `role="alert"`로 서고 **친 글은 그대로 남는다**(케이스 *"저장이 실패하면 …"*
 * 이 그 둘을 잠근다). 다시 시도할 수 있고 잃는 글자가 없다.
 *
 * **바꿀 값이 있다면 이 자리가 아니다** — 편집 표면 전체(또는 모드 토글)를 역할로 가르는
 * 것이 그 슬라이스이고, 게이트가 하나면 두 벌이 안 된다. **이월로 올린다.**
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
 * 갈라 적는다). **둘째는 이월 Q 판(2026-09-21)에서 고쳤다**(아래 둘째 항목의 끝). 첫째는 그대로다.
 *
 * 1. **타이밍 창.** 저장이 나가 있는 동안 탭을 오가거나 옆 페이지를 다녀오면 조회를
 *    다시 건다. 그 조회가 **저장이 커밋되기 전의 값을 읽고, 저장의 응답보다 늦게** 도착하면
 *    응답이 갈아 끼운 값을 덮어 상자가 낡은 값을 보인다. 리뷰의 판(저장 요청을 늦춘다)에서는
 *    조회가 먼저 끝나 이 창에 안 들어간다. **9차 좁은 반증이 Chrome 으로 그 순서를 지었다**(가 →
 *    나 → 가로 돌아와 건 조회를 곧바로 서버에서 읽히고, 그 응답을 저장의 응답 뒤로 늦췄다):
 *    저장의 응답이 올 때 조회 값이 아직 `loading`이라 `replace`가 아무것도 안 하고 잠금만
 *    풀린다. 뒤이어 조회가 서면 상자는 **저장 전 서버 값을 «설명을 저장했습니다»와 함께** 보이고
 *    DB 는 저장한 값이다. 이 순서를 만드는 jsdom 케이스는 세우지 않았다.
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
 *
 * ## 남의 저장을 조용히 덮는다 — **고치지 않는다. 이월한다** (리뷰 N3)
 *
 * **이 화면에는 페이지 메타(설명·제목)의 충돌 모델이 없다.** 서버의 `UpdatePageBody`는
 * `{ title?, description?, menuNodeId?, sortOrder? }`뿐이고 버전도 기대값도 없다 — 나중에
 * 저장한 쪽이 이긴다. 화면도 남이 설명을 저장한 것을 알리지 않는다.
 *
 * **그래서 사용자가 겪는 것:** 내가 초안을 치는 동안 남이 같은 페이지의 설명을 저장하면, 내
 * 상자는 **내 초안을 계속 보이고** 저장 버튼이 열려 있다. 누르면 **남의 설명을 경고 없이
 * 덮는다.** 탭을 오가 다시 조회해도 초안이 그 값을 가린다(리뷰 실측 — Chrome·jsdom).
 * 7차 전에는 탭 왕복이 **우연히** 남의 새 값을 보여 줬다 — 내 초안을 잃는 대가로. 덮는 것
 * 자체는 탭을 안 오가도 7차 전부터 그랬다.
 *
 * **여기서만 충돌 감지를 넣지 않는 이유:** 그것이 이 앱의 **첫 충돌 모델**이 된다. 제목도
 * 같은 경로(`PATCH .../pages/:id`)로 덮이는데 거기엔 없고, 제대로 하려면 서버 계약(기대값)을
 * 바꿔야 한다. 한 자리에서 먼저 지으면 두 자리가 다른 규칙을 갖는다 — 위 «viewer에게 …»가
 * 역할 게이트를 한 자리에서 먼저 만들지 않은 것과 같은 이유다. **이월로 올린다.**
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
import { lockSlot, slot, usePanelLock, usePanelSlot, type PanelLock } from './panel-drafts'
import { PendingNotice } from './pending-notice'

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

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; title: string; description: string | null }
  | { status: 'failed'; failure: Failure }

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
  | { status: 'failed'; failure: Failure }

/**
 * **이 탭의 칸 넷.** 넷 다 `panel-drafts.tsx`의 칸이라 탭·모드를 오가도 산다 — 이 패널이
 * 언마운트되기 때문이다(위 머리말 «탭·모드를 오가도 …»). 앞의 셋은 «그 방문의 것»이라
 * **페이지가 바뀌면 그 provider가 함께 버리고**(위 머리말 «페이지가 바뀌면 …»), 넷째인 잠금만
 * **그 페이지에 매인 채 남는다**(`SAVING`).
 */
/** 조회 값. 저장의 응답이 **여기를** 갈아 끼운다 — 그래서 조회 값도 마운트 밖에 든다. */
const LOAD = slot<LoadState>('page-description/load', { status: 'loading' })
/**
 * **초안은 «아직 안 쳤다»를 `null`로 든다.** 빈 문자열로 초기화하면 조회가 끝나기 전의
 * 빈 상자와 *"사용자가 지운 상자"*가 같은 값이 되어, 값이 도착할 때 지운 것을 되살린다.
 */
const DRAFT = slot<string | null>('page-description/draft', null)
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
  draft: string | null
  setDraft: (draft: string | null) => void
  save: SaveState
  setSave: (save: SaveState) => void
  /** 저장이 나가 있다 — 잠금. 장부에 든다(`write-ledger.tsx`). */
  saving: PanelLock
  replace: (description: string | null) => void
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
  useEffect(() => {
    setSave(IDLE)
    // 마운트될 때 한 번. 위 주석이 그 근거다.
  }, [])

  useEffect(() => {
    if (pageId === undefined) return

    // 응답이 오기 전에 다른 페이지로 옮기거나 이 본문이 내려가면 결과를 버린다
    // (`routes/editor.tsx`와 같은 가드). 페이지 쪽은 칸의 쓰기 가드도 막지만(`panel-drafts.tsx`),
    // 언마운트 쪽은 이것만 막는다 — 다음 마운트가 자기 조회를 다시 건다.
    let alive = true
    setState({ status: 'loading' })

    async function load(openPageId: string): Promise<void> {
      try {
        const page = await api.getPage(projectId, openPageId)
        if (!alive) return
        setState({ status: 'ready', title: page.title, description: page.description })
      } catch (caught) {
        if (!alive) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILED) })
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
    // `setState`는 이 렌더의 페이지를 단 쓰기라 `pageId`와 함께만 바뀐다.
  }, [api, projectId, pageId])

  const replace = (description: string | null): void => {
    // **조회에 성공한 상태에서만 갈아 끼운다.** 로딩·실패 상태를 `ready`로 만들면 제목이
    // 없는 `ready`를 지어내야 한다.
    setState((prev) => (prev.status === 'ready' ? { ...prev, description } : prev))
  }

  return { state, draft, setDraft, save, setSave, saving, replace }
}

/** 뷰 모드 «페이지 설명» 탭의 본문. 읽고 고친다(위 머리말). */
export function PageDescriptionPanel(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const api = useApi()
  const { projectId, pageId } = props
  const { state, draft, setDraft, save, setSave, saving, replace } = usePageDescription(projectId, pageId)

  const server = state.status === 'ready' ? (state.description ?? '') : ''
  const value = draft ?? server

  async function submit(): Promise<void> {
    if (pageId === undefined || saving.locked) return
    setSave(IDLE)
    // 빈 칸은 "설명을 지운다"(`null`)이고 그 밖은 친 그대로다(위 머리말).
    const next = value === '' ? null : value
    const openPageId = pageId
    // **잠금은 장부가 쥐고 푼다**(`write-ledger.tsx`) — 그 페이지의 것을, 지금 어디에 가 있든
    // (머리말 3), 에디터를 떠났다 와도(이월 Q). 아래 `settle`이 끝나야 풀린다.
    await saving.run({
      send: (signal) => api.updatePage(projectId, openPageId, { description: next }, { signal }),
      // **시간 안에 응답이 없으면 서버에서 다시 읽는다**(이월 R). 서버 값이 보낸 값과 같으면
      // 커밋된 것이다 — 서버가 설명을 정규화하지 않는다(`api/client.ts`의 `updatePage` 표:
      // 보낸 그대로 되읽힌다).
      verify: async () => {
        const page = await api.getPage(projectId, openPageId)
        return { description: page.description, committed: page.description === next }
      },
      settle: (outcome) => {
        // **아래는 칸에 쓴다 — 이 클릭이 난 렌더의 페이지를 달고.** 그래서 응답이 오기 전에
        // 탭을 오갔으면 **지금 떠 있는 본문**에 닿고(리뷰 N1 — 7차 판은 셋 중 초안 비우기만
        // 닿았다), 페이지를 옮겼으면 **어디에도 안 닿는다**(리뷰 N2 — `panel-drafts.tsx`).
        // 가 → 나 → 가로 돌아와 있으면 돌아온 방문에 닿고, 에디터를 떠났다 돌아와 있으면 **새로
        // 선 provider** 의 방문에 닿는다(이월 Q). 두 방문 다 잠금이 남아 있어 초안을 칠 수
        // 없었으므로 비우는 것은 **보낸 그것**뿐이다(리뷰 N-A — 머리말 3).
        if (outcome.kind === 'failed') {
          setSave({ status: 'failed', failure: toFailure(outcome.caught, SAVE_FAILED) })
          return
        }
        // **서버가 준 값을 쓴다** — 보낸 것이 아니라. 서버가 정규화하면 화면이 그것을 본다.
        // 다시 읽어 판정했으면 그 읽은 값이다.
        const committed = outcome.kind === 'done' || outcome.verdict.committed
        replace(outcome.kind === 'done' ? outcome.value.description : outcome.verdict.description)
        if (committed) {
          setDraft(null)
          setSave({ status: 'saved' })
        } else {
          // **초안은 남긴다** — 서버 값만 갈아 끼웠으므로 상자는 친 글을 보이고 저장 버튼이
          // 열린다. 다시 저장할 수 있다.
          setSave({ status: 'failed', failure: { kind: 'message', message: NOT_SAVED } })
        }
      },
    })
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

  // 저장 도중 세션이 끊긴 것도 같은 규칙이다 — 오류 문장이 아니라 로그인이다.
  const saveFailure = save.status === 'failed' ? save.failure : null
  if (saveFailure?.kind === 'signed-out') return <SignedOut />

  // **바꾼 것이 없으면 보내지 않는다.** 서버가 빈 본문에 400을 내는 것과는 다른 이유다 —
  // 이 본문은 키가 하나라 비지 않는다. 누를 것이 없을 때 눌리는 버튼을 두지 않는 것뿐이다.
  const dirty = value !== server

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
          void submit()
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
              setDraft(event.target.value)
              // **친 순간 앞의 통지를 지운다.** 남겨 두면 고치는 중에 "저장했습니다"가
              // 떠 있어, 지금 화면의 글이 저장된 것처럼 보인다. 잠금(`SAVING`)은 건드리지 않는다.
              setSave(IDLE)
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
      {saveFailure !== null && (
        // 서버 문장 그대로다(`api/failure.tsx`) — 400의 상한 문장·403의 권한 문장이 여기 온다.
        <p className="wb-shell-page-description-error" role="alert">{saveFailure.message}</p>
      )}
    </>
  )
}
