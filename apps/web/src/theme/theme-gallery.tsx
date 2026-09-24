/**
 * **테마 갤러리**(설계서 「테마 관리」의 «미리보기»). 카탈로그의 모든 컴포넌트를 한 화면에 늘어놓고
 * **초안이 고른 구조로** 그린다. 사용자가 왼쪽에서 값 하나를 고치면 여기 예순 개가 함께 변한다.
 *
 * ---
 *
 * # 이 파일이 **하지 않는** 것 셋
 *
 * 셋 다 다른 파일이 소유하는 자리이고, 어기면 어떻게 되는지는 그쪽 주석이 적는다.
 *
 * 1. **초안을 해석하지 않는다.** `resolved`를 props로 받는다. 라우트가 한 번 해석해
 *    갤러리·이슈 패널·CSS 주입 셋에 나눠 준다 — 각자 부르면 같은 초안에 대한 해석이 셋이 되고
 *    갈릴 수 있다(`draft-css.ts`의 `resolveDraft` 주석).
 * 2. **CSS를 주입하지 않는다.** `useDraftCss`가 갤러리 전용 셋째 시트에 이미 싣고 있다.
 *    여기서 또 넣으면 **캔버스의 공유 시트를 덮고 그 뒤 아무도 안 고치는** 사고가 난다
 *    (`draft-css.ts` 머리말의 표).
 * 3. **이슈를 그리지 않는다.** `theme-issues.tsx`가 한 곳에서 `partitionIssues`로 가른다.
 *    아래 *"테마 없이 그린다"* 안내는 **이슈가 아니다** — 이 컴포넌트는 이슈를 받지도 않고
 *    `severity`를 비교하지도 않는다. `resolved === null`은 `resolveTheme`의 계약
 *    (*"`error`가 있으면 `null`"*)을 그대로 읽은 것이다.
 *
 * ---
 *
 * # `resolved`가 `null`일 때 — **그린다. 다만 무테마라고 말한다**
 *
 * **비우지 않는다.**
 *
 * 비우면 사용자가 **방금 무언가를 깨뜨린 그 순간에** 참조 화면을 통째로 잃는다 — 무엇이
 * 아직 서 있는지 보려는 때가 바로 그때다. 렌더러는 테마 없이도 그리므로(카탈로그의 첫 구조를
 * 쓴다) 빈 화면이 되지 않고, 초안 시트는 그때 빈 문자열이라(`resolveDraft`) 화면에 남는 것은
 * **구조 기본 CSS뿐**이다. 그 사실을 문장 하나로 말한다.
 *
 * ---
 *
 * # 오류 경계를 두는 이유는 캔버스와 **같다**
 *
 * `renderNode`는 노드가 잘못된 정도로는 던지지 않는다(폴백으로 흡수한다). 남은 던지는 경로는
 * **구조 구현체 본문의 예외** 하나이고, 렌더러가 그것을 일부러 안 감싼다
 * (`packages/renderer/src/render.tsx`가 그 근거를 적었다 — 감싸면 진짜 버그가 *"폴백이 떴네"*로
 * 위장된다). 경계가 없으면 **구현체 하나의 버그가 테마 저작 화면 전체를 흰 화면으로 만든다.**
 * 갤러리는 항목이 예순 개라 그 확률이 캔버스보다 높다.
 *
 * **리셋 키가 `structureKey`인 것이 판정이다.** 노드는 상수이므로 결과를 바꿀 수 있는 입력은
 * `options.structures` 하나다 — 토큰 값을 고칠 때마다 되살리면 던지는 구현체가 그 자리에서
 * 계속 다시 던지고, 아무 때도 안 되살리면 구조를 바꿔 고친 뒤에도 오류 문장이 남는다.
 *
 * ---
 *
 * # 이 파일이 만드는 **감싸는 상자 둘**
 *
 * `.wb-shell-gallery-list`와 `.wb-shell-gallery-item` 안에 문서 노드가 들어온다. 그래서 둘 다
 * `test/shell-css-guard.ts`의 `WRAPPERS`에 **들어 있다** — 목록에서 빠지면 그 상자에 건 상속
 * 속성 위반을 아무 케이스도 잡지 못한다. 즉 빠뜨리면 감싸는 상자의 상속 속성 위반이 조용히
 * 지나간다. **캡션·안내·오류 배너는 감싸는 상자가 아니다**(문서 노드를 품지 않는다) —
 * 그래서 글자 속성을 마음대로 걸 수 있고, 실제로 캡션이 그 자리다.
 */
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import { renderNode, type NodeRenderError, type RenderOptions } from '@wirebound/renderer'
import { themeStructures, type ResolvedTheme } from '@wirebound/themes'
import { galleryItems, structureCount, structureKey, type GalleryItem } from './gallery-document'
/**
 * 카탈로그·구조 구현체가 없으면 모든 노드가 폴백으로 그려진다(`canvas/canvas.tsx`가 같은
 * 줄을 같은 이유로 갖고 있다).
 *
 * > **지금 이 줄 자체는 아무 케이스도 지키지 않는다.** 바로 위
 * > `./gallery-document`가 같은 모듈을 import하고 **그쪽이 실제로 카탈로그를 읽기** 때문이다
 * > (`test/theme/gallery-document.test.ts`가 그쪽 줄의 구분력을 잰다). 그래도 두는 것은
 * > `renderNode`를 부르는 자리가 여기이고, 위 import가 사라지는 날 **이 줄만이 남는 방벽**이기
 * > 때문이다. `draft-css.ts`도 같은 판단으로 같은 줄을 둔다.
 */
import '../catalog-setup'

/** 축마다 캡션에 붙는 말. 표로 두는 것은 문안이 코드 사이에 흩어지지 않게 하기 위해서다. */
const AXIS_LABEL: Readonly<Record<GalleryItem['axis'], string>> = {
  base: '',
  variant: '변형',
  state: '상태',
}

export function ThemeGallery(props: { resolved: ResolvedTheme | null }): ReactElement {
  const structures = themeStructures(props.resolved)

  return (
    <>
      {props.resolved === null && (
        <p className="wb-shell-gallery-notice" role="status">
          테마에 오류가 있어 지금은 테마 CSS 없이 그립니다. 오류를 고치면 다시 입혀집니다.
        </p>
      )}
      <GalleryBoundary resetKey={structureKey(structures)}>
        <GalleryBody structures={structures} />
      </GalleryBoundary>
    </>
  )
}

/**
 * 항목을 실제로 그리는 자리. `ThemeGallery`에서 갈라 둔 이유는 **오류 경계 때문**이다 —
 * `renderNode`는 엘리먼트를 만드는 함수이지 컴포넌트가 아니므로, 그 호출이 경계보다 위에
 * 있으면 경계가 잡지 못한다(`canvas/canvas.tsx`의 `CanvasDocument`와 같은 이유).
 */
function GalleryBody(props: { structures: Record<string, string> }): ReactElement {
  /**
   * 렌더 중에 모은다. `onNodeError` 안에서 `setState`를 부르면 안 되고(렌더러 주석),
   * `renderNode`가 돌아온 시점에는 그 서브트리의 오류가 이미 이 배열에 들어 있다.
   * **아래 `map`이 동기적으로 다 돌고 나서 배너를 짓는다** — 그래서 상태 없이 같은 렌더에서
   * 쓸 수 있다. 렌더마다 새 배열이므로 StrictMode의 이중 렌더에서도 누적되지 않는다.
   */
  const errors: NodeRenderError[] = []
  const options: RenderOptions = {
    structures: props.structures,
    onNodeError: (error) => errors.push(error),
  }

  const drawn = galleryItems().map((item) => ({ item, tree: renderNode(item.node, options) }))

  return (
    <>
      {errors.length > 0 && (
        <div className="wb-shell-gallery-error" role="alert">
          <p className="wb-shell-gallery-error-title">
            갤러리 노드 {errors.length}개를 그리지 못했습니다
          </p>
          <ul className="wb-shell-gallery-error-list">
            {/* 키가 인덱스인 것은 이 목록이 렌더마다 새로 만들어지고 항목이 상태를 갖지 않기
                때문이다(`canvas/canvas.tsx`의 같은 목록과 같은 판단). */}
            {errors.map((error, index) => (
              <li key={index} className="wb-shell-gallery-error-item">
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="wb-shell-gallery-list">
        {drawn.map(({ item, tree }) => (
          <div key={item.node.id} className="wb-shell-gallery-item">
            <Caption item={item} structures={props.structures} />
            {tree}
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * 항목 하나의 머리글. **안 보이는 구조 옵션이 있다는 것을 화면에 적는 자리다.**
 *
 * 구조 옵션을 다 늘어놓지 않기로 한 대신 *"5개 중 bordered"*라고 **세어서** 말한다 — 안 보이는
 * 것이 몇 개인지 알려 주지 않으면 사용자는 자기가 보고 있는 것이 전부라고 믿는다.
 * (근거는 `gallery-document.ts` 머리말의 측정 표에 있다.)
 *
 * **테마가 언급하지 않은 타입을 표시한다.** `themeStructures`에 키가 없다는 것은 초안의
 * `components`에 그 타입이 없다는 뜻이고, 그러면 `base`·조각·변형·상태 **어느 층도** 나오지
 * 않는다. 그때 화면에 보이는 것은 구조 기본 CSS와 토큰뿐인데, 그것을 말해 주지 않으면
 * *"내 테마가 이렇게 생겼구나"*로 읽힌다. 그리고 그 자리에 그려지는 구조는 테마의 선택이
 * 아니라 **카탈로그의 첫 구조**다(`resolveStructureOf`) — 그것도 함께 적는다.
 */
function Caption(props: { item: GalleryItem; structures: Record<string, string> }): ReactElement {
  const type = props.item.node.type
  const chosen = props.structures[type]
  const structure = chosen ?? props.item.def.structures[0] ?? ''
  const count = structureCount(type)

  return (
    <p className="wb-shell-gallery-caption">
      <span className="wb-shell-gallery-type">{type}</span>
      <span className="wb-shell-gallery-structure">
        {structure}
        {count > 1 && ` · 구조 ${count}개 중`}
      </span>
      {props.item.axis !== 'base' && (
        <span className="wb-shell-gallery-axis">
          {AXIS_LABEL[props.item.axis]} {props.item.name}
        </span>
      )}
      {chosen === undefined && (
        <span className="wb-shell-gallery-untouched">테마가 언급하지 않음 · 카탈로그 기본 구조</span>
      )}
    </p>
  )
}

/** 오류 경계의 상태. 메시지가 있으면 그 문장을 대신 그린다. */
interface BoundaryState {
  message: string | null
}

/**
 * 갤러리를 그리다 던진 예외를 잡는다. 근거는 이 파일 머리말의 *"오류 경계를 두는 이유"* 절에
 * 있고, 형태는 `canvas/canvas.tsx`의 `CanvasBoundary`와 같다.
 *
 * **합치지 않는다.** 그쪽은 `resetKey`가 `PageDocument`로 못박혀 있고 문안도 캔버스의 것이다.
 * 공통 컴포넌트로 빼는 것이 옳아 보이지만 그러려면 `canvas.tsx`의 `CanvasBoundary`를 함께
 * 고쳐야 한다 — 합칠 때는 둘을 한 번에 옮긴다.
 *
 * **내보내는 것은 케이스 때문이다.** 던지는 구조 구현체를 레지스트리에 심으면 등록이 전역이라
 * (`registerStructure`는 중복에 던진다) 다른 케이스 파일까지 오염된다 — 경계가 잡는 것은
 * *"자식이 던진다"* 하나이므로 그것을 직접 재는 편이 좁고 정확하다.
 */
export class GalleryBoundary extends Component<
  { resetKey: string; children: ReactNode },
  BoundaryState
> {
  override state: BoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 사용자에게는 문장 하나만 보이므로, 원인을 찾을 사람을 위해 콘솔에 남긴다.
    console.error('테마 갤러리를 그리지 못했습니다', error, info.componentStack)
  }

  override componentDidUpdate(prev: { resetKey: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.message !== null) {
      this.setState({ message: null })
    }
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      <div className="wb-shell-gallery-error" role="alert">
        <p className="wb-shell-gallery-error-title">갤러리를 그리지 못했습니다</p>
        <p className="wb-shell-gallery-error-item">{this.state.message}</p>
      </div>
    )
  }
}
