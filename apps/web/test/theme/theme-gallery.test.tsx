/**
 * **테마 갤러리 — 케이스 자리.**
 *
 * **갤러리의 케이스는 이 파일에만 쓴다.** 이유는 `token-editor.test.tsx` 머리말에 있다.
 *
 * 첫 케이스는 **계약 하나**를 잡는다: 갤러리는 `resolved`를 **props로 받고 스스로
 * 해석하지 않는다.** 다른 케이스가 무엇을 더해도 참이어야 하므로 지우지 않는다.
 *
 * ---
 *
 * **이 파일이 재는 것은 렌더링이다.** 문서 데이터 쪽(`validatePage`·항목 수·`재라 #5` 묶음)은
 * `gallery-document.test.ts`에 있다. 가른 이유는 그 파일 머리말에 있다 — 요지는 그쪽이
 * `draft-css`를 import하지 않아 **`catalog-setup` import의 구분력을 잴 수 있다**는 것이다.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { installStructures, registerStructure, resetStructures } from '@wirebound/renderer'
import { resolveTheme, systemTheme, type Theme } from '@wirebound/themes'
import { GalleryBoundary, ThemeGallery } from '../../src/theme/theme-gallery'
import { resolveDraft } from '../../src/theme/draft-css'
import { galleryItems } from '../../src/theme/gallery-document'

/** `admin`을 해석한 것. 갤러리는 이 값을 props로만 받는다. */
function admin(): ReturnType<typeof resolveDraft>['resolved'] {
  return resolveDraft(systemTheme('admin') as Theme, null).resolved
}

/** `document.head`의 wirebound 시트 목록. **갤러리가 CSS를 안 넣는 것**을 잰다. */
function styleIds(): string[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-wb-style]')].map(
    (tag) => tag.dataset.wbStyle ?? '',
  )
}

describe('ThemeGallery', () => {
  it('해석 결과를 받아 그린다 — 스스로 해석하지 않는다', () => {
    const { resolved } = resolveDraft(systemTheme('admin') as Theme, null)

    const view = render(<ThemeGallery resolved={resolved} />)

    expect(view.container).toBeTruthy()
  })

  it('resolved가 null이어도 죽지 않는다 — error가 있는 초안의 상태다', () => {
    const view = render(<ThemeGallery resolved={null} />)

    expect(view.container).toBeTruthy()
  })

  it('갤러리 항목 하나마다 문서 노드를 하나씩 그린다', () => {
    const view = render(<ThemeGallery resolved={admin()} />)

    const boxes = view.container.querySelectorAll('.wb-shell-gallery-item')
    expect(boxes.length).toBe(galleryItems().length)
    // 상자마다 문서 노드가 정확히 하나 — 캡션은 그 형제다(캡션은 감싸는 상자가 아니다).
    for (const box of boxes) {
      expect(box.querySelectorAll(':scope > [data-wb-component]').length).toBe(1)
    }
  })

  /**
   * **`admin`으로 쓰면 이 케이스는 구분력이 0이다.**
   *
   * `admin`은 **열일곱 타입 전부 카탈로그의 첫 구조를 고른다.** 그래서 *"테마가 고른 구조로
   * 그린다"*를 그 테마로 재면, 구조를 통째로 무시하고 카탈로그 기본만 쓰는 갤러리도 초록이다
   * (`admin`으로 바꾸면 아래 `not.toBe`가 죽는다). `portal`은 일곱 타입에서
   * 갈린다 — 그중 `Card: plain → bordered`를 쓴다.
   *
   * **아래 `not.toBe`를 지우지 마라.** 테마가 바뀌어 다시 같아지면 그 줄이 죽어서 알려 준다.
   */
  it('테마가 고른 구조로 그린다 — 카탈로그 기본 구조가 아니다', () => {
    const { resolved } = resolveDraft(systemTheme('portal') as Theme, null)
    const chosen = resolved?.components.get('Card')?.structure
    expect(chosen).toBeDefined()
    expect(chosen).not.toBe('plain')

    const view = render(<ThemeGallery resolved={resolved} />)

    const cards = view.container.querySelectorAll('[data-wb-component="Card"]')
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.getAttribute('data-wb-structure')).toBe(chosen)
    }
  })

  it('resolved가 null이면 카탈로그 기본 구조로 그리고 그 사실을 말한다', () => {
    const view = render(<ThemeGallery resolved={null} />)

    expect(view.getByRole('status').textContent).toContain('테마 CSS 없이')
    // 렌더러는 테마 없이도 그린다 — 빈 화면이 되지 않는 것이 이 판정의 전제다.
    const cards = view.container.querySelectorAll('[data-wb-component="Card"]')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]?.getAttribute('data-wb-structure')).toBe('plain')
  })

  it('테마가 언급하지 않은 타입을 표시한다', () => {
    // 컴포넌트를 하나도 안 든 초안. 해석은 서지만 어떤 컴포넌트 층도 나오지 않는다.
    const bare = resolveTheme({
      meta: { id: 'bare', name: '빈 테마', version: '1.0.0' },
    } as unknown as Theme)
    expect(bare.theme).not.toBeNull()

    const view = render(<ThemeGallery resolved={bare.theme} />)

    const marks = view.container.querySelectorAll('.wb-shell-gallery-untouched')
    expect(marks.length).toBe(galleryItems().length)

    // 반대편 — 전부 언급하는 테마에서는 하나도 안 나온다.
    const full = render(<ThemeGallery resolved={admin()} />)
    expect(full.container.querySelectorAll('.wb-shell-gallery-untouched').length).toBe(0)
  })

  it('캡션이 안 그린 구조 옵션의 수를 말한다', () => {
    const view = render(<ThemeGallery resolved={admin()} />)

    const captions = [...view.container.querySelectorAll('.wb-shell-gallery-caption')].map(
      (node) => node.textContent ?? '',
    )
    // Card는 구조가 다섯인데 화면에는 하나만 나온다 — 그 사실을 세어서 적는다.
    expect(captions.some((text) => text.includes('Card') && text.includes('구조 5개 중'))).toBe(true)
    // 구조가 하나뿐인 타입에는 안 적는다(셀 것이 없다).
    const placeholder = captions.find((text) => text.startsWith('Placeholder'))
    expect(placeholder).toBeDefined()
    expect(placeholder).not.toContain('구조 1개 중')
  })

  it('CSS를 주입하지 않는다 — 초안 시트는 라우트의 useDraftCss가 싣는다', () => {
    const before = styleIds()

    const view = render(<ThemeGallery resolved={admin()} />)
    expect(styleIds()).toEqual(before)

    view.unmount()
    expect(styleIds()).toEqual(before)
  })

  it('노드를 하나도 폴백으로 떨어뜨리지 않는다 — 시스템 테마 다섯 전부', () => {
    // 샘플 props가 카탈로그 스키마를 어기거나 테마가 고른 구조에 구현이 없으면 여기서 죽는다.
    // 폴백은 `data-wb-error`를 단다(`packages/renderer/src/fallback.tsx`).
    for (const name of ['admin', 'portal', 'commerce', 'docs', 'saas-marketing']) {
      const { resolved } = resolveDraft(systemTheme(name) as Theme, null)
      const view = render(<ThemeGallery resolved={resolved} />)
      expect(view.container.querySelectorAll('[data-wb-error]').length).toBe(0)
      expect(view.container.querySelector('.wb-shell-gallery-error')).toBeNull()
      view.unmount()
    }
  })

  /**
   * **경계를 실제 경로로 잰다.** 아래 `GalleryBoundary` 묶음은 경계 자체를 직접 재는데,
   * 그것만으로는 **`ThemeGallery`가 그 경계를 두르고 있는지**를 아무도 안 본다 —
   * `ThemeGallery`에서 `<GalleryBoundary>`를 걷어내면 이 케이스 말고는 `--project web`에서
   * 죽는 케이스가 없다. 이 케이스가 그 사각을 닫는다.
   *
   * 레지스트리를 비웠다 되돌리는 것은 `registerStructure`가 중복에 던지기 때문이다. 같은
   * 케이스 안에서 `finally`로 되돌리므로 파일의 다른 케이스에 남지 않는다.
   */
  it('구조 구현체가 던져도 화면 전체가 사라지지 않는다', () => {
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => {})
    resetStructures()
    try {
      // `admin`은 Card로 `plain`을 고른다. 나머지 구조는 등록하지 않았으므로 폴백이 되고,
      // 폴백은 던지지 않는다 — 즉 던지는 경로가 이 하나뿐이다.
      registerStructure('Card', 'plain', () => {
        throw new Error('구조 구현체가 던졌다')
      })

      const view = render(<ThemeGallery resolved={admin()} />)

      expect(view.getByRole('alert').textContent).toContain('구조 구현체가 던졌다')
    } finally {
      resetStructures()
      installStructures()
      silenced.mockRestore()
    }
  })
})

describe('GalleryBoundary', () => {
  /**
   * 던지는 자식. **레지스트리에 던지는 구조 구현체를 등록하지 않는 이유**: 등록은 전역이고
   * `registerStructure`는 중복에 던지므로, 한 번 심으면 이 파일의 다른 케이스와 같은 프로세스의
   * 다른 모듈까지 영향을 받는다. 경계가 잡는 것은 *"자식이 던진다"* 하나이므로 그것을 바로 잰다.
   */
  function Throwing(): never {
    throw new Error('구조 구현체가 던졌다')
  }

  it('자식이 던지면 문장으로 바꾸고 형제는 살려 둔다', () => {
    // React가 잡힌 예외를 콘솔에 남긴다 — 케이스 출력이 그것으로 덮이지 않게 막는다.
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => {})

    const view = render(
      <GalleryBoundary resetKey="Card:plain">
        <Throwing />
      </GalleryBoundary>,
    )

    expect(view.getByRole('alert').textContent).toContain('구조 구현체가 던졌다')
    silenced.mockRestore()
  })

  it('구조 선택이 바뀌면 다시 그려 본다 — 값이 그대로면 문장을 남긴다', () => {
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => {})

    const view = render(
      <GalleryBoundary resetKey="Card:plain">
        <Throwing />
      </GalleryBoundary>,
    )
    expect(view.queryByRole('alert')).not.toBeNull()

    // 같은 키로 다시 그린다 — 토큰 값 하나를 고친 렌더가 이것이다. 되살리면 던지는 구현체가
    // 그 자리에서 계속 다시 던진다.
    view.rerender(
      <GalleryBoundary resetKey="Card:plain">
        <p>고쳐졌다</p>
      </GalleryBoundary>,
    )
    expect(view.queryByRole('alert')).not.toBeNull()

    // 키가 바뀌면 되살린다 — 구조를 바꿔 고쳤는데도 오류 문장이 남으면 안 된다.
    view.rerender(
      <GalleryBoundary resetKey="Card:bordered">
        <p>고쳐졌다</p>
      </GalleryBoundary>,
    )
    expect(view.queryByRole('alert')).toBeNull()
    silenced.mockRestore()
  })
})
