/**
 * **액션 그룹.** `Button`·`Link`.
 *
 * 카탈로그의 `component/catalog/action.ts`와 같은 경계다(P4b-2 D2). 등록(`ACTION_ENTRIES`)과
 * 기본 CSS(`actionCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import type { StructureEntry, StructureRenderer } from './registry'

export const ButtonSolid: StructureRenderer = ({ attrs, props, part }) => (
  <button {...attrs} type="button" disabled={props.disabled === true}>
    <span {...part('label')}>{String(props.label)}</span>
  </button>
)

export const LinkDefault: StructureRenderer = ({ attrs, props }) => (
  <a {...attrs} href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </a>
)

/** 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다(파일 끝에 둔다 — TDZ). */
export const ACTION_ENTRIES: StructureEntry[] = [
  ['Button', 'solid', ButtonSolid],
  ['Link', 'default', LinkDefault],
]
