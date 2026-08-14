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
 * 뒤 넷은 `@wirebound/schema`의 `readPageJson`이 가르고 **서버도 같은 함수를 쓴다** —
 * 화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일이 없다(P7-1 이월 §2의 반대편).
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
  readPageJson,
  type PageJson,
  type PageJsonIssue,
} from '@wirebound/schema'
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

/** 대기 글자를 읽은 결과. **`readPageJson`의 갈래를 그대로 쓴다** — 여기서 다시 가르지 않는다. */
type Preview =
  | { kind: 'none' }
  | { kind: 'failed'; message: string; issues: readonly PageJsonIssue[] }
  | { kind: 'ready'; file: PageJson; nodes: number; comments: number; dangling: number }

/**
 * 대기 글자를 미리보기로 옮긴다. **순수하고 던지지 않는다.**
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

  const ids = new Set(collectNodeIds(result.file.schema.root))
  return {
    kind: 'ready',
    file: result.file,
    nodes: ids.size,
    comments: result.file.comments.length,
    dangling: result.file.comments.filter((comment) => !ids.has(comment.nodeId)).length,
  }
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
        {preview.issues.length > 0 && (
          <ul className="wb-shell-pagejson-issues">
            {preview.issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <code>{issue.path === '' ? '(파일 전체)' : issue.path}</code> {issue.message}
              </li>
            ))}
          </ul>
        )}
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
    </div>
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
