/**
 * **속성 패널의 «공통코드» 칸**(정본 설계서 「설계서 화면 구조」의 속성 패널) — 묶이는 타입(`ComponentDef.code`)에만 선다.
 *
 * | 노드 | 칸 |
 * |---|---|
 * | 안 묶임 | «공통코드로 묶기» → 그룹 고르기(대표 글이면 항목도) → «묶기» |
 * | 대표 글 · 묶임 | «공통코드: 그룹 › 항목 · 풀기» · «이 코드를 쓰는 곳 N»(공통코드 화면의 그 항목으로) |
 * | 선택 위젯 · 묶임 | 카드 하나 — «공통코드: 그룹» · 키 · 항목 수 · 항목 칩(고른 것 강조) · 하나 고르는 타입은 «고른 값» 셀렉트, 여럿은 칩이 켜고 끄는 단추 · «풀기» · «이 코드를 쓰는 곳 N» · 고른 값이 표에 없으면 그 한 줄. 선택지 칸은 숨는다(목록이 한 번만 선다) |
 * | 끊김 | «끊긴 공통코드: 키 › 값 · 다시 묶기 · 풀기» |
 *
 * 묶인 동안 그 prop 칸은 잠긴다 — 속성 패널(`./property-panel.tsx`)이 `codeLockedProp` 로 끈다. 선택 위젯의 선택지 칸은 표를 읽었고 끊기지 않은 동안 아예
 * 숨는다(`codeHiddenProp` — 같은 목록이 두 번 서지 않게). 편집은 `edit/code-ops.ts` 의 셋이고
 * 고칠 수 없는 판(역할 · 남의 잠금)은 패널의 `blocked` 를 그대로 받는다. 표는 셸의 것(`codes/project-codes.tsx`)이다 — 표를 못 읽었으면 묶을 수 없다고만
 * 말한다(무엇이 끊겼는지 모른다).
 */
import { useEffect, useId, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import {
  codeBindingOf,
  getComponent,
  isCodeBroken,
  picksOneChoice,
  resolveChoices,
  resolveLabel,
  type CodeBinding,
  type CodeIndex,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { useApi } from '../api/context'
import { useProjectCodes } from '../codes/project-codes'
import { bindCodeOps, pickCodeOps, unbindCodeOps } from '../edit/code-ops'
import { isolate } from '../shell/isolate'
import { shellIcon } from '../shell/icons'

export const CODES_UNAVAILABLE = '공통코드 표를 읽지 못해 묶을 수 없습니다'
export const NO_CODE_GROUPS = '이 프로젝트에 공통코드 그룹이 없습니다 — 공통코드 화면에서 만드세요'

/** 묶인 동안 잠기는 prop — 대표 글 prop 이나 `options`. 안 묶였거나 받지 않는 타입이면 `null`. */
export function codeLockedProp(node: WbNode): string | null {
  if (node.code === undefined) return null
  const binding = codeBindingOf(node.type)
  if (binding === null) return null
  return binding.kind === 'label' ? binding.prop : 'options'
}

/**
 * 묶인 동안 **숨기는** prop — 선택 위젯(`choices`)의 `options` 는 표를 읽었고 참조가 안 끊긴 동안 카드의 칩이 같은 목록이라 숨긴다. 끊겼거나 표를
 * 못 읽었으면 잠긴 목록(대체 글)이 무엇이 들어 있었는지 말하는 유일한 자리라 남긴다.
 */
export function codeHiddenProp(node: WbNode, index: CodeIndex | undefined): string | null {
  if (node.code === undefined || index === undefined || codeBindingOf(node.type)?.kind !== 'choices') return null
  return isCodeBroken(node, index) ? null : 'options'
}

export function CodeBindingField(props: {
  projectId: string
  document: PageDocument
  node: WbNode
  disabled: boolean
  commit: (ops: PatchOp[]) => void
}): ReactElement | null {
  const { node } = props
  const binding = codeBindingOf(node.type)
  const codes = useProjectCodes()
  const [choosing, setChoosing] = useState(false)
  const ids = { label: useId(), pick: useId() }
  if (binding === null) return null

  const ref = node.code
  // 묶이지 않은 노드는 표에 그룹이 있을 때만 칸이 선다 — 공통코드를 안 쓰는 프로젝트의 패널에 빈 단추를 세우지 않는다.
  if (ref === undefined && (codes.table === null || codes.table.length === 0)) return null
  const index = codes.index
  const body = (() => {
    if (index === undefined || codes.table === null) {
      return (
        <>
          {ref !== undefined && <p className="wb-shell-code-line">{refText(ref.group, ref.item)}</p>}
          <p className="wb-shell-panel-notice">{CODES_UNAVAILABLE}</p>
        </>
      )
    }
    if (choosing || ref === undefined) {
      return choosing ? (
        <CodeChooser
          binding={binding}
          groups={codes.table}
          onCancel={() => setChoosing(false)}
          onChoose={(group, item) => {
            const ops = bindCodeOps(props.document, node.id, index, group, item)
            if (ops !== null) props.commit(ops)
            setChoosing(false)
          }}
        />
      ) : (
        <button
          className="wb-shell-project-action"
          type="button"
          disabled={props.disabled || codes.table.length === 0}
          onClick={() => setChoosing(true)}
        >
          {shellIcon('bindCode', 14, 'wb-shell-icon-lead')}
          공통코드로 묶기
        </button>
      )
    }
    const unbind = (
      <button
        className="wb-shell-project-action"
        type="button"
        disabled={props.disabled}
        onClick={() => {
          const ops = unbindCodeOps(props.document, node.id, index)
          if (ops !== null) props.commit(ops)
        }}
      >
        {shellIcon('unbindCode', 14, 'wb-shell-icon-lead')}
        풀기
      </button>
    )
    if (isCodeBroken(node, index)) {
      return (
        <>
          <p className="wb-shell-code-line wb-shell-code-broken" role="status">
            {`끊긴 공통코드: ${ref.group}${ref.item === undefined ? '' : ` › ${ref.item}`}`}
          </p>
          <div className="wb-shell-code-actions">
            <button className="wb-shell-project-action" type="button" disabled={props.disabled} onClick={() => setChoosing(true)}>
              다시 묶기
            </button>
            {unbind}
          </div>
        </>
      )
    }
    const group = index.get(ref.group)!
    if (binding.kind === 'label') {
      const label = resolveLabel(index, ref)!
      return (
        <>
          <p className="wb-shell-code-line">{`공통코드: ${isolate(group.name)} › ${isolate(label.name)}${label.inactive ? ' (사용 안 함)' : ''}`}</p>
          <div className="wb-shell-code-actions">
            {unbind}
            <UsageLink projectId={props.projectId} group={ref.group} item={ref.item!} />
          </div>
        </>
      )
    }
    const def = getComponent(node.type)
    const one = def !== undefined && picksOneChoice(def)
    const choices = resolveChoices(index, ref)
    const selected = new Set(ref.selected ?? [])
    const pick = (next: string[]): void => {
      const ops = pickCodeOps(props.document, node.id, index, next)
      if (ops !== null) props.commit(ops)
    }
    const picked = choices.items.filter((item) => selected.has(item.value))
    return (
      <div className="wb-shell-code-card">
        {/* 머리 — 그룹 이름 · 키 · 항목 수. 목록은 아래 칩 한 줄에만 선다(선택지 칸은 묶인 동안 숨는다 — `./property-panel.tsx`). */}
        <p className="wb-shell-code-line">
          {`공통코드: ${isolate(group.name)}`}
          <span className="wb-shell-code-card-key">{ref.group}</span>
          <span className="wb-shell-code-card-count">{`${choices.items.length}개`}</span>
        </p>
        {one ? (
          <>
            <ul className="wb-shell-code-chips" aria-label="표의 항목">
              {choices.items.map((item) => (
                <li
                  key={item.value}
                  className={selected.has(item.value) ? 'wb-shell-code-chip wb-shell-code-chip-on' : 'wb-shell-code-chip'}
                  {...(selected.has(item.value) ? { 'aria-current': 'true' as const } : {})}
                >
                  {isolate(item.name)}
                </li>
              ))}
            </ul>
            <div className="wb-shell-code-pick-one">
              <label className="wb-shell-prop-label" htmlFor={ids.pick}>
                고른 값
              </label>
              <select
                id={ids.pick}
                className="wb-shell-control"
                value={picked[0]?.value ?? ''}
                disabled={props.disabled}
                onChange={(event) => pick(event.target.value === '' ? [] : [event.target.value])}
              >
                <option value="">— 없음 —</option>
                {choices.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          // 여럿을 고르는 타입(체크박스 무리)은 칩이 곧 켜고 끄는 단추다 — 목록이 한 번만 선다.
          <div className="wb-shell-code-chips" role="group" aria-label="고른 값">
            {choices.items.map((item) => (
              <button
                key={item.value}
                type="button"
                className={selected.has(item.value) ? 'wb-shell-code-chip wb-shell-code-chip-on' : 'wb-shell-code-chip'}
                aria-pressed={selected.has(item.value)}
                disabled={props.disabled}
                onClick={() =>
                  pick(selected.has(item.value) ? [...selected].filter((value) => value !== item.value) : [...selected, item.value])
                }
              >
                {isolate(item.name)}
              </button>
            ))}
          </div>
        )}
        {choices.items.length === 0 && <p className="wb-shell-panel-notice">사용 중인 항목이 없습니다</p>}
        <div className="wb-shell-code-actions">
          {unbind}
          <UsageLink projectId={props.projectId} group={ref.group} />
        </div>
        {choices.brokenSelected.length > 0 && (
          <p className="wb-shell-code-line wb-shell-code-broken">{`고른 값이 표에 없거나 사용 안 함: ${choices.brokenSelected.join(', ')}`}</p>
        )}
        {choices.truncated && <p className="wb-shell-panel-notice">사용 중 항목이 30개를 넘어 앞 30개만 그립니다</p>}
      </div>
    )
  })()

  return (
    <div className="wb-shell-prop" data-wb-code-field="">
      <dt className="wb-shell-prop-label">공통코드</dt>
      <dd className="wb-shell-prop-value wb-shell-code-field">{body}</dd>
    </div>
  )
}

function refText(group: string, item: string | undefined): string {
  return `공통코드: ${group}${item === undefined ? '' : ` › ${item}`}`
}

/** «이 코드를 쓰는 곳 N» — 공통코드 화면의 그 그룹(· 항목)으로. 수는 서버가 센다(못 읽으면 수 없이 링크만). */
function UsageLink(props: { projectId: string; group: string; item?: string }): ReactElement {
  const api = useApi()
  const [count, setCount] = useState<number | null>(null)
  const { projectId, group, item } = props
  useEffect(() => {
    let alive = true
    api.codeUsageCounts(projectId).then(
      (counts) => {
        if (!alive) return
        const entry = counts[group]
        setCount(item === undefined ? (entry?.group ?? 0) : (entry?.items[item] ?? 0))
      },
      () => {
        if (alive) setCount(null)
      },
    )
    return () => {
      alive = false
    }
  }, [api, projectId, group, item])
  const query = new URLSearchParams({ group, ...(item === undefined ? {} : { item }) })
  return (
    <Link className="wb-shell-code-usage" to={`/projects/${projectId}/codes?${query}`}>
      {count === null ? '이 코드를 쓰는 곳' : `이 코드를 쓰는 곳 ${count}`}
    </Link>
  )
}

/** 그룹(· 항목) 고르기 — 표에 있는 것만 고른다. */
function CodeChooser(props: {
  binding: CodeBinding
  groups: readonly { key: string; name: string; items: readonly { value: string; name: string; active: boolean }[] }[]
  onChoose: (group: string, item?: string) => void
  onCancel: () => void
}): ReactElement {
  const [group, setGroup] = useState(props.groups[0]?.key ?? '')
  const items = props.groups.find((entry) => entry.key === group)?.items ?? []
  const [item, setItem] = useState(items[0]?.value ?? '')
  const ids = { group: useId(), item: useId() }
  const needsItem = props.binding.kind === 'label'
  if (props.groups.length === 0) return <p className="wb-shell-panel-notice">{NO_CODE_GROUPS}</p>
  return (
    <div className="wb-shell-code-chooser">
      <label className="wb-shell-prop-label" htmlFor={ids.group}>
        그룹
      </label>
      <select
        id={ids.group}
        value={group}
        onChange={(event) => {
          setGroup(event.target.value)
          setItem(props.groups.find((entry) => entry.key === event.target.value)?.items[0]?.value ?? '')
        }}
      >
        {props.groups.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {`${entry.name} (${entry.key})`}
          </option>
        ))}
      </select>
      {needsItem && (
        <>
          <label className="wb-shell-prop-label" htmlFor={ids.item}>
            항목
          </label>
          <select id={ids.item} value={item} onChange={(event) => setItem(event.target.value)}>
            {items.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {`${entry.name}${entry.active ? '' : ' (사용 안 함)'}`}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="wb-shell-code-actions">
        <button
          className="wb-shell-project-submit"
          type="button"
          disabled={group === '' || (needsItem && item === '')}
          onClick={() => props.onChoose(group, needsItem ? item : undefined)}
        >
          묶기
        </button>
        <button className="wb-shell-project-action" type="button" onClick={props.onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}
