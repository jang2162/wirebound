/**
 * **테마 갤러리(② W3) — 케이스 자리.** ①이 미리 만들어 두었다.
 *
 * 셋이 병렬로 일하므로 **각자 자기 케이스 파일에만 쓴다.** 이유는
 * `token-editor.test.tsx` 머리말에 있다.
 *
 * 아래 케이스는 **계약 하나**를 잡는다: 갤러리는 `resolved`를 **props로 받고 스스로
 * 해석하지 않는다.** 채우고 나서도 참이어야 한다 — 지우지 말고 아래에 더해라.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { systemTheme, type Theme } from '@wirebound/themes'
import { ThemeGallery } from '../../src/theme/theme-gallery'
import { resolveDraft } from '../../src/theme/draft-css'

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
})
