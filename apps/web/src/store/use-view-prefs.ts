/**
 * **표시 옵션 — 내가 이 프로젝트의 편집 캔버스에서 끈 레이아웃 영역**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「표시 옵션 저장」 ·
 * `GET/PUT …/view-prefs`). 값은 열쇠 «<레이아웃>.<영역 id>» 의 목록이다. 캔버스가 읽고(편집 모드에만 적용 — 뷰 모드는 늘 다 켬), 머리의 «보기»
 * 메뉴가 바꾼다.
 *
 * | 때 | 화면 값 |
 * |---|---|
 * | 에디터를 열면 | 다 켬 — GET 이 오면 그 값. GET 이 실패하면 다 켠 채다 |
 * | 바꾸면 | **곧바로** 새 값(낙관 반영) — PUT 을 보낸다 |
 * | PUT 이 나가 있는 동안 또 바꾸면 | 화면은 곧바로 바뀌고, 보낼 값은 **마지막 것 하나**만 남긴다 — 앞 답이 온 뒤 그 하나를 보낸다 |
 * | 마지막으로 보낸 PUT 이 실패하면 | 서버가 마지막으로 받아 준 값으로 되돌리고 하단 바에 한 줄(`VIEW_PREFS_FAILED`) |
 * | 바꾼 뒤 GET 의 답이 오면 | 버린다 — 사람이 고른 값이 이긴다(그 값을 PUT 이 나르는 중이다) |
 *
 * **PUT 을 겹쳐 보내지 않는다.** 같은 사람의 겹친 PUT 은 서버에서 **커밋 차례로** 선다 — 앞 요청이 늦게 커밋되면 서버 끝 값이 화면 값과 갈린다
 * (리뷰 `docs/superpowers/plans/2026-11-25-rv-vp-report.md` L1). 한 번에 하나만 내보내고 그 사이의 값은 마지막 것으로 접으면 서버가 받는 차례가
 * 곧 사람이 바꾼 차례다(`apps/web/test/store/view-prefs.test.tsx` «겹치지 않는다»).
 *
 * 공급자 밖이면 늘 다 켬이고 `set` 은 아무것도 안 한다(트리 칸 · 캔버스만 세운 숙주 테스트).
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useEditorStoreInstance } from './use-editor-store'

/** 마지막으로 보낸 PUT 이 실패했을 때 하단 바의 한 줄. */
export const VIEW_PREFS_FAILED = '보기 설정을 저장하지 못했습니다'

export interface ViewPrefs {
  /** 끈 영역 열쇠(«<레이아웃>.<영역 id>») — 화면에 지금 적용할 값. */
  hidden: readonly string[]
  /** 끈 영역 목록을 통째로 바꾼다 — 화면에 곧바로 서고 서버로 보낸다(머리말의 표). */
  set: (next: readonly string[]) => void
}

const NONE: readonly string[] = []
const OUTSIDE: ViewPrefs = { hidden: NONE, set: () => {} }
const ViewPrefsContext = createContext<ViewPrefs>(OUTSIDE)

export function ViewPrefsProvider(props: { projectId: string; children: ReactNode }): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  const { projectId } = props
  const [hidden, setHidden] = useState<readonly string[]>(NONE)
  /** 서버가 마지막으로 받아 준(또는 읽어 준) 값 — 실패한 PUT 을 되돌릴 자리. */
  const saved = useRef<readonly string[]>(NONE)
  /** 아직 안 보낸 마지막 값. `null` 이면 보낼 것이 없다. */
  const pending = useRef<readonly string[] | null>(null)
  const inFlight = useRef(false)
  /** 사람이 한 번이라도 바꿨다 — 그 뒤 온 GET 의 답은 버린다. */
  const touched = useRef(false)
  /** 이 프로젝트의 공급자가 살아 있나 — 내려간 뒤(프로젝트를 옮김) 온 답은 버린다. */
  const alive = useRef<string | null>(null)

  useEffect(() => {
    alive.current = projectId
    touched.current = false
    pending.current = null
    // 앞 프로젝트에 나가 있던 PUT 의 답은 `alive` 가 버린다 — 새 프로젝트의 줄이 그것을 기다리지 않게 잠금도 푼다.
    inFlight.current = false
    saved.current = NONE
    setHidden(NONE)
    const controller = new AbortController()
    api.getViewPrefs(projectId, { cancel: controller.signal }).then(
      (read) => {
        if (alive.current !== projectId || touched.current) return
        saved.current = read
        setHidden(read)
      },
      // 읽기 실패는 다 켠 판으로 그린다(머리말의 표) — 말하지 않는다. 캔버스는 그대로 쓸 수 있다.
      () => {},
    )
    return () => {
      controller.abort()
      if (alive.current === projectId) alive.current = null
    }
  }, [api, projectId])

  const pump = useCallback((): void => {
    if (inFlight.current) return
    const next = pending.current
    if (next === null) return
    pending.current = null
    inFlight.current = true
    const sentFor = projectId
    api.putViewPrefs(projectId, next).then(
      (stored) => {
        if (alive.current !== sentFor) return
        inFlight.current = false
        saved.current = stored
        pump()
      },
      (caught: unknown) => {
        if (alive.current !== sentFor) return
        inFlight.current = false
        // 그 사이 또 바꿨으면 그 값을 보낸다 — 실패한 값은 이미 지난 값이다.
        if (pending.current !== null) {
          pump()
          return
        }
        setHidden(saved.current)
        const failure = toFailure(caught, VIEW_PREFS_FAILED)
        store.setEditFailure(failure.kind === 'signed-out' ? failure : { kind: 'message', message: VIEW_PREFS_FAILED })
      },
    )
  }, [api, projectId, store])

  const set = useCallback(
    (next: readonly string[]): void => {
      touched.current = true
      const value = [...next]
      setHidden(value)
      pending.current = value
      pump()
    },
    [pump],
  )

  const value = useMemo<ViewPrefs>(() => ({ hidden, set }), [hidden, set])
  return createElement(ViewPrefsContext.Provider, { value }, props.children)
}

export function useViewPrefs(): ViewPrefs {
  return useContext(ViewPrefsContext)
}

/** 그 레이아웃에서 끈 영역 id — 열쇠(«<레이아웃>.<영역 id>») 가운데 그 레이아웃 머리의 것만, 머리를 떼고. */
export function hiddenIn(keys: readonly string[], layout: string): string[] {
  const head = `${layout}.`
  return keys.filter((key) => key.startsWith(head)).map((key) => key.slice(head.length))
}
