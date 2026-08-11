/**
 * 갤러리가 초안 CSS를 싣는 자리(P4c-2 D5·재라 #2).
 *
 * **이 파일이 지키는 하중은 하나다 — 갤러리가 캔버스의 공유 시트를 건드리지 않는다.**
 * 그 판정에 이른 실측(같은 id로 넣으면 무엇이 깨지는가, 후보 셋의 비교)은
 * `src/theme/draft-css.ts` 머리말에 표로 있다. 여기 있는 것은 **그 판정을 기계가 지키는
 * 형태**다.
 *
 * ---
 *
 * **jsdom에서 캐스케이드를 단언하지 않는다.** 재보니 이 환경은 **DOM 순서가 아니라
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
    // **이 케이스는 `draft-css.ts`의 `catalog-setup` import를 지키지 않는다 — 재서 적는다.**
    // 그 줄을 지워도 전체 스위트가 **0 사망**이었다: 이 파일이 `use-theme-css`도 import하고
    // 그쪽이 카탈로그를 끌어오기 때문이다. 즉 여기서 재는 것은 *"설치가 어디선가 일어났다"*이지
    // *"저 파일이 스스로 설치한다"*가 아니다. **닫는 케이스를 만들지 못했다** — 한 모듈만
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
   * **이것이 이 파일의 하중이다.** 같은 id를 쓰던 판에서는 여기서 캔버스의 `theme` 시트가
   * 초안 CSS로 덮였고, **그 뒤 아무도 고치지 않았다**(`draft-css.ts` 머리말의 관측 1~3).
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
   * 살아남은 훅의 스타일까지 사라진다 — `use-theme-css.ts`가 쟀다) 여기에는 살아남을
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
 * 둔다(산문으로만 적으면 이 저장소가 여섯 사이클 겪은 그 부류가 된다).
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
    // **계획서 D5의 *"뒤로 가면 캔버스가 초안 CSS로 그려진다"*가 이 경로에서는 거짓이다** —
    // 새 마운트의 레이아웃 이펙트가 자기 값을 쓴다. 남는 것은 캔버스가 **안 그려지는**
    // 상태이고, 그것은 위 "언마운트하면 비워진다"가 닫는다.
    const gallery = render(<Gallery theme={withPrimary('#ff00ff')} />)
    gallery.unmount()

    render(<Canvas />)

    expect(primaryIn(THEME_STYLE_ID)).not.toBe('#ff00ff')
  })
})
