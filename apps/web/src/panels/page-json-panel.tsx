/**
 * **페이지 JSON 내보내기·가져오기**(§11.2 — P7-3 T5: D10·D11). 메뉴 트리 상자 안,
 * 툴바 아래에 산다.
 *
 * ---
 *
 * # 왜 메뉴 트리인가
 *
 * **가져오기는 새 페이지를 만드는 조작이다**(D4 — 절대 덮지 않는다). 페이지를 만드는 자리는
 * 이미 여기다(`MenuToolbar`의 `페이지 추가`), 그리고 대상이 **메뉴 노드**라 그 선택을 든
 * 곳이 여기뿐이다. 구조 툴바에 두면 *"지금 페이지"*를 고른 상태에서 **다른 페이지를 만드는**
 * 버튼이 되어 자리가 뜻과 어긋난다.
 *
 * 내보내기가 같은 상자에 있는 것은 **둘이 같은 파일 형식의 양쪽**이기 때문이다 — 나누면
 * 사용자가 *"내보낸 것을 어디로 가져오나"*를 화면에서 잇지 못한다.
 *
 * ---
 *
 * # D11 — 이 상자의 키 이벤트
 *
 * `panels/menu-tree.tsx`의 키 핸들러는 **트리와 툴바와 이 패널을 함께 감싸는 상자**에 붙어
 * 있고, 첫 단축키가 수식 키 없는 `Delete`·`Backspace`를 **삭제 확인**으로 받는다. 여기에
 * 입력 칸 셋(파일·붙여 넣기·제목)을 놓으면 **이름을 고치다 오타를 지운 사용자가 메뉴 삭제
 * 확인을 보게 된다** — P7-2 이월 §2가 구조 트리에서 실측한 그 사고다.
 *
 * **칸을 하나씩 예외 처리하지 않았다.** 그 이월이 정확히 그러지 말라고 적었고
 * (*"태그 이름 목록으로 가르면 안 된다"*), `panels/typing-surface.ts`가 그 부류를 이미
 * 덮는다. **그 상자의 핸들러에 `isTypingSurface` 한 줄을 더한 것이 이 슬라이스가 한
 * 일이다** — 앞서 그 상자는 `commands.editing !== null`이라는 **상태**로만 걸렀고, 그것은
 * 인라인 입력에만 참이라 이 패널의 칸에는 걸리지 않는다.
 *
 * **못 막는 표면 둘**(`mode:'closed'` shadow 호스트 · 편집 가능성도 역할도 선언하지 않는
 * 위젯)은 여기에 없다 — 이 패널이 쓰는 것은 `<input>` 둘과 `<textarea>` 하나이고 셋 다
 * 폼 컨트롤이라 생성자로 잡힌다.
 *
 * ---
 *
 * # 읽기 실패를 **넷으로 갈라 말한다**
 *
 * P7-2 이월 §4가 *"P7-3의 미리보기도 같은 물음을 받는다 — 파일은 읽었는데 그 안의 문서를
 * 못 읽은 상태가 있다"*고 적은 자리다. 접으면 화면이 **겪지 않은 실패**를 말한다.
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
 * > **여기 있던 *"화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일이 없다"*는
 * > 거짓이었다 — 리뷰가 셋을 실측했다**(문서 버전 999 · 카탈로그에 없는 타입 ·
 * > `duplicate-id`: 미리보기는 `ready`인데 서버가 400/422). 그 문장은 **봉투 게이트
 * > 하나만 보고** 전체를 단언한 것이다. 미리보기가 게이트 셋을 다 지나게 고쳤고
 * > (`previewPageJson`의 표), **그래도 서버만 아는 것 넷이 남는다** — 그것을 화면이
 * > 말한다(`SERVER_ONLY`). 단언을 줄이고 남는 것을 적는 것이 P7-1 이월 §2에 대한
 * > 정직한 답이다.
 *
 * **파일 읽기가 실패하면 대기 글자를 비운다.** P4c-3이 닫은 사고를 되풀이하지 않는다 —
 * 화면은 *"파일을 읽지 못했습니다"*라고 말하는데 앞서 읽힌 글자가 남아 있어, 그 상태로
 * 누르면 **고르지도 않은 앞 파일**이 들어간다(`theme-io-panel.tsx`의 실측).
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
  /** 카탈로그 이슈에만 있다. **파일의 id다** — 리매핑 전 문서로 보기 때문이다(D8). */
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
 * # 서버와 **같은 함수**로 게이트 셋을 지난다 (P7-3 리뷰 ③)
 *
 * **앞 판은 봉투만 봤고, 그래서 미리보기가 통과시킨 파일을 서버가 거절했다** — 리뷰가 셋을
 * 실측했다(문서 버전 999 · 카탈로그에 없는 타입 · `duplicate-id`). 그것이 P7-1 이월 §2가
 * 이름 붙인 부류다: *"화면은 괜찮다고 했는데 저장이 거부됐다."*
 *
 * | 게이트 | 서버 | 여기 | 왜 같을 수 있나 |
 * |---|---|---|---|
 * | 봉투 | `parsePageJson` | `readPageJson` | 같은 모듈의 두 입구 |
 * | 문서 버전 | `migrateDocument` | 같은 함수 | 순수하고 브라우저에서 돈다 |
 * | 카탈로그 | `validatePage` | 같은 함수 | 〃. 카탈로그도 같은 패키지가 싣는다(`catalog-setup`) |
 *
 * **`error`만 막는다.** 경고는 서버도 막지 않으므로 여기서 막으면 **화면이 서버보다
 * 엄격해진다**(P7-1 이월 §7) — 그쪽 손해가 더 크다: 할 수 있는 일을 못 하게 된다.
 *
 * **검증을 리매핑 전 문서로 하는 것도 서버와 같다**(D8). 사용자에게 남는 것은 파일뿐이라
 * 이슈의 `nodeId`가 **파일에서 찾을 수 있는 값**이어야 한다.
 *
 * # 서버만 아는 것 넷 — **미리보기가 다 걸러 준다고 말하지 않는다**
 *
 * | 무엇 | 왜 여기서 못 보나 |
 * |---|---|
 * | 대상 메뉴가 아직 있는가 | 트리가 낡았을 수 있다(고른 뒤 남이 지운다) |
 * | NUL(U+0000) | 그 규칙은 **Postgres를 아는 계층**의 것이다(`db/nul-guard.ts`) — 여기로 옮기면 브라우저에서도 도는 패키지가 DB 제약을 알게 된다 |
 * | 본문 크기 | 상한이 **서버 설정**이다(Fastify 기본 1MiB) |
 * | 권한 | 서버만 판정한다(§10) |
 *
 * **그리고 배포 편차가 있다** — 서버가 다른 판의 `@wirebound/schema`를 돌리면 위 셋도
 * 갈릴 수 있다. 그래서 화면은 *"보내 봐야 아는 것"*이 남아 있다고 **말한다.**
 *
 * ---
 *
 * **끊긴 코멘트를 여기서 센다**(D5). 세는 단위는 *"파일의 트리에 없는 노드를 가리키는
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

  // **게이트 둘을 여기서 짜지 않는다 — 서버와 같은 함수를 부른다**(P7-3 리뷰 ③).
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
      </div>

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
        // 새로 짜지 않는 것이 D5이고, 훅도 같은 값을 다시 본다(단축키가 버튼을 지나지 않는
        // 자리와 같은 겹).
        disabled={!commands.abilities.addPage || commands.busy || preview.kind !== 'ready'}
        title={commands.abilities.addPage ? '' : NO_MENU}
        onClick={runImport}
      >
        페이지 가져오기
      </button>

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
        {/* **파일의 자리를 보인다**(D8). 가져오기가 실패하면 사용자에게 남는 것이 파일뿐이라
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
      {/* **경고는 막지 않는다**(P7-1 이월 §7) — 서버도 막지 않으므로 여기서 막으면 화면만
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
      {/* **D4 — 쓰지 않는다고 미리 말한다.** 서버도 응답에서 같은 것을 말하지만, 누르기
          전에 아는 편이 낫다. */}
      {preview.file.page.layoutRef !== undefined && (
        <p>
          이 파일은 레이아웃 <code>{preview.file.page.layoutRef}</code>을 가리키지만, 오늘
          페이지가 레이아웃을 고르는 경로가 없어 <strong>쓰지 않습니다.</strong>
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
