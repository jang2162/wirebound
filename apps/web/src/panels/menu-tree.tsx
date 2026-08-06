/**
 * 좌측 상단의 메뉴·페이지 트리. **메뉴와 페이지는 한 트리다**(설계 §9) — 페이지는 항상
 * 어느 메뉴에 속하므로 목록을 둘로 나누지 않는다.
 *
 * 여기서 하는 일은 트리를 그리고 **주소를 바꾸는 것까지다.** 페이지 문서를 받아 스토어에
 * 싣는 것은 캔버스 쪽(`routes/editor.tsx`의 `CanvasFrame`)이다. 그렇게 가른 이유는 둘이다.
 *
 * 1. 주소가 열린 페이지의 단일 진실이다. 클릭이 직접 문서를 받아 오면 "눌러서 연 페이지"와
 *    "주소로 들어와 열린 페이지"가 서로 다른 경로가 되고, 새로고침·공유 주소가 조용히
 *    다르게 동작한다. 트리는 주소만 바꾸고, 문서는 주소를 보고 받는다 — 경로가 하나다.
 * 2. 한 조회의 실패가 다른 자리를 죽이지 않는다. 트리 조회 실패는 이 상자 안에서,
 *    페이지 조회 실패는 캔버스 안에서 끝난다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import type { TreeMenuNode, TreePage } from '../api/types'

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `menu.length === 0`으로 판정하면
 * 응답이 오기 전과 "메뉴가 없는 프로젝트"와 실패가 전부 같은 값이 된다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; menu: TreeMenuNode[] }
  | { status: 'failed'; message: string }

/**
 * `projectId`·`pageId`를 셸에서 받는다. 여기서 `useParams`를 다시 부르지 않는 것은,
 * 셸이 이미 푼 것을 두 곳에서 풀면 라우트 표가 바뀔 때 한쪽만 고치는 일이 생기기
 * 때문이다.
 */
export function MenuTree(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const api = useApi()
  const { projectId } = props
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(`require-auth`와 같은 이유).
    let alive = true

    // 프로젝트가 바뀌면 앞 프로젝트의 트리가 새 주소에서 잠깐 보이는 것을 막는다.
    setState({ status: 'loading' })

    // `.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
    // 때문이다. 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
    async function load(): Promise<void> {
      try {
        const menu = await api.getTree(projectId)
        if (alive) setState({ status: 'ready', menu })
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
  }, [api, projectId])

  if (state.status === 'loading') {
    return (
      <p className="wb-shell-tree-notice" role="status">
        불러오는 중…
      </p>
    )
  }

  if (state.status === 'failed') {
    return (
      <p className="wb-shell-tree-notice" role="alert">
        {state.message}
      </p>
    )
  }

  return (
    <ul className="wb-shell-tree">
      {byOrder(state.menu).map((node) => (
        // 키는 노드 id다. 인덱스를 쓰면 정렬이 바뀔 때 React가 앞 노드의 상태를 다른
        // 노드에 재사용한다.
        //
        // **이 성질은 테스트가 지키지 않는다**(실측: 아래 두 자리까지 세 곳 전부 인덱스로
        // 바꿔도 `apps/web/test` 96케이스가 전부 통과한다). 트리를 한 번 받아 그대로 그리는
        // 지금 화면에는 순서가 런타임에 바뀌는 자리가 없어서다. P2b-2에서 트리를 다시 받거나 순서를
        // 편집하게 되면 그때 케이스와 함께 지켜야 한다 — 그 전까지 이 주석이 유일한 방벽이다.
        <MenuItem key={node.id} node={node} projectId={projectId} pageId={props.pageId} />
      ))}
    </ul>
  )
}

/**
 * 메뉴 하나와 그 안의 것들. 자기 페이지를 먼저, 그다음 자식 메뉴를 품는다 — 둘은 각각
 * 자기 `sortOrder` 눈금을 갖고 있어(서버가 배열을 따로 준다) 하나로 섞어 정렬할 수 없다.
 */
function MenuItem(props: {
  node: TreeMenuNode
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const { node, projectId, pageId } = props
  const pages = byOrder(node.pages)
  const children = byOrder(node.children)

  return (
    <li>
      {/* 메뉴 제목은 누를 수 없다. 메뉴에는 열 문서가 없고(설계 §9의 트리에서 문서를
          가진 것은 페이지뿐이다), 누를 수 있게 보이는 것은 그 자체로 거짓말이다. */}
      <span className="wb-shell-tree-menu">{node.title}</span>

      {(pages.length > 0 || children.length > 0) && (
        <ul className="wb-shell-tree-list">
          {/* 여기 두 자리의 키도 인덱스가 아니라 id다 — 이유와 "테스트가 지키지 않는다"는
              사실은 `MenuTree`의 키 주석에 있다. */}
          {pages.map((page) => (
            <li key={page.id}>
              <PageLink page={page} projectId={projectId} pageId={pageId} />
            </li>
          ))}
          {children.map((child) => (
            <MenuItem key={child.id} node={child} projectId={projectId} pageId={pageId} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * 페이지 한 줄. 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로
 * 열거나 주소를 공유할 수 있어야 한다(`project-list.tsx`와 같은 이유).
 */
function PageLink(props: {
  page: TreePage
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const selected = props.page.id === props.pageId

  return (
    <Link
      className="wb-shell-tree-page"
      to={`/projects/${props.projectId}/pages/${props.page.id}`}
      // 선택은 **주소에서 나온다.** 누른 것을 따로 기억하면 새로고침·뒤로 가기에서
      // 표시와 실제로 열린 페이지가 어긋난다.
      //
      // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
      // 때문이다 — 그러면 "표시가 붙은 줄"을 속성으로 셀 수 없다.
      aria-current={selected ? 'page' : undefined}
    >
      {props.page.title}
    </Link>
  )
}

/**
 * `sortOrder` 오름차순. **원본을 복사하고 정렬한다** — 응답 배열을 제자리에서 뒤집으면
 * 그 배열을 들고 있는 다른 곳(캐시·다음 렌더의 같은 참조)의 순서까지 바뀐다.
 *
 * `sort`는 안정 정렬이므로 `sortOrder`가 같은 형제는 서버가 준 순서를 지킨다.
 */
function byOrder<T extends { sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}
