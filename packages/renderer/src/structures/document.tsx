/**
 * **문서 그룹.** `Text`·`Media`·`Divider`·`Placeholder`.
 *
 * 카탈로그의 `component/catalog/document.ts`와 같은 경계다(P4b-2 D2).
 * 등록(`DOCUMENT_ENTRIES`)과 기본 CSS(`documentCssBlocks`)를 이 파일이 소유한다.
 * 공용 도구는 `../structure-css-tools`에 있다 — 복사해 오지 마라.
 */
import { createElement, type CSSProperties } from 'react'
import { componentRule, nodeVar, partRule } from '../structure-css-tools'
import type { StructureEntry, StructureRenderer } from './registry'

const ROLE_TAG: Record<string, string> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'p',
  caption: 'small',
}

// `data-wb-role`은 없어졌다 — `role`이 `variantFrom`으로 `data-wb-variant`가 된다(P0 이월 #8).
// **`ROLE_TAG`는 그대로 둔다.** 태그를 바꾸는 것은 접근성과 문서 구조의 문제이지
// 스타일 채널이 아니다 — `<h1>`이 `<p>`가 되면 개요(outline)가 달라진다.
export const TextDefault: StructureRenderer = ({ attrs, props }) =>
  createElement(ROLE_TAG[props.role as string] ?? 'p', attrs, String(props.content))

export const MediaImage: StructureRenderer = ({ attrs, props, part }) => (
  <figure {...attrs}>
    <div
      {...part('frame')}
      style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}
    />
    {props.caption ? <figcaption {...part('caption')}>{String(props.caption)}</figcaption> : null}
  </figure>
)

// `data-direction`은 없어졌다 — `direction`이 `data-wb-variant`로 나간다.
export const DividerDefault: StructureRenderer = ({ attrs }) => <hr {...attrs} />

export const PlaceholderDefault: StructureRenderer = ({ attrs, props }) => (
  // 길이 단위를 여기서 붙인다. 기본 CSS가 `calc(var(…) * 1px)`로 붙이면 그 곱셈이
  // 테마가 값을 덮을 때도 남아, `height: 300px`을 준 테마가 `300px * 1px`이라는 무효한
  // 값을 만든다 — 통로는 CSS에 그대로 실을 수 있는 값을 날라야 한다.
  <div
    {...attrs}
    style={{ [nodeVar('placeholder', 'height')]: `${props.height as number}px` } as CSSProperties}
  >
    {String(props.label)}
  </div>
)

/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. 규칙을 더하면 여기에 `blocks.push(…)`를 더한다.
 * 셀렉터를 손으로 쓰지 마라 — `componentRule`·`partRule`만 쓴다.
 */
export function documentCssBlocks(): string[] {
  const blocks: string[] = []

  // ── Media ─────────────────────────────────────────────────────────────────
  blocks.push(
    partRule('Media', 'frame', [`aspect-ratio: var(${nodeVar('media', 'ratio')}, 16/9);`]),
  )

  // ── Placeholder ───────────────────────────────────────────────────────────
  blocks.push(
    componentRule('Placeholder', 'default', [
      `height: var(${nodeVar('placeholder', 'height')}, 120px);`,
    ]),
  )

  return blocks
}

/** 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다(파일 끝에 둔다 — TDZ). */
export const DOCUMENT_ENTRIES: StructureEntry[] = [
  ['Text', 'default', TextDefault],
  ['Media', 'image', MediaImage],
  ['Divider', 'default', DividerDefault],
  ['Placeholder', 'default', PlaceholderDefault],
]
