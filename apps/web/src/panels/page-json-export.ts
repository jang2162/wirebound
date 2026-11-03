/**
 * **페이지 JSON 내보내기** — 페이지 줄 `…`의 «JSON 내보내기»가 부른다(`panels/tree-row-actions.tsx` · 설계서 「페이지 JSON」). **열린
 * 페이지가 아니라 그 줄의 페이지**를 내보낸다 — 줄 행동은 그 줄에 대한 것이다.
 *
 * **곧바로 받지 않고 모달을 연다**(`./page-json-export-dialog.tsx`) — 읽는 동안은 «불러오는 중», 다 읽으면 지금 파일과 같은 글(이름 · 내용)을 읽기 전용
 * 상자에 보이고 «클립보드에 복사» · «파일로 받기» 를 둔다. 이 훅은 모달의 상태(`view`)를 들고, 그리는 것은 메뉴 트리다(가져오기 상자와 같은 자리 —
 * `panels/menu-tree.tsx` 의 `outside`).
 *
 * **서버에서 둘을 같은 순간에 읽는다**(`edit/page-export.ts`의 머리말) — 스토어의 문서와 서버의 코멘트를 섞으면 파일이 만들어지는
 * 순간 끊긴 참조를 담을 수 있다. 그래서 열린 페이지라도 스토어를 읽지 않고 서버에서 받는다.
 *
 * **실패는 모달 안의 문장이다.** 모달이 열려 있는 동안 나는 실패라 말할 자리가 그 상자다 — 하단 바로 보내면 뒤 화면이 막힌(모달) 채 상자에는 «불러오는
 * 중» 이 남는다. 세션이 끊긴 실패는 화면을 바꾼다(`api/failure.tsx` 의 `SignedOut`).
 *
 * **열린 페이지는 보낸 편집의 답을 받은 뒤에 읽는다**(`settle`) — 칸에 친 채 줄 `…`를 누르면 그 클릭이 blur 로 낸 편집(WS)과 이 읽기(REST)가 다른
 * 연결로 겨뤄, 읽기가 앞서면 파일에 방금 친 글이 없다(Chrome `build-test/editor-export-open-edits.test.ts`). 기다림은 셸이 한도를 쥔다.
 *
 * **읽는 동안은 항목이 꺼진다**(`exporting`) — 한 번에 하나다. 읽는 중에 모달을 닫으면 그 읽기의 답은 버린다(세대 `generation`) — 닫은 뒤 다시 연
 * 내보내기가 앞 답을 받지 않는다.
 */
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import { pageExport } from '../edit/page-export'

/** 내보내기가 이유 없이 실패했을 때. */
const EXPORT_FAILED = '페이지를 내보내지 못했습니다'

/** 모달이 보이는 것 — 그 줄의 페이지 id · 이름과 읽기의 판. */
export type PageJsonExportView = { pageId: string; title: string } & (
  | { status: 'loading' }
  | { status: 'ready'; fileName: string; text: string }
  | { status: 'failed'; failure: Failure }
)

export interface PageJsonExport {
  /** 읽는 중인 페이지 id. 아니면 `null` — 그동안 «JSON 내보내기» 항목이 꺼진다. */
  exporting: string | null
  /** 열린 모달. 닫혀 있으면 `null`. */
  view: PageJsonExportView | null
  run: (pageId: string, title: string) => void
  close: () => void
}

export function usePageJsonExport(projectId: string, settle?: (pageId: string) => Promise<void>): PageJsonExport {
  const api = useApi()
  const [view, setView] = useState<PageJsonExportView | null>(null)
  /** 같은 tick 의 두 번째 호출을 막는 잠금 — 상태로만 두면 같은 렌더의 클로저가 거짓을 본다(`use-tree-commands.tsx`의 `inFlight`). */
  const inFlight = useRef(false)
  /** 모달을 열 때마다 오르는 수 — 닫힌 뒤 온 답을 버린다(머리말). */
  const generation = useRef(0)
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  async function run(pageId: string, title: string): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    const mine = ++generation.current
    const current = (): boolean => !unmounted.current && generation.current === mine
    setView({ pageId, title, status: 'loading' })
    try {
      await settle?.(pageId)
      if (!current()) return
      const [page, comments] = await Promise.all([api.getPage(projectId, pageId), api.listComments(projectId, pageId)])
      if (!current()) return
      const exported = pageExport(page, comments)
      setView({ pageId, title, status: 'ready', fileName: exported.fileName, text: exported.text })
    } catch (caught) {
      if (current()) setView({ pageId, title, status: 'failed', failure: toFailure(caught, EXPORT_FAILED) })
    } finally {
      if (generation.current === mine) inFlight.current = false
    }
  }

  function close(): void {
    // 읽는 중에 닫으면 그 읽기를 버리고 다음 내보내기를 받는다 — 앞 읽기의 `finally` 는 세대가 달라 잠금을 안 건드린다.
    generation.current += 1
    inFlight.current = false
    setView(null)
  }

  return {
    exporting: view?.status === 'loading' ? view.pageId : null,
    view,
    run: (pageId, title) => void run(pageId, title),
    close,
  }
}
