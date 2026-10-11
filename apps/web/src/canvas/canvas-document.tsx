/**
 * **캔버스 iframe 의 문서를 셸의 다른 칸이 아는 통로.**
 *
 * 캔버스 문서는 별도 `Document`(iframe)라 그 안의 네이티브 이벤트(`mousedown` · `keydown` · 포인터)가 호스트 `document` ·
 * `window` 로 올라가지 않는다 — 호스트에 전역 리스너를 거는 장치(팝오버 닫기 `shell/use-popover-dismiss.ts`)는 이 문서에도 걸어야
 * 캔버스 위의 조작을 받는다. React 합성 이벤트는 portal 로 호스트 트리에 닿으므로 이 통로가 필요 없다.
 *
 * **iframe 은 페이지를 옮길 때마다 새로 선다**(조회 중에 캔버스가 내려갔다 올라온다). 그래서 문서를 한 번 읽어 두지 말고 이
 * 값을 이펙트의 의존으로 두어, 바뀌면 옛 문서의 리스너를 걷고 새 문서에 건다.
 *
 * 공급자 밖이면 `null` 이다(캔버스가 없는 화면 · 최소 숙주 테스트).
 */
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'

interface Publish {
  show: (doc: Document) => void
  /** 그 문서가 지금 값일 때만 비운다 — 새 iframe 이 먼저 섰으면 그것을 지우지 않는다. */
  hide: (doc: Document) => void
}

const DocumentContext = createContext<Document | null>(null)
const PublishContext = createContext<Publish>({ show: () => {}, hide: () => {} })

/** 셸이 캔버스와 머리를 함께 감싼다. `children` 을 그대로 넘겨 값이 바뀌어도 읽는 쪽만 다시 그린다. */
export function CanvasDocumentProvider(props: { children: ReactNode }): ReactElement {
  const [doc, setDoc] = useState<Document | null>(null)
  const show = useCallback((next: Document) => setDoc(next), [])
  const hide = useCallback((gone: Document) => setDoc((prev) => (prev === gone ? null : prev)), [])
  const [publish] = useState<Publish>(() => ({ show, hide }))
  return (
    <PublishContext.Provider value={publish}>
      <DocumentContext.Provider value={doc}>{props.children}</DocumentContext.Provider>
    </PublishContext.Provider>
  )
}

/** 캔버스가 지금 그리는 iframe 문서를 싣는다. 내려가면 거둔다. */
export function usePublishCanvasDocument(doc: Document | null): void {
  const publish = useContext(PublishContext)
  useLayoutEffect(() => {
    if (doc === null) return
    publish.show(doc)
    return () => publish.hide(doc)
  }, [publish, doc])
}

/** 지금 캔버스 iframe 의 문서. 없으면 `null`. */
export function useCanvasDocument(): Document | null {
  return useContext(DocumentContext)
}
