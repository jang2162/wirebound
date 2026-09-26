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
