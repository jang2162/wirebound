/**
 * 설계서를 여는 에디터 셸. 좌측에 메뉴·구조 트리, 가운데 캔버스, 우측 속성 패널이다
 * (설계 §9).
 *
 * **이 단계는 틀과 상단 도구까지다.** 세 패널은 빈 상자로 두고, 좌측 트리는 태스크 8이,
 * 캔버스 내용과 속성 패널은 태스크 9가 채운다. 그래서 셸이 부르는 API는 `getProject`
 * 하나뿐이다 — 트리·페이지 조회는 그것을 그리는 태스크가 함께 가져온다.
 *
 * 편집 상태(모드·뷰포트 폭·줌·선택)는 `EditorStore`가 갖는다. 셸이 그것을 `useState`로
 * 들고 내려보내지 않는 이유는 P2b-2 때문이다 — 낙관적 적용·롤백·undo가 붙으면 그 상태는
 * 화면 없이 단위 테스트할 수 있어야 하고, 컴포넌트 안에 있으면 그럴 수 없다.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import type { ProjectDetail } from '../api/types'
import { EditorStore, VIEWPORT_PRESETS, type ViewportWidth } from '../store/editor-store'
import {
  EditorStoreProvider,
  useEditorStore,
  useEditorStoreInstance,
} from '../store/use-editor-store'

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '프로젝트를 불러오지 못했습니다'
/** 조회 실패 화면의 제목. **프로젝트 이름과 겹치면 안 된다** — 아래 주석 참고. */
const FAILURE_TITLE = '설계서를 열지 못했습니다'
/** 아직 페이지를 고르지 않은 캔버스의 안내. */
const NO_PAGE_NOTICE = '왼쪽 트리에서 페이지를 고르세요'

/** 줌 한 칸. 한계(0.25~2)는 스토어가 클램프하므로 여기서 다시 알 필요가 없다. */
const ZOOM_STEP = 0.25

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `project === null`로 실패를 판정하면
 * 응답이 오기 전과 실패가 같은 값이 되어, 로딩 중에 오류 화면이 떴다 사라진다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectDetail }
  | { status: 'failed'; message: string }

/**
 * 라우트가 잡는 컴포넌트. `/projects/:projectId`와 `/projects/:projectId/pages/:pageId`가
 * 같은 이것을 그린다 — 페이지를 연 것은 셸 안의 캔버스가 달라지는 일이지 다른 화면이 아니다.
 */
export function EditorShellRoute(): ReactElement {
  const params = useParams()
  const projectId = params.projectId ?? ''
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  /**
   * 스토어는 셸이 사는 동안 하나다. `useMemo`가 아니라 ref인 것은 `useMemo`가 캐시일 뿐
   * 동일성 보장이 아니기 때문이다 — React가 값을 버리면 새 스토어가 생기고, 그 순간 편집
   * 상태가 조용히 초기화된다.
   */
  const storeRef = useRef<EditorStore | null>(null)
  if (storeRef.current === null) storeRef.current = new EditorStore()
  const store = storeRef.current

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(`require-auth`와 같은 이유).
    let alive = true

    // 프로젝트가 바뀌면 앞 프로젝트의 문서·선택·줌이 남지 않게 지운다. 노드 id는 문서
    // 안에서만 뜻이 있으므로, 남으면 선택 표시가 존재하지 않는 노드를 가리킨다.
    store.reset()
    // 앞 프로젝트의 이름이 새 주소에서 잠깐 보이는 것도 막는다. 라우터는 두 프로젝트
    // 주소 사이에서 같은 컴포넌트를 다시 쓰므로 상태가 그대로 남는다.
    setState({ status: 'loading' })

    // `.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
    // 때문이다. 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
    async function load(): Promise<void> {
      try {
        const project = await api.getProject(projectId)
        if (alive) setState({ status: 'ready', project })
      } catch (caught) {
        if (!alive) return
        // 서버가 준 문장을 그대로 보여준다. 화면이 문안을 다시 쓰면 서버가 이유를 바꿔도
        // 사용자는 옛 이유를 듣는다.
        setState({
          status: 'failed',
          message: caught instanceof ApiError ? caught.message : UNKNOWN_FAILURE,
        })
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [api, projectId, store])

  if (state.status === 'loading') {
    return (
      <main className="wb-shell-notice">
        <p role="status">불러오는 중…</p>
      </main>
    )
  }

  if (state.status === 'failed') {
    /**
     * **셸 대신** 오류다. 실패했는데도 셸의 랜드마크가 남아 있으면, 셸을 보는 테스트가
     * 오류 화면 위에서 통과한다 — 이 브랜치에서 실제로 난 사고다. 제목도 프로젝트
     * 이름과 겹치지 않아야 같은 이유로 안전하다.
     */
    return (
      <main className="wb-shell-notice">
        <h1>{FAILURE_TITLE}</h1>
        <p role="alert">{state.message}</p>
      </main>
    )
  }

  return (
    <EditorStoreProvider store={store}>
      <EditorShell project={state.project} pageId={params.pageId} />
    </EditorStoreProvider>
  )
}

/** 세 패널과 상단 도구. 스토어는 컨텍스트에서 꺼낸다. */
function EditorShell(props: { project: ProjectDetail; pageId: string | undefined }): ReactElement {
  const store = useEditorStoreInstance()
  const mode = useEditorStore(store, (s) => s.mode)

  return (
    <div className="wb-shell">
      <header className="wb-shell-header">
        <h1 className="wb-shell-title">{props.project.name}</h1>
        <ShellTools />
      </header>

      <nav className="wb-shell-side" aria-label="메뉴와 구조">
        <ShellRegion className="wb-shell-region" name="메뉴·페이지 트리" />
        {/* 구조 트리는 편집 모드에서만 있다. 뷰 모드에서는 접혀 메뉴 트리가 좌측 전체를
            쓴다(설계 §9).

            "접힘"을 `hidden`이 아니라 **DOM에서 제거**로 구현한다. 태스크 8이 여기에
            실제 트리를 채우면 뷰 모드에서 보이지도 않는 트리가 계속 렌더되고 스토어를
            구독하게 되는데, 접힌 동안 그 상태를 유지할 이유가 없다(선택은 스토어가 갖고
            있어 다시 펼칠 때 그대로 돌아온다).

            **테스트는 둘 중 어느 쪽인지까지 잡지 못한다.** RTL의 role 조회가 `hidden`
            요소를 접근성 트리에서 빼므로 두 구현 모두 같은 단언을 통과한다(실측:
            이 자리를 `hidden` 방식으로 바꿔도 10케이스가 전부 통과했다). 테스트가
            지키는 것은 "접힌다"는 사용자가 보는 성질이고, 방식은 여기 적힌 이유다. */}
        {mode === 'edit' && <ShellRegion className="wb-shell-region" name="구조 트리" />}
      </nav>

      <main className="wb-shell-canvas" aria-label="캔버스">
        <CanvasFrame pageId={props.pageId} />
      </main>

      <aside className="wb-shell-panel" aria-label="속성 패널">
        <p className="wb-shell-placeholder">태스크 9가 채운다</p>
      </aside>
    </div>
  )
}

/** 이름표가 붙은 빈 상자. 태스크 8·9가 `children` 자리를 채운다. */
function ShellRegion(props: { className: string; name: string; children?: ReactNode }): ReactElement {
  return (
    <section className={props.className} aria-label={props.name}>
      <h2 className="wb-shell-region-title">{props.name}</h2>
      {props.children}
    </section>
  )
}

/**
 * 캔버스 프레임. 뷰포트 폭과 줌이 여기서 실제 치수가 된다.
 *
 * **프레임 안쪽에는 셸의 클래스를 더 붙이지 않는다** — 그 안은 P4a의 테마 CSS가 전담한다
 * (설계 D7).
 */
function CanvasFrame(props: { pageId: string | undefined }): ReactElement {
  const store = useEditorStoreInstance()
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  const zoom = useEditorStore(store, (s) => s.zoom)

  return (
    <div
      className="wb-shell-canvas-frame"
      // 폭은 프리셋 그대로, 줌은 그 위의 배율이다. 폭에 줌을 곱해 넣으면 "1280 폭에서
      // 어떻게 보이는가"라는 뷰포트 프리셋의 뜻이 깨진다.
      style={{ width: `${viewportWidth}px`, transform: `scale(${zoom})` }}
    >
      {props.pageId === undefined ? (
        <p className="wb-shell-placeholder">{NO_PAGE_NOTICE}</p>
      ) : (
        <p className="wb-shell-placeholder">페이지 {props.pageId}</p>
      )}
    </div>
  )
}

/** 모드 토글·뷰포트 프리셋·줌. 셋 다 스토어를 읽고 쓴다. */
function ShellTools(): ReactElement {
  const store = useEditorStoreInstance()
  const mode = useEditorStore(store, (s) => s.mode)
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  const zoom = useEditorStore(store, (s) => s.zoom)

  return (
    <div className="wb-shell-tools">
      {/* 두 상태 중 하나를 고르는 자리라 `aria-pressed`를 둘 다에 단다. 눌린 쪽만
          표시하면 보조 기술은 나머지 버튼이 토글인지 알 수 없다. */}
      <div className="wb-shell-modes" role="group" aria-label="모드">
        <button
          type="button"
          className="wb-shell-mode"
          aria-pressed={mode === 'edit'}
          onClick={() => store.setMode('edit')}
        >
          편집 모드
        </button>
        <button
          type="button"
          className="wb-shell-mode"
          aria-pressed={mode === 'view'}
          onClick={() => store.setMode('view')}
        >
          뷰 모드
        </button>
      </div>

      <label className="wb-shell-field">
        뷰포트 폭
        <select
          className="wb-shell-select"
          value={viewportWidth}
          // 프리셋 밖의 값은 스토어가 무시한다. 여기서 다시 거르면 같은 규칙이 두 곳에
          // 생기고, 둘이 어긋나는 날 어느 쪽이 맞는지 알 수 없다.
          onChange={(event) => store.setViewportWidth(Number(event.target.value) as ViewportWidth)}
        >
          {VIEWPORT_PRESETS.map((width) => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>

      {/* 한계값(0.25~2)을 이쪽에 두지 않는다. 스토어가 클램프하므로 버튼은 한 칸씩
          밀기만 하면 되고, 한계가 바뀌어도 고칠 곳이 하나로 남는다. */}
      <div className="wb-shell-zoom" role="group" aria-label="줌">
        <button
          type="button"
          className="wb-shell-zoom-step"
          onClick={() => store.setZoom(zoom - ZOOM_STEP)}
        >
          축소
        </button>
        <span className="wb-shell-zoom-value">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="wb-shell-zoom-step"
          onClick={() => store.setZoom(zoom + ZOOM_STEP)}
        >
          확대
        </button>
      </div>
    </div>
  )
}
