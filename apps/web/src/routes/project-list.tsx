/**
 * 로그인 다음 화면. 내가 속한 프로젝트를 늘어놓고, 하나를 고르면 에디터로 들어간다.
 *
 * **읽기 전용이다.** 서버에 생성·수정 엔드포인트가 있어도 P2b-1의 범위는 "보는 것"까지다.
 *
 * 데이터 페칭 라이브러리를 쓰지 않고 `useEffect` + `useState`로 둔다. 이 단계의 화면은
 * 셋뿐이고 전부 한 번 읽고 끝이며, 편집 상태는 P2b-2의 스토어가 따로 맡는다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import type { ProjectDetail } from '../api/types'

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '프로젝트 목록을 불러오지 못했습니다'
/** 조회가 성공했는데 결과가 비어 있을 때의 안내. */
const EMPTY_NOTICE = '참여 중인 프로젝트가 없습니다'

/**
 * 조회 상태. **`projects.length === 0`으로 빈 상태를 판정하지 않는다** — 응답이 오기
 * 전에도 목록은 비어 있으므로, 길이만 보면 로딩 중에 "없습니다"가 떴다가 사라진다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectDetail[] }
  | { status: 'failed'; message: string }

export function ProjectListRoute(): ReactElement {
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(`require-auth`와 같은 이유).
    let alive = true

    // `.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
    // 때문이다. 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
    async function load(): Promise<void> {
      try {
        const projects = await api.listProjects()
        if (alive) setState({ status: 'ready', projects })
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
  }, [api])

  return (
    <main>
      <h1>프로젝트</h1>
      {state.status === 'loading' && <p role="status">불러오는 중…</p>}
      {state.status === 'failed' && <p role="alert">{state.message}</p>}
      {state.status === 'ready' &&
        (state.projects.length === 0 ? (
          <p>{EMPTY_NOTICE}</p>
        ) : (
          <ul>
            {state.projects.map((project) => (
              <li key={project.id}>
                {/* 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로
                    열거나 주소를 공유할 수 있어야 한다. */}
                <Link to={`/projects/${project.id}`}>{project.name}</Link>
                {project.description !== null && <p>{project.description}</p>}
              </li>
            ))}
          </ul>
        ))}
    </main>
  )
}
