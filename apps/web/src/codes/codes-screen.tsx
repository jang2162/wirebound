/**
 * **공통코드 화면의 몸**(`routes/codes.tsx`) — 왼쪽 그룹 목록(이름 · 키 · 항목 수 · 사용 수), 오른쪽 고른 그룹의 항목 표(차례 · 코드값 · 이름 ·
 * 사용 여부 · 사용 수 · 줄 «…»)와 그 아래 사용처(페이지 › 노드 이름 — 누르면 에디터가 그 페이지를 열고 그 노드를 고른다).
 *
 * - **주소가 고른 것을 든다** — `?group=<키>`(없거나 모르는 키면 첫 그룹) · `?item=<코드값>`(사용처를 그 항목으로 좁힌다). 바꿀 때는 `replace`.
 * - **키 · 코드값은 만든 뒤 못 바꾼다**(서버가 받지 않는다) — 표의 코드값 칸은 글이고, 줄 «…» 에 «이름 바꾸기» 만 있다. 바꾸려면 새 항목을
 *   만들고 다시 묶는다(사용처 목록이 그 작업 목록이다).
 * - **쓰이는 그룹 · 항목을 지우면 묻는다** — 사용 수 · 첫 다섯 곳 · «참조가 끊깁니다». 안 쓰이면 묻지 않고 지운다.
 * - 쓰기가 끝나면(성공이든 실패든) 표와 사용 수를 다시 받는다(관리자 칸과 같은 까닭 — `admin/admin-screen.tsx` 머리말 «표 넷의 공통 꼴»).
 *   이 화면은 셸 밖이라 룸에 안 든다 — 남의 쓰기는 다시 받기 · 새로고침에 보인다.
 * - 꼴은 관리자 칸과 같다 — 목록 | 상세(`.wb-shell-admin-layout` — 창이 900px 아래면 목록이 위로) · 표(`.wb-shell-admin-table` — 좁으면 카드).
 *   사람 글(이름 · 페이지 제목)은 `isolate` 로 가둔다.
 */
import { useCallback, useId, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CODE_NAME_MAX, CODE_VALUE_MAX, type CodeGroup, type CodeItem, type UsageHit } from '@wirebound/schema'
import { useApi } from '../api/context'
import type { CodeUsageCounts } from '../api/client'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import { confirmClick, Outcome, useAdminList } from '../admin/admin-screen'
import { ActionMenu } from '../shell/action-menu'
import { ICONS, shellIcon } from '../shell/icons'
import { isolate } from '../shell/isolate'
import { ShellDialog } from '../shell/shell-dialog'

const LOAD_FAILURE = '공통코드 표를 불러오지 못했습니다'
const WRITE_FAILURE = '공통코드를 바꾸지 못했습니다'
const USAGE_FAILURE = '사용처를 불러오지 못했습니다'
export const NO_GROUPS = '만든 공통코드 그룹이 없습니다'
export const NO_ITEMS = '이 그룹에 항목이 없습니다'
export const NO_USAGE = '이 코드를 쓰는 노드가 없습니다'
/** 지우기 확인 상자가 보이는 사용처 수. */
export const DELETE_PREVIEW = 5
export const BREAKS_REFERENCES = '참조가 끊깁니다 — 그 노드는 묶을 때의 글과 끊김 표지로 남습니다.'

const KIND_TEXT: Record<UsageHit['kind'], string> = { page: '페이지', layout: '레이아웃', module: '모듈' }

interface Table {
  groups: CodeGroup[]
  counts: CodeUsageCounts
}

/** 지울 것 — 그룹이면 `item` 이 없다. */
interface DeleteTarget {
  group: CodeGroup
  item?: CodeItem
  uses: number
  hits: UsageHit[]
}

/** 이름 상자가 무엇을 만들거나 고치나. */
type NameTarget =
  | { kind: 'create-group' }
  | { kind: 'create-item'; group: CodeGroup }
  | { kind: 'rename-group'; group: CodeGroup }
  | { kind: 'rename-item'; group: CodeGroup; item: CodeItem }

/** 사용처 줄 — 페이지면 에디터로 가는 주소, 레이아웃 · 모듈은 에디터에서 그 노드를 여는 길이 없어 글만이다. */
export function usageHref(projectId: string, hit: UsageHit, nodeId: string): string | null {
  return hit.kind === 'page' ? `/projects/${projectId}/pages/${hit.id}?node=${encodeURIComponent(nodeId)}` : null
}

export function CodesScreen(props: { projectId: string; canEdit: boolean }): ReactElement {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [naming, setNaming] = useState<NameTarget | null>(null)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)

  const { list, stale, reload } = useAdminList<Table>(
    useCallback(async () => {
      const [groups, counts] = await Promise.all([api.listCodes(props.projectId), api.codeUsageCounts(props.projectId)])
      return { groups, counts }
    }, [api, props.projectId]),
    LOAD_FAILURE,
  )

  const groups = list.status === 'ready' ? list.value.groups : []
  const counts = list.status === 'ready' ? list.value.counts : {}
  const selected = groups.find((group) => group.key === params.get('group')) ?? groups[0]
  const itemValue = params.get('item')
  const selectedItem = selected?.items.find((item) => item.value === itemValue)

  function choose(group: string, item?: string): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('group', group)
        if (item === undefined) next.delete('item')
        else next.set('item', item)
        return next
      },
      { replace: true },
    )
  }

  /** 쓰기 하나 — 끝나면(실패여도) 표를 다시 받는다. */
  async function write(run: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true)
    setDone(null)
    setFailure(null)
    let ok = false
    try {
      await run()
      setDone(success)
      ok = true
    } catch (caught) {
      setFailure(toFailure(caught, WRITE_FAILURE))
    }
    await reload()
    setBusy(false)
    return ok
  }

  /**
   * 지우기 — **늘 사용처를 한 번 묻고**, 쓰이면 그 목록으로 확인을 받고 안 쓰이면 곧바로 지운다. 화면의 사용 수(`counts`)로 정하지 않는다 — 이
   * 화면은 룸에 안 들어 그 수가 연 때의 값이라, 연 뒤 다른 탭 · 다른 사람이 묶은 항목이 확인 없이 지워진다. 조회가 실패하면 지우지 않는다.
   */
  async function askDelete(group: CodeGroup, item?: CodeItem): Promise<void> {
    setBusy(true)
    let hits: UsageHit[]
    try {
      hits = await api.codeUsage(props.projectId, group.key, item?.value)
    } catch (caught) {
      setFailure(toFailure(caught, USAGE_FAILURE))
      setBusy(false)
      return
    }
    setBusy(false)
    const uses = hits.reduce((sum, hit) => sum + hit.nodes.length, 0)
    if (uses === 0) await remove(group, item)
    else setDeleting({ group, uses, hits, ...(item === undefined ? {} : { item }) })
  }

  async function remove(group: CodeGroup, item?: CodeItem): Promise<void> {
    setDeleting(null)
    if (item === undefined) {
      await write(() => api.deleteCodeGroup(props.projectId, group.key), `«${isolate(group.name)}» 그룹을 지웠습니다.`)
    } else {
      await write(() => api.deleteCodeItem(props.projectId, group.key, item.value), `«${isolate(item.name)}» 항목을 지웠습니다.`)
      if (itemValue === item.value) choose(group.key)
    }
  }

  function move(group: CodeGroup, by: -1 | 1, item?: CodeItem): void {
    if (item === undefined) {
      const at = groups.findIndex((entry) => entry.key === group.key)
      void write(
        () => api.updateCodeGroup(props.projectId, group.key, { sortOrder: at + by }),
        `«${isolate(group.name)}» 그룹을 옮겼습니다.`,
      )
    } else {
      const at = group.items.findIndex((entry) => entry.value === item.value)
      void write(
        () => api.updateCodeItem(props.projectId, group.key, item.value, { sortOrder: at + by }),
        `«${isolate(item.name)}» 항목을 옮겼습니다.`,
      )
    }
  }

  if (list.status === 'failed' && list.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  return (
    <>
      {props.canEdit && (
        <div className="wb-shell-admin-bar">
          <button className="wb-shell-project-submit" type="button" disabled={busy} onClick={() => setNaming({ kind: 'create-group' })}>
            {shellIcon('add', 14, 'wb-shell-icon-lead')}
            그룹 만들기
          </button>
        </div>
      )}
      <Outcome done={done} failure={failure?.kind === 'message' ? failure.message : null} stale={stale} />
      {list.status === 'loading' && (
        <p className="wb-shell-project-notice" role="status">
          불러오는 중…
        </p>
      )}
      {list.status === 'failed' && list.failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {list.failure.message}
        </p>
      )}
      {list.status === 'ready' && groups.length === 0 && <p className="wb-shell-project-notice">{NO_GROUPS}</p>}
      {list.status === 'ready' && selected !== undefined && (
        <div className="wb-shell-admin-layout wb-shell-codes-layout">
          <ul className="wb-shell-admin-list" aria-label="공통코드 그룹">
            {groups.map((group) => (
              <li className="wb-shell-admin-list-item" key={group.key}>
                <button
                  className="wb-shell-admin-pick"
                  type="button"
                  aria-current={group.key === selected.key ? 'true' : undefined}
                  onClick={() => choose(group.key)}
                >
                  <span className="wb-shell-admin-pick-name">{isolate(group.name)}</span>
                  <span className="wb-shell-admin-pick-meta">{`${group.key} · 항목 ${group.items.length} · 사용 ${counts[group.key]?.group ?? 0}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <section className="wb-shell-codes-group" aria-label={`그룹 ${selected.name}`}>
            <div className="wb-shell-admin-bar">
              <h2 className="wb-shell-codes-title">{isolate(selected.name)}</h2>
              <span className="wb-shell-codes-key">{selected.key}</span>
              {props.canEdit && (
                <div className="wb-shell-admin-bar-end">
                  <button
                    className="wb-shell-project-action"
                    type="button"
                    disabled={busy}
                    onClick={() => setNaming({ kind: 'create-item', group: selected })}
                  >
                    {shellIcon('add', 14, 'wb-shell-icon-lead')}
                    항목 추가
                  </button>
                  <ActionMenu
                    size="sm"
                    label={`«${selected.name}» 그룹 더 보기`}
                    items={[
                      {
                        key: 'rename',
                        label: '이름 바꾸기',
                        icon: ICONS.rename,
                        onSelect: () => setNaming({ kind: 'rename-group', group: selected }),
                      },
                      {
                        key: 'up',
                        label: '위로',
                        icon: ICONS.moveUp,
                        disabled: groups[0]?.key === selected.key,
                        onSelect: () => move(selected, -1),
                      },
                      {
                        key: 'down',
                        label: '아래로',
                        icon: ICONS.moveDown,
                        disabled: groups.at(-1)?.key === selected.key,
                        onSelect: () => move(selected, 1),
                      },
                      { key: 'delete', label: '삭제', icon: ICONS.remove, danger: true, onSelect: () => void askDelete(selected) },
                    ]}
                  />
                </div>
              )}
            </div>
            {selected.items.length === 0 ? (
              <p className="wb-shell-project-notice">{NO_ITEMS}</p>
            ) : (
              <table className="wb-shell-admin-table" aria-label="공통코드 항목">
                <thead className="wb-shell-admin-head">
                  <tr className="wb-shell-admin-head-row">
                    {['차례', '코드값', '이름', '사용 여부', '사용 수'].map((label) => (
                      <th className="wb-shell-admin-th" scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                    <th className="wb-shell-admin-th" scope="col">
                      <span className="wb-shell-admin-sr">행동</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="wb-shell-admin-body">
                  {selected.items.map((item, index) => (
                    <tr
                      className="wb-shell-admin-row"
                      key={item.value}
                      data-active={item.active ? 'true' : 'false'}
                      aria-current={item.value === selectedItem?.value ? 'true' : undefined}
                    >
                      <td className="wb-shell-admin-cell" data-label="차례">
                        {index + 1}
                      </td>
                      <td className="wb-shell-admin-cell wb-shell-admin-cell-email" data-label="코드값">
                        {item.value}
                      </td>
                      <td className="wb-shell-admin-cell wb-shell-admin-cell-name" data-label="이름">
                        {isolate(item.name)}
                      </td>
                      <td className="wb-shell-admin-cell" data-label="사용 여부">
                        {item.active ? '사용' : '사용 안 함'}
                      </td>
                      <td className="wb-shell-admin-cell" data-label="사용 수">
                        <button className="wb-shell-codes-uses" type="button" onClick={() => choose(selected.key, item.value)}>
                          {`${counts[selected.key]?.items[item.value] ?? 0}곳`}
                        </button>
                      </td>
                      <td className="wb-shell-admin-cell wb-shell-admin-cell-menu">
                        {props.canEdit && (
                          <ActionMenu
                            size="sm"
                            label={`«${item.name}» 더 보기`}
                            items={[
                              {
                                key: 'rename',
                                label: '이름 바꾸기',
                                icon: ICONS.rename,
                                onSelect: () => setNaming({ kind: 'rename-item', group: selected, item }),
                              },
                              {
                                key: 'active',
                                label: item.active ? '사용 안 함으로' : '사용으로',
                                onSelect: () =>
                                  void write(
                                    () => api.updateCodeItem(props.projectId, selected.key, item.value, { active: !item.active }),
                                    `«${isolate(item.name)}» — ${item.active ? '사용 안 함' : '사용'}으로 바꿨습니다.`,
                                  ),
                              },
                              {
                                key: 'up',
                                label: '위로',
                                icon: ICONS.moveUp,
                                disabled: index === 0,
                                onSelect: () => move(selected, -1, item),
                              },
                              {
                                key: 'down',
                                label: '아래로',
                                icon: ICONS.moveDown,
                                disabled: index === selected.items.length - 1,
                                onSelect: () => move(selected, 1, item),
                              },
                              {
                                key: 'delete',
                                label: '삭제',
                                icon: ICONS.remove,
                                danger: true,
                                onSelect: () => void askDelete(selected, item),
                              },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <UsageList
              key={`${selected.key}\n${selectedItem?.value ?? ''}`}
              projectId={props.projectId}
              group={selected}
              item={selectedItem}
              revision={list.value}
              onAll={() => choose(selected.key)}
            />
          </section>
        </div>
      )}

      {naming !== null && (
        <NameDialog
          target={naming}
          busy={busy}
          problem={failure?.kind === 'message' ? failure.message : null}
          onClose={() => {
            setNaming(null)
            setFailure(null)
          }}
          onSubmit={async (key, name) => {
            const target = naming
            const ok = await write(
              async () => {
                if (target.kind === 'create-group') await api.createCodeGroup(props.projectId, { key, name })
                else if (target.kind === 'create-item') await api.createCodeItem(props.projectId, target.group.key, { value: key, name })
                else if (target.kind === 'rename-group') await api.updateCodeGroup(props.projectId, target.group.key, { name })
                else await api.updateCodeItem(props.projectId, target.group.key, target.item.value, { name })
              },
              `«${isolate(name)}» — 저장했습니다.`,
            )
            if (!ok) return
            setNaming(null)
            if (target.kind === 'create-group') choose(key)
          }}
        />
      )}

      <ShellDialog
        open={deleting !== null}
        title={deleting?.item === undefined ? '공통코드 그룹 삭제' : '공통코드 항목 삭제'}
        onClose={() => setDeleting(null)}
      >
        {deleting !== null && (
          <div className="wb-shell-admin-dialog-body">
            <p className="wb-shell-admin-dialog-sentence">
              {`«${isolate(deleting.item?.name ?? deleting.group.name)}» 을(를) ${deleting.uses}곳에서 씁니다. ${BREAKS_REFERENCES}`}
            </p>
            <ul className="wb-shell-codes-usage" aria-label="지우면 끊길 곳">
              {deleting.hits
                .flatMap((hit) => hit.nodes.map((node) => ({ hit, node })))
                .slice(0, DELETE_PREVIEW)
                .map(({ hit, node }) => (
                  <li
                    className="wb-shell-codes-usage-item"
                    key={`${hit.id}\n${node.nodeId}`}
                  >{`${KIND_TEXT[hit.kind]} ${isolate(hit.title)} › ${isolate(node.name)}`}</li>
                ))}
            </ul>
            <div className="wb-shell-admin-dialog-foot">
              <button className="wb-shell-project-action" type="button" onClick={() => setDeleting(null)}>
                취소
              </button>
              <button
                className="wb-shell-project-danger"
                type="button"
                disabled={busy}
                onClick={confirmClick(() => void remove(deleting.group, deleting.item))}
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </ShellDialog>
    </>
  )
}

/** 고른 그룹(· 항목)의 사용처. 표가 바뀔 때마다(`revision`) 다시 읽는다. */
function UsageList(props: {
  projectId: string
  group: CodeGroup
  item: CodeItem | undefined
  revision: unknown
  onAll: () => void
}): ReactElement {
  const api = useApi()
  const { group, item, projectId, revision } = props
  const { list } = useAdminList<UsageHit[]>(
    // `revision` 은 다시 읽을 때를 알릴 뿐이다 — 표를 다시 받으면 새 객체다.
    useCallback(() => api.codeUsage(projectId, group.key, item?.value), [api, projectId, group.key, item?.value, revision]),
    USAGE_FAILURE,
  )
  const title = item === undefined ? `«${isolate(group.name)}» 을(를) 쓰는 곳` : `«${isolate(item.name)}» 을(를) 쓰는 곳`
  return (
    <section className="wb-shell-codes-group" aria-label="사용처">
      <div className="wb-shell-admin-bar">
        <h3 className="wb-shell-codes-subtitle">{title}</h3>
        {item !== undefined && (
          <button className="wb-shell-project-action" type="button" onClick={props.onAll}>
            그룹 전체 보기
          </button>
        )}
      </div>
      {list.status === 'loading' && (
        <p className="wb-shell-project-notice" role="status">
          불러오는 중…
        </p>
      )}
      {list.status === 'failed' && list.failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {list.failure.message}
        </p>
      )}
      {list.status === 'ready' && list.value.length === 0 && <p className="wb-shell-project-notice">{NO_USAGE}</p>}
      {list.status === 'ready' && list.value.length > 0 && (
        <ul className="wb-shell-codes-usage" aria-label="사용처 목록">
          {list.value.flatMap((hit) =>
            hit.nodes.map((node) => {
              const href = usageHref(projectId, hit, node.nodeId)
              const text = `${KIND_TEXT[hit.kind]} ${isolate(hit.title)} › ${isolate(node.name)}`
              return (
                <li className="wb-shell-codes-usage-item" key={`${hit.kind}\n${hit.id}\n${node.nodeId}`}>
                  {href === null ? (
                    text
                  ) : (
                    <Link className="wb-shell-codes-usage-link" to={href}>
                      {text}
                    </Link>
                  )}
                </li>
              )
            }),
          )}
        </ul>
      )}
    </section>
  )
}

/** 만들기 · 이름 바꾸기 상자. 만들기는 키(코드값)와 이름, 바꾸기는 이름만 — 키는 만든 뒤 못 바꾼다. */
function NameDialog(props: {
  target: NameTarget
  busy: boolean
  /** 앞 저장이 거절된 문장 — 상자가 뒤 화면을 막아 상자 안에 보인다. */
  problem: string | null
  onClose: () => void
  onSubmit: (key: string, name: string) => Promise<void>
}): ReactElement {
  const { target } = props
  const creates = target.kind === 'create-group' || target.kind === 'create-item'
  const keyLabel = target.kind === 'create-group' ? '그룹 키(대문자 · 숫자 · 밑줄)' : '코드값'
  const [key, setKey] = useState('')
  const [name, setName] = useState(
    target.kind === 'rename-group' ? target.group.name : target.kind === 'rename-item' ? target.item.name : '',
  )
  const ids = { key: useId(), name: useId() }
  const title =
    target.kind === 'create-group'
      ? '공통코드 그룹 만들기'
      : target.kind === 'create-item'
        ? `«${isolate(target.group.name)}» 에 항목 추가`
        : '이름 바꾸기'
  return (
    <ShellDialog open title={title} onClose={props.onClose}>
      <form
        className="wb-shell-admin-dialog-body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void props.onSubmit(key.trim(), name.trim())
        }}
      >
        {creates && (
          <>
            <label className="wb-shell-settings-label" htmlFor={ids.key}>
              {keyLabel}
            </label>
            <input
              className="wb-shell-settings-input"
              id={ids.key}
              type="text"
              value={key}
              maxLength={CODE_VALUE_MAX}
              disabled={props.busy}
              onChange={(event) => setKey(event.target.value)}
            />
          </>
        )}
        <label className="wb-shell-settings-label" htmlFor={ids.name}>
          이름
        </label>
        <input
          className="wb-shell-settings-input"
          id={ids.name}
          type="text"
          value={name}
          maxLength={CODE_NAME_MAX}
          disabled={props.busy}
          onChange={(event) => setName(event.target.value)}
        />
        {props.problem !== null && (
          <p className="wb-shell-project-alert" role="alert">
            {props.problem}
          </p>
        )}
        <div className="wb-shell-admin-dialog-foot">
          <button className="wb-shell-project-action" type="button" onClick={props.onClose}>
            취소
          </button>
          <button className="wb-shell-project-submit" type="submit" disabled={props.busy}>
            {creates ? '만들기' : '저장'}
          </button>
        </div>
      </form>
    </ShellDialog>
  )
}
