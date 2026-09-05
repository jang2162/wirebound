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
 * - **채택 — 초안을 패널 밖에 든다.** `PageDescriptionDraftProvider`가 `RightPanel`의
 *   탭 목록 **밖**에 서서 초안 한 칸을 든다. 그 컴포넌트는 탭·모드가 바뀌어도 언마운트되지
 *   않으므로 초안이 산다. **드는 자리가 언마운트를 고른 자리와 같다** — 대가를 만든 곳이
 *   대가를 문다.
 * - **버림 — 이 탭을 언마운트하지 않는다(`hidden`으로 둔다).** 재 봤다: `RightPanel`이
 *   탭 넷을 전부 그리게 하면 **`--project web`에서 35 사망 / 11 파일**이다
 *   (`edit-recovery` 8 · `props-lock` 8 · `menu-tree` 6 · `snapshots-panel` 4 · …).
 *   *"페이지를 한 번만 읽는다"*(D6)를 재는 케이스들이 그 안에 있다 — 위 §9 절이 적은
 *   **`getPage`가 둘이 된다**와 같은 값이고, 코멘트의 `listComments`까지 늘 나간다.
 * - **버림 — blur에 커밋한다(속성 패널 선례).** **그 선례가 이 갈래를 못 고친다.**
 *   실측: 속성 패널에 글을 치고 **탭을 클릭**하면 `activeElement`가 `BODY`로 가고
 *   `patchOps` **0건**이며, 돌아오면 상자가 `"옛 내용"`(서버 값)이다 — **속성 패널도 같은
 *   방식으로 친 글자를 잃는다.** `property-panel.tsx` 머리말이 이미 그 값을 갖고 있고
 *   (*"클릭으로 노드를 옮기면 초안이 사라진다 … 요청이 0건"*), **실브라우저에서는 재지
 *   않았다**고 스스로 못박아 뒀다. 그러니 blur 커밋은 «탭을 눌렀을 때»를 **브라우저에
 *   맡기는** 판이고, 그 위에 얹은 자는 jsdom에서 재현되지 않는다. 위 이유 셋도 그대로 선다.
 * - **버림 — 못 살린다고 머리말을 고치고 사용자에게 알린다.** 위 채택 갈래가 **파일 둘·
 *   50줄 안**이고 테스트 사망 0이므로, 값으로 «비용이 크다»가 성립하지 않는다.
 *   §3.16이 *"친 글자는 문서와 무관해 낡지 않는다"*로 살릴 값이라 판정한 그 부류다.
 *
 * **`comment-panel.tsx`는 아직 이 대가를 문다** — 실측: 코멘트 초안 `"코멘트 초안"`을 치고
 * 속성 탭을 눌렀다 돌아오면 `""`다. **여기서 고치지 않는다**(그 파일의 축이고 초안이 셋이다
 * — 새 코멘트·고치던 것·`editingId`). **보고로 올린다.**
 *
 * ## 페이지가 바뀌면 초안도 통지도 버린다 — **통지는 조회와 같은 자리, 초안은 한 겹 위**
 *
 * **탭이 그대로면 페이지를 바꿔도 이 패널은 언마운트되지 않는다** — `routes/editor.tsx`가
 * 탭 본문을 `key` 없이 그리므로 같은 인스턴스가 산다. 그래서 조회를 다시 거는 것만으로는
 * 부족했다: 앞 페이지에 쓰던 초안이 `value = draft ?? server`에서 **이기고**, 그대로
 * 저장하면 **남의 페이지에 그 글이 들어간다.** 저장 통지도 같은 경로로 새어 아무것도
 * 저장한 적 없는 페이지에 «저장했습니다»가 떠 있었다. **지어 놓고 났던 결함이고**
 * 브라우저에서 쳐서 DB까지 확인됐다(P10 리뷰 F1).
 *
 * **`comment-panel.tsx`가 같은 자리에서 같은 것을 한다** — 조회를 다시 걸면서 초안·고치던
 * 것·오류를 함께 버리고, 이유를 *"노드 id도 코멘트 id도 그 페이지 안에서만 뜻이 있다"*로
 * 적어 뒀다. **여기도 같은 결이다.**
 *
 * **그래서 셋(조회·초안·저장 통지)을 `usePageDescription`이 함께 낸다.** 초안과 통지를
 * 컴포넌트가 따로 들면 «페이지가 바뀌면 버린다»가 **두 벌의 처방**이 되고, 실제로 그렇게
 * 지었다가 조회 하나만 갖췄다.
 *
 * **7차에 초안의 «드는 자리»만 위로 올라갔다**(`PageDescriptionDraftProvider` — 위 절).
 * **처방이 두 벌이 된 것이 아니라 자리가 하나 옮겨간 것이다:** 훅은 여전히 셋을 함께 내고,
 * 초안을 버리는 일도 여전히 **한 군데**서만 한다. 다만 그 한 군데가 «패널이 마운트될 때»가
 * 아니라 «`pageId`가 바뀔 때»다 — **재 보니 그 둘이 같은 사건이 아니었다**(탭을 누르면
 * 앞의 것만 일어난다). 통지는 «마운트될 때»가 맞아 훅에 남았고, 그 갈리는 근거는
 * 이펙트 안 주석에 있다.
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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { PAGE_DESCRIPTION_MAX_LENGTH } from '@wirebound/schema'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'

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
 * **저장하지 않은 초안 한 칸.** `PageDescriptionPanel` 밖에 있는 것이 요점이다 —
 * 패널이 **언마운트되기 때문**이다(위 머리말 «탭·모드를 오가도 …»).
 *
 * 드는 자리는 `routes/editor.tsx`의 `RightPanel`이고, 그것이 **언마운트를 고른 컴포넌트**다.
 * 대가를 만든 자리가 대가를 문다.
 */
interface DraftBox {
  /** 아직 아무것도 안 쳤으면 `null`. `PageDescriptionPanel`의 `value`가 그것을 푼다. */
  draft: string | null
  setDraft: (draft: string | null) => void
}

const DraftContext = createContext<DraftBox | null>(null)

/**
 * 초안을 드는 자리. **탭 목록 밖에 세운다** — 안에 세우면 탭과 함께 언마운트되어
 * 아무것도 달라지지 않는다.
 *
 * **«페이지가 바뀌면 버린다»(F1)를 여기가 든다.** 이 이펙트가 패널이 아니라 여기 있는
 * 것이 이 판의 전부다: 패널의 이펙트는 **마운트마다** 돌아 탭을 한 번 누른 것만으로도
 * 초안을 지웠지만, 이 컴포넌트는 탭·모드가 바뀌어도 언마운트되지 않아 `pageId`가
 * **실제로 바뀔 때만** 돈다. (첫 마운트에서도 한 번 도는데 그때 초안은 이미 `null`이라
 * 아무 일도 안 한다.)
 */
export function PageDescriptionDraftProvider(props: {
  pageId: string | undefined
  children: ReactNode
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)
  const { pageId } = props

  useEffect(() => {
    setDraft(null)
  }, [pageId])

  const box = useMemo<DraftBox>(() => ({ draft, setDraft }), [draft])
  return <DraftContext.Provider value={box}>{props.children}</DraftContext.Provider>
}

/**
 * 그 칸을 읽는다. **없으면 요란하게 깨진다** — 조용히 로컬 상태로 물러나면 초안이 다시
 * 사라지는데 화면은 멀쩡해 보인다(고치기 전과 똑같은 결함이 소리 없이 돌아온다).
 */
function useDraftBox(): DraftBox {
  const box = useContext(DraftContext)
  if (box === null) {
    throw new Error('PageDescriptionPanel은 PageDescriptionDraftProvider 안에서만 선다')
  }
  return box
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; title: string; description: string | null }
  | { status: 'failed'; failure: Failure }

/** 저장 진행 상태. 성공·실패 통지는 **다음 편집이 시작되면 사라진다**(아래 `onChange`). */
type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'failed'; failure: Failure }

/**
 * **그 페이지의 것 셋을 함께 든다** — 조회(`state`)·초안(`draft`)·저장 통지(`save`).
 *
 * 셋이 한 자리에 있는 것이 이 훅의 요점이다. 셋 다 «그 페이지의 것»이라 **페이지가 바뀌면
 * 함께 버려야 하는데**, 초안과 통지를 컴포넌트가 따로 들면 그 버리는 일이 두 벌의 처방이
 * 된다(위 머리말의 그 절 — 그렇게 지었다가 결함이 났다).
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
  replace: (description: string | null) => void
} {
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // **초안은 «아직 안 쳤다»를 `null`로 든다.** 빈 문자열로 초기화하면 조회가 끝나기 전의
  // 빈 상자와 *"사용자가 지운 상자"*가 같은 값이 되어, 값이 도착할 때 지운 것을 되살린다.
  //
  // **`useState`가 아니라 위쪽 칸이다.** 여기 두면 탭을 한 번 누르는 것만으로 사라진다
  // (위 머리말 «탭·모드를 오가도 …»). 버리는 일도 그 칸이 한다.
  const { draft, setDraft } = useDraftBox()
  const [save, setSave] = useState<SaveState>({ status: 'idle' })

  useEffect(() => {
    if (pageId === undefined) return

    // 응답이 오기 전에 다른 페이지로 옮기면 결과를 버린다(`routes/editor.tsx`와 같은 가드).
    let alive = true
    setState({ status: 'loading' })
    // **그 페이지에 대한 통지를 버린다.** 통지는 그 페이지에서 한 저장의 결과라 이 페이지
    // 안에서만 뜻이 있다. `comment-panel.tsx`가 같은 자리에서 같은 것을 한다.
    //
    // **초안은 여기서 안 버린다 — `PageDescriptionDraftProvider`가 버린다.** 이 이펙트는
    // **마운트마다** 돌아서, 여기 두면 탭을 한 번 누르고 돌아온 것만으로 친 글이 사라진다
    // (위 머리말 «탭·모드를 오가도 …»의 그 값 — 실측으로 잡힌 결함이다).
    //
    // **통지는 갈린다. 마운트마다 지우는 것이 맞다.** 초안은 «사용자가 친 글자»라 잃으면
    // 안 되지만(§3.16 E), 통지는 «방금 저장했다»는 사건이라 탭을 다녀온 뒤에도 떠 있으면
    // 지금 화면의 글이 저장된 것처럼 보인다 — `onChange`가 통지를 지우는 것과 같은 이유다.
    setSave({ status: 'idle' })

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
  }, [api, projectId, pageId])

  const replace = useCallback((description: string | null) => {
    // **조회에 성공한 상태에서만 갈아 끼운다.** 로딩·실패 상태를 `ready`로 만들면 제목이
    // 없는 `ready`를 지어내야 한다.
    setState((prev) => (prev.status === 'ready' ? { ...prev, description } : prev))
  }, [])

  return { state, draft, setDraft, save, setSave, replace }
}

/** 뷰 모드 «페이지 설명» 탭의 본문. 읽고 고친다(위 머리말). */
export function PageDescriptionPanel(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const api = useApi()
  const { projectId, pageId } = props
  const { state, draft, setDraft, save, setSave, replace } = usePageDescription(projectId, pageId)

  const server = state.status === 'ready' ? (state.description ?? '') : ''
  const value = draft ?? server

  async function submit(): Promise<void> {
    if (pageId === undefined) return
    setSave({ status: 'saving' })
    // 빈 칸은 "설명을 지운다"(`null`)이고 그 밖은 친 그대로다(위 머리말).
    const next = value === '' ? null : value
    try {
      const page = await api.updatePage(projectId, pageId, { description: next })
      // **서버가 준 값을 쓴다** — 보낸 것이 아니라. 서버가 정규화하면 화면이 그것을 본다.
      replace(page.description)
      setDraft(null)
      setSave({ status: 'saved' })
    } catch (caught) {
      setSave({ status: 'failed', failure: toFailure(caught, SAVE_FAILED) })
    }
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

  const saving = save.status === 'saving'
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
            disabled={saving}
            onChange={(event) => {
              setDraft(event.target.value)
              // **친 순간 앞의 통지를 지운다.** 남겨 두면 고치는 중에 "저장했습니다"가
              // 떠 있어, 지금 화면의 글이 저장된 것처럼 보인다.
              setSave({ status: 'idle' })
            }}
          />
        </label>
        {/* **글자 수를 보인다.** `maxLength`가 조용히 잘라 내므로(브라우저가 더 못 치게
            막는다) 세는 것이 없으면 사용자는 왜 안 쳐지는지 모른다. 한 줄 입력들
            (`snapshots-panel.tsx`)은 눈으로 어림되지만 여러 줄 상자는 그렇지 않다. */}
        <p className="wb-shell-page-description-count">
          {value.length} / {PAGE_DESCRIPTION_MAX_LENGTH}
        </p>
        <button type="submit" className="wb-shell-page-description-save" disabled={saving || !dirty}>
          설명 저장
        </button>
      </form>
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
