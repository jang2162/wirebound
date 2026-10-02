/**
 * **페이지 JSON 내보내기** — 페이지 줄 `…`의 «JSON 내보내기»가 부른다(`panels/tree-row-actions.tsx` · 설계서 「페이지 JSON」). **열린
 * 페이지가 아니라 그 줄의 페이지**를 내보낸다 — 줄 행동은 그 줄에 대한 것이다.
 *
 * **서버에서 둘을 같은 순간에 읽는다**(`edit/page-export.ts`의 머리말) — 스토어의 문서와 서버의 코멘트를 섞으면 파일이 만들어지는
 * 순간 끊긴 참조를 담을 수 있다. 그래서 열린 페이지라도 스토어를 읽지 않고 서버에서 받는다.
 *
 * **실패는 하단 바의 통지다**(`panels/page-json-notices.tsx` — 셸이 상태를 들고 여기서는 `showFailure`로 채운다). 줄 메뉴는 고르면
 * 닫히므로 그 자리에 말할 곳이 없다. 다음 내보내기를 시작하면 앞 실패를 걷는다(걷히는 때의 표는 그 파일 머리말).
 *
 * **한 번에 하나다**(`exporting`). 두 번 눌러 같은 파일을 두 번 받을 까닭이 없다 — 내보내는 동안 항목이 꺼진다.
 */
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import { pageExport } from '../edit/page-export'
import { downloadTextFile } from '../files/file-io'

/** 내보내기가 이유 없이 실패했을 때. */
const EXPORT_FAILED = '페이지를 내보내지 못했습니다'

export interface PageJsonExport {
  /** 내보내는 중인 페이지 id. 아니면 `null`. */
  exporting: string | null
  run: (pageId: string) => void
}

export function usePageJsonExport(projectId: string, showFailure: (failure: Failure | null) => void): PageJsonExport {
  const api = useApi()
  const [exporting, setExporting] = useState<string | null>(null)
  /** 같은 tick 의 두 번째 호출을 막는 잠금 — `busy` 를 state 로만 두면 같은 렌더의 클로저가 거짓을 본다(`use-tree-commands.tsx`의 `inFlight`). */
  const inFlight = useRef(false)
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
    }
  }, [])

  async function run(pageId: string): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setExporting(pageId)
    showFailure(null)
    try {
      const [page, comments] = await Promise.all([api.getPage(projectId, pageId), api.listComments(projectId, pageId)])
      if (unmounted.current) return
      const exported = pageExport(page, comments)
      downloadTextFile(exported.fileName, exported.text)
    } catch (caught) {
      if (!unmounted.current) showFailure(toFailure(caught, EXPORT_FAILED))
    } finally {
      inFlight.current = false
      if (!unmounted.current) setExporting(null)
    }
  }

  return { exporting, run: (pageId) => void run(pageId) }
}
