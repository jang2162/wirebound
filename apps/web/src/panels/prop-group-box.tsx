/**
 * **속성 칸의 묶음 상자**(`./prop-groups.ts` 의 넷) — 머리 단추 하나(`aria-expanded`)로 접고 편다. 빈 묶음은 안 선다.
 *
 * **접힘은 묶음 이름으로 기억한다** — 노드를 바꿔 골라도 «상태» 를 접어 둔 사람에게는 다음 노드의 «상태» 도 접혀 있다. 기억은 셸이 사는 동안이다:
 * 우측 패널(`routes/editor.tsx` 의 `RightPanel`)이 `PropGroupFoldsProvider` 로 들어 탭 · 모드를 오가도 남고(탭 본문은 탭을 옮기면 내려간다), 셸이
 * 내려가면 버린다 — 브라우저 저장소에 두지 않는다(묶음 넷의 접힘은 다음 날까지 들 까닭이 없고, 칸을 찾다 헤매게 하는 숨김이 남는다).
 *
 * 접힌 몸통은 `hidden` 이라 칸이 DOM 에 남는다 — 쓰던 칸의 초안 · 포커스를 접기가 지우지 않는다(위젯이 내려가면 초안은 `useLeftoverCommit` 길로 간다).
 */
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'
import { PROP_GROUPS, type PropGroup } from './prop-groups'

type Folds = readonly [ReadonlySet<PropGroup>, (group: PropGroup) => void]
const FoldsContext = createContext<Folds | null>(null)

function useFolds(): Folds {
  const [folded, setFolded] = useState<ReadonlySet<PropGroup>>(() => new Set())
  return [
    folded,
    (group) =>
      setFolded((prev) => {
        const next = new Set(prev)
        if (next.has(group)) next.delete(group)
        else next.add(group)
        return next
      }),
  ]
}

/** 묶음 접힘 — 우측 패널이 셸 동안 든다(머리말). */
export function PropGroupFoldsProvider(props: { children: ReactNode }): ReactElement {
  return <FoldsContext.Provider value={useFolds()}>{props.children}</FoldsContext.Provider>
}

/** 묶음마다의 줄. `null` 은 그 자리에 안 서는 줄이다. */
export function PropGroups(props: { rows: Record<PropGroup, readonly (ReactElement | null)[]> }): ReactElement {
  const shared = useContext(FoldsContext)
  const local = useFolds()
  const [folded, toggle] = shared ?? local
  return (
    <>
      {PROP_GROUPS.map((group) => {
        const rows = props.rows[group.id].filter((row): row is ReactElement => row !== null)
        if (rows.length === 0) return null
        const open = !folded.has(group.id)
        const bodyId = `wb-prop-group-${group.id}`
        return (
          <div className="wb-shell-prop-group" key={group.id} data-wb-prop-group={group.id}>
            <button
              type="button"
              className="wb-shell-prop-group-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => toggle(group.id)}
            >
              {group.label}
            </button>
            <dl className="wb-shell-props" id={bodyId} hidden={!open}>
              {rows}
            </dl>
          </div>
        )
      })}
    </>
  )
}
