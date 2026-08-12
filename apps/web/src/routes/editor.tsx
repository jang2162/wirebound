/**
 * 설계서를 여는 에디터 셸. 좌측에 메뉴·구조 트리, 가운데 캔버스, 우측 속성 패널이다
 * (설계 §9).
 *
 * **캔버스 내용과 속성 패널은 아직 자리 표시자다** — 태스크 9가 채운다. 좌측의 메뉴·페이지
 * 트리는 `panels/menu-tree.tsx`가 그린다.
 *
 * 조회는 자리마다 나뉘어 있다. 셸은 `getProject`, 트리는 `getTree`, 캔버스는 `getPage`를
 * 각각 부르고 각자 실패를 자기 자리에 그린다. 한 곳에 모아 두면 어느 하나가 실패할 때
 * 화면 전체가 오류로 바뀌고, 사용자는 멀쩡한 트리까지 잃는다.
 *
 * 편집 상태(모드·뷰포트 폭·줌·선택·문서)는 `EditorStore`가 갖는다. 셸이 그것을 `useState`로
 * 들고 내려보내지 않는 이유는 P2b-2 때문이다 — 낙관적 적용·롤백·undo가 붙으면 그 상태는
 * 화면 없이 단위 테스트할 수 있어야 하고, 컴포넌트 안에 있으면 그럴 수 없다.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectDetail } from '../api/types'
import { Canvas } from '../canvas/canvas'
import { CommentPanel } from '../panels/comment-panel'
import { MenuTree } from '../panels/menu-tree'
import { PropertyPanel } from '../panels/property-panel'
import { StructureTree } from '../panels/structure-tree'
import { useEditCommit } from '../edit/use-edit-commit'
import { EditAlert } from '../shell/edit-alert'
import { projectAbilities } from '../projects/project-actions'
import { ThemePicker } from '../theme/theme-picker'
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
/** 페이지 조회가 이유 없이 실패했을 때의 문장. 프로젝트 쪽(`UNKNOWN_FAILURE`)과 다르다. */
const PAGE_UNKNOWN_FAILURE = '페이지를 불러오지 못했습니다'

/** 줌 한 칸. 한계(0.25~2)는 스토어가 클램프하므로 여기서 다시 알 필요가 없다. */
const ZOOM_STEP = 0.25

/** 우측 패널의 탭. **오늘은 둘뿐이다** — 근거는 아래 `RightPanel`의 머리말에 있다. */
type PanelTab = 'props' | 'comments'

/** 탭의 순서와 이름. 표를 상수로 두면 탭이 늘 때 고칠 자리가 하나다. */
const PANEL_TABS: readonly { id: PanelTab; label: string }[] = [
  { id: 'props', label: '속성' },
  { id: 'comments', label: '코멘트' },
]

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `project === null`로 실패를 판정하면
 * 응답이 오기 전과 실패가 같은 값이 되어, 로딩 중에 오류 화면이 떴다 사라진다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectDetail }
  | { status: 'failed'; failure: Failure }

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
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
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
    // 세션이 끊겼으면 오류 화면이 아니라 로그인이다(D5). 여기까지 온 사용자는 문지기를
    // 이미 통과한 뒤라, 이 판정이 없으면 새로고침 말고는 로그인 화면에 갈 길이 없다.
    if (state.failure.kind === 'signed-out') return <SignedOut />

    /**
     * **셸 대신** 오류다. 실패했는데도 셸의 랜드마크가 남아 있으면, 셸을 보는 테스트가
     * 오류 화면 위에서 통과한다 — 이 브랜치에서 실제로 난 사고다. 제목도 프로젝트
     * 이름과 겹치지 않아야 같은 이유로 안전하다.
     */
    return (
      <main className="wb-shell-notice">
        <h1>{FAILURE_TITLE}</h1>
        <p role="alert">{state.failure.message}</p>
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
  /**
   * **고르개가 테마를 바꿨다는 신호**(P4b-3 P2). 값에는 뜻이 없고 오를 때마다 캔버스가
   * 테마를 다시 조회한다.
   *
   * **테마 자체를 여기 두지 않는다.** 그러면 셸이 테마를 읽는 주체가 되어
   * `useThemeCss`의 안정 참조 계약을 셸이 지켜야 하고, 캔버스는 자기가 그리는 것의
   * 출처를 잃는다. 신호 하나만 내려보내면 그 계약이 `useProjectTheme` 안에 그대로 남는다.
   *
   * **스토어에 두지 않는 이유:** `EditorState`가 드는 것은 **페이지 편집** 상태다
   * (문서·`headSeq`·undo 스택·전송 큐). 테마 선택은 그 축이 아니고, 거기 얹으면
   * 편집과 무관한 이유로 스토어 구독자가 다시 그린다.
   */
  const [themeReloadToken, setThemeReloadToken] = useState(0)

  return (
    <div className="wb-shell">
      <header className="wb-shell-header">
        <h1 className="wb-shell-title">{props.project.name}</h1>
        <UndoTools projectId={props.project.id} pageId={props.pageId} />
        <ShellTools />
        {/* **테마 고르개**(P4b-3 D2). 셸 머리에 두는 것은 이것이 화면 **전체**를 바꾸기
            때문이다 — 페이지 하나가 아니라 이 프로젝트의 모든 화면이 갈린다.
            `role`을 그대로 넘겨 owner가 아니면 읽기 전용으로 그린다(서버도 막는다). */}
        <ThemePicker
          projectId={props.project.id}
          canChoose={projectAbilities(props.project.role).chooseTheme}
          onChanged={() => setThemeReloadToken((token) => token + 1)}
        />
        {/* 편집 실패 통지는 **한 자리**다(D8). 조회 실패처럼 화면마다 나누지 않는 것은,
            어느 화면에서 시작된 편집이든 실패의 결과가 같기 때문이다 — 페이지를 다시
            받고 보내지 못한 편집을 잃는다(D4). 셸 상단에 두면 어느 패널을 보고 있어도
            눈에 들어온다. */}
        <EditAlert />
      </header>

      <nav className="wb-shell-side" aria-label="메뉴와 구조">
        <ShellRegion className="wb-shell-region" name="메뉴·페이지 트리">
          {/* 트리에 주는 `projectId`는 **조회해 온 프로젝트의 id**다. 경로의 파라미터를
              다시 읽지 않는 것은, 트리가 만드는 주소가 지금 열려 있는 프로젝트를 가리켜야
              하기 때문이다 — 둘은 같은 값이지만 진실은 조회 결과 쪽에 있다. */}
          <MenuTree projectId={props.project.id} pageId={props.pageId} />
        </ShellRegion>
        {/* 구조 트리는 편집 모드에서만 있다. 뷰 모드에서는 접혀 메뉴 트리가 좌측 전체를
            쓴다(설계 §9).

            "접힘"을 `hidden`이 아니라 **DOM에서 제거**로 구현한다. 여기에 실제 구조 트리가
            채워지면 뷰 모드에서 보이지도 않는 트리가 계속 렌더되고 스토어를 구독하게 되는데,
            접힌 동안 그 상태를 유지할 이유가 없다(선택은 스토어가 갖고 있어 다시 펼칠 때
            그대로 돌아온다).

            **테스트는 둘 중 어느 쪽인지까지 잡지 못한다.** RTL의 role 조회가 `hidden`
            요소를 접근성 트리에서 빼므로 두 구현 모두 같은 단언을 통과한다(실측:
            이 자리를 `hidden` 방식으로 바꿔도 `--project web` 전량이 통과한다 — 0 사망).
            테스트가 지키는 것은 "접힌다"는 사용자가 보는 성질이고, 방식은 여기 적힌
            이유다. */}
        {mode === 'edit' && (
          <ShellRegion className="wb-shell-region" name="구조 트리">
            {/* `projectId`는 메뉴 트리와 같은 이유로 **조회해 온 프로젝트의 id**다.
                구조 편집이 그것을 `PATCH /projects/:id/pages/:id/ops`의 경로로 쓴다. */}
            <StructureTree projectId={props.project.id} pageId={props.pageId} />
          </ShellRegion>
        )}
      </nav>

      <main className="wb-shell-canvas" aria-label="캔버스">
        <CanvasFrame
          projectId={props.project.id}
          pageId={props.pageId}
          themeReloadToken={themeReloadToken}
        />
      </main>

      <aside className="wb-shell-panel" aria-label="우측 패널">
        <RightPanel projectId={props.project.id} pageId={props.pageId} />
      </aside>
    </div>
  )
}

/**
 * 우측 패널의 탭(설계 §9, P5-1 계획서 D6).
 *
 * **오늘은 둘뿐이다.** §9의 편집 모드 탭은 **속성 / 코멘트 / 상호작용** 셋이고 뷰 모드는
 * **페이지 설명 / 코멘트 / 상호작용**인데, 상호작용 탭은 P5-2가, 뷰 모드의 탭 구성 변화는
 * P5-3이 채운다. **없는 것을 흉내 내지 않는다** — 비활성 탭이나 "준비 중" 자리를 미리
 * 만들지 않는다.
 *
 * **모드에 따라 탭을 가르지 않는 것이 오늘의 선택이다.** 뷰 모드에서 속성 대신 페이지
 * 설명을 놓는 것은 P5-3의 일이고, 그 전까지 두 모드가 같은 둘을 쓴다. 그래서 이 컴포넌트는
 * `mode`를 읽지 않는다 — 읽으면 P5-3이 고칠 자리가 여기와 그쪽 둘이 된다.
 *
 * **탭 상태를 스토어에 두지 않는다.** `EditorState`가 드는 것은 **페이지 편집** 상태다
 * (문서·`headSeq`·undo 스택·전송 큐). 어느 탭을 보고 있는가는 그 축이 아니고, 거기 얹으면
 * 편집과 무관한 이유로 스토어 구독자가 다시 그린다 — `themeReloadToken`을 셸의 `useState`로
 * 둔 것과 같은 근거다.
 *
 * **`role="tab"`·`aria-selected`·`role="tabpanel"`을 다는 것이 계약이다.** 보조 기술이
 * "탭 중 하나"를 알아야 나머지 탭이 있다는 것을 알린다 — `ShellTools`의 모드 토글이
 * 눌리지 않은 쪽에도 `aria-pressed`를 다는 것과 같은 이유다.
 */
function RightPanel(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const [tab, setTab] = useState<PanelTab>('props')

  return (
    <>
      <div className="wb-shell-tabs" role="tablist" aria-label="우측 패널 탭">
        {PANEL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`wb-tab-${item.id}`}
            className="wb-shell-tab"
            aria-selected={tab === item.id}
            aria-controls={`wb-tabpanel-${item.id}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* **보이지 않는 탭은 DOM에서 뺀다** — `hidden`으로 두지 않는다. 코멘트 탭은
          마운트될 때 `listComments`를 부르므로, 감춰 둔 채 살려 두면 보지도 않는 목록을
          위해 페이지를 열 때마다 요청이 나간다. 구조 트리를 뷰 모드에서 DOM에서 빼는 것과
          같은 판단이고, 근거도 같다(그쪽 주석). */}
      <div
        className="wb-shell-tabpanel"
        role="tabpanel"
        id={`wb-tabpanel-${tab}`}
        aria-labelledby={`wb-tab-${tab}`}
      >
        {tab === 'props' ? (
          <PropertyPanel projectId={props.projectId} pageId={props.pageId} />
        ) : (
          <CommentPanel projectId={props.projectId} pageId={props.pageId} />
        )}
      </div>
    </>
  )
}

/**
 * 되돌리기·다시 실행 버튼.
 *
 * **`useEditCommit`의 두 번째 인스턴스다**(첫째는 속성 패널). 그래도 D6가 지켜지는 것은
 * 전송 루프의 가드를 스토어가 들기 때문이다 — 훅의 `ref`에 두면 여기서 낸 undo와 패널에서
 * 낸 편집이 동시에 나간다(실측: `maxInFlight`가 2가 됐다. `store/editor-store.ts`의
 * `#pumping` 주석에 그 값이 있다).
 *
 * `pageId`가 없으면 되돌릴 것도 없다 — 훅은 `''`를 받아 `useOpenPage('')`가 `null`을 내고
 * 스택이 비어 두 버튼이 다 비활성이 된다(속성 패널과 같은 관례).
 */
function UndoTools(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const { undo, redo, canUndo, canRedo } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })

  return (
    <div className="wb-shell-history" role="group" aria-label="편집 이력">
      <button type="button" className="wb-shell-history-step" onClick={undo} disabled={!canUndo}>
        되돌리기
      </button>
      <button type="button" className="wb-shell-history-step" onClick={redo} disabled={!canRedo}>
        다시 실행
      </button>
    </div>
  )
}

/**
 * 이름표가 붙은 상자. `children`이 그 안의 내용이다 — 메뉴·페이지 트리는 채워져 있고,
 * 구조 트리 자리는 아직 비어 있다.
 */
function ShellRegion(props: { className: string; name: string; children?: ReactNode }): ReactElement {
  return (
    <section className={props.className} aria-label={props.name}>
      <h2 className="wb-shell-region-title">{props.name}</h2>
      {props.children}
    </section>
  )
}

/**
 * 캔버스에 담길 것의 상태. 문서 자체는 여기 두지 않는다 — 스토어가 갖는다. 화면이 문서를
 * 자기 `useState`에 들면 태스크 9의 캔버스·속성 패널·구조 트리가 각자 다른 사본을 보게
 * 된다.
 */
type PageLoadState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'failed'; failure: Failure }

/**
 * 캔버스 프레임. 뷰포트 폭과 줌이 여기서 실제 치수가 되고, **열린 페이지의 문서를 받아
 * 스토어에 싣는 자리**이기도 하다.
 *
 * 문서를 받는 일이 트리가 아니라 여기 있는 이유는 `panels/menu-tree.tsx`의 주석에 있다 —
 * 요지는 "주소가 열린 페이지의 단일 진실"이라는 것이다. 트리는 주소만 바꾸고, 문서는
 * 주소(`pageId`)를 보고 받는다. 그래서 눌러서 연 페이지와 주소로 들어와 열린 페이지가
 * 같은 경로를 지난다.
 *
 * **아래 이펙트가 돌고 난 뒤의 스토어 문서는 지금 열려 있는 페이지의 것이거나 비어 있다.**
 * 여기가 문서를 싣는 유일한 자리이면서 비우는 자리이기도 하기 때문이다.
 *
 * **"이펙트가 돌고 난 뒤"라는 단서는 그대로다 — 무조건이 아니다.** 비우는 일이 `useEffect`
 * 안에 있어 커밋보다 뒤에 돌기 때문에, `pageId`가 바뀌고 나서 **첫 커밋 하나 동안**은
 * 스토어가 아직 앞 페이지의 문서·`headSeq`·선택을 들고 있다. **그 커밋을 화면이 그리지 않게
 * 만드는 것은 스토어의 `openPageId`다** — 문서를 읽는 셋(캔버스·구조 트리·속성 패널)이
 * `useOpenDocument(pageId)`로 그 값을 주소와 대조하고, 어긋나면 아무것도 그리지 않는다
 * (`store/use-editor-store.tsx`).
 *
 * **그 창은 보통의 단언으로는 보이지 않는다** — RTL이 단언 전에 이펙트를 흘리므로 어떤
 * `expect`도 그 사이를 보지 못한다(`test/setup.ts`). 그래서 커밋마다 화면을 읽는 장치를
 * 따로 만들어 쟀다(`test/editor-harness.tsx`의 `CommitProbe`). 잰 것 둘:
 *
 * - 대조를 없애고 셋이 `s.document`를 곧장 읽게 하면, 새 주소 아래 커밋 **하나**에 앞
 *   페이지의 캔버스 루트(`n-root`)·구조 트리 다섯 줄·앞 페이지에서 고른 노드의 속성이
 *   **함께** 나온다.
 * - `clearPage()`를 `useLayoutEffect`로 옮기는 쪽도 걸어 봤는데 **같은 관측이 그대로
 *   나온다.** 그쪽은 커밋을 DOM에 꽂은 뒤 페인트 전에 지우는 방식이라, 페인트가 없는
 *   jsdom에서는 고쳐졌는지 잴 방법이 없다. 스토어 쪽을 택한 이유가 그것이다.
 *
 * **그 성질이 무엇에 매여 있는지는 하나씩 지워 보고 쟀다.** 아래 셋이 그렇게 확인된
 * 하중이다 — 목록이 완전한지는 재지 못했으므로 "이것이 전부"라고 적지 않는다. 죽는 수는
 * 케이스를 더할 때마다 어긋나므로 **이름만 적는다.**
 *
 * 1. **`pageId`가 사라질 때의 `clearPage()`**(아래 `pageId === undefined` 분기). 페이지를
 *    떠났는데 문서가 남는 것을 막는다. 지우면 죽는 것 —
 *    `menu-tree`의 `페이지를 떠나 pageId 없는 주소로 돌아오면 스토어의 문서가 비워진다`와
 *    `canvas`의 `페이지를 떠나면 선택이 남지 않는다`.
 * 2. **조회를 시작할 때의 `clearPage()`** — 응답이 온 뒤가 아니다. 뒤에 갈아 끼우면 조회가
 *    도는 동안 주소는 새 페이지인데 스토어는 앞 페이지의 것을 들고 있다(라운드 1이 실제로
 *    그랬다). 지우면 죽는 것 — `다른 페이지를 여는 동안…`과 `다른 페이지의 조회가
 *    실패하면…`. 지우는 대신 라운드 1처럼 `catch`로 **옮기기만** 하면 앞의 하나만 죽는다.
 * 3. **성공 분기의 `if (!alive) return`.** 늦게 도착한 앞 페이지의 응답이 새 페이지의 문서를
 *    덮어쓰는 것을 막는다 — 조회가 둘 떠 있을 때 서버가 요청 순서대로 답한다는 보장이 없다.
 *    지우면 죽는 것 — `앞 페이지의 응답이 늦게 와도 새 페이지의 문서를 덮어쓰지 않는다`.
 *
 * 그래서 **스토어의 문서가 비어 있는 것은 셋 다를 뜻한다**: 열린 페이지가 없다(`empty`),
 * 조회 중이다(`loading`), 조회가 실패했다(`failed`). 태스크 9가 그 셋을 갈라 그려야 하면
 * 스토어가 아니라 이 컴포넌트의 `PageLoadState`를 봐야 한다.
 *
 * **프레임 안쪽에는 문서를 겨냥하는 셸의 스타일이 없다** — 그 안은 P4a의 테마 CSS가
 * 전담한다(설계 D7). 그래서 아래 안내 문단들에 클래스가 없고, 스타일도 없다. 셸이
 * 글꼴·글자색을 걸어 두면 상속으로 프레임 안까지 내려가 테마가 정해야 할 값을 누른다 —
 * 선택자를 겨냥하지 않아도 새는 형태라 선택자만 보는 검사로는 보이지 않는다(그래서 문서를
 * 감싸는 상자에는 **속성 허용 목록**을 따로 건다).
 *
 * **태스크 9에서 프레임 안에 셸의 클래스가 셋 생겼다**(`canvas/canvas.tsx`): 문서를 감싸는
 * 상자와, 문서 **옆에** 그려지는 선택 아웃라인·오류 배너다. 셋 다 문서 노드를 겨냥하지
 * 않고, 상속되는 속성도 걸지 않는다 — 검사는 `apps/web/test/shell-css.test.ts`가 돌리고
 * 프레임과 그 상자까지 함께 본다.
 *
 * `ready` 분기만 문서를 그린다. 나머지 세 자리(안내·로딩·오류)에는 그릴 문서가 없다 —
 * 스토어의 문서가 비어 있다는 것은 그 셋 중 하나라는 뜻이므로(위), 스토어만 보고는
 * 어느 쪽인지 알 수 없다.
 *
 * **이 게이트는 지금 어떤 케이스도 지키지 않는다**(실측: 게이트를 없애고 `<Canvas />`를
 * 늘 그려도 `--project web` 전량이 통과한다 — 0 사망). 그래도 두는 것은, 통과하는 이유가
 * "위의 성질이 지켜지고 있어서"이기 때문이다 — 그 셋에서는 스토어의 문서가 비어 있어
 * 캔버스가 아무것도 그리지 않는다. 성질이 깨지는 날 이 게이트가 마지막 방벽이다.
 */
function CanvasFrame(props: {
  projectId: string
  pageId: string | undefined
  /** 고르개가 테마를 바꿨다는 신호. `Canvas`가 그대로 `useProjectTheme`에 넘긴다. */
  themeReloadToken: number
}): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const [state, setState] = useState<PageLoadState>({ status: 'empty' })
  const { projectId, pageId } = props

  useEffect(() => {
    if (pageId === undefined) {
      // 화면만 되돌리면 스토어에는 앞 페이지의 문서와 `headSeq`가 남는다. 주소에 열린
      // 페이지가 없는데 스토어는 있다고 말하는 상태다 — 문서를 스토어에서 읽는 쪽(태스크 9의
      // 캔버스·구조 트리·속성 패널)이 열려 있지 않은 페이지를 그리게 된다. P2b-2에서는
      // 남은 `headSeq`가 `baseSeq`가 되어 더 나쁘다.
      store.clearPage()
      setState({ status: 'empty' })
      return
    }

    // 응답이 오기 전에 다른 페이지로 옮기면 결과를 버린다. 이것이 없으면 늦게 온 앞
    // 페이지의 문서가 뒤 페이지를 덮어쓴다(아래 성공 분기의 `if (!alive) return`이 그
    // 자리다 — 지우면 `앞 페이지의 응답이 늦게 와도…`가 죽는다. 위 JSDoc의 하중 3).
    let alive = true
    setState({ status: 'loading' })
    // **조회를 시작할 때 비운다.** 응답이 온 뒤에 갈아 끼우면 조회가 도는 동안 주소는 새
    // 페이지인데 스토어는 앞 페이지의 문서와 `headSeq`를 들고 있다(실측: 그 창에서
    // `headSeq`가 7로 남았다). 그동안 문서를 스토어에서 읽는 쪽은 열려 있지 않은 페이지를
    // 그리고, P2b-2에서는 앞 페이지의 revision 위에서 편집 요청이 만들어진다. 캔버스가
    // 잠깐 비는 쪽을 택했다 — 새 페이지의 주소 아래에 앞 페이지의 내용이 그려지는 것보다
    // 낫다. 이미 비어 있으면 스토어가 알리지 않으므로 구독자가 헛일을 하지도 않는다.
    store.clearPage()

    /**
     * 내 revision을 받아 undo 스택을 채운다(D10). **실패는 삼킨다** — 조회가 실패하면
     * undo만 없고 페이지는 그대로 열려 있다.
     *
     * **재조회(복구) 경로에서는 이것을 부르지 않는다.** 재조회는 서버가 내 것과 갈라졌다는
     * 뜻이고, 그때 옛 `inverse`를 되살리면 **남의 편집을 조용히 덮는다** — 실측: 내가 `A→B`로
     * 바꾼 뒤 남이 `C`로 바꾼 문서에 내 `inverse`(`replace … ← "A"`)를 적용하면 던지지 않고
     * 그대로 `A`가 되어 `C`가 사라진다. §7.3의 건너뛰기는 **노드가 지워진 경우만** 잡는다
     * (그쪽은 `경로를 찾을 수 없습니다`로 던진다). 값이 갈린 흔한 경우는 못 잡으므로,
     * 충돌 뒤에는 스택을 비운 채 두고 사용자가 새로고침으로 되찾게 한다.
     */
    async function restoreUndo(openPageId: string): Promise<void> {
      try {
        const revisions = await api.listMyRevisions(projectId, openPageId)
        // 늦게 온 응답이 새 페이지의 스택을 덮지 않게 한다(문서 조회와 같은 가드).
        if (!alive) return
        // 서버의 `id`가 스택의 `revisionId`다. 두 이름을 맞추는 자리를 여기 하나로 둔다 —
        // 스토어가 `RevisionSummary`를 알면 `apps/web`의 HTTP 경계가 스토어까지 새어 든다.
        store.restoreUndoStack(
          revisions.map((revision) => ({ revisionId: revision.id, inverse: revision.inverse })),
        )
      } catch {
        // 여기서 알리지 않는다. 사용자가 할 수 있는 일이 없고, 편집 실패 통지 자리(D8)를
        // 부가 기능의 실패로 채우면 진짜 편집 실패가 묻힌다.
      }
    }

    // 열 페이지를 **인자로** 받는다. 이펙트 위쪽의 `undefined` 검사만으로는 이 안에서
    // `pageId`가 좁혀지지 않는다(호이스팅된 함수 선언이라 TS가 호출 시점을 모른다).
    async function load(openPageId: string): Promise<void> {
      try {
        const page = await api.getPage(projectId, openPageId)
        // 이 줄이 없으면 늦게 온 앞 페이지의 응답이 아래 `loadPage`로 흘러 **새 페이지의
        // 문서를 덮어쓴다.** 실측: 지우면 `앞 페이지의 응답이 늦게 와도 새 페이지의 문서를
        // 덮어쓰지 않는다` 하나가 죽는다.
        if (!alive) return
        // **문서는 스토어로 간다.** `headSeq`가 P2b-2의 `baseSeq`다 — 문서와 함께
        // 실어야 편집 요청이 어느 revision 위에서 만들어졌는지가 어긋나지 않는다.
        // 연 페이지의 id도 같은 호출로 넘긴다: 읽는 쪽이 그것을 주소와 대조한다.
        store.loadPage(openPageId, page.schema, page.headSeq)
        setState({ status: 'ready' })
        // **undo 스택 복원은 `loadPage` 뒤다**(D10). 순서가 뒤바뀌면 방금 채운 스택을
        // `loadPage`가 지운다 — 그것이 페이지 상태를 서버 것으로 놓는 자리이기 때문이다
        // (`store/editor-store.ts`). `restoreUndoStack이 loadPage 뒤에 온다`가 그 순서를
        // 고정한다.
        //
        // **페이지가 뜬 뒤에 받는다.** 이 조회가 실패해도 `setState({ status: 'ready' })`는
        // 이미 지났으므로 페이지는 열려 있다 — undo 복원은 부가 기능이고, 그것 때문에
        // 문서를 못 보게 되면 안 된다.
        void restoreUndo(openPageId)
      } catch (caught) {
        if (!alive) return
        // 여기서 다시 `clearPage()`를 부르지 않는다. 조회 시작 시점에 이미 비웠고, 그
        // 사이에 문서를 싣는 길은 이 이펙트의 성공 분기뿐인데 그쪽은 도달하지 못했다
        // (앞 조회가 늦게 와도 `alive`가 false다 — **그 전제는 위 성공 분기의 가드가
        // 지키고, 그 가드는 `앞 페이지의 응답이 늦게 와도…`가 지킨다**). 실측: 여기에
        // `clearPage()`를 도로 넣어도 `--project web` 전량이 그대로 통과한다(0 사망) —
        // 아무도 지키지 않는 줄이라는 뜻이라 두지 않는다. 실패한 뒤 앞 페이지의 문서를
        // **되살려 놓는** 구현은 `다른 페이지의 조회가 실패하면…` 하나가 잡는다.
        //
        // 실패는 **이 상자 안에서** 끝난다. 셸 전체를 오류로 바꾸면 멀쩡한 트리까지
        // 사라져, 사용자가 다른 페이지로 옮겨 갈 길이 없어진다. **세션이 끊긴 것만 예외다**
        // — 그 실패는 이 상자 안에서 끝낼 수 없다(`api/failure.tsx`, D5).
        setState({ status: 'failed', failure: toFailure(caught, PAGE_UNKNOWN_FAILURE) })
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
  }, [api, projectId, pageId, store])

  return (
    <div
      className="wb-shell-canvas-frame"
      // 폭은 프리셋 그대로, 줌은 그 위의 배율이다. 폭에 줌을 곱해 넣으면 "1280 폭에서
      // 어떻게 보이는가"라는 뷰포트 프리셋의 뜻이 깨진다.
      style={{ width: `${viewportWidth}px`, transform: `scale(${zoom})` }}
    >
      {state.status === 'empty' && <p>{NO_PAGE_NOTICE}</p>}
      {state.status === 'loading' && <p role="status">페이지를 불러오는 중…</p>}
      {/* 실패한 동안에는 그릴 문서가 없다. 이 상태로 들어오는 길은 조회뿐이고, 그
          조회가 시작될 때 스토어의 문서를 비웠기 때문이다 — 앞 페이지의 문서를 오류 문장
          밑에 그리면 어느 페이지를 보고 있는지 알 수 없다. */}
      {state.status === 'failed' &&
        (state.failure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <p role="alert">{state.failure.message}</p>
        ))}
      {state.status === 'ready' && (
        <Canvas projectId={projectId} pageId={pageId} themeReloadToken={props.themeReloadToken} />
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
