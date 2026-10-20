/**
 * **«모듈로 저장…» 상자** — 구조 트리에서 고른 노드를 개인 모듈 · 프로젝트 모듈로 남긴다(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B3. 모듈」 · `2026-10-20-personal-modules-design.md` «저장»). 구조 트리 줄 `…` 의
 * «모듈로 저장…»이 연다(`./tree-row-actions.tsx` — 뿌리 줄에는 없다). 편집할 수 없는 판(viewer)의 트리에도 그 한 항목은 선다.
 *
 * **어디에 저장할지 상자 안에서 고른다** — «개인 모듈»(내가 여는 모든 프로젝트) · «프로젝트 모듈»(이 프로젝트의 멤버 모두). **기본값은 개인 모듈이다** —
 * 남에게 보이지 않는 쪽이라 고르지 않고 저장해도 아무에게도 새지 않는다. 프로젝트 쪽은 프로젝트 모듈을 쓸 수 있을 때(editor 이상)만 선다 —
 * viewer 에게는 고르기에 개인 하나뿐이다(서버도 막는다 — `POST …/modules` 의 editor 가드).
 *
 * | 담는 것 | 규칙 |
 * |---|---|
 * | 고른 노드들 | 문서 차례 · 조상과 자손을 함께 골랐으면 조상만(복사와 같은 정규화) · 뿌리는 뺀다 — `moduleSelection` |
 * | 걷는 것 | `marker` · 상태 보임(`visibility` — 모듈에는 상태가 없다) · 묶음 밖 노드를 겨냥하는 액션(`@wirebound/schema` 의 `moduleNodesForSave` — 서버도 같은 함수로 다시 걷는다). 뺀 액션 수를 상자가 말한다 |
 *
 * **담을 노드는 연 순간의 문서로 정한다** — 상자를 연 뒤 남이 그 노드를 고쳐도 담는 것은 연 순간의 모양이다(상자가 노드 수 · 뺀 수를 그 모양으로
 * 말했다). 저장은 문서를 바꾸지 않는 쓰기라 잠금 · 되돌리기와 무관하다.
 *
 * 이름은 1 ~ 60자(`MODULE_NAME_MAX` — 서버와 같은 값)이고 앞뒤 공백을 뗀다. 저장하면 상자를 닫고 하단 판 «모듈» 탭이 그 목록을 다시 읽는다
 * (`announceModulesChanged`). 서버가 거절하면(422 `nested-page` · 400) 그 문장을 상자 안에 세운다.
 *
 * **상자는 구조 트리의 키 상자 밖에 선다**(`shell/shell-dialog.tsx` 머리말 «상자 안의 키는 React 트리를 따라 버블된다» — 상자 단추의 키가 뒤 트리의 단축키로 버블되지 않게).
 */
import { useId, useState, type ReactElement } from 'react'
import { MODULE_NAME_MAX, moduleNodesForSave, type PageDocument, type WbNode } from '@wirebound/schema'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { walkSafely } from '../edit/safe-walk'
import { announceModulesChanged } from '../palette/module-tab'
import { ShellDialog } from '../shell/shell-dialog'
import { SAVE_MODULE_LABEL } from './tree-row-actions'

/**
 * 모듈에 담을 노드 — 고른 id 들을 문서 차례로, 조상이 함께 골린 노드는 빼고(조상이 담는다), 뿌리는 뺀다. 문서에 없는 id 는 건너뛴다.
 * 고른 것이 없거나 뿌리뿐이면 빈 목록이다.
 */
export function moduleSelection(document: PageDocument, selectedIds: readonly string[]): WbNode[] {
  const wanted = new Set(selectedIds)
  const rootId: unknown = document.root?.id
  const picked: WbNode[] = []
  const covered = new Set<string>()
  for (const visit of walkSafely(document.root)) {
    const { node, parent } = visit
    // 뿌리는 담지 않으므로 «조상이 담는다»의 조상이 되지 않는다 — 뿌리와 함께 준 노드는 남는다.
    if (parent !== null && parent.id !== rootId && (covered.has(parent.id) || wanted.has(parent.id))) covered.add(node.id)
    if (node.id === rootId || !wanted.has(node.id) || covered.has(node.id)) continue
    picked.push(node)
  }
  return picked
}

/** 담는 노드 수(자손까지)와 뺀 액션 수를 말하는 문장. */
export function saveModuleSentence(count: number, droppedActions: number): string {
  const head = `노드 ${count}개를 모듈로 저장합니다.`
  return droppedActions === 0 ? head : `${head} 모듈 밖을 가리키는 상호작용 동작 ${droppedActions}개는 빼고 저장합니다.`
}

/** 이름 칸의 까닭 — 맞으면 `undefined`. */
export function moduleNameWhy(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed === '') return '이름을 입력하세요'
  if (trimmed.length > MODULE_NAME_MAX) return `이름은 ${MODULE_NAME_MAX}자 이하여야 합니다`
  return undefined
}

/** 저장할 곳 — 개인 모듈 · 프로젝트 모듈. */
export type ModuleTarget = 'personal' | 'project'

const TARGET_LABEL: Record<ModuleTarget, string> = { personal: '개인 모듈', project: '프로젝트 모듈' }

/** 저장했다 — 정보 통지 자리의 한 줄. */
export function savedModuleNotice(name: string, to: ModuleTarget): string {
  return `${TARGET_LABEL[to]} '${name}'을(를) 저장했습니다. 하단 판의 «모듈» 탭에 섭니다.`
}

export function SaveModuleDialog(props: {
  projectId: string
  /** 연 순간에 고른 노드(`moduleSelection`). `null` 이면 닫혀 있다. */
  nodes: readonly WbNode[] | null
  /** 프로젝트 모듈을 쓸 수 있는가(editor 이상) — 아니면 고르기에 «개인 모듈» 하나다. */
  projectWritable: boolean
  onClose: () => void
  /** 저장했다 — 부르는 쪽이 통지를 세운다. */
  onSaved: (name: string, to: ModuleTarget) => void
}): ReactElement | null {
  if (props.nodes === null) return null
  return <OpenSaveModule {...props} nodes={props.nodes} />
}

function OpenSaveModule(props: {
  projectId: string
  nodes: readonly WbNode[]
  projectWritable: boolean
  onClose: () => void
  onSaved: (name: string, to: ModuleTarget) => void
}): ReactElement {
  const api = useApi()
  const sentenceId = useId()
  const inputId = useId()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [target, setTarget] = useState<ModuleTarget>('personal')
  /** 고른 곳 — 연 뒤 프로젝트 쪽을 잃었으면(강등) 개인으로 저장한다(고르기에서도 사라진다). */
  const to: ModuleTarget = props.projectWritable ? target : 'personal'
  const targets: ModuleTarget[] = props.projectWritable ? ['personal', 'project'] : ['personal']
  const [prepared] = useState(() => moduleNodesForSave(props.nodes))
  const count = prepared.nodes.reduce((sum, node) => sum + [...walkSafely(node)].length, 0)
  const why = moduleNameWhy(name)

  const save = (): void => {
    if (why !== undefined || pending) return
    const trimmed = name.trim()
    setPending(true)
    setFailure(null)
    const body = { name: trimmed, nodes: prepared.nodes }
    const saved = to === 'personal' ? api.createMyModule(body) : api.createModule(props.projectId, body)
    saved.then(
      () => {
        setPending(false)
        announceModulesChanged(to === 'personal' ? { kind: 'personal' } : { kind: 'project', projectId: props.projectId })
        props.onSaved(trimmed, to)
        props.onClose()
      },
      (caught: unknown) => {
        setPending(false)
        const read = toFailure(caught, '모듈을 저장하지 못했습니다. 다시 시도하세요.')
        setFailure(read.kind === 'message' ? read.message : '로그인이 필요합니다')
      },
    )
  }

  return (
    <ShellDialog open title={SAVE_MODULE_LABEL} onClose={props.onClose} describedBy={sentenceId}>
      <form
        className="wb-shell-module-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <p id={sentenceId} className="wb-shell-module-dialog-sentence">
          {saveModuleSentence(count, prepared.droppedActions)}
        </p>
        <fieldset className="wb-shell-module-dialog-targets" disabled={pending}>
          <legend className="wb-shell-module-dialog-label">저장할 곳</legend>
          {targets.map((entry) => (
            <label key={entry} className="wb-shell-module-dialog-target">
              <input type="radio" name={`${inputId}-target`} value={entry} checked={to === entry} onChange={() => setTarget(entry)} />
              {TARGET_LABEL[entry]}
            </label>
          ))}
        </fieldset>
        <label className="wb-shell-module-dialog-label" htmlFor={inputId}>
          모듈 이름
        </label>
        <input
          id={inputId}
          className="wb-shell-module-name-input wb-shell-module-dialog-input"
          value={name}
          autoFocus
          disabled={pending}
          aria-invalid={name !== '' && why !== undefined}
          aria-description={name === '' ? undefined : why}
          onChange={(event) => setName(event.target.value)}
        />
        {name !== '' && why !== undefined && <p className="wb-shell-module-dialog-why">{why}</p>}
        {failure !== null && (
          <p className="wb-shell-module-dialog-why" role="alert">
            {failure}
          </p>
        )}
        <div className="wb-shell-module-dialog-foot">
          <button type="button" className="wb-shell-module-text-action" onClick={props.onClose}>
            취소
          </button>
          <button type="submit" className="wb-shell-module-text-action" aria-disabled={why !== undefined || pending || undefined}>
            저장
          </button>
        </div>
      </form>
    </ShellDialog>
  )
}
