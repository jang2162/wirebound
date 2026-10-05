/**
 * **좌측 · 우측을 접고 펴는 머리의 토글**(`shell/sidebar-layout.ts` 머리말 «둘 다 최소인데도 캔버스 몫이 모자라면 사람이 접는다»). 좌측 토글은
 * 머리 왼쪽 끝, 우측 토글은 오른쪽 끝(`…` 앞)에 선다 — 접는 쪽과 같은 편이다.
 *
 * **이름이 하는 일을 말한다**(«좌측 패널 접기» · «좌측 패널 펴기»)이고 `aria-expanded` 가 지금 상태다 — 아이콘만의 단추라 이름 · `title` 이
 * 같은 글이다(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»). `aria-controls` 는 접히는 상자를 가리킨다 — 접혀도 그 상자는 DOM 에
 * 남는다(`display: none`).
 */
import type { ReactElement } from 'react'
import { shellIcon } from './icons'

export function PanelFoldToggle(props: {
  side: 'side' | 'panel'
  folded: boolean
  /** 접히는 상자의 id. */
  controls: string
  onToggle: () => void
}): ReactElement {
  const label = `${props.side === 'side' ? '좌측' : '우측'} 패널 ${props.folded ? '펴기' : '접기'}`
  return (
    <button
      type="button"
      className="wb-shell-fold-toggle"
      aria-label={label}
      title={label}
      aria-expanded={!props.folded}
      aria-controls={props.controls}
      onClick={props.onToggle}
    >
      {shellIcon(props.side === 'side' ? 'foldSide' : 'foldPanel', 16)}
    </button>
  )
}
