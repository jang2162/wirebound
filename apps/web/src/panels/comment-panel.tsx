/**
 * 우측의 코멘트 탭(설계 §9). **설계서에 읽는 사람이 말을 남기는 자리다.**
 *
 * ## 두 진실을 한 화면에서 합친다
 *
 * **번호는 문서에 있고 본문은 표에 있다**(계획서 D1). 이 파일이 둘을 잇는 유일한 자리다 —
 * 코멘트의 `nodeId`로 문서에서 노드를 찾아 그 `marker`를 읽는다. 서버는 번호를 모르므로
 * 목록을 번호 순으로 주지 못한다(`created_at` 오름차순이다). **묶고 늘어놓는 것이 여기 일이다.**
 *
 * **선택한 노드의 것만 보이지 않는다**(재라 #3). §9의 그림이 *"① 검색폼 - … / ② 목록 - …"*로
 * **전부**를 보인다 — 코멘트 탭의 쓸모가 *"이 설계서에 어떤 말이 붙어 있는가"*를 훑는
 * 것이기 때문이다. 선택한 노드의 무리에는 표시를 달아 눈이 먼저 가게 한다.
 *
 * ## 무리가 셋이고, **"모른다"는 그 셋 중 하나가 아니다** (리뷰 F)
 *
 * | 무리 | 언제 | 순서 |
 * |---|---|---|
 * | 번호가 있는 노드 | 보통 | 번호 오름차순 |
 * | 번호가 없는 노드 | undo가 번호를 되돌렸다(D2의 대가 1) | 코멘트가 달린 순서 |
 * | **문서에 없는 노드** | 코멘트가 달린 노드를 지웠다 | 코멘트가 달린 순서 |
 *
 * 셋째가 실재하는 이유는 `comments.node_id`에 FK가 없기 때문이다(노드는 테이블이 아니라
 * jsonb 안의 값이다). **감추지 않는다** — 감추면 사용자가 남긴 말이 소리 없이 사라진다.
 *
 * **그런데 문서를 아직/영영 못 읽은 상태가 따로 있다.** 앞 판은 `markersOf(null)`이 빈
 * 표를 내고 `markers.has(nodeId)`가 전부 `false`가 되어 **모든 코멘트를 셋째 무리로
 * 단언했다** — *"사라진 노드"*라고. **거짓말이고 사용자가 실제로 본다:** 페이지를 갈아탈
 * 때마다 커밋 하나 동안, 그리고 문서 조회가 실패한 뒤로는 계속.
 *
 * **`null`(못 읽었다)과 빈 값(없다)을 같은 것으로 접는 자리 —** 이 저장소가 네 번 만난
 * 부류다(P4c-3 이월 2번: W2의 저장 버튼 · P4c-3의 파일 읽기 · 리뷰 B5의 트랜잭션 ·
 * 그리고 여기). **그래서 `present`가 `boolean`이 아니라 셋이다:**
 * `'yes' | 'no' | 'unknown'`. `'unknown'`이면 무엇도 단언하지 않고 그렇다고 말한다.
 *
 * ## 문서를 바꾸는 조작 셋
 *
 * 코멘트 작성·삭제·재번호는 서버에서 `marker`를 바꾸고 revision을 남긴다(D2). 그 변화를
 * `store.applyMarkerChange`가 내 문서에 얹는다 — 그러지 않으면 캔버스에 번호가 안 뜨고
 * `headSeq`가 서버보다 뒤처진다.
 *
 * ## 이 패널은 오류 경계 밖이다
 *
 * `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나다. 그래서 여기서 예외가
 * 새면 셸 전체가 흰 화면이 된다 — `panels/property-panel.tsx`가 같은 이유로 `nodeType`
 * 가드를 들고 있다. 이 파일이 그리는 값은 전부 문자열이고(모양 가드가
 * `api/http-client.ts`의 `SHAPES.comment`에서 이미 끊는다), 문서 순회는 던지지 않는
 * `walkSafely`를 쓴다.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { PageDocument } from '@wirebound/schema'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ApiClient } from '../api/client'
import type { Comment } from '../api/types'
import { walkSafely } from '../edit/safe-walk'
import { useSessionUser } from '../session/session-context'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'

/** 페이지를 열지 않았을 때. */
const NO_PAGE = '페이지를 열면 코멘트가 보입니다'
/** 코멘트가 하나도 없을 때. */
const NO_COMMENTS = '아직 코멘트가 없습니다'
/** 노드를 고르지 않아 새 코멘트를 달 수 없을 때. */
const NO_TARGET = '코멘트를 달 노드를 캔버스나 구조 트리에서 고르세요'
/** 조회가 이유 없이 실패했을 때. */
const LOAD_FAILED = '코멘트를 불러오지 못했습니다'
/** 쓰기가 이유 없이 실패했을 때. */
const WRITE_FAILED = '코멘트를 저장하지 못했습니다'
/** 문서에 없는 노드에 붙은 코멘트의 무리 이름. */
const MISSING_NODE = '사라진 노드'
/** 문서를 못 읽어 번호를 붙일 수 없을 때. **"사라진 노드"라고 단언하지 않는다**(리뷰 F). */
const NO_DOCUMENT = '문서를 읽지 못해 번호를 보일 수 없습니다'
/** 서버는 번호를 바꿨는데 내 문서에 얹지 못했을 때(리뷰 ④). */
const DIVERGED = '번호를 화면에 반영하지 못했습니다 — 새로고침하면 맞춰집니다'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; comments: Comment[] }
  | { status: 'failed'; failure: Failure }

/** 한 노드에 붙은 코멘트 묶음. `marker`는 문서에서 읽은 값이다(표에는 없다). */
interface Group {
  nodeId: string
  /** 그 노드의 번호. 노드가 없거나 번호가 없거나 **문서를 못 읽었으면** `null`이다. */
  marker: number | null
  /**
   * 노드가 문서에 있는가. **`boolean`이 아닌 것이 요점이다**(리뷰 F) —
   * `'unknown'`은 *"문서를 못 읽어서 모른다"*이고 `'no'`(*"문서에 없다"*)와 다른 말이다.
   */
  present: 'yes' | 'no' | 'unknown'
  comments: Comment[]
}

/**
 * 문서에서 노드 id → `marker` 표를 만든다. **`walkSafely`를 쓴다** — 검증 전 문서가
 * 스토어에 실릴 수 있고(P2b-2), `walkNodes`는 `children` 안의 노드 아닌 원소에서 던진다
 * (`edit/safe-walk.ts`의 실측). 이 패널은 오류 경계 밖이라 그 예외가 셸을 지운다.
 *
 * `marker`가 정수가 아닌 값이면 없는 것으로 다룬다 — 봉투 검증이 막지만 그 문서가 여기
 * 오지 않는다는 보장은 검증 **전** 문서에 대해서는 없다.
 */
function markersOf(document: PageDocument): Map<string, number | null> {
  const markers = new Map<string, number | null>()

  for (const visit of walkSafely(document.root)) {
    const marker = visit.node.marker
    markers.set(visit.node.id, typeof marker === 'number' && Number.isInteger(marker) ? marker : null)
  }
  return markers
}

/**
 * 코멘트를 노드별로 묶고 늘어놓는다. **순서가 이 함수의 계약이다**(위 머리말의 표).
 *
 * 묶음 안의 순서는 서버가 준 그대로다 — `created_at` 오름차순이라 먼저 한 말이 먼저다.
 */
export function groupComments(comments: readonly Comment[], document: PageDocument | null): Group[] {
  // **문서가 없으면 `null`을 그대로 들고 간다** — 빈 표로 접으면 모든 노드가 "없다"가 된다(리뷰 F).
  const markers = document === null ? null : markersOf(document)
  const groups = new Map<string, Group>()

  for (const comment of comments) {
    const existing = groups.get(comment.nodeId)
    if (existing) {
      existing.comments.push(comment)
      continue
    }
    const present: Group['present'] =
      markers === null ? 'unknown' : markers.has(comment.nodeId) ? 'yes' : 'no'
    groups.set(comment.nodeId, {
      nodeId: comment.nodeId,
      marker: present === 'yes' ? (markers?.get(comment.nodeId) ?? null) : null,
      present,
      comments: [comment],
    })
  }

  // **`Map`의 순회 순서가 삽입 순서**라, 번호 없는 두 무리는 코멘트가 달린 순서로 남는다.
  // `sort`가 안정 정렬이므로(ES2019부터 규격이다) 그 순서가 아래 정렬을 지나도 보존된다.
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.marker ?? 0) - (b.marker ?? 0))
}

/**
 * 무리의 등급. 작을수록 앞이다 — 번호 있음 → 번호 없음 → 사라진 노드.
 *
 * **`'unknown'`은 뒤로 밀지 않는다.** 그것은 *"이 노드가 나쁘다"*가 아니라 *"내가 모른다"*
 * 이고, 모르는 것을 뒤로 몰면 사용자가 그것을 문제로 읽는다. 문서를 못 읽었으면 **전부**
 * `'unknown'`이므로 순서는 코멘트가 달린 순서 그대로 남는다.
 */
function rank(group: Group): number {
  if (group.present === 'unknown') return 1
  if (group.present === 'no') return 2
  return group.marker === null ? 1 : 0
}

export function CommentPanel(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  // **남의 코멘트는 고칠 수 없다**(서버의 재라 #2). `null`이면 아직 누구인지 모르는
  // 것이므로 수정 단추를 하나도 안 낸다 — 서버가 어차피 403으로 막는다.
  const currentUser = useSessionUser()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 쓴다.
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  /** 쓰기 중에는 조작을 막는다. 같은 코멘트가 두 번 나가면 번호는 하나인데 행이 둘이 된다. */
  const [busy, setBusy] = useState(false)
  /** 마지막 쓰기 실패. **성공하면 지운다** — 남아 있으면 방금 한 조작도 실패한 것으로 읽힌다. */
  const [writeError, setWriteError] = useState<Failure | null>(null)
  /**
   * **서버는 번호를 바꿨는데 내 문서에 얹지 못했다**(리뷰 ④ — `applyMarkerChange`가
   * `'diverged'`를 냈다). 보내지 않은 구조 편집이 그 노드를 이미 지운 경우다.
   *
   * **버리지 않고 말한다.** 버리면 *"코멘트는 달렸는데 캔버스에 번호가 없고 아무도 그것을
   * 말하지 않는"* 상태가 되고, 그것이 이 저장소가 네 번 만난 부류의 형태다.
   * **`'skipped'`는 말하지 않는다** — 그때는 화면이 이미 다른 페이지를 보고 있다.
   */
  const [diverged, setDiverged] = useState(false)
  const [draft, setDraft] = useState('')
  /** 지금 고치고 있는 코멘트의 id. `null`이면 아무것도 안 고치는 중이다. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const { projectId, pageId } = props

  const reload = useCallback(async (): Promise<Comment[] | null> => {
    if (pageId === undefined) return null
    try {
      const comments = await api.listComments(projectId, pageId)
      setState({ status: 'ready', comments })
      return comments
    } catch (caught) {
      setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILED) })
      return null
    }
  }, [api, projectId, pageId])

  useEffect(() => {
    if (pageId === undefined) {
      setState({ status: 'ready', comments: [] })
      return
    }

    // 응답이 오기 전에 다른 페이지로 옮기면 결과를 버린다(`routes/editor.tsx`와 같은 가드).
    let alive = true
    setState({ status: 'loading' })
    // 페이지가 바뀌면 앞 페이지에 쓰던 초안·고치던 것도 버린다. 노드 id도 코멘트 id도
    // 그 페이지 안에서만 뜻이 있다.
    setDraft('')
    setEditingId(null)
    setWriteError(null)
    setDiverged(false)

    async function load(openPageId: string): Promise<void> {
      try {
        const comments = await api.listComments(projectId, openPageId)
        if (!alive) return
        setState({ status: 'ready', comments })
      } catch (caught) {
        if (!alive) return
        setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILED) })
      }
    }

    void load(pageId)
    return () => {
      alive = false
    }
  }, [api, projectId, pageId])

  /**
   * 쓰기 하나를 감싼다. **성공·실패 어느 쪽이든 `busy`를 반드시 내린다** — 안 그러면
   * 실패 한 번에 패널이 영영 잠긴다.
   */
  const write = useCallback(
    async (run: (client: ApiClient, openPageId: string) => Promise<void>): Promise<void> => {
      if (pageId === undefined || busy) return
      setBusy(true)
      try {
        await run(api, pageId)
        setWriteError(null)
      } catch (caught) {
        setWriteError(toFailure(caught, WRITE_FAILED))
      } finally {
        setBusy(false)
      }
    },
    [api, busy, pageId],
  )

  const submit = (): void => {
    const body = draft.trim()
    if (body === '' || selectedNodeId === null) return

    void write(async (client, openPageId) => {
      const created = await client.createComment(projectId, openPageId, { nodeId: selectedNodeId, body })
      // **문서 변화를 먼저 얹는다.** 목록을 다시 받아도 번호는 그 응답에 없다 —
      // 번호는 문서의 값이다(D1). 결과를 **버리지 않는다**(리뷰 ④).
      setDiverged(store.applyMarkerChange(openPageId, created) === 'diverged')
      // 초안은 **성공한 뒤에** 비운다. 실패했는데 비우면 사용자가 쓴 말이 사라진다
      // (P4c-3 이월의 둘째 줄이 말하는 부류의 반대편이다).
      setDraft('')
      await reload()
    })
  }

  const remove = (commentId: string): void => {
    void write(async (client, openPageId) => {
      const change = await client.deleteComment(projectId, openPageId, commentId)
      setDiverged(store.applyMarkerChange(openPageId, change) === 'diverged')
      await reload()
    })
  }

  const saveEdit = (commentId: string): void => {
    const body = editDraft.trim()
    if (body === '') return

    void write(async (client, openPageId) => {
      await client.updateComment(projectId, openPageId, commentId, { body })
      setEditingId(null)
      await reload()
    })
  }

  const renumber = (): void => {
    void write(async (client, openPageId) => {
      const change = await client.renumberComments(projectId, openPageId)
      setDiverged(store.applyMarkerChange(openPageId, change) === 'diverged')
      // 목록은 다시 받지 않아도 된다 — 재번호는 **표를 안 건드린다**(D4). 번호만 바뀌고
      // 그 번호는 문서에서 읽는다.
    })
  }

  if (pageId === undefined) {
    return <p className="wb-shell-panel-notice">{NO_PAGE}</p>
  }

  if (state.status === 'loading') {
    return (
      <p className="wb-shell-panel-notice" role="status">
        코멘트를 불러오는 중…
      </p>
    )
  }

  if (state.status === 'failed') {
    // **세션이 끊겼으면 오류 문장이 아니라 로그인이다**(D5) — `routes/editor.tsx`의
    // 캔버스 실패가 같은 판정을 한다. 여기서 문장만 그리면 사용자가 새로고침 말고는
    // 로그인 화면에 갈 길이 없다.
    if (state.failure.kind === 'signed-out') return <SignedOut />
    return (
      <p className="wb-shell-panel-notice" role="alert">
        {state.failure.message}
      </p>
    )
  }

  const groups = groupComments(state.comments, document)

  return (
    <div className="wb-shell-comments">
      <form
        className="wb-shell-comment-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="wb-shell-comment-label" htmlFor="wb-comment-draft">
          새 코멘트
        </label>
        <textarea
          id="wb-comment-draft"
          className="wb-shell-comment-input"
          value={draft}
          rows={3}
          // **고른 노드가 없으면 아예 쓸 수 없다.** 눌러 봐야 실패할 자리를 열어 두지
          // 않는다(P2b-2 D7과 같은 판단) — 서버도 `nodeId` 없는 본문을 400으로 막는다.
          disabled={selectedNodeId === null || busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        {selectedNodeId === null && <p className="wb-shell-panel-notice">{NO_TARGET}</p>}
        <div className="wb-shell-comment-actions">
          <button
            type="submit"
            className="wb-shell-comment-submit"
            disabled={selectedNodeId === null || busy || draft.trim() === ''}
          >
            코멘트 달기
          </button>
          {/* §9의 *"문서 순서대로 재번호"* 버튼. 표는 안 건드리고 문서만 바꾼다(D4). */}
          <button type="button" className="wb-shell-comment-renumber" disabled={busy} onClick={renumber}>
            문서 순서대로 재번호
          </button>
        </div>
        {writeError !== null &&
          (writeError.kind === 'signed-out' ? (
            <SignedOut />
          ) : (
            <p className="wb-shell-panel-notice" role="alert">
              {writeError.message}
            </p>
          ))}
        {/* **실패가 아니라 어긋남이다** — 코멘트는 저장됐고 번호만 화면에 못 얹었다.
            그래서 `alert`가 아니라 `status`이고 문안도 *"실패했다"*가 아니다. */}
        {diverged && (
          <p className="wb-shell-panel-notice" role="status">
            {DIVERGED}
          </p>
        )}
      </form>

      {/* **문서를 못 읽었으면 그렇다고 말한다**(리뷰 F). 코멘트는 그대로 보이되 번호
          자리가 비는 이유를 화면이 스스로 설명한다 — 조용히 `–`만 두면 사용자는 번호가
          없는 것으로 읽는다. */}
      {document === null && state.comments.length > 0 && (
        <p className="wb-shell-panel-notice" role="status">
          {NO_DOCUMENT}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="wb-shell-panel-notice">{NO_COMMENTS}</p>
      ) : (
        <ul className="wb-shell-comment-groups">
          {groups.map((group) => (
            <li
              key={group.nodeId}
              className="wb-shell-comment-group"
              // 고른 노드의 무리에 표시를 단다. `aria-current`는 "여럿 중 지금 것"을
              // 뜻하는 표준 자리라 보조 기술도 그대로 읽는다.
              {...(group.nodeId === selectedNodeId ? { 'aria-current': true as const } : {})}
            >
              <h3 className="wb-shell-comment-group-title">
                <span className="wb-shell-comment-marker">{group.marker ?? '–'}</span>{' '}
                {/* **`'unknown'`을 `'no'`와 갈라 말한다**(리뷰 F). 문서를 못 읽었을 뿐인데
                    *"사라진 노드"*라고 적으면 화면이 거짓을 단언한다. */}
                {group.present === 'no' ? `${MISSING_NODE} (${group.nodeId})` : group.nodeId}
              </h3>
              <ul className="wb-shell-comment-list">
                {group.comments.map((comment) => (
                  <li key={comment.id} className="wb-shell-comment">
                    <p className="wb-shell-comment-author">{comment.authorName}</p>
                    {editingId === comment.id ? (
                      <>
                        <label className="wb-shell-comment-label" htmlFor={`wb-comment-edit-${comment.id}`}>
                          코멘트 수정
                        </label>
                        <textarea
                          id={`wb-comment-edit-${comment.id}`}
                          className="wb-shell-comment-input"
                          value={editDraft}
                          rows={3}
                          disabled={busy}
                          onChange={(event) => setEditDraft(event.target.value)}
                        />
                        <button
                          type="button"
                          className="wb-shell-comment-save"
                          disabled={busy || editDraft.trim() === ''}
                          onClick={() => saveEdit(comment.id)}
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          className="wb-shell-comment-cancel"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="wb-shell-comment-body">{comment.body}</p>
                        {/* **수정은 작성자만 부를 수 있다**(서버 재라 #2 — 남이 부르면
                            403이다). 눌러 봐야 실패할 버튼을 두지 않는다. */}
                        {currentUser !== null && comment.authorId === currentUser.id && (
                          <button
                            type="button"
                            className="wb-shell-comment-edit"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(comment.id)
                              setEditDraft(comment.body)
                            }}
                          >
                            수정
                          </button>
                        )}
                        {/* **삭제는 editor면 누구나 한다** — 수정과 갈린다(서버 재라 #2). */}
                        <button
                          type="button"
                          className="wb-shell-comment-delete"
                          disabled={busy}
                          onClick={() => remove(comment.id)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
