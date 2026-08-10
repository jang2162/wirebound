/**
 * **문서 그룹.** `Text`·`Media`·`Divider`·`Placeholder`.
 *
 * 카탈로그의 `component/catalog/document.ts`와 같은 경계다(P4b-2 D2).
 * 등록(`DOCUMENT_ENTRIES`)과 기본 CSS(`documentCssBlocks`)를 이 파일이 소유한다.
 * 공용 도구는 `../structure-css-tools`에 있다 — 복사해 오지 마라.
 */
import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
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

/**
 * `Media` 네 구조가 공유하는 것 — **비율을 나르는 틀 하나와 조건부 설명 하나.**
 *
 * 틀에 실리는 `--wb-node-media-ratio`는 `documentCssBlocks()`의 `partRule`이 읽는다.
 * 그 규칙은 **구조 이름을 넣지 않으므로 네 구조에 다 걸린다** — 그래서 넷 중 하나라도
 * 값을 안 실으면 그 구조에서만 조용히 기본값 `16/9`로 굳는다. 여기서 한 번에 싣는 것이
 * 그 어긋남을 만들 자리를 없앤다.
 *
 * `inside`가 틀 **안**에 들어가는 내용이다. 넷을 가르는 것이 이것뿐이고, 나머지는 같다.
 */
function mediaFigure(
  { attrs, props, part }: Parameters<StructureRenderer>[0],
  inside: ReactNode,
): ReactElement {
  return (
    <figure {...attrs}>
      <div
        {...part('frame')}
        style={{ [nodeVar('media', 'ratio')]: String(props.ratio) } as CSSProperties}
      >
        {inside}
      </div>
      {props.caption ? <figcaption {...part('caption')}>{String(props.caption)}</figcaption> : null}
    </figure>
  )
}

// **빈 틀이 곧 "사진"이다.** 와이어프레임에서 아무 표시 없는 상자가 이미지를 뜻하므로
// 안에 아무것도 넣지 않는 것이 이 구조의 내용이다 — 뒤의 셋은 여기에 표시를 더해 갈린다.
export const MediaImage: StructureRenderer = (ctx) => mediaFigure(ctx, null)

// 영상은 **재생 어포던스**로 읽힌다. 글자를 넣는 것은 이 저장소의 선례를 따른 것이다 —
// `TreeIndent`의 `▸`, `ListTable`의 `—`·`1 2 3`처럼 테마가 없어도 무엇인지 보이게 한다.
export const MediaVideo: StructureRenderer = (ctx) => (
  mediaFigure(ctx, <span {...ctx.part('play')}>▶</span>)
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
  ['Media', 'video', MediaVideo],
  ['Divider', 'default', DividerDefault],
  ['Placeholder', 'default', PlaceholderDefault],
]
