/**
 * **페이지 JSON 내보내기 모달**(설계서 「페이지 JSON」) — 페이지 줄 `…` 의 «JSON 내보내기» 가 연다. 상태는 `./page-json-export.ts` 의 훅이 들고 메뉴 트리가
 * 단축키 상자의 **형제**로 그린다(`panels/page-import-dialog.tsx` 머리말 «키가 트리 단축키로 새지 않는다» 와 같은 까닭).
 *
 * | 판 | 상자 안 |
 * |---|---|
 * | 읽는 중 | «불러오는 중…» — 복사 · 받기가 없다 |
 * | 다 읽음 | 읽기 전용 글 상자(받을 파일과 같은 글) · 파일 이름 · «클립보드에 복사» · «파일로 받기» |
 * | 실패 | 실패 문장(서버 문장 · 없으면 «페이지를 내보내지 못했습니다»). 세션이 끊긴 실패는 로그인 화면으로 간다 |
 *
 * 닫기는 상자 머리의 «닫기» · Escape 다(`shell/shell-dialog.tsx`) — 바닥에 같은 이름의 단추를 또 두지 않는다.
 *
 * ## 복사가 막히면 글 상자를 골라 둔다
 *
 * `navigator.clipboard.writeText` 는 보안 문맥(https · localhost)에서만 있고 권한 · 포커스에 따라 거절된다. 실패하면 «복사하지 못했습니다 — 글 상자의
 * 글을 골라 직접 복사하세요» 를 말하고 **글 상자 전체를 골라 포커스를 둔다** — 곧바로 Cmd+C 로 이어 간다. 성공 · 실패 문장은 다음 누름이 고쳐 쓴다.
 */
import { useRef, useState, type ReactElement } from 'react'
import { SignedOut } from '../api/failure'
import { downloadTextFile } from '../files/file-io'
import { ShellDialog } from '../shell/shell-dialog'
import type { PageJsonExport } from './page-json-export'

export const EXPORT_COPIED = '클립보드에 복사했습니다'
export const EXPORT_COPY_FAILED = '복사하지 못했습니다 — 글 상자의 글을 골라 직접 복사하세요'

/** 상자의 제목 — 그 줄의 페이지를 말한다. */
export function exportDialogTitle(title: string): string {
  return `JSON 내보내기 — ${title}`
}

export function PageJsonExportDialog(props: { exporter: PageJsonExport; focusFallback?: () => HTMLElement | null }): ReactElement | null {
  const { view, close } = props.exporter
  if (view === null) return null
  return (
    <ShellDialog open title={exportDialogTitle(view.title)} onClose={close} focusFallback={props.focusFallback}>
      {/* 열 때마다 새 몸체 — 복사 문장이 앞 내보내기의 것으로 남지 않는다. */}
      <ExportBody key={`${view.pageId}:${view.status}`} view={view} />
    </ShellDialog>
  )
}

function ExportBody(props: { view: NonNullable<PageJsonExport['view']> }): ReactElement {
  const { view } = props
  const box = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  if (view.status === 'loading') {
    return (
      <div className="wb-shell-pagejson-body">
        <p className="wb-shell-pagejson-empty" role="status">
          불러오는 중…
        </p>
      </div>
    )
  }
  if (view.status === 'failed') {
    if (view.failure.kind === 'signed-out') return <SignedOut />
    return (
      <div className="wb-shell-pagejson-body">
        <p className="wb-shell-pagejson-refused" role="alert">
          {view.failure.message}
        </p>
      </div>
    )
  }

  const { fileName, text } = view
  const copy = async (): Promise<void> => {
    try {
      // `clipboard` 가 없는 문맥(보안 문맥 아님)에서는 여기서 던진다 — 거절과 같은 갈래다.
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      setCopied('failed')
      box.current?.focus()
      box.current?.select()
    }
  }

  return (
    <div className="wb-shell-pagejson-body">
      <label className="wb-shell-pagejson-field">
        <span>
          파일 <code>{fileName}</code>
        </span>
        <textarea ref={box} className="wb-shell-pagejson-text" aria-label="내보낸 JSON" rows={16} readOnly value={text} />
      </label>
      {copied === 'ok' && (
        <p className="wb-shell-pagejson-copied" role="status">
          {EXPORT_COPIED}
        </p>
      )}
      {copied === 'failed' && (
        <p className="wb-shell-pagejson-refused" role="alert">
          {EXPORT_COPY_FAILED}
        </p>
      )}
      <div className="wb-shell-pagejson-foot">
        <button type="button" className="wb-shell-pagejson-cancel" onClick={() => void copy()}>
          클립보드에 복사
        </button>
        <button type="button" className="wb-shell-pagejson-submit" onClick={() => downloadTextFile(fileName, text)}>
          파일로 받기
        </button>
      </div>
    </div>
  )
}
