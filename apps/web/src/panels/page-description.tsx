/**
 * 뷰 모드 우측 패널의 첫째 탭 — **페이지 설명**(설계 §9).
 *
 * §9의 표: 편집 모드는 **속성** / 코멘트 / 상호작용, 뷰 모드는 **페이지 설명** / 코멘트 /
 * 상호작용이다. 뷰 모드에는 고른 노드의 속성을 편집할 이유가 없고(그 모드는 결과를 본다),
 * 대신 *"이 페이지가 무엇인가"*가 온다.
 *
 * ## 새 데이터가 아니다 — 이미 있는 것의 다른 자리다
 *
 * `pages.description`은 §4.2의 컬럼이고 `GET .../pages/:id` 응답의 여덟 키에 이미 들어
 * 있다(`api/types.ts`의 `PageDetail`). **다만 오늘 그것을 그리는 화면이 하나도 없다** —
 * `api/client.ts`의 `createPage`가 *"설계 §9가 그 편집을 우측 패널의 «페이지 설명» 탭에
 * 두기로 했고"*라고 적어 둔 그 자리가 여기다.
 *
 * ## 읽기 전용이다 (P5-3의 판정)
 *
 * **고칠 경로가 없다.** `updatePage`가 받는 것은 `title`·`menuNodeId`·`sortOrder` 셋이고
 * `description`은 **서버 쪽에도 입구가 없다**(`api/client.ts`의 `updatePage` 주석 —
 * *"`description`·`schema`는 여기서 못 바꾼다"*). 편집을 만들려면 API를 넓혀야 하는데,
 * §9가 이 슬라이스에 준 것은 **탭 구성**이지 새 편집 경로가 아니다. **그래서 오늘은 보이는
 * 것까지이고, 그 사실을 화면이 말한다**(설명이 없으면 그렇다고 적는다 — 빈 자리로 두면
 * *"이 탭이 고장 났나"*가 된다).
 *
 * ## 왜 스스로 조회하나
 *
 * 셸의 `CanvasFrame`이 이미 `getPage`를 부르지만 **스키마와 `headSeq`만 스토어로 보내고
 * 나머지는 버린다.** 제목·설명을 스토어에 실으려면 `EditorStore`가 *"페이지 편집 상태"*
 * 밖의 값을 들게 되고(그 파일의 경계다), 셸까지 내려보내려면 프롭이 한 겹 더 생긴다.
 *
 * **코멘트 탭이 이미 같은 형태다** — 마운트될 때 자기 것을 조회한다. 그리고 이 패널은
 * **뷰 모드에서 그 탭을 봤을 때만 마운트된다**(`routes/editor.tsx`가 보이지 않는 탭을
 * DOM에서 뺀다). 값이 큰 것은 `schema`를 함께 받아 오는 낭비 하나이고, 그것은 보고에 적는다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 설명이 보입니다'
/** 설명이 비어 있을 때. **빈 자리로 두지 않는다** — 고장과 구분되지 않는다. */
const NO_DESCRIPTION = '이 페이지에는 아직 설명이 없습니다'
/** 조회가 이유 없이 실패했을 때. */
const LOAD_FAILED = '페이지 설명을 불러오지 못했습니다'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; title: string; description: string | null }
  | { status: 'failed'; failure: Failure }

export function PageDescriptionPanel(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const api = useApi()
  const { projectId, pageId } = props
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    if (pageId === undefined) return

    // 응답이 오기 전에 다른 페이지로 옮기면 결과를 버린다(`routes/editor.tsx`와 같은 가드).
    let alive = true
    setState({ status: 'loading' })

    async function load(openPageId: string): Promise<void> {
      try {
        const page = await api.getPage(projectId, openPageId)
        if (!alive) return
        setState({ status: 'ready', title: page.title, description: page.description })
      } catch (caught) {
        if (!alive) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다(D5). 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILED) })
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
  }, [api, projectId, pageId])

  if (pageId === undefined) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }

  if (state.status === 'loading') {
    return <p className="wb-shell-panel-notice" role="status">불러오는 중…</p>
  }

  if (state.status === 'failed') {
    // 세션이 끊겼으면 오류 문장이 아니라 로그인이다(D5) — 조회 실패 자리들과 같은 규칙이다.
    if (state.failure.kind === 'signed-out') return <SignedOut />
    return <p className="wb-shell-panel-notice" role="alert">{state.failure.message}</p>
  }

  return (
    <>
      <h2 className="wb-shell-panel-title">{state.title}</h2>
      {state.description === null || state.description.trim().length === 0 ? (
        <p className="wb-shell-panel-notice">{NO_DESCRIPTION}</p>
      ) : (
        // `white-space: pre-wrap`을 CSS가 준다 — 설명은 줄바꿈이 뜻을 갖는 글이다.
        <p className="wb-shell-page-description">{state.description}</p>
      )}
    </>
  )
}
