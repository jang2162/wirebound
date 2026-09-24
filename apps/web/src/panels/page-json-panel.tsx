/**
 * **페이지 JSON 내보내기·가져오기**(설계서 「페이지 JSON」). 메뉴 트리 상자 안,
 * 툴바 아래에 산다.
 *
 * ---
 *
 * # 왜 메뉴 트리인가
 *
 * **가져오기는 새 페이지를 만드는 조작이다**(절대 덮지 않는다). 페이지를 만드는 자리는
 * 이미 여기다(`MenuToolbar`의 `페이지 추가`), 그리고 대상이 **메뉴 노드**라 그 선택을 든
 * 곳이 여기뿐이다. 구조 툴바에 두면 *"지금 페이지"*를 고른 상태에서 **다른 페이지를 만드는**
 * 버튼이 되어 자리가 뜻과 어긋난다.
 *
 * 내보내기가 같은 상자에 있는 것은 **둘이 같은 파일 형식의 양쪽**이기 때문이다 — 나누면
 * 사용자가 *"내보낸 것을 어디로 가져오나"*를 화면에서 잇지 못한다.
 *
 * ---
 *
 * # 가져오기 폼은 **기본이 접혀 있다**
 *
 * **드물게 쓰는 조작이 주인공(트리)의 자리를 상시로 먹지 않게 한다.** 1440x900에서 좌측의 두
 * 상자는 `flex: 1`이라 425px씩 나눠 갖는데, 펼친 이 패널이 그중 **235px**를 먹는다. 접으면
 * **33px**이고, 펼치면 235px로 정확히 돌아온다 — 접힘은 폼 자체를 바꾸지 않는다.
 *
 * **버는 자리를 값으로 말한다**(전부 진짜 크로미움에서 잰 값이고, **`clientHeight`·
 * `scrollHeight`이지 "몇 줄"이 아니다** — 줄 수는 창 크기·글꼴에 따라 흔들려 근거로 못 쓴다):
 *
 * - **작은 설계서에서 스크롤 자체가 사라진다** — 상자의 `scrollHeight`가 **506px → 425px**
 *   이고 그 425px은 상자 자신의 `clientHeight`다. **`scrollHeight`는 상자 높이 아래로는 안
 *   내려가므로** 425px은 *"딱 찼다"*가 아니라 *"더는 넘치지 않는다"*는 뜻이다 — 스크롤 막대가
 *   사라진다. (그래서 줄어든 양 81px이 아래 202px과 다르다. 실제로 빠진 것은 202px이고
 *   나머지는 바닥에 닿아 안 보이는 것뿐이다.)
 * - **큰 설계서에서는 넘치는 양이 준다** — 같은 425px 상자에서 `scrollHeight` **842px →
 *   640px**(넘치는 양 417px → 215px). 여전히 스크롤하지만 한 화면에 드는 몫이 그만큼 는다.
 *
 * (이 자리를 *"스크롤 없이 서는 트리 N줄 → M줄"*처럼 줄 수로 말하지 마라 — 맨 위에서
 * 보이는 트리 줄은 접든 펴든 그대로이고, 그런 수는 *"패널과 트리를 한 화면에 놓았을 때
 * 트리가 갖는 몫"*이라는 다른 것을 센다.)
 *
 * ## `<details>`가 아니라 토글 버튼 + 조건부 렌더다
 *
 * 1. **이 저장소의 "접힘"은 `hidden`이 아니라 DOM에서 빼는 것이다** — `routes/editor.tsx`가
 *    구조 트리를 그렇게 접고 그 자리에 근거를 적었다. 여기서는 이유가 하나 더 붙는다:
 *    빼면 **입력 칸 셋이 함께 사라지므로** 접힌 동안 아래 «이 상자의 키 이벤트»의 사고가
 *    성립할 여지 자체가 없다.
 * 2. **`<details>`는 이 저장소의 케이스가 잴 수 없다.** jsdom이 닫힌 `<details>`의 자식을
 *    숨기지 않는다 — 쟀다: 닫힌 채로 `queryByRole('button', …)`이 그것을 **찾고**
 *    `getComputedStyle(…).display`가 `none`이 아니라 `inline-block`이다. 그러면
 *    *"기본이 접힘"*을 재는 케이스를 쓸 수 없어, **되돌려도 죽는 케이스가 없는 변경**이 된다.
 * 3. **선례가 이미 토글 버튼이다** — `shell/export-panel.tsx`·`shell/snapshots-panel.tsx`가
 *    `aria-expanded`를 쓴다.
 *
 * ## 팝오버는 아니다
 *
 * 그 둘은 셸 **머리**에 살아 캔버스 위로 겹칠 수 있다. 이 패널은 `overflow: auto`인
 * `.wb-shell-region` **안**이라 절대 위치 상자가 그 상자에 잘리고, 거기서 벗어나는 수단
 * (포털)은 이 저장소에 0건이다. 제자리에서 펼치고 상자가 스크롤하는 것이 맞다 — 접힘이
 * 닫는 것은 *"펼치면 자리를 먹는다"*가 아니라 *"안 쓸 때도 먹는다"*이다.
 *
 * ## `페이지 내보내기`는 접힘 **밖**이다
 *
 * **토글과 같은 줄에 서므로 이것까지 접어서 버는 세로가 0px이다** — 접힌 패널 33px은
 * 버튼 한 줄(25px)과 상자의 위 여백(8px)이고, 그 줄에서 버튼 하나를 빼도 줄은 그대로 한
 * 줄이다. 값이 0인 대가로 얻는 것은 둘이다: **접힌 채로도 이 상자가 무엇을 하는 자리인지
 * 말하고**, **내보내기와 가져오기가 같은 파일 형식의 양쪽**이라는 이 상자의 축(위 첫 절)이
 * 접혀 있을 때도 보인다. 읽기 동작 하나를 한 번 더 눌러야 닿는 자리로 미룰 이유가 없다.
 *
 * **이 0px은 여기서만 참이다** — `theme/theme-io-panel.tsx`의 접힘 밖 셋은 토글과 **다른
 * 줄**이라 26.5px이다. 그쪽은 그쪽 머리말이 자기 값으로 판단을 든다. 여기 문장을 그리로
 * 옮겨 쓰지 마라.
 *
 * ## 접힘 상태는 이 컴포넌트의 `useState`다
 *
 * 스토어도 `localStorage`도 아니다.
 *
 * - **대기 글자(`text`·`title`)를 이 컴포넌트가 이미 들고 있어** 접었다 펴도 치던 것이
 *   그대로 남는다. 상태를 아래로 내리면 그 성질을 잃는다.
 * - `MenuTree`는 페이지를 옮겨도 마운트를 유지하므로 **열어 둔 것이 페이지 이동으로 닫히지
 *   않는다.** 다시 접히는 것은 **뷰 모드로 갔다 오거나**(그때는 패널이 통째로 DOM에서
 *   빠진다) 설계서를 다시 열 때다.
 * - **`localStorage`에 두지 않는다.** 들이면 *"언제 지우나"*와 접근 자체가 던지는 판
 *   (`shell/sidebar-layout.ts` 머리말)이 따라오는데, 드물게 쓰는 폼에 대해 세션마다
 *   한 번 여는 것은 맞는 대가다. 필요해지는 날의 신호는 *"열어 두는 사람이 매번 다시
 *   연다"*이고 그때 이 문단을 고치면 된다.
 *
 * ## 문안
 *
 * 토글은 `페이지 JSON 가져오기`다. 안의 실행 버튼이 `페이지 가져오기`라 **같은 이름을 쓰면
 * 펼친 순간 둘이 한 화면에 서고 이름으로 하는 조회가 갈리지 않는다.** 상자 이름과 붙여 넣기
 * 칸 이름이 이미 `페이지 JSON`이므로 그 낱말을 그대로 쓴다.
 *
 * ---
 *
 * # 이 상자의 키 이벤트
 *
 * `panels/menu-tree.tsx`의 키 핸들러는 **트리와 툴바와 이 패널을 함께 감싸는 상자**에 붙어
 * 있고, 첫 단축키가 수식 키 없는 `Delete`·`Backspace`를 **삭제 확인**으로 받는다. 여기에
 * 입력 칸 셋(파일·붙여 넣기·제목)을 놓으면 **이름을 고치다 오타를 지운 사용자가 메뉴 삭제
 * 확인을 보게 된다** — 구조 트리에서도 같은 사고가 난다(`panels/typing-surface.ts` 머리말).
 *
 * **칸을 하나씩 예외 처리하지 않는다.** 태그 이름 목록으로 가르면 목록 밖의 표면에서 같은
 * 사고가 난다(`panels/typing-surface.ts`의 «태그 이름이 아니라 편집 가능성으로 가른다»).
 * **그 상자의 핸들러가 `isTypingSurface`로 거른다** — `commands.editing !== null`이라는
 * **상태**로만 거르면 그것은 인라인 입력에만 참이라 이 패널의 칸에는 걸리지 않는다.
 *
 * **못 막는 표면 둘**(`mode:'closed'` shadow 호스트 · 편집 가능성도 역할도 선언하지 않는
 * 위젯)은 여기에 없다 — 이 패널이 쓰는 것은 `<input>` 둘과 `<textarea>` 하나이고 셋 다
 * 폼 컨트롤이라 생성자로 잡힌다.
 *
 * ---
 *
 * # 읽기 실패를 **넷으로 갈라 말한다**
 *
 * 파일은 읽었는데 그 안의 문서를 못 읽은 상태가 있다. 접으면 화면이 **겪지 않은 실패**를
 * 말한다.
 *
 * | 상태 | 무엇이 일어났나 | 사용자가 할 일 |
 * |---|---|---|
 * | `file-failed` | **파일 자체를 못 읽었다**(권한·삭제) | 다시 고른다 |
 * | `unreadable` | 파일은 읽었는데 JSON이 아니다 | 파일을 확인한다 |
 * | `not-envelope` | JSON은 맞는데 wirebound 페이지 파일이 아니다 | **다른 파일을 고른다** |
 * | `unknown-version` | 봉투는 맞는데 모르는 버전이다 | **wirebound를 올린다** |
 * | `bad-shape` | 봉투인데 **그 안의 내용**이 규격이 아니다 | **파일의 그 자리를 고친다**(자리를 보인다) |
 *
 * 뒤 넷은 `@wirebound/schema`의 `readPageJson`이 가르고 **서버도 같은 함수를 쓴다.**
 *
 * > ***"화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일이 없다"*고 단언하지 않는다.**
 * > 봉투 게이트 하나만 보면 그렇게 보이지만, 문서 버전 999 · 카탈로그에 없는 타입 ·
 * > `duplicate-id`는 봉투를 지나고도 서버가 400/422로 거절한다. 미리보기는 게이트 셋을 다
 * > 지나고(`previewPageJson`의 표), **그래도 서버만 아는 것 넷이 남는다** — 그것을 화면이
 * > 말한다(`SERVER_ONLY`). 단언을 줄이고 남는 것을 적는다.
 *
 * **파일 읽기가 실패하면 대기 글자를 비운다.** 안 비우면 화면은 *"파일을 읽지 못했습니다"*라고
 * 말하는데 앞서 읽힌 글자가 남아 있어, 그 상태로 누르면 **고르지도 않은 앞 파일**이
 * 들어간다(`theme-io-panel.tsx`의 실측).
 *
 * ---
 *
 * # 이 파일은 오류 경계 밖이다
 *
 * 메뉴 트리와 같은 자리다. 그래서 여기서 부르는 것은 전부 **값으로 답하는** 것들이다:
 * `readPageJson`은 던지지 않고, 미리보기의 수는 봉투를 지난 트리에서 센다.
 */
import { useState, type ReactElement } from 'react'
import {
  collectNodeIds,
  gatePageImport,
  partitionIssues,
  readPageJson,
  type PageJson,
  type ValidationIssue,
} from '@wirebound/schema'
// **카탈로그가 실려 있어야 `validatePage`가 참말을 한다.** import만으로 설치된다
// (`catalog-setup.ts`의 머리말) — 안 싣고 부르면 모든 타입이 *"없는 타입"*이 되어
// **미리보기가 멀쩡한 파일을 전부 막는다.**
import '../catalog-setup'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import { pageExport } from '../edit/page-export'
import { downloadTextFile, readTextFile } from '../files/file-io'
import type { TreeCommands } from '../tree/use-tree-commands'

/** 아직 아무 글자도 없을 때. */
const NO_TEXT = '파일을 고르거나 JSON을 붙여 넣으세요'
/** 내보낼 페이지가 없을 때. */
const NO_PAGE = '페이지를 열면 내보낼 수 있습니다'
/** 가져올 메뉴를 고르지 않았을 때. **`treeAbilities.addPage`와 같은 조건이다.** */
const NO_MENU = '가져올 메뉴를 트리에서 고르세요'
/** 내보내기가 이유 없이 실패했을 때. */
const EXPORT_FAILED = '페이지를 내보내지 못했습니다'
/** 파일 자체를 못 읽었을 때(내용이 JSON이 아닌 것과 **다른 말이다**). */
const FILE_FAILED = '파일을 읽지 못했습니다'
/** 봉투는 맞는데 그 안의 **문서 버전**을 이 wirebound가 모를 때. 서버도 같은 이유로 400이다. */
const UNSUPPORTED_VERSION = '이 파일의 문서 버전을 읽을 수 없습니다 —'
/** 봉투도 버전도 맞는데 **카탈로그 규칙**을 어겼을 때. 서버는 같은 이유로 422다. */
const INVALID_DOCUMENT = '이 문서는 페이지로 서지 않습니다 — 파일의 아래 자리를 고치세요.'
/**
 * 미리보기가 **볼 수 없는 것**. 위 `previewPageJson`의 표를 한 줄로 옮긴 것이고,
 * *"미리보기가 다 걸러 준다"*는 거짓을 화면이 말하지 않게 하는 자리다.
 */
const SERVER_ONLY = '보내 봐야 아는 것: 대상 메뉴가 아직 있는지 · NUL 문자 · 본문 크기 · 권한.'

/** 미리보기가 가리키는 파일의 한 자리. 봉투 이슈와 카탈로그 이슈를 같은 모양으로 담는다. */
interface PreviewIssue {
  path: string
  message: string
  /** 카탈로그 이슈에만 있다. **파일의 id다** — 리매핑 전 문서로 보기 때문이다. */
  nodeId?: string | null
}

/** 대기 글자를 읽은 결과. */
type Preview =
  | { kind: 'none' }
  | { kind: 'failed'; message: string; issues: readonly PreviewIssue[] }
  | {
      kind: 'ready'
      file: PageJson
      nodes: number
      comments: number
      dangling: number
      /** 막지 않는 이슈. **알리되 막지 않는다** — 서버도 이것으로 막지 않는다. */
      warnings: readonly PreviewIssue[]
    }

/**
 * 대기 글자를 미리보기로 옮긴다. **순수하고 던지지 않는다.**
 *
 * ---
 *
 * # 서버와 **같은 함수**로 게이트 셋을 지난다
 *
 * **봉투만 보면 미리보기가 통과시킨 파일을 서버가 거절한다** — 문서 버전 999 · 카탈로그에
 * 없는 타입 · `duplicate-id`가 그렇다. *"화면은 괜찮다고 했는데 저장이 거부됐다"*는 부류다.
 *
 * | 게이트 | 서버 | 여기 | 왜 같을 수 있나 |
 * |---|---|---|---|
 * | 봉투 | `parsePageJson` | `readPageJson` | 같은 모듈의 두 입구 |
 * | 문서 버전 | `migrateDocument` | 같은 함수 | 순수하고 브라우저에서 돈다 |
 * | 카탈로그 | `validatePage` | 같은 함수 | 〃. 카탈로그도 같은 패키지가 싣는다(`catalog-setup`) |
 *
 * **`error`만 막는다.** 경고는 서버도 막지 않으므로 여기서 막으면 **화면이 서버보다
 * 엄격해진다** — 그쪽 손해가 더 크다: 할 수 있는 일을 못 하게 된다.
 *
 * **검증을 리매핑 전 문서로 하는 것도 서버와 같다**. 사용자에게 남는 것은 파일뿐이라
 * 이슈의 `nodeId`가 **파일에서 찾을 수 있는 값**이어야 한다.
 *
 * # 서버만 아는 것 넷 — **미리보기가 다 걸러 준다고 말하지 않는다**
 *
 * | 무엇 | 왜 여기서 못 보나 |
 * |---|---|
 * | 대상 메뉴가 아직 있는가 | 트리가 낡았을 수 있다(고른 뒤 남이 지운다) |
 * | NUL(U+0000) | 그 규칙은 **Postgres를 아는 계층**의 것이다(`db/nul-guard.ts`) — 여기로 옮기면 브라우저에서도 도는 패키지가 DB 제약을 알게 된다 |
 * | 본문 크기 | 상한이 **서버 설정**이다(Fastify 기본 1MiB) |
 * | 권한 | 서버만 판정한다(설계서 「권한 모델」) |
 *
 * **그리고 배포 편차가 있다** — 서버가 다른 판의 `@wirebound/schema`를 돌리면 위 셋도
 * 갈릴 수 있다. 그래서 화면은 *"보내 봐야 아는 것"*이 남아 있다고 **말한다.**
 *
 * ---
 *
 * **끊긴 코멘트를 여기서 센다**. 세는 단위는 *"파일의 트리에 없는 노드를 가리키는
 * 코멘트 하나당 하나"*이고, 그것이 서버가 내는 `comments.dangling`과 같은 값이어야 한다 —
 * 같지 않으면 미리보기가 **일어나지 않을 일**을 말한다. 리매핑을 여기서 돌리지 않는 것은
 * 그것이 id를 태우기 때문이고, 셈에는 파일의 id 집합만 있으면 된다.
 *
 * `collectNodeIds`가 던지지 않는 것은 봉투를 지난 트리이기 때문이다 — `PageJsonSchema`가
 * `children`을 재귀로 검사하므로 노드가 아닌 원소가 있을 수 없다.
 */
export function previewPageJson(text: string): Preview {
  if (text.trim() === '') return { kind: 'none' }

  const result = readPageJson(text)
  if (result.status === 'failed') {
    return { kind: 'failed', message: result.message, issues: result.issues }
  }

  // **게이트 둘을 여기서 짜지 않는다 — 서버와 같은 함수를 부른다**.
  // 한 벌 더 짜면 같은 물음에 답하는 자리가 둘이 되고, 갈리는 날 이 미리보기가 다시
  // *"괜찮다"*고 거짓을 말한다. 순서·판정의 근거는 `gatePageImport`의 머리말에 있다.
  const gate = gatePageImport(result.file)
  if (!gate.ok) {
    return gate.reason === 'unsupported-version'
      ? { kind: 'failed', message: `${UNSUPPORTED_VERSION} ${gate.message}`.trim(), issues: [] }
      : {
          kind: 'failed',
          message: INVALID_DOCUMENT,
          // **막은 것만 보인다** — 게이트는 경고까지 함께 싣는데(서버 응답과 같은 관례),
          // 화면에서 둘을 섞으면 사용자가 무엇을 고쳐야 막힘이 풀리는지 모른다.
          issues: partitionIssues(gate.issues).errors.map(toPreviewIssue),
        }
  }

  const ids = new Set(collectNodeIds(result.file.schema.root))
  return {
    kind: 'ready',
    file: result.file,
    nodes: ids.size,
    comments: result.file.comments.length,
    dangling: result.file.comments.filter((comment) => !ids.has(comment.nodeId)).length,
    warnings: gate.warnings.map(toPreviewIssue),
  }
}

function toPreviewIssue(issue: ValidationIssue): PreviewIssue {
  return { path: issue.path, message: issue.message, nodeId: issue.nodeId }
}

export function PageJsonPanel(props: {
  projectId: string
  /** 열린 페이지. 내보내기의 대상이다. 없으면 내보낼 것이 없다. */
  pageId: string | undefined
  commands: TreeCommands
}): ReactElement {
  const api = useApi()
  const { projectId, pageId, commands } = props
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [exporting, setExporting] = useState(false)
  /** 가져오기 폼이 펼쳐졌는가. **기본은 접힘이다**(머리말). */
  const [importOpen, setImportOpen] = useState(false)
  /** 내보내기·파일 읽기의 실패. **가져오기 실패는 `commands.failure`가 든다**(자리가 하나여야 한다). */
  const [localFailure, setLocalFailure] = useState<Failure | null>(null)

  const preview = previewPageJson(text)

  /**
   * 지금 페이지를 파일로 내려받는다.
   *
   * **서버에서 둘을 같은 순간에 읽는다**(`edit/page-export.ts`의 머리말) — 스토어의 문서와
   * 서버의 코멘트를 섞으면 파일이 만들어지는 순간 끊긴 참조를 담을 수 있다.
   */
  async function runExport(): Promise<void> {
    if (pageId === undefined) return
    setExporting(true)
    setLocalFailure(null)
    try {
      const [page, comments] = await Promise.all([
        api.getPage(projectId, pageId),
        api.listComments(projectId, pageId),
      ])
      const exported = pageExport(page, comments)
      downloadTextFile(exported.fileName, exported.text)
    } catch (caught) {
      setLocalFailure(toFailure(caught, EXPORT_FAILED))
    } finally {
      setExporting(false)
    }
  }

  function runImport(): void {
    if (preview.kind !== 'ready') return
    commands.importJson(preview.file, title.trim())
    // **대기 글자를 비운다.** 성공하면 새 페이지로 옮겨 가고, 실패하면 `commands.failure`가
    // 이유를 말한다 — 어느 쪽이든 같은 글자를 다시 보내는 것은 같은 결과다.
    setText('')
    setTitle('')
  }

  return (
    <section className="wb-shell-pagejson" aria-label="페이지 JSON">
      <div className="wb-shell-pagejson-row">
        <button
          type="button"
          className="wb-shell-pagejson-action"
          disabled={pageId === undefined || exporting}
          title={pageId === undefined ? NO_PAGE : ''}
          onClick={() => void runExport()}
        >
          페이지 내보내기
        </button>
        {/* **접힌 채로도 이 상자가 무엇을 하는 자리인지 말하는 한 줄이다**(머리말).
            `aria-expanded`는 셸 머리의 팝오버 토글 둘과 같은 것을 쓴다 — 다만 **그 둘이
            함께 쓰는 `shell/use-popover-dismiss.ts`는 여기서 쓰지 않는다.** 이것은 팝오버가
            아니라 제자리에서 펼치는 폼이라 *"바깥"*이 없다: 트리를 누르는 것은 **가져올
            메뉴를 고르는 것**이라 폼을 닫을 일이 아니고, `Escape`로 닫으면 치던 글자가
            화면에서 사라진다(글자 자체는 남지만 사용자는 잃은 줄 안다). */}
        <button
          type="button"
          className="wb-shell-pagejson-action"
          aria-expanded={importOpen}
          onClick={() => setImportOpen((was) => !was)}
        >
          페이지 JSON 가져오기
        </button>
      </div>

      {/* **폼은 토글이 열 때만 DOM에 있다**(머리말 — `hidden`이 아니다). 대기 글자는 이
          컴포넌트가 들고 있으므로 접었다 펴도 그대로다. */}
      {importOpen && (
        <div className="wb-shell-pagejson-import" role="group" aria-label="페이지 JSON 가져오기">
          <label className="wb-shell-pagejson-field">
            페이지 파일
            <input
              className="wb-shell-pagejson-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file === undefined) return
                void readTextFile(file).then(
                  (read) => {
                    setText(read)
                    setLocalFailure(null)
                  },
                  (error: unknown) => {
                    // **대기 글자를 비운다** — 안 비우면 앞서 읽힌 파일이 들어간다(머리말).
                    setText('')
                    setLocalFailure(toFailure(error, FILE_FAILED))
                  },
                )
              }}
            />
          </label>

          <label className="wb-shell-pagejson-field">
            페이지 JSON
            <textarea
              className="wb-shell-pagejson-text"
              value={text}
              rows={3}
              spellCheck={false}
              onChange={(event) => {
                setText(event.target.value)
                setLocalFailure(null)
              }}
            />
          </label>

          <label className="wb-shell-pagejson-field">
            가져올 페이지 제목
            <input
              className="wb-shell-pagejson-input"
              value={title}
              placeholder="비우면 파일의 제목을 씁니다"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <PreviewView preview={preview} />

          <button
            type="button"
            className="wb-shell-pagejson-action"
            // **`addPage`와 같은 판정이다** — 가져오기는 페이지를 만드는 것이다. 판정을 여기서
            // 새로 짜지 않고, 훅도 같은 값을 다시 본다(단축키가 버튼을 지나지 않는
            // 자리와 같은 겹).
            disabled={!commands.abilities.addPage || commands.busy || preview.kind !== 'ready'}
            title={commands.abilities.addPage ? '' : NO_MENU}
            onClick={runImport}
          >
            페이지 가져오기
          </button>
        </div>
      )}

      {/* **둘 다 접힘 밖이다.** 실패는 내보내기(접힘 밖)의 것이기도 하고, 가져온 결과는
          폼을 접은 뒤에도 읽을 것이 남는다 — 안에 두면 접는 순간 방금 한 일이 사라진다. */}
      {localFailure !== null && (
        <p className="wb-shell-pagejson-notice" role="alert">
          {localFailure.kind === 'message' ? localFailure.message : EXPORT_FAILED}
        </p>
      )}

      {commands.imported !== null && <ImportedView imported={commands.imported} />}
    </section>
  )
}

/** 대기 글자에 대해 아는 것. **셋을 갈라 그린다**(머리말의 표). */
function PreviewView(props: { preview: Preview }): ReactElement {
  const { preview } = props

  if (preview.kind === 'none') {
    return <p className="wb-shell-pagejson-notice">{NO_TEXT}</p>
  }

  if (preview.kind === 'failed') {
    return (
      <div className="wb-shell-pagejson-notice">
        <p role="alert">{preview.message}</p>
        {/* **파일의 자리를 보인다**. 가져오기가 실패하면 사용자에게 남는 것이 파일뿐이라
            *"규격이 아닙니다"* 하나로는 어디를 고칠지 알 수 없다. */}
        {preview.issues.length > 0 && <IssueList issues={preview.issues} />}
      </div>
    )
  }

  return (
    <div className="wb-shell-pagejson-notice">
      {/* **`role="status"`이지 `alert`이 아니다** — 읽은 것을 말하는 자리이지 실패 통지가
          아니다(`preset-picker.tsx`가 확인 문장에 대해 같은 판단을 적었다). */}
      <p role="status">
        {preview.file.page.title} — 노드 {preview.nodes}개, 코멘트 {preview.comments}개
      </p>
      {/* **경고는 막지 않는다** — 서버도 막지 않으므로 여기서 막으면 화면만
          엄격해진다. 대신 보인다: 들어간 뒤에야 알면 고칠 자리를 다시 찾아야 한다. */}
      {preview.warnings.length > 0 && (
        <>
          <p>경고 {preview.warnings.length}개는 저장을 막지 않습니다.</p>
          <IssueList issues={preview.warnings} />
        </>
      )}
      {preview.dangling > 0 && (
        <p>
          코멘트 {preview.dangling}개는 이 파일의 트리에 없는 노드를 가리킵니다 — 들어가되
          <strong>&ldquo;사라진 노드&rdquo;</strong>로 남습니다.
        </p>
      )}
      {/* **쓰지 않는다고 미리 말한다.** 서버도 응답에서 같은 것을 말하지만, 누르기
          전에 아는 편이 낫다. */}
      {preview.file.page.layoutRef !== undefined && (
        <p>
          이 파일은 레이아웃 <code>{preview.file.page.layoutRef}</code>을 가리키지만, 페이지는
          프로젝트의 기본 레이아웃을 쓰고 따로 고를 수 없어 <strong>쓰지 않습니다.</strong>
        </p>
      )}
      {/* **미리보기가 다 걸러 준다고 말하지 않는다.** 위 `previewPageJson`의 표가 무엇을
          못 보는지 적어 뒀고, 이 줄이 그것을 사용자에게 옮긴다 — 없으면 화면이 다시
          *"괜찮다"*고 단언하게 된다. */}
      <p>{SERVER_ONLY}</p>
    </div>
  )
}

/**
 * 파일의 자리 목록. **막은 이유와 경고가 같은 모양으로 보인다** — 둘 다 *"파일의 어디"*를
 * 말하는 것이고, 모양을 나누면 같은 것을 두 벌로 그리게 된다.
 *
 * **`nodeId`는 있을 때만 붙인다.** 봉투 이슈에는 없다(그 층은 노드를 모른다).
 */
function IssueList(props: { issues: readonly PreviewIssue[] }): ReactElement {
  return (
    <ul className="wb-shell-pagejson-issues">
      {props.issues.map((issue) => (
        <li key={`${issue.path}:${issue.nodeId ?? ''}:${issue.message}`}>
          <code>{issue.path === '' ? '(파일 전체)' : issue.path}</code>{' '}
          {issue.nodeId != null && <code>{issue.nodeId}</code>} {issue.message}
        </li>
      ))}
    </ul>
  )
}

/**
 * 가져온 뒤에 말해야 하는 것. **성공 통지이지만 `role="status"` 하나로 끝나지 않는다** —
 * 고아 코멘트는 사용자가 **되돌릴 수 없는** 상태이고(코멘트 행은 지워지지 않는다),
 * 그것을 말하지 않으면 사용자는 자기가 그것을 만든 줄 모른다.
 */
function ImportedView(props: {
  imported: NonNullable<TreeCommands['imported']>
}): ReactElement {
  const { imported } = props

  return (
    <div className="wb-shell-pagejson-notice">
      <p role="status">
        가져왔습니다: {imported.page.title} — 코멘트 {imported.comments.inserted}개
      </p>
      {imported.comments.dangling > 0 && (
        <p>
          그중 {imported.comments.dangling}개는 가리키던 노드가 파일에 없어
          <strong>&ldquo;사라진 노드&rdquo;</strong>로 들어갔습니다.
        </p>
      )}
      {imported.ignoredLayoutRef !== undefined && (
        <p>
          레이아웃 <code>{imported.ignoredLayoutRef}</code>은 쓰지 않았습니다 — 이 페이지는
          프로젝트의 기본 레이아웃으로 열립니다.
        </p>
      )}
    </div>
  )
}
