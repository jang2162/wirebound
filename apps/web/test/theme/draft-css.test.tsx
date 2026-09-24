/**
 * 갤러리가 초안 CSS를 싣는 자리.
 *
 * **이 파일이 지키는 하중은 하나다 — 갤러리가 캔버스의 공유 시트를 건드리지 않는다.**
 * 그 판정에 이른 실측(같은 id로 넣으면 무엇이 깨지는가, 후보 셋의 비교)은
 * `src/theme/draft-css.ts` 머리말에 표로 있다. 여기 있는 것은 **그 판정을 기계가 지키는
 * 형태**다.
 *
 * ---
 *
 * **jsdom에서 캐스케이드를 단언하지 않는다.** 이 환경은 **DOM 순서가 아니라
 * `textContent`를 쓴 순서**로 이긴 쪽을 정한다(그 표도 `draft-css.ts` 머리말에 있다).
 * 실제 브라우저는 DOM 순서로 가르므로, 여기서 계산된 스타일로 *"초안이 이긴다"*를 확인해도
 * 그것은 브라우저에 대해 아무것도 말하지 않는다. **잴 수 있는 것은 어느 태그에 무엇이
 * 실렸는가까지다.**
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { structureBaseCss } from '@wirebound/renderer'
import { systemTheme, type Theme } from '@wirebound/themes'
import { DRAFT_STYLE_ID, resolveDraft, useDraftCss } from '../../src/theme/draft-css'
import { STRUCTURE_STYLE_ID, THEME_STYLE_ID, useThemeCss } from '../../src/theme/use-theme-css'
import type { ThemeSource } from '../../src/theme/theme-source'

const admin = systemTheme('admin') as Theme

/** `--wb-semantic-primary`를 바꾼 초안. **CSS에 글자로 나타나는 값**이라 눈으로 셀 수 있다. */
function withPrimary(value: string): Theme {
  const next = structuredClone(admin) as Theme
  ;(next.tokens as Record<string, Record<string, string>>)['semantic']!['primary'] = value
  return next
}

function tag(id: string): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
}

function text(id: string): string {
  return tag(id)?.textContent ?? ''
}

/** 시트에 실린 `--wb-semantic-primary` 값. 없으면 빈 문자열이다. */
function primaryIn(id: string): string {
  return /--wb-semantic-primary:\s*([^;]+);/.exec(text(id))?.[1] ?? ''
}

const canvasSource: ThemeSource = () => admin

function Canvas(): ReactElement {
  useThemeCss(canvasSource)
  return <div data-testid="canvas" />
}

function Gallery(props: { theme: Theme | null; base?: Theme | null }): ReactElement {
  useDraftCss(resolveDraft(props.theme, props.base ?? null))
  return <div data-testid="gallery" />
}

describe('resolveDraft', () => {
  it('초안이 없으면 아무것도 내지 않는다', () => {
    expect(resolveDraft(null, null)).toEqual({ resolved: null, issues: [], css: '' })
  })

  it('해석과 컴파일과 이슈를 한 번에 낸다 — 셋이 갈릴 자리를 만들지 않는다', () => {
    const result = resolveDraft(admin, null)
    expect(result.issues).toEqual([])
    expect(result.resolved).not.toBeNull()
    expect(result.css).toContain(':root {')
  })

  it('이 파일이 도는 시점에 카탈로그가 설치돼 있다', () => {
    // 없으면 모든 컴포넌트가 `unknown-component`가 되어 `resolved`가 `null`이 된다.
    //
    // **이 케이스는 `draft-css.ts`의 `catalog-setup` import를 지키지 않는다.**
    // 그 줄을 지워도 전체 스위트에서 죽는 케이스가 없다: 이 파일이 `use-theme-css`도 import하고
    // 그쪽이 카탈로그를 끌어오기 때문이다. 즉 여기서 재는 것은 *"설치가 어디선가 일어났다"*이지
    // *"저 파일이 스스로 설치한다"*가 아니다. **닫는 케이스가 없다** — 한 모듈만
    // 격리해 import 그래프를 끊는 수단이 이 저장소에 없다(vitest의 모듈 모킹으로 부작용
    // import를 지우는 판을 만들어 봤자 그것은 다른 것을 재게 된다).
    expect(resolveDraft(admin, null).resolved).not.toBeNull()
  })

  it('error가 있으면 CSS를 안 내고 이슈만 낸다 — 던지지 않는다', () => {
    const broken = structuredClone(admin) as Theme
    ;(broken.tokens as Record<string, Record<string, string>>)['semantic']!['primary'] =
      'palette.그런건없다'

    const result = resolveDraft(broken, null)

    expect(result.css).toBe('')
    expect(result.resolved).toBeNull()
    expect(result.issues.length).toBeGreaterThan(0)
  })

  /**
   * **패턴이 깊어 해석이 호출 스택을 넘겨도 던지지 않는다 — 이슈로 낸다.** 패턴 노드의 검증(zod)이 재귀라, 깊이가 스택을
   * 넘으면 `RangeError`가 테마 편집 화면째 흰 화면으로 만든다(Chrome: 한 줄로 이은 `Flex` 패턴 깊이 1500 에서 body 가 빈다
   * — 넘는 깊이는 엔진 · 스택 크기에 따라 갈린다). 여기서는 넘는 깊이를 넉넉히 준다.
   */
  it('패턴이 깊어 해석이 스택을 넘기면 이슈로 낸다 — 던지지 않는다', () => {
    let node: Record<string, unknown> = { type: 'Text', props: { content: '잎' } }
    for (let i = 0; i < 20000; i += 1) node = { type: 'Flex', children: [node] }
    const deep = { ...structuredClone(admin), patterns: { 'content.deep': { name: '깊은 패턴', schema: node } } } as unknown as Theme

    const result = resolveDraft(deep, null)

    expect(result.resolved).toBeNull()
    expect(result.css).toBe('')
    expect(result.issues.map((one) => [one.code, one.severity])).toEqual([['bad-spec', 'error']])
    expect(result.issues[0]?.message).toContain('너무 깊')
  })

  it('base 없이 파생을 해석하면 bad-extends로 거절된다 — 그것을 막지 않고 보여 준다', () => {
    const derived: Theme = {
      meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' },
    }

    const result = resolveDraft(derived, null)

    // 상속 대상이 코드에서 사라진 낡은 파생이 이 상태다(서버가 그때 `base` 키를 안 낸다).
    expect(result.issues.map((issue) => issue.code)).toContain('bad-extends')
  })

  it('base를 주면 파생이 해석된다', () => {
    const derived: Theme = {
      meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' },
    }

    expect(resolveDraft(derived, admin).resolved).not.toBeNull()
  })
})

describe('useDraftCss — 갤러리 전용 시트', () => {
  it('초안 CSS를 갤러리 전용 태그에 싣는다', () => {
    render(<Gallery theme={withPrimary('#ff00ff')} />)

    expect(primaryIn(DRAFT_STYLE_ID)).toBe('#ff00ff')
  })

  it('구조 기본 CSS는 공유 시트를 그대로 쓴다 — 두 벌로 만들지 않는다', () => {
    render(<Gallery theme={admin} />)

    expect(text(STRUCTURE_STYLE_ID)).toBe(structureBaseCss())
    expect(text(DRAFT_STYLE_ID)).not.toContain(structureBaseCss())
  })

  /**
   * **이것이 이 파일의 하중이다.** 갤러리가 캔버스와 같은 id를 쓰면 여기서 캔버스의 `theme`
   * 시트가 초안 CSS로 덮이고, **그 뒤 아무도 되돌려 쓰지 않는다**(`draft-css.ts` 머리말의 관측 1~3).
   */
  it('캔버스가 떠 있어도 공유 theme 시트를 건드리지 않는다', () => {
    render(<Canvas />)
    const before = primaryIn(THEME_STYLE_ID)
    expect(before).not.toBe('')

    render(<Gallery theme={withPrimary('#ff00ff')} />)

    expect(primaryIn(THEME_STYLE_ID)).toBe(before)
    expect(primaryIn(DRAFT_STYLE_ID)).toBe('#ff00ff')
  })

  it('입력마다 초안이 바뀌어도 공유 시트는 그대로다', () => {
    render(<Canvas />)
    const before = primaryIn(THEME_STYLE_ID)
    const view = render(<Gallery theme={withPrimary('#000000')} />)

    view.rerender(<Gallery theme={withPrimary('#000001')} />)
    view.rerender(<Gallery theme={withPrimary('#000002')} />)

    expect(primaryIn(DRAFT_STYLE_ID)).toBe('#000002')
    expect(primaryIn(THEME_STYLE_ID)).toBe(before)
  })

  /**
   * **소유자가 하나라 비울 수 있다.** 공유 시트 둘은 못 비우는데(훅 하나가 언마운트될 때
   * 살아남은 훅의 스타일까지 사라진다 — `use-theme-css.ts` 머리말) 여기에는 살아남을
   * 다른 훅이 없다. 이 케이스가 없으면 **캔버스가 안 그려지는 상태로 돌아갔을 때 초안
   * CSS가 남는다**(그 머리말의 관측 5).
   */
  it('언마운트하면 초안 CSS가 비워진다 — 태그는 남는다', () => {
    const view = render(<Gallery theme={withPrimary('#ff00ff')} />)
    expect(primaryIn(DRAFT_STYLE_ID)).toBe('#ff00ff')

    view.unmount()

    expect(tag(DRAFT_STYLE_ID)).not.toBeNull()
    expect(text(DRAFT_STYLE_ID)).toBe('')
  })

  it('초안이 없으면 시트가 비어 있다', () => {
    render(<Gallery theme={null} />)

    expect(text(DRAFT_STYLE_ID)).toBe('')
  })

  it('두 번 그려도 태그가 늘지 않는다', () => {
    const view = render(<Gallery theme={admin} />)
    view.rerender(<Gallery theme={admin} />)
    view.rerender(<Gallery theme={admin} />)

    expect(document.head.querySelectorAll(`style[data-wb-style="${DRAFT_STYLE_ID}"]`)).toHaveLength(1)
  })

  /**
   * **초안 시트는 늘 `head`의 마지막이어야 한다** — 어기면 실브라우저에서 갤러리가 초안 대신
   * 저장본을 그린다(실브라우저에서 잰 고장 방식). `draft-css.ts`의
   * `document.head.append(draftTag)` 머리말에 표가 있다.
   *
   * **계산된 스타일로 재면 안 된다.** jsdom은 캐스케이드를 **쓴 순서**로 가르므로
   * 초안 시트가 DOM에서 앞에 있어도 나중에 쓰면 이긴다 — 즉 **이 환경에서 `getComputedStyle`은
   * 결함을 못 본다.** 실브라우저는 DOM 순서로 가른다. **그래서 DOM 순서를 직접
   * 단언한다** — jsdom에서 참이면서 브라우저의 성질과 이어지는 유일한 관측이다.
   *
   * 순서는 **태그가 처음 만들어진 순서**로 고정된다(`ensureStyle`이 이름으로 찾으므로).
   * 그래서 **초안 시트가 먼저 생긴 판**을 심어야 결함이 드러난다 — 아래가 그 판이다
   * (사용자가 테마 화면을 먼저 연 세션).
   */
  it('갤러리를 먼저 열고 캔버스를 뒤에 열어도 초안 시트가 head의 마지막이다', () => {
    // 1. 갤러리 먼저 — `theme-draft` 태그가 `theme`보다 앞에 생긴다.
    const gallery = render(<Gallery theme={withPrimary('#ff00ff')} />)
    // 2. 캔버스가 뒤에 붙어 `theme` 태그를 만든다.
    render(<Canvas />)
    // 3. 갤러리가 다시 그려진다(= 테마 화면으로 돌아온 것).
    gallery.rerender(<Gallery theme={withPrimary('#ff00fe')} />)

    const ids = [...document.head.querySelectorAll('style[data-wb-style]')].map(
      (element) => (element as HTMLElement).dataset.wbStyle,
    )

    expect(ids).toContain(THEME_STYLE_ID)
    expect(ids[ids.length - 1]).toBe(DRAFT_STYLE_ID)
    // 그리고 그 시트가 실제로 새 초안을 들고 있어야 한다 — 자리만 옮기고 내용이 낡으면 같은 손해다.
    expect(primaryIn(DRAFT_STYLE_ID)).toBe('#ff00fe')
  })

  /**
   * **`structure`를 다시 쓰지 않는 것이 하중이다** — jsdom에서는 나중에 쓴 시트가 이기므로
   * (`draft-css.ts` 머리말), 가드 없이 다시 쓰면 구조 기본 CSS가 테마 CSS를 이긴다.
   * 브라우저에는 없는 거짓 관측이 회귀에 섞인다.
   *
   * 쓰기를 세는 장치를 따로 둔다 — `textContent`가 같은 값이면 관측할 방법이 그것뿐이다.
   */
  it('이미 같은 구조 CSS가 실려 있으면 다시 쓰지 않는다', () => {
    render(<Canvas />)
    const structure = tag(STRUCTURE_STYLE_ID)!
    let writes = 0
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!
    Object.defineProperty(structure, 'textContent', {
      configurable: true,
      get: () => original.get!.call(structure),
      set: (value: string) => {
        writes += 1
        original.set!.call(structure, value)
      },
    })

    render(<Gallery theme={admin} />)

    expect(writes).toBe(0)
  })
})

/**
 * **`use-theme-css.ts`가 여전히 정리에서 시트를 안 지운다는 것**이 위 판정의 전제다.
 * 그쪽이 언젠가 정리를 하게 되면 이 파일의 근거 절반이 낡는다 — 그 사실을 케이스로 붙여
 * 둔다(산문으로만 적으면 전제가 바뀌어도 아무것도 죽지 않아 근거가 조용히 낡는다).
 */
describe('전제 — 공유 시트는 정리에서 안 지워진다', () => {
  it('캔버스 훅을 언마운트해도 공유 태그 둘이 남는다', () => {
    const view = render(<Canvas />)
    expect(tag(THEME_STYLE_ID)).not.toBeNull()

    view.unmount()

    expect(tag(STRUCTURE_STYLE_ID)).not.toBeNull()
    expect(tag(THEME_STYLE_ID)).not.toBeNull()
    expect(text(THEME_STYLE_ID)).not.toBe('')
  })

  it('갤러리만 있던 화면에서 캔버스로 돌아가면 캔버스가 자기 CSS를 다시 쓴다', () => {
    // ***"뒤로 가면 캔버스가 초안 CSS로 그려진다"*는 이 경로에서 거짓이다** —
    // 새 마운트의 레이아웃 이펙트가 자기 값을 쓴다. 남는 것은 캔버스가 **안 그려지는**
    // 상태이고, 그것은 위 "언마운트하면 비워진다"가 닫는다.
    const gallery = render(<Gallery theme={withPrimary('#ff00ff')} />)
    gallery.unmount()

    render(<Canvas />)

    expect(primaryIn(THEME_STYLE_ID)).not.toBe('#ff00ff')
  })
})
