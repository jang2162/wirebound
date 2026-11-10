/**
 * **에디터 셸이 든 공통코드 표**(정본 설계서 「도메인 모델」의 공통코드) — 캔버스 · 팝업 층이 렌더 옵션 `codes` 로, 속성 패널이 묶기 · 고르기에 읽는다.
 *
 * - **셸이 설 때 한 번 읽고**, `codes-changed` 프레임(남의 표 쓰기 · 복원)과 다시 붙은 연결에서 다시 읽는다(`realtime/use-realtime.ts`). 표에는
 *   번호가 없어 «이 프레임이 새것인가»를 못 가린다 — 늘 다시 읽고, **마지막에 시작한 조회의 답만 싣는다**(앞 조회가 늦게 와 새 표를 덮지 않게).
 * - 조회가 실패하면 표 없이 그린다 — 묶인 노드는 prop 의 대체 글(묶을 때의 이름)로 서고, 하단 바에 한 줄을 세운다. 끊김 표지는 안 단다 —
 *   표를 모르는 것과 참조가 끊긴 것은 다르다(`RenderOptions.codes` 가 없다).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { indexCodes, type CodeIndex, type CodeTable } from '@wirebound/schema'
import { useApi } from '../api/context'
import { useEditorStoreInstance } from '../store/use-editor-store'

export interface ProjectCodes {
  /** 읽은 표. 읽기 전 · 실패하면 `null`. */
  table: CodeTable | null
  /** 렌더 옵션에 싣는 풀린 표. 표가 없으면 `undefined` — 렌더러는 prop 의 글로 그린다. */
  index: CodeIndex | undefined
  /** 표를 다시 읽는다(프레임 · 다시 붙음 · 공통코드 화면에서 돌아옴). */
  reload: () => void
}

export const CODES_UNREAD = '공통코드 표를 읽지 못했습니다 — 묶인 노드는 묶을 때의 글로 보입니다'

const NO_CODES: ProjectCodes = { table: null, index: undefined, reload: () => {} }

const ProjectCodesContext = createContext<ProjectCodes>(NO_CODES)

export function ProjectCodesProvider(props: { projectId: string; children: ReactNode }): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  const [table, setTable] = useState<CodeTable | null>(null)
  const turn = useRef(0)
  const alive = useRef(true)

  const reload = useCallback(() => {
    const mine = ++turn.current
    void api.listCodes(props.projectId).then(
      (groups) => {
        if (!alive.current || turn.current !== mine) return
        setTable(groups)
      },
      () => {
        if (!alive.current || turn.current !== mine) return
        setTable(null)
        store.setInfoNotice(CODES_UNREAD, { survivesLeave: true })
      },
    )
  }, [api, props.projectId, store])

  useEffect(() => {
    alive.current = true
    reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  const value = useMemo<ProjectCodes>(() => ({ table, index: table === null ? undefined : indexCodes(table), reload }), [table, reload])
  return <ProjectCodesContext.Provider value={value}>{props.children}</ProjectCodesContext.Provider>
}

/** 셸의 공통코드 표. 공급자 밖(셸을 안 세운 화면 테스트 · 뷰어)이면 표 없음 — 렌더러는 prop 의 글로 그린다. */
export function useProjectCodes(): ProjectCodes {
  return useContext(ProjectCodesContext)
}
