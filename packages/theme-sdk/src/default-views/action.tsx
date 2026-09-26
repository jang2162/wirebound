/** **액션 그룹 기본 뷰.** `Button`·`Link`. 옮긴 규칙은 `./index.ts` 머리말. */
import { view } from '../define'
import { Root } from '../root'

export const ButtonView = view(({ props }) => (
  <Root as="button" data-wb-structure="solid" type="button" disabled={props.disabled === true}>
    <span data-wb-part="label">{String(props.label)}</span>
  </Root>
))

export const LinkView = view(({ props }) => (
  <Root as="a" data-wb-structure="default" href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </Root>
))

/** 이 그룹의 기본 CSS. 비어 있다 — 값을 나르는 노드 변수가 없다. */
export function actionCssBlocks(): string[] {
  return []
}
