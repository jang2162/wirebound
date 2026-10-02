/**
 * **페이지 가져오기 대화 상자**(설계서 「페이지 JSON」) — 메뉴 줄 `+`의 «JSON 에서 가져오기…»가 연다. 파일 한 벌로 그 메뉴 밑에 새 페이지를
 * 만든다(절대 덮지 않는다).
 *
 * ---
 *
 * # 누가 여는가 — 트리가 `ShellDialog`를 그린다
 *
 * 상자는 스냅샷 · 프로젝트 내보내기와 같은 모달(`shell/shell-dialog.tsx`)이지만 셸의 `dialog` 상태(`routes/editor.tsx`)에 싣지 않는다.
 * 보내기는 트리 명령 훅의 `importJson`이고(잠금 · 다시 받기 · 이동이 그 훅에 있다 — `useTreeCommands`), **그 훅을 부르는 자리는 하나여야
 * 한다**(훅의 머리말 — 둘이면 `busy` 잠금이 각자 것이 된다). 그래서 상자의 열림 · 대상도 그 훅이 들고(`importing`), 메뉴 트리가 그린다.
 * 모달이라 셸의 상자와 함께 서지 않는다 — 한쪽이 떠 있는 동안 뒤 화면이 `inert`라 다른 쪽을 여는 단추에 닿지 않는다.
 *
 * # 키가 트리 단축키로 새지 않는다 — 상자는 단축키 상자 **밖**에 선다
 *
 * 메뉴 트리의 키 핸들러(`panels/menu-tree.tsx`의 `handleKeyDown`)는 수식 키 없는 `Delete` · `Backspace`를 **삭제 확인**으로 받고, 모달 안의
 * 키도 React 트리를 따라 거기까지 버블된다(`shell/shell-dialog.tsx` 머리말 «상자 안의 키는 React 트리를 따라 버블된다»). 입력 칸이면
 * `isTypingSurface`가 거르지만 상자의 단추(«가져오기» · «JSON 직접 붙여 넣기»)는 입력 칸이 아니다. 그래서 메뉴 트리가 상자를 단축키 상자의
 * **형제**로 그린다 — 거르는 장치가 아니라 자리가 막는다(`test/panels/page-json.test.tsx` «상자의 키가 트리 단축키로 새지 않는다» ·
 * `build-test/page-json-dialog.test.ts`).
 *
 * # 실패가 서는 자리
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 파일을 못 읽음 · 봉투 · 게이트(`previewPageJson`) | 미리보기 카드(빨강) — 가져오기 단추가 꺼진다 |
 * | 서버 거절(남이 메뉴를 지움 · NUL · 크기 · 권한) | 상자 바닥(`commands.importFailure`) — **상자를 닫지 않고** 고른 파일 · 글자 · 제목을 그대로 둔다 |
 * | 보낸 뒤 상자를 닫았으면 | 트리의 실패 줄(`commands.failure`) — 한 실패가 서는 자리는 하나다(`TreeCommands.importFailure`) |
 * | 성공 | 상자를 닫고 새 페이지로 옮긴다. 결과는 하단 바의 통지(`panels/page-json-notices.tsx`) |
 *
 * **파일 읽기가 실패하면 대기 글자를 비운다.** 안 비우면 화면은 *"파일을 읽지 못했습니다"*라고 말하는데 앞서 읽힌 글자가 남아 있어,
 * 그 상태로 누르면 **고르지도 않은 앞 파일**이 들어간다. 나중에 고른 파일만 싣는다 — 앞 파일의 읽기가 늦게 끝나도 버린다(`readSeq`).
 *
 * # 상자의 상태는 몸체의 것이다
 *
 * 고른 파일 · 붙여 넣은 글자 · 제목 · 펼침은 이 몸체의 `useState`다 — 닫으면 함께 사라진다(`ShellDialog`의 «열려 있는 동안만 DOM 에
 * 둔다»). 바깥 누름으로는 닫히지 않으므로(같은 머리말) 잘못 누른 한 번에 잃지 않는다.
 *
 * # 파일 칸 — OS 파일 끌어 놓기
 *
 * 브라우저의 HTML5 끌어 놓기다(`drop`의 `dataTransfer.files`) — 앱의 포인터 끌기 장치(`drag/use-pointer-drag.ts`)와 무관하다. **몸체 전체가
 * 받는다** — 칸을 조금 비켜 놓은 파일을 브라우저가 열면 에디터를 떠난다. 파일을 끌고 들어오면 칸이 강조된다. 키보드는 칸 안의 파일 입력
 * (`<label>` 이 감싼 `<input type="file">` — 눈에는 감추되 포커스는 받는다)이 받는다.
 */
import { CircleCheck, CircleX, FileUp, TriangleAlert } from 'lucide-react'
import { useRef, useState, type DragEvent, type FormEvent, type ReactElement } from 'react'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import { readTextFile } from '../files/file-io'
import { ShellDialog } from '../shell/shell-dialog'
import type { ImportTarget, TreeCommands } from '../tree/use-tree-commands'
import { previewPageJson, SERVER_ONLY, type Preview, type PreviewIssue } from './page-json-preview'

/** 아직 아무 글자도 없을 때. */
const NO_TEXT = '파일을 고르거나 JSON을 붙여 넣으면 무엇이 들어갈지 여기 보입니다.'
/** 파일 자체를 못 읽었을 때(내용이 JSON이 아닌 것과 **다른 말이다**). */
const FILE_FAILED = '파일을 읽지 못했습니다'

/** 상자의 제목 — 대상 메뉴를 말한다. «메뉴로»라 메뉴 이름의 받침과 무관하게 조사가 맞는다. */
export function importDialogTitle(target: ImportTarget): string {
  return `페이지 가져오기 — ${target.title} 메뉴로`
}

export function PageImportDialog(props: { commands: TreeCommands }): ReactElement | null {
  const { commands } = props
  const target = commands.importing
  if (target === null) return null
  return (
    <ShellDialog open title={importDialogTitle(target)} onClose={commands.closeImport}>
      <PageImportBody commands={commands} />
    </ShellDialog>
  )
}

function PageImportBody(props: { commands: TreeCommands }): ReactElement {
  const { commands } = props
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  /** 파일 자체를 못 읽은 실패 — 미리보기의 넷(봉투)과 다른 갈래다(`page-json-preview.ts`의 표 첫 줄). */
  const [fileFailure, setFileFailure] = useState<Failure | null>(null)
  /** «JSON 직접 붙여 넣기»가 펴졌는가 — 기본은 접힘(파일이 주된 길이다). */
  const [pasteOpen, setPasteOpen] = useState(false)
  /** 경고 목록이 펴졌는가 — 기본은 접힘(막지 않는 것이라 수만 먼저 말한다). */
  const [warningsOpen, setWarningsOpen] = useState(false)
  /** 파일을 끌고 몸체 위에 있는가 — 칸을 강조한다. 안쪽 요소를 넘나들 때마다 enter · leave 가 나므로 수로 센다. */
  const [dragDepth, setDragDepth] = useState(0)
  /** 마지막으로 시작한 파일 읽기 — 그보다 앞의 읽기가 늦게 끝나면 버린다(머리말). */
  const readSeq = useRef(0)

  const preview = fileFailure !== null ? null : previewPageJson(text)

  function pickFile(file: File | undefined): void {
    if (file === undefined) return
    readSeq.current += 1
    const seq = readSeq.current
    setFileName(file.name)
    void readTextFile(file).then(
      (read) => {
        if (seq !== readSeq.current) return
        setText(read)
        setFileFailure(null)
      },
      (error: unknown) => {
        if (seq !== readSeq.current) return
        // **대기 글자를 비운다** — 안 비우면 앞서 읽힌 파일이 들어간다(머리말).
        setText('')
        setFileFailure(toFailure(error, FILE_FAILED))
      },
    )
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (preview === null || preview.kind !== 'ready' || commands.busy) return
    // **글자를 비우지 않는다** — 서버가 거절하면 상자가 그대로 남아 같은 파일로 고쳐 다시 보낸다. 성공하면 상자째 닫힌다.
    commands.importJson(preview.file, title.trim())
  }

  /** 끌고 들어온 것이 파일인가 — 글자 · 링크를 끌 때는 칸을 강조하지 않고 기본 동작(입력 칸에 놓기)을 막지 않는다. */
  function carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes('Files')
  }

  const sending = commands.busy
  const ready = preview !== null && preview.kind === 'ready'

  return (
    <form
      className="wb-shell-pagejson-body"
      onSubmit={submit}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        setDragDepth((depth) => depth + 1)
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return
        // 막지 않으면 브라우저가 `drop`을 안 내고 파일을 연다(에디터를 떠난다).
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return
        setDragDepth((depth) => Math.max(0, depth - 1))
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        setDragDepth(0)
        pickFile(event.dataTransfer.files[0])
      }}
    >
      <label className={dragDepth > 0 ? 'wb-shell-pagejson-drop wb-shell-pagejson-drop-over' : 'wb-shell-pagejson-drop'}>
        <FileUp className="wb-shell-pagejson-drop-icon" size={24} strokeWidth={1.75} aria-hidden="true" />
        <span className="wb-shell-pagejson-drop-lead">JSON 파일을 여기 끌어 놓거나 눌러서 고르세요</span>
        <span className="wb-shell-pagejson-drop-hint">
          {fileName === null ? '.wirebound-page.json — 페이지 «JSON 내보내기»로 받은 파일' : `고른 파일: ${fileName}`}
        </span>
        <input
          className="wb-shell-pagejson-file"
          type="file"
          accept="application/json,.json"
          aria-label="페이지 파일"
          onChange={(event) => {
            pickFile(event.target.files?.[0])
            // 같은 파일을 고쳐 다시 고르면 `change`가 다시 나야 한다.
            event.target.value = ''
          }}
        />
      </label>

      <div className="wb-shell-pagejson-paste">
        <button
          type="button"
          className="wb-shell-pagejson-disclosure"
          aria-expanded={pasteOpen}
          onClick={() => setPasteOpen((was) => !was)}
        >
          {/* 펼침 표시는 글자가 아니다 — 이름은 «JSON 직접 붙여 넣기»이고 상태는 `aria-expanded`가 말한다. */}
          <span aria-hidden="true">{pasteOpen ? '▾' : '▸'}</span>
          JSON 직접 붙여 넣기
        </button>
        {pasteOpen && (
          <textarea
            className="wb-shell-pagejson-text"
            aria-label="페이지 JSON"
            value={text}
            rows={6}
            spellCheck={false}
            onChange={(event) => {
              setText(event.target.value)
              setFileFailure(null)
              setFileName(null)
            }}
          />
        )}
      </div>

      {fileFailure !== null ? (
        <FailedCard message={fileFailure.kind === 'message' ? fileFailure.message : FILE_FAILED} issues={[]} />
      ) : (
        <PreviewCard
          preview={preview ?? { kind: 'none' }}
          warningsOpen={warningsOpen}
          onToggleWarnings={() => setWarningsOpen((was) => !was)}
        />
      )}

      <label className="wb-shell-pagejson-field">
        가져올 페이지 제목
        <input
          className="wb-shell-pagejson-input"
          value={title}
          // **파일의 제목을 자리표로 보인다** — 비우면 서버가 그 제목을 쓴다(`importJson`이 키를 안 싣는다).
          placeholder={ready && preview.kind === 'ready' ? preview.file.page.title : '비우면 파일의 제목을 씁니다'}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      {/* **서버 거절은 상자 안에 선다**(머리말의 표) — 상자를 닫지 않고 고른 것을 그대로 둔다. */}
      {commands.importFailure !== null &&
        (commands.importFailure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <p className="wb-shell-pagejson-refused" role="alert">
            가져오지 못했습니다 — {commands.importFailure.message}
          </p>
        ))}

      <div className="wb-shell-pagejson-foot">
        <button type="button" className="wb-shell-pagejson-cancel" onClick={commands.closeImport}>
          취소
        </button>
        <button type="submit" className="wb-shell-pagejson-submit" disabled={!ready || sending} aria-busy={sending}>
          {sending ? '가져오는 중…' : '가져오기'}
        </button>
      </div>
    </form>
  )
}

/** 대기 글자에 대해 아는 것. **셋을 갈라 그린다**(`page-json-preview.ts`의 표). */
function PreviewCard(props: { preview: Preview; warningsOpen: boolean; onToggleWarnings: () => void }): ReactElement {
  const { preview } = props

  if (preview.kind === 'none') {
    return <p className="wb-shell-pagejson-empty">{NO_TEXT}</p>
  }

  if (preview.kind === 'failed') {
    return <FailedCard message={preview.message} issues={preview.issues} />
  }

  return (
    <div className="wb-shell-pagejson-card wb-shell-pagejson-card-ready">
      {/* **`role="status"`이지 `alert`이 아니다** — 읽은 것을 말하는 자리이지 실패 통지가 아니다(`preset-picker.tsx`가 확인 문장에 대해
          같은 판단을 적었다). */}
      <p className="wb-shell-pagejson-card-head" role="status">
        <CircleCheck className="wb-shell-pagejson-icon-ok" size={16} strokeWidth={2} aria-hidden="true" />
        <span>
          <strong>{preview.file.page.title}</strong> — 노드 {preview.nodes}개, 코멘트 {preview.comments}개
        </span>
      </p>
      {/* **경고는 막지 않는다** — 서버도 막지 않으므로 여기서 막으면 화면만 엄격해진다. 대신 보인다: 들어간 뒤에야 알면 고칠 자리를
          다시 찾아야 한다. 수만 먼저 말하고 목록은 접어 둔다(`<details>`가 아닌 까닭은 `menu-tree.tsx` 머리말 «이 저장소의 "접힘"은 …»과
          같다 — 닫힌 `<details>`의 자식을 jsdom 이 숨기지 않아 접힘을 재는 케이스를 못 쓴다). */}
      {preview.warnings.length > 0 && (
        <div className="wb-shell-pagejson-card-line">
          <button
            type="button"
            className="wb-shell-pagejson-disclosure"
            aria-expanded={props.warningsOpen}
            onClick={props.onToggleWarnings}
          >
            <TriangleAlert className="wb-shell-pagejson-icon-warn" size={14} strokeWidth={2} aria-hidden="true" />
            경고 {preview.warnings.length}개(저장은 됩니다)
          </button>
          {props.warningsOpen && <IssueList issues={preview.warnings} />}
        </div>
      )}
      {preview.dangling > 0 && (
        <p className="wb-shell-pagejson-card-line">
          코멘트 {preview.dangling}개는 이 파일의 트리에 없는 노드를 가리킵니다 — 들어가되 <strong>&ldquo;사라진 노드&rdquo;</strong>로
          남습니다.
        </p>
      )}
      {/* **쓰지 않는다고 미리 말한다.** 서버도 응답에서 같은 것을 말하지만, 누르기 전에 아는 편이 낫다. */}
      {preview.file.page.layoutRef !== undefined && (
        <p className="wb-shell-pagejson-card-line">
          이 파일은 레이아웃 <code>{preview.file.page.layoutRef}</code>을 가리키지만, 페이지는 프로젝트의 기본 레이아웃을 쓰고 따로 고를 수
          없어 <strong>쓰지 않습니다.</strong>
        </p>
      )}
      {/* **미리보기가 다 걸러 준다고 말하지 않는다.** `previewPageJson`의 표가 무엇을 못 보는지 적어 뒀고, 이 줄이 그것을 사용자에게
          옮긴다 — 없으면 화면이 다시 *"괜찮다"*고 단언하게 된다. */}
      <p className="wb-shell-pagejson-footnote">{SERVER_ONLY}</p>
    </div>
  )
}

/**
 * 막힌 판 — 이유와 **파일의 자리**. 가져오기가 실패하면 사용자에게 남는 것이 파일뿐이라 *"규격이 아닙니다"* 하나로는 어디를 고칠지 알 수
 * 없다.
 */
function FailedCard(props: { message: string; issues: readonly PreviewIssue[] }): ReactElement {
  return (
    <div className="wb-shell-pagejson-card wb-shell-pagejson-card-failed">
      <p className="wb-shell-pagejson-card-head" role="alert">
        <CircleX className="wb-shell-pagejson-icon-fail" size={16} strokeWidth={2} aria-hidden="true" />
        <span>{props.message}</span>
      </p>
      {props.issues.length > 0 && <IssueList issues={props.issues} />}
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
