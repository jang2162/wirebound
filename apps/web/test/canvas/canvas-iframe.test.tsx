import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasIframe } from '../../src/canvas/canvas-iframe'

function frameDoc(container: HTMLElement): Document {
  const iframe = container.querySelector('iframe')!
  return iframe.contentDocument!
}

describe('CanvasIframe', () => {
  it('자식을 iframe 문서의 body 에 그린다 — 호스트 문서에는 없다', async () => {
    const { container } = render(
      <CanvasIframe styles={[]} width={1280}>{() => <p data-probe="1">안</p>}</CanvasIframe>,
    )
    await waitFor(() => expect(frameDoc(container).querySelector('[data-probe]')).not.toBeNull())
    expect(document.querySelector('[data-probe]')).toBeNull()
  })

  it('스타일은 iframe 의 head 에 차례로 — 호스트 head 에는 없다', async () => {
    const { container } = render(
      <CanvasIframe styles={[{ id: 'base', css: 'p{}' }, { id: 'theme', css: 'button{color:red}' }]} width={1280}>{() => null}</CanvasIframe>,
    )
    await waitFor(() => expect(frameDoc(container).head.querySelectorAll('style[data-wb-style]')).toHaveLength(2))
    const ids = [...frameDoc(container).head.querySelectorAll('style')].map((s) => s.getAttribute('data-wb-style'))
    expect(ids).toEqual(['base', 'theme'])
    expect(document.head.querySelector('style[data-wb-style="theme"]')).toBeNull()
  })

  it('두 번 마운트해도 style 은 한 벌', async () => {
    const { container } = render(
      <StrictMode><CanvasIframe styles={[{ id: 'base', css: 'p{}' }]} width={1280}>{() => null}</CanvasIframe></StrictMode>,
    )
    await waitFor(() => expect(frameDoc(container).head.querySelectorAll('style[data-wb-style="base"]')).toHaveLength(1))
  })

  it('스타일 내용이 바뀌면 같은 태그를 고쳐 쓴다', async () => {
    const { container, rerender } = render(<CanvasIframe styles={[{ id: 'theme', css: 'a{}' }]} width={1280}>{() => null}</CanvasIframe>)
    rerender(<CanvasIframe styles={[{ id: 'theme', css: 'b{}' }]} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() => expect(frameDoc(container).head.querySelector('style')!.textContent).toBe('b{}'))
    expect(frameDoc(container).head.querySelectorAll('style')).toHaveLength(1)
  })

  it('href 시트는 <link rel=stylesheet> 로 · 배열 차례대로 선다', async () => {
    const { container } = render(
      <CanvasIframe
        styles={[{ id: 'base', css: 'p{}' }, { id: 'theme', href: '/api/theme-packages/a/1.0.0/files/theme.css' }, { id: 'tokens', css: ':root{}' }]}
        width={1280}
      >
        {() => null}
      </CanvasIframe>,
    )
    await waitFor(() => expect(frameDoc(container).head.querySelectorAll('[data-wb-style]')).toHaveLength(3))
    const sheets = [...frameDoc(container).head.querySelectorAll('[data-wb-style]')]
    expect(sheets.map((el) => `${el.tagName.toLowerCase()}:${el.getAttribute('data-wb-style')}`)).toEqual(['style:base', 'link:theme', 'style:tokens'])
    expect(sheets[1]!.getAttribute('rel')).toBe('stylesheet')
    expect(sheets[1]!.getAttribute('href')).toBe('/api/theme-packages/a/1.0.0/files/theme.css')
  })

  it('같은 id 의 종류가 바뀌면 그 자리에서 바꾼다 — css → href', async () => {
    const at = (css: boolean) =>
      [{ id: 'base', css: 'p{}' }, css ? { id: 'theme', css: 'a{}' } : { id: 'theme', href: '/t.css' }, { id: 'tokens', css: ':root{}' }]
    const { container, rerender } = render(<CanvasIframe styles={at(true)} width={1280}>{() => null}</CanvasIframe>)
    rerender(<CanvasIframe styles={at(false)} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() => expect(frameDoc(container).head.querySelector('link[data-wb-style="theme"]')).not.toBeNull())
    const ids = [...frameDoc(container).head.querySelectorAll('[data-wb-style]')].map((el) => el.getAttribute('data-wb-style'))
    expect(ids).toEqual(['base', 'theme', 'tokens'])
    expect(frameDoc(container).head.querySelector('style[data-wb-style="theme"]')).toBeNull()
  })

  it('href 가 바뀌면 같은 link 를 고쳐 쓴다', async () => {
    const { container, rerender } = render(<CanvasIframe styles={[{ id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>)
    const first = await waitFor(() => frameDoc(container).head.querySelector('link')!)
    rerender(<CanvasIframe styles={[{ id: 'theme', href: '/b.css' }]} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() => expect(frameDoc(container).head.querySelector('link')!.getAttribute('href')).toBe('/b.css'))
    expect(frameDoc(container).head.querySelector('link')).toBe(first)
  })

  it('사라진 id 는 걷는다 — 번들이 실패해 theme 시트를 뺀 판', async () => {
    const { container, rerender } = render(
      <CanvasIframe styles={[{ id: 'base', css: 'p{}' }, { id: 'theme', href: '/a.css' }, { id: 'tokens', css: ':root{}' }]} width={1280}>
        {() => null}
      </CanvasIframe>,
    )
    rerender(<CanvasIframe styles={[{ id: 'base', css: 'p{}' }, { id: 'tokens', css: ':root{}' }]} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() => expect(frameDoc(container).head.querySelector('[data-wb-style="theme"]')).toBeNull())
    const ids = [...frameDoc(container).head.querySelectorAll('[data-wb-style]')].map((el) => el.getAttribute('data-wb-style'))
    expect(ids).toEqual(['base', 'tokens'])
  })

  it('차례가 바뀌면 그 차례로 다시 선다', async () => {
    const { container, rerender } = render(
      <CanvasIframe styles={[{ id: 'tokens', css: ':root{}' }, { id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>,
    )
    rerender(<CanvasIframe styles={[{ id: 'theme', href: '/a.css' }, { id: 'tokens', css: ':root{}' }]} width={1280}>{() => null}</CanvasIframe>)
    await waitFor(() =>
      expect([...frameDoc(container).head.querySelectorAll('[data-wb-style]')].map((el) => el.getAttribute('data-wb-style'))).toEqual([
        'theme',
        'tokens',
      ]),
    )
  })

  /**
   * link 시트가 실리는 동안 전이를 멈추는 시트의 수명. jsdom 은 link 를 싣지 않아 `load` · `error` 를 손으로 낸다 — 멈춤이 실제로 전이를
   * 막는지(계산값)는 실브라우저 판 `apps/web/build-test/canvas-iframe.test.ts` 「늦게 온 테마 시트」 가 잰다.
   */
  describe('link 가 실리는 동안의 전이 멈춤', () => {
    const hold = (container: HTMLElement) => frameDoc(container).head.querySelector('style[data-wb-hold]')

    it('새 link 가 실리기 전에는 head 맨 앞에 서고, load 뒤 걷힌다 — 걷을 때 다시 잰다', async () => {
      const { container } = render(
        <CanvasIframe styles={[{ id: 'base', css: 'p{}' }, { id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>,
      )
      await waitFor(() => expect(hold(container)).not.toBeNull())
      const doc = frameDoc(container)
      expect(doc.head.firstElementChild).toBe(hold(container))
      const measured = vi.fn()
      doc.defaultView!.addEventListener('wb-canvas-measure', measured)
      await act(async () => { doc.head.querySelector('link')!.dispatchEvent(new Event('load')) })
      expect({ hold: hold(container), measured: measured.mock.calls.length }).toEqual({ hold: null, measured: 1 })
    })

    it('error 도 걷는다 — 못 받은 시트를 끝없이 기다리지 않는다', async () => {
      const { container } = render(<CanvasIframe styles={[{ id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(hold(container)).not.toBeNull())
      await act(async () => { frameDoc(container).head.querySelector('link')!.dispatchEvent(new Event('error')) })
      expect(hold(container)).toBeNull()
    })

    it('href 가 바뀌면 다시 선다 — 판을 바꾼 시트도 전이 없이 얹힌다', async () => {
      const { container, rerender } = render(<CanvasIframe styles={[{ id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(hold(container)).not.toBeNull())
      await act(async () => { frameDoc(container).head.querySelector('link')!.dispatchEvent(new Event('load')) })
      expect(hold(container)).toBeNull()
      rerender(<CanvasIframe styles={[{ id: 'theme', href: '/b.css' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(hold(container)).not.toBeNull())
    })

    it('css 시트만이면 서지 않는다 — 인라인 시트는 첫 계산에 있다', async () => {
      const { container } = render(<CanvasIframe styles={[{ id: 'base', css: 'p{}' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(frameDoc(container).head.querySelector('style[data-wb-style="base"]')).not.toBeNull())
      expect(hold(container)).toBeNull()
    })

    it('실리기 전에 걷힌 link 는 안 기다린다 — 번들이 실패해 theme 시트를 뺀 판', async () => {
      const { container, rerender } = render(<CanvasIframe styles={[{ id: 'theme', href: '/a.css' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(hold(container)).not.toBeNull())
      rerender(<CanvasIframe styles={[{ id: 'base', css: 'p{}' }]} width={1280}>{() => null}</CanvasIframe>)
      await waitFor(() => expect(frameDoc(container).head.querySelector('link')).toBeNull())
      expect(hold(container)).toBeNull()
    })
  })

  it('iframe 안 클릭이 호스트 onClick 에 닿는다', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <div onClick={(e) => onClick((e.target as Element).getAttribute('data-probe'))}>
        <CanvasIframe styles={[]} width={1280}>{() => <button data-probe="안">누름</button>}</CanvasIframe>
      </div>,
    )
    await waitFor(() => expect(frameDoc(container).querySelector('button')).not.toBeNull())
    fireEvent.click(frameDoc(container).querySelector('button')!)
    expect(onClick).toHaveBeenCalledWith('안')
  })

  it('iframe 의 빈 자리(body · html) 클릭은 onBackgroundClick 으로 — React 의 onClick 에는 안 닿는다', async () => {
    const onBackground = vi.fn()
    const onClick = vi.fn()
    const { container } = render(
      <div onClick={onClick}>
        <CanvasIframe styles={[]} width={1280} onBackgroundClick={onBackground}>{() => <button>누름</button>}</CanvasIframe>
      </div>,
    )
    await waitFor(() => expect(frameDoc(container).querySelector('button')).not.toBeNull())
    fireEvent.click(frameDoc(container).body)
    fireEvent.click(frameDoc(container).documentElement)
    expect(onBackground).toHaveBeenCalledTimes(2)
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(frameDoc(container).querySelector('button')!)
    expect(onBackground).toHaveBeenCalledTimes(2)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('폭은 width px 그대로', () => {
    const { container } = render(<CanvasIframe styles={[]} width={375}>{() => null}</CanvasIframe>)
    expect(container.querySelector('iframe')!.style.width).toBe('375px')
  })

  it('내용이 자라면 iframe 이 따라 자란다', async () => {
    const { container } = render(<CanvasIframe styles={[]} width={1280}>{() => <div />}</CanvasIframe>)
    const doc = await waitFor(() => frameDoc(container))
    // jsdom 은 레이아웃이 없어 scrollHeight 를 흉내 낸다 — 실브라우저 판은 `apps/web/build-test/canvas-iframe.test.ts`.
    Object.defineProperty(doc.documentElement, 'scrollHeight', { configurable: true, value: 640 })
    await act(async () => { doc.defaultView!.dispatchEvent(new Event('wb-canvas-measure')) })
    expect(container.querySelector('iframe')!.style.height).toBe('640px')
  })
})
