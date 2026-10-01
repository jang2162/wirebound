/**
 * 페이지 프리셋을 고르고 지금 페이지를 프리셋으로 남기는 자리(설계서 「페이지 프리셋」).
 * 구조 트리 뿌리 `+`의 `프리셋`이 연다.
 *
 * **`PatternPicker` 옆에 둔다** — 둘 다 *"무엇을 넣을까"*를 고르는 자리이고, 새 패널을
 * 만들면 좁은 좌측에 목록이 하나 더 쌓인다. 고르개 상태가 툴바에 하나뿐인 것도 같은 이유다.
 *
 * ---
 *
 * # 여는 순간 조회하고, 둘을 함께 받는다
 *
 * 프리셋 목록과 **이 페이지의 코멘트 수**다. 후자는 덮기 전 확인 문장의 재료다 —
 * 적용은 페이지 내용을 통째로 치우고, 그러면 코멘트 행이 가리키던 노드가 사라진다.
 *
 * **확인 단계에 와서야 코멘트를 읽는 판을 고르지 않는다.** 그러면 확인 문장이 *"읽는
 * 중"*으로 시작하고, **사용자가 되돌릴 수 없다고 생각하는 순간에 로딩을 보게 된다.**
 * 여는 순간 둘을 함께 받으면 확인 문장이 뜰 때 이미 준비돼 있다.
 *
 * **코멘트 수를 읽지 못하면 `null`이고, 그때 0이라고 말하지 않는다.** *"못 읽었다"*와
 * *"없다"*를 접으면 화면이 사실과 다른 것을 말한다(`comment-panel.tsx`의 `present`가
 * `'unknown'`을 가진 이유와 같다).
 *
 * **그래도 적용을 막지는 않는다.** 코멘트 조회가 실패했다고 페이지 편집이 막히면, 아무
 * 상관없는 서비스의 장애가 편집을 세운다 — 화면이 서버보다 엄격해지는 부류다.
 * 대신 **모른다고 말한 채** 사용자가 고르게 한다.
 *
 * ---
 *
 * # 코멘트를 지우지 않는다
 *
 * 코멘트는 사람의 글이고 지우는 것은 되돌릴 수 없다(삭제 경로가 따로 있다).
 * 적용은 문서만 바꾸므로 **행은 남고 문서에서만 사라진다** — 코멘트 탭이 그것을
 * *"사라진 노드"* 무리로 갈라 보인다.
 *
 * ---
 *
 * # 이 파일은 오류 경계 밖이다
 *
 * 구조 트리와 같은 자리다. 그리는 값이 전부 문자열이고(`SHAPES.preset`이 `name`을 이미
 * 끊는다) 편집을 만드는 일은 툴바가 한다 — 여기서 하는 것은 고르는 것과 저장 요청뿐이다.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { WbNode } from '@wirebound/schema'
import { useApi } from '../api/context'
import { walkSafely } from '../edit/safe-walk'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { Preset } from '../api/types'

/** 목록·코멘트 조회의 상태. */
type LoadState =
  | { status: 'loading' }
  /**
   * `commentNodes`가 `null`이면 **코멘트를 읽지 못했다** — 0건과 다른 말이다.
   *
   * **수가 아니라 `nodeId` 목록을 든다.** 세는 단위가 *"이 적용이 문서에서
   * 없애는 노드를 가리키는 코멘트"*이므로, 세려면 **지금 문서**와 맞대야 한다 —
   * 조회 시점에 세어 두면 그 사이 문서가 바뀌었을 때 낡은 수를 말한다.
   */
  | { status: 'ready'; presets: Preset[]; commentNodes: string[] | null }
  | { status: 'failed'; failure: Failure }

const LOADING = '프리셋을 읽는 중입니다'
/** 목록 조회가 실패했을 때. 서버 문장이 없으면 이것을 쓴다. */
const LOAD_FAILED = '프리셋을 불러오지 못했습니다'
/** 저장이 이유 없이 실패했을 때. */
const SAVE_FAILED = '프리셋을 저장하지 못했습니다'
/** 문서를 아직 못 읽어 저장할 것이 없을 때. */
const NO_DOCUMENT = '페이지를 읽지 못해 저장할 수 없습니다'

export function PresetPicker(props: {
  projectId: string
  /** 코멘트 수를 세는 대상. 없으면 세지 않는다(그때 확인 문장은 *"모른다"* 쪽이다). */
  pageId: string | undefined
  /**
   * 지금 페이지의 root `children`. **문서 봉투가 아니다.** 문서를 못 읽었으면
   * `null`이고 그때 저장 버튼이 비활성이다.
   */
  currentNodes: readonly WbNode[] | null
  /**
   * 이름칸에 친 글자. **이 컴포넌트가 안 든다 — 툴바가 든다.**
   *
   * 남이 이 페이지에 잠금을 잡으면 `visiblePicker`가 `null`이 되어 이 컴포넌트가 DOM에서
   * 빠지고, `useState`로 들면 그때 **사용자가 친 글자가 사라진다.** 툴바는 그동안 그대로
   * 마운트돼 있으므로 이 문자열만 거기 둔다.
   *
   * **폼을 통째로 올리는 것이 아니다** — 고른 프리셋(`picked`)·확인 단계(`confirming`)·
   * 저장 결과는 그대로 여기 있고 잠금이 오가면 되돌아간다. 왜 이 하나만 가르는지는
   * `structure-toolbar.tsx`의 `visiblePicker` 머리말이 갖는다.
   */
  name: string
  onNameChange: (name: string) => void
  /** 고른 프리셋을 놓는다. 편집을 만드는 것은 툴바다(판정이 컴포넌트로 들어오지 않는다). */
  onApply: (nodes: WbNode[]) => void
  onCancel: () => void
}): ReactElement {
  const api = useApi()
  const { projectId, pageId, name } = props
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [picked, setPicked] = useState('')
  /** 덮는다는 확인을 받는 중인가. */
  const [confirming, setConfirming] = useState(false)
  /** 저장 결과 한 줄. 성공도 실패도 여기 실린다. */
  const [saveFailure, setSaveFailure] = useState<Failure | null>(null)
  /** 저장 성공 한 줄. 실패는 `saveFailure`가 든다 — 세션이 끊긴 갈래를 갈라야 하기 때문이다. */
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** 저장 뒤 목록을 다시 읽게 하는 값. */
  const [reload, setReload] = useState(0)

  useEffect(() => {
    // 앞 프로젝트의 응답이 늦게 도착해 새 프로젝트의 목록을 덮는 것을 막는다.
    let alive = true
    // 떠나면 요청째 끊는다(`ReadOptions.cancel`).
    const leave = new AbortController()
    setLoad({ status: 'loading' })
    void (async () => {
      try {
        const presets = await api.listPresets(projectId, { cancel: leave.signal })
        // **코멘트 조회의 실패는 프리셋 조회의 실패와 다르다.** 앞엣것이 없으면 고를 것이
        // 없지만, 뒤엣것이 없어도 고르고 적용할 수 있다 — 그래서 갈래를 갈라 잡는다.
        let commentNodes: string[] | null = null
        if (pageId !== undefined) {
          try {
            commentNodes = (await api.listComments(projectId, pageId, { cancel: leave.signal })).map((entry) => entry.nodeId)
          } catch {
            commentNodes = null
          }
        }
        if (alive) setLoad({ status: 'ready', presets, commentNodes })
      } catch (caught) {
        if (alive) setLoad({ status: 'failed', failure: toFailure(caught, LOAD_FAILED) })
      }
    })()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId, pageId, reload])

  // **세션이 끊긴 갈래는 문장으로 말하지 않는다** — 화면을 로그인으로 갈아 끼운다
  // (`comment-panel.tsx`가 같은 판단을 적었다: 남아 있는 화면 자체가 없다).
  const signedOut =
    (load.status === 'failed' && load.failure.kind === 'signed-out') ||
    saveFailure?.kind === 'signed-out'
  if (signedOut) return <SignedOut />

  if (load.status !== 'ready') {
    // **어느 갈래든 같은 상자에 담는다** — 취소가 사라지면 사용자가 목록을 닫는 방법이
    // 상태에 따라 달라진다(`PatternPicker`가 같은 판단을 적었다).
    return (
      <div className="wb-shell-picker" role="group" aria-label="프리셋 고르기">
        <p className="wb-shell-picker-notice">
          {load.status === 'loading' ? LOADING : failureMessage(load.failure)}
        </p>
        <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
          프리셋 취소
        </button>
      </div>
    )
  }

  // 첫 항목을 기본값으로 삼되 **`useState`의 초기값으로 두지 않는다** — 조회가 끝나기
  // 전에 마운트되므로 초기값이 영원히 빈 문자열로 굳는다(`PatternPicker`의 실측).
  const current = load.presets.some((preset) => preset.id === picked)
    ? picked
    : (load.presets[0]?.id ?? '')
  const selected = load.presets.find((preset) => preset.id === current)

  function apply(): void {
    if (selected === undefined) return
    setConfirming(false)
    props.onApply(selected.nodes)
  }

  async function save(): Promise<void> {
    if (props.currentNodes === null) return
    setSaving(true)
    setSaved(null)
    setSaveFailure(null)
    try {
      const created = await api.createPreset(projectId, {
        name: name.trim(),
        // **`marker`를 여기서 지우지 않는다** — 버리는 자리는 서버다(`apps/api/README.md` 「저장은 `marker`를
        // 버리고 id는 그대로 담는다」). 규칙의 자리가 하나여야 다른 저장 경로(MCP · CLI)에도 같은 것이 걸린다.
        schema: [...props.currentNodes],
      })
      setSaved(`프리셋으로 저장했습니다: ${created.name}`)
      props.onNameChange('')
      // 방금 저장한 것이 목록에 있어야 바로 다른 페이지에 놓을 수 있다.
      setReload((value) => value + 1)
    } catch (caught) {
      setSaveFailure(toFailure(caught, SAVE_FAILED))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wb-shell-picker" role="group" aria-label="프리셋 고르기">
      {/* **줄을 마크업이 가른다**(`shell.css`의 `.wb-shell-picker-row`) — 이름표와 칸이 한 줄, 함께 누르는 단추가 한 줄. */}
      <div className="wb-shell-picker-row">
        <label className="wb-shell-picker-label" htmlFor="wb-shell-preset-picker">
          프리셋
        </label>
        <select
          id="wb-shell-preset-picker"
          className="wb-shell-picker-select"
          value={current}
          onChange={(event) => {
            setPicked(event.target.value)
            // 고른 것이 바뀌면 확인은 무효다 — 확인 문장이 가리키던 프리셋이 아니다.
            setConfirming(false)
          }}
        >
          {load.presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {optionLabel(preset)}
            </option>
          ))}
        </select>
      </div>

      {confirming ? (
        <>
          {/* **덮는다는 것을 먼저 말한다.** `role="alert"`이 아닌 것은 이것이 실패
              통지가 아니라 **묻는 말**이기 때문이다 — 편집 실패의 알림 자리
              (`EditAlert`)와 섞이면 그 하나뿐인 통지 규칙이 흩어진다. */}
          <p className="wb-shell-picker-notice">
            {overwriteNotice(orphanedCount(load.commentNodes, props.currentNodes))}
          </p>
          <div className="wb-shell-picker-row">
            <button type="button" className="wb-shell-picker-action" onClick={apply}>
              덮고 적용
            </button>
            <button
              type="button"
              className="wb-shell-picker-action"
              onClick={() => setConfirming(false)}
            >
              적용 취소
            </button>
          </div>
        </>
      ) : (
        <div className="wb-shell-picker-row">
          <button
            type="button"
            className="wb-shell-picker-action"
            disabled={selected === undefined}
            onClick={() => setConfirming(true)}
          >
            프리셋 적용
          </button>
        </div>
      )}

      <div className="wb-shell-picker-row">
        <label className="wb-shell-picker-label" htmlFor="wb-shell-preset-name">
          프리셋 이름
        </label>
        <input
          id="wb-shell-preset-name"
          className="wb-shell-picker-input"
          value={name}
          onChange={(event) => props.onNameChange(event.target.value)}
        />
      </div>
      <div className="wb-shell-picker-row">
        <button
          type="button"
          className="wb-shell-picker-action"
          // **이름이 비어 있으면 서버가 400이다**(1~60자). 보내 봐야 거절될 요청을 막는 것은
          // 구조 트리 줄 행동의 끈 항목과 같은 판단이다.
          disabled={saving || props.currentNodes === null || name.trim() === ''}
          title={props.currentNodes === null ? NO_DOCUMENT : ''}
          onClick={() => void save()}
        >
          현재 페이지를 프리셋으로 저장
        </button>
      </div>
      {saved !== null && <p className="wb-shell-picker-notice">{saved}</p>}
      {saveFailure !== null && (
        <p className="wb-shell-picker-notice">{failureMessage(saveFailure)}</p>
      )}

      <button type="button" className="wb-shell-picker-action" onClick={props.onCancel}>
        프리셋 취소
      </button>
    </div>
  )
}

/**
 * `Failure`에서 보일 문장. **`signed-out`은 여기 오지 않는다** — 그 갈래는 화면을 통째로
 * 갈아 끼우므로 위에서 먼저 걸린다. 그래도 값을 하나 내는 것은 이 층의 계약이
 * *"던지지 않는다"*이기 때문이다.
 */
function failureMessage(failure: Failure): string {
  return failure.kind === 'message' ? failure.message : LOAD_FAILED
}

/**
 * 목록 한 줄. **내장인지 프로젝트 것인지 말한다** — 이름은 사용자가 지을 수 있어
 * 내장과 같은 이름이 될 수 있고(유일 제약이 없다 — `apps/api/README.md` 「이름에 유일 제약이 없다」), 그러면 이름만으로는 갈리지
 * 않는다.
 */
function optionLabel(preset: Preset): string {
  const source = preset.source === 'builtin' ? '내장' : '프로젝트'
  return preset.description === null || preset.description === ''
    ? `${preset.name} (${source})`
    : `${preset.name} (${source}) — ${preset.description}`
}

/**
 * 셀 수 있으면 수, 못 세면 **왜 못 세는지**. 셋을 가르는 이유는 각각 사용자에게
 * 다른 것을 말하기 때문이다 — 하나로 접으면 화면이 겪지 않은 실패를 말하게 된다.
 */
type OrphanCount =
  | { kind: 'counted'; count: number }
  /** 코멘트 목록 조회가 실패했다. */
  | { kind: 'comments-unknown' }
  /** 코멘트는 읽었는데 **무엇이 없어지는지**를 모른다 — 문서의 `children`이 배열이 아니다. */
  | { kind: 'document-unknown' }

/**
 * **이 적용이 고아로 만드는 코멘트의 수.** 못 세면 왜 못 세는지 말한다.
 *
 * # 세는 단위
 *
 * > **적용이 문서에서 없애는 노드를 가리키는 코멘트 하나당 하나.**
 *
 * 없애는 것은 root의 `children`이므로(root 자체는 안 바꾼다) 세는 대상은 **그 트리
 * 안의 노드를 가리키는 코멘트**다. 그래서 둘이 빠진다:
 *
 * - **root를 가리키는 코멘트** — 그 노드는 적용 뒤에도 그대로 있다.
 * - **이미 고아인 코멘트**(가리키는 노드가 지금 문서에 없다) — 이 적용이 그 상태를
 *   바꾸지 않는다. *"이 조작이 무엇을 하는가"*를 말하는 문장에 넣으면 남 탓을 싣는 것이다.
 *
 * **페이지의 코멘트를 통째로 세면 실제보다 많다.**
 * 새 id는 적용마다 새로 발급되므로(설계서 「페이지 프리셋」) **놓인 뒤의 노드를 가리키는 옛 코멘트는 있을 수
 * 없다** — 즉 "없애는 노드를 가리킨다"가 곧 "적용 뒤 고아가 된다"이다.
 *
 * **문서를 못 읽었으면(`currentNodes === null`) `'document-unknown'`이다.** 무엇이
 * 없어지는지 모르는 채로 수를 말할 수 없다 — 0으로 접으면 *"고아가 없다"*는 거짓이 되고,
 * 코멘트 쪽 실패로 접으면 **읽은 것을 못 읽었다고** 말하게 된다.
 *
 * **`walkSafely`로 훑는다.** 검증 전 문서에는 노드가 아닌 원소가 있을 수 있고
 * (`edit/safe-walk.ts`), 이 컴포넌트는 오류 경계 밖이라 순회가 던지면 셸이 사라진다.
 */
function orphanedCount(
  commentNodes: string[] | null,
  currentNodes: readonly WbNode[] | null,
): OrphanCount {
  // **모르는 것이 둘이고 둘은 다른 말이다.** 둘을 `null` 하나로 접으면
  // **코멘트를 읽었는데도** *"코멘트 수를 읽지 못했습니다"*라고 말한다 — 화면이 사실과
  // 다른 것을 말하는 부류다. 코멘트 쪽을 먼저 보는 것은 **둘 다 모를 때** 그쪽이 더 앞선
  // 실패이기 때문이다(코멘트를 못 읽었으면 무엇을 세는지와 무관하게 셀 것이 없다).
  if (commentNodes === null) return { kind: 'comments-unknown' }
  if (currentNodes === null) return { kind: 'document-unknown' }

  const removed = new Set<string>()
  for (const node of currentNodes) {
    for (const visit of walkSafely(node)) {
      if (typeof visit.node.id === 'string') removed.add(visit.node.id)
    }
  }

  return { kind: 'counted', count: commentNodes.filter((nodeId) => removed.has(nodeId)).length }
}

/**
 * 덮기 전에 보이는 문장. **위에서 센 수를 싣는다.**
 *
 * 세 갈래인 것은 *"모른다"*가 *"없다"*와 다른 말이기 때문이다. 그리고 **코멘트가 지워지지
 * 않는다는 것을 함께 말한다** — 사용자가 *"코멘트도 날아간다"*고 오해하면 되돌릴 수 있는
 * 조작을 되돌릴 수 없는 것으로 읽는다.
 */
function overwriteNotice(orphaned: OrphanCount): string {
  const head = '이 페이지의 내용을 프리셋으로 통째로 바꿉니다. 되돌리기로 한 번에 되돌릴 수 있습니다.'
  switch (orphaned.kind) {
    case 'comments-unknown':
      return `${head} 코멘트 수를 읽지 못했습니다 — 가리키던 노드가 사라지는 코멘트가 있을 수 있습니다.`
    case 'document-unknown':
      // **코멘트는 읽었다.** 못 읽은 것은 문서 쪽이라고 그대로 말한다 — 그리고 코멘트가
      // 지워지지 않는다는 것은 이 갈래에서도 참이므로 함께 말한다.
      return `${head} 이 페이지의 구조를 읽지 못해 어떤 코멘트가 고아가 되는지 셀 수 없습니다. 코멘트 자체는 지워지지 않습니다.`
    case 'counted':
      return orphaned.count === 0
        ? `${head} 가리키던 노드가 사라지는 코멘트는 없습니다.`
        : `${head} 코멘트 ${orphaned.count}개는 지워지지 않지만 가리키던 노드가 사라집니다.`
  }
}
