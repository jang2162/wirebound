/** **문서 그룹 기본 뷰.** `Text`·`Media`·`Divider`·`Placeholder`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { nodeVar, partRule, zeroRule } from '../css-tools'
import { view } from '../define'
import { PLACEHOLDER_VARS, placeholderVars } from '../placeholder'
import { Root } from '../root'

// 태그는 접근성 · 문서 개요의 문제라 역할에서 고른다 — `<h1>` 이 `<p>` 가 되면 개요가 달라진다.
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

export const TextView = view(({ props }) => (
  <Root as={ROLE_TAG[props.role as string] ?? 'p'} data-wb-structure="default">
    {String(props.content)}
  </Root>
))

/** 종류(`kind`)마다 틀 가운데 표지. `image` 는 없다 — 빈 틀이 곧 «사진» 이다. */
const MEDIA_GLYPH: Record<string, string> = { video: '▶', illustration: '✎', chart: '▤' }

// 기본 구조 `image`.
export const MediaView = view(({ props }) => {
  const glyph = MEDIA_GLYPH[String(props.kind)]
  return (
    <Root as="figure" data-wb-structure="image">
      <div data-wb-part="frame" style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}>
        {glyph === undefined ? null : (
          <span data-wb-part="glyph" aria-hidden="true">
            {glyph}
          </span>
        )}
      </div>
      {props.caption ? <figcaption data-wb-part="caption">{String(props.caption)}</figcaption> : null}
    </Root>
  )
})

export const DividerView = view(() => <Root as="hr" data-wb-structure="default" />)

// 몸통(`content`)이 있으면 라벨이 안 선다 — 라벨은 «아직 정하지 않은 자리» 의 글이고, 안을 채웠으면 채운 것이 그 자리를 말한다.
export const PlaceholderView = view(({ props, children }) => (
  <Root as="div" data-wb-structure="default" style={placeholderVars(props)}>
    {children === null ? <span data-wb-part="label">{String(props.label)}</span> : <div data-wb-part="content">{children}</div>}
  </Root>
))

export function documentCssBlocks(): string[] {
  return [
    partRule('Media', 'frame', [`aspect-ratio: var(${nodeVar('media', 'ratio')}, 16/9);`]),
    // 표지를 틀 가운데 둔다. 틀의 높이는 `aspect-ratio` 가 정하므로 격자로 바꿔도 크기가 안 변한다.
    zeroRule('[data-wb-component="Media"] [data-wb-part="frame"]', ['display: grid;', 'place-items: center;']),
    // 자리표시자 — 정한 값은 변수로 온다(`placeholderVars`). 넷 다 특이도 0 이라 테마가 같은 속성을 걸면 테마가 이긴다 — 테마는 그 값을
    // `var(--wb-node-placeholder-<이름>, <테마 몫>)` 꼴로 읽어야 사람이 정한 값이 선다.
    zeroRule(
      '[data-wb-component="Placeholder"]',
      PLACEHOLDER_VARS.map((name) => `${name}: initial;`),
    ),
    zeroRule('[data-wb-component="Placeholder"][data-wb-structure="default"]', [
      'box-sizing: border-box;',
      'display: flex;',
      'flex-wrap: wrap;',
      'align-items: center;',
      'justify-content: center;',
      'text-align: center;',
      'max-width: 100%;',
      `width: var(${nodeVar('placeholder', 'width')});`,
      `height: var(${nodeVar('placeholder', 'height')});`,
      'border-width: 1px;',
      'border-style: dashed;',
      `border-color: var(${nodeVar('placeholder', 'border-color')}, currentColor);`,
      `border-radius: var(${nodeVar('placeholder', 'radius')});`,
      `background-color: var(${nodeVar('placeholder', 'background')});`,
      `color: var(${nodeVar('placeholder', 'color')});`,
      `font-size: var(${nodeVar('placeholder', 'font-size')});`,
      `padding: var(${nodeVar('placeholder', 'padding')});`,
    ]),
    // 빈 자리표시자(라벨만)는 높이를 정하지 않았으면 120px 을 잡는다 — 정했으면 그 높이다(`min-height` 가 `height` 를 이기지 않게 같은 값).
    zeroRule('[data-wb-component="Placeholder"]:has(> [data-wb-part="label"])', [
      `min-height: var(${nodeVar('placeholder', 'height')}, 120px);`,
    ]),
    zeroRule('[data-wb-component="Placeholder"] > [data-wb-part="content"]', [
      'display: flex;',
      'flex-wrap: wrap;',
      'align-items: center;',
      'justify-content: inherit;',
      'gap: 4px;',
      'min-width: 0;',
    ]),
    zeroRule('[data-wb-component="Placeholder"][data-wb-border="solid"]', ['border-style: solid;']),
    zeroRule('[data-wb-component="Placeholder"][data-wb-border="none"]', ['border-style: none;']),
    zeroRule('[data-wb-component="Placeholder"][data-wb-align="start"]', ['justify-content: flex-start;', 'text-align: start;']),
    zeroRule('[data-wb-component="Placeholder"][data-wb-align="end"]', ['justify-content: flex-end;', 'text-align: end;']),
    // `Flex` 안에서 몫을 받으면 바탕 폭이 0 이 되어(`flex: <몫>`) `width` 가 안 듣는다 — 정한 너비는 그때 바닥(`min-width`)이 된다.
    zeroRule('[data-wb-component="Flex"] > [data-wb-component="Placeholder"]', [
      `min-width: var(${nodeVar('placeholder', 'width')}, auto);`,
    ]),
  ]
}
