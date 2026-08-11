/**
 * 갤러리가 그릴 **문서**를 만든다. React를 모르는 순수 데이터 모듈이다.
 *
 * §6.10: *"테마 편집 화면은 모든 컴포넌트를 한 페이지에 늘어놓은 테마 갤러리를 실시간으로
 * 보여준다. 변경이 전 컴포넌트에 어떻게 퍼지는지 즉시 확인한다."* **이 파일이 그 "모든
 * 컴포넌트"의 정의다.**
 *
 * ---
 *
 * # 재라 #5의 답 — **구조 옵션마다가 아니다. 축은 테마가 실제로 스타일하는 것이다**
 *
 * 계획서가 넘긴 물음은 *"컴포넌트 전부를 한 번씩인지, 구조 옵션마다인지"*였다. 후자는
 * **45개**다(P4b-2가 구현한 수, P4b-3 ③이 재확인). **재보니 둘 다 아니다.**
 *
 * **밟아서 잰 것**(내가 쟀다 — `compileTheme`이 낸 CSS에서 선택자를 센 값이다):
 *
 * | # | 센 것 | 값 |
 * |---|---|---|
 * | 1 | 카탈로그의 컴포넌트 타입 | **19** |
 * | 2 | 그 타입들의 구조 옵션 합 | **45** |
 * | 3 | `admin` 테마가 `base` 규칙을 내는 (타입:구조) 쌍 | **15** |
 * | 4 | 즉 45개 중 **base 선언이 아예 없는** 구조 옵션 | **30** |
 * | 5 | `admin`이 내는 변형 층 | **21** |
 * | 6 | `admin`이 내는 상태 층 | **8** |
 *
 * **주석이 아니라 케이스가 센다** — 여섯 줄 전부
 * `test/theme/gallery-document.test.ts`의 `재라 #5` 묶음이 단언한다. 값이 바뀌면 거기서 죽고,
 * 죽으면 이 표를 고치게 된다(수를 적어 두었다가 낡는 것이 이 저장소의 반복된 실패다).
 *
 * 검산(워크트리 루트에서):
 * `pnpm vitest run --project web apps/web/test/theme/gallery-document.test.ts -t '재라 #5'`
 *
 * **4번이 판정의 근거다.** 방출이 컴포넌트 `base`를 내는 선택자는
 * `[data-wb-component="X"][data-wb-structure="Y"]`이고, **`Y`는 테마가 고른 구조 하나뿐**이다
 * (`packages/themes/src/emit/index.ts`의 `pushComponent`). 그러므로 45개를 다 늘어놓으면
 * **셋 중 둘은 테마가 아무 말도 하지 않은 채로** 그려진다 — `Card`의 plain·bordered·elevated는
 * DOM이 글자까지 같으므로(P4b-3 §3이 쟀다. 45개 중 14개가 그 부류다) 화면에는 **똑같이 생긴
 * 상자 셋**이 뜨고, 그중 하나만 테마가 입혀져 있다. *"변경이 어떻게 퍼지는가"*를 보러 온
 * 사람에게 **퍼지지 않는 것 30개를 함께 보여 주는 것**이 그 화면이다.
 *
 * **반대로 5·6이 빠져 있었다.** 변형과 상태의 선택자는
 * `[data-wb-component="X"][data-wb-variant="v"]` · `[data-wb-state~="s"]`로 **구조와 무관하게**
 * 걸린다(같은 파일의 `pushLayer`). `admin` 하나가 그 층을 **29개** 갖고 있는데, 구조만 늘어놓는
 * 갤러리는 그 29개를 **하나도 보여 주지 못한다.** §6.5가 상태의 쓸모를 *"'선택된 행 강조' 같은
 * 서술을 목업에서 실제로 보여주려면"*이라고 적은 그 자리다.
 *
 * **그래서 축은 셋이다:** 타입마다 한 번(테마가 고른 구조로) · **선언된 변형마다** ·
 * **선언된 상태마다**. 안 그리는 구조 옵션이 몇 개인지는 **화면이 캡션으로 말한다**
 * (`theme-gallery.tsx`) — 숨기는 것이 아니라 세어서 보여 준다.
 *
 * ---
 *
 * # 왜 문서인가 — **`validatePage`를 지나는 진짜 페이지 문서다**
 *
 * `galleryDocument()`가 내는 것은 갤러리 항목 전부를 `Page` 아래에 담은 `PageDocument`이고,
 * 케이스가 `validatePage`로 **이슈 0건**을 확인한다. 그리는 자리는 항목마다 `renderNode`를
 * 부르지만(캡션을 사이에 끼워야 해서 문서 하나를 통째로 그릴 수 없다), **샘플 데이터가
 * 사용자 문서와 같은 규칙을 지킨다는 것**은 그 문서로 잰다. 그 케이스 하나가 잡는 것:
 * 중복 id · 없는 prop · `children`을 못 갖는 타입에 자식을 단 것 · `variantFrom` 타입에
 * `node.variant`를 쓴 것(`ignored-variant`) · `Slot`을 넣은 것(`slot-count`).
 *
 * ---
 *
 * # 제외한 타입 둘 — **이유가 서로 다르다**
 *
 * `EXCLUDED`에 문장으로 적어 두었다. **`admin`이 아무 말도 하지 않는 타입이 정확히 그 둘이라는
 * 것은 우연이 아니다**(내가 쟀다 — 위 검산 명령이 함께 낸다): 페이지의 껍데기와 레이아웃의
 * 구멍은 *"늘어놓고 보는"* 대상이 아니다.
 */
import {
  CURRENT_DOCUMENT_VERSION,
  getComponent,
  listComponents,
  type ComponentDef,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
/**
 * **카탈로그가 설치돼 있어야 이 파일이 일한다.** `listComponents()`가 빈 배열이면 갤러리가
 * 통째로 사라지고, 설치 전에 그린 노드는 전부 *"알 수 없는 컴포넌트 타입"* 폴백이 된다
 * (`catalog-setup.ts`의 주석이 설치가 import만으로 끝나는 이유를 적어 두었다).
 *
 * **이 줄이 지켜지는지 케이스가 잰다** — `draft-css.ts`의 같은 import는 오늘 0 사망이라고
 * ①이 적었는데(그 파일이 바로 다음 줄에서 `use-theme-css`를 끌어오기 때문이다), 이쪽은
 * 카탈로그 말고 아무것도 import하지 않으므로 **이 줄만이 설치의 유일한 경로다.**
 * 지우면 케이스가 죽는다(재서 확인했다 — 보고서의 변조 표).
 */
import '../catalog-setup'

/** 항목이 무엇을 보이려고 거기 있는가. 캡션의 문안이 이 값에서 갈린다. */
export type GalleryAxis = 'base' | 'variant' | 'state'

export interface GalleryItem {
  /** 그릴 문서 노드. `renderNode`가 그대로 받는다. */
  node: WbNode
  /** 카탈로그 정의. 캡션이 구조 옵션 수를 여기서 읽는다. */
  def: ComponentDef
  axis: GalleryAxis
  /** 변형·상태의 이름. `axis`가 `base`면 빈 문자열이다. */
  name: string
}

/** 자식 하나의 명세. **한 겹만 판다** — 손자까지 두면 샘플이 화면보다 커진다. */
interface ChildSpec {
  type: string
  props: Record<string, unknown>
}

interface Sample {
  props: Record<string, unknown>
  /** `children: 'none'`인 타입에 적으면 `validatePage`가 `children-not-allowed`로 잡는다. */
  children?: readonly ChildSpec[]
}

/**
 * 갤러리에 안 넣는 타입과 **그 이유**. 이유를 문자열로 두는 것은, 이 목록이 늘 때
 * *"왜 빠졌는지"*가 코드 밖으로 새지 않게 하기 위해서다.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  ['Page', '갤러리 문서 자체의 루트다 — 항목으로 또 넣으면 문서가 문서를 품는다'],
  ['Slot', '레이아웃 전용이다(§4.4) — 페이지 문서에 넣으면 validatePage가 slot-count로 막는다'],
])

/**
 * 컴포넌트마다 **무엇을 담아 보일 것인가.**
 *
 * **파생할 수 없어서 손으로 적는 유일한 자리다.** props의 기본값은 카탈로그에 다 있지만
 * (`Card.title`은 `''`, `List.columns`는 `['컬럼 1','컬럼 2']`) 그대로 그리면 **빈 상자 열일곱**이
 * 나온다 — 테마가 무엇을 어떻게 입히는지 보이지 않는다.
 *
 * **빠뜨려도 갤러리에서 사라지지는 않는다** — 없으면 `{}`로 그려 카탈로그 기본값이 쓰인다.
 * 대신 케이스가 **카탈로그에 없는 키**(낡은 항목)를 잡는다. 반대 방향(새 컴포넌트에 샘플이
 * 없는 것)을 케이스로 막지 않는 것은, 그때 나와야 하는 것이 *"실패"*가 아니라 *"기본값으로
 * 그려진 새 컴포넌트"*이기 때문이다.
 */
const SAMPLES: Readonly<Record<string, Sample>> = {
  Section: {
    props: { compact: false },
    children: [{ type: 'Text', props: { content: '섹션 본문', role: 'body' } }],
  },
  Flex: {
    props: { direction: 'row', align: 'center', justify: 'between', wrap: false },
    children: [
      { type: 'Text', props: { content: '왼쪽', role: 'body' } },
      { type: 'Button', props: { label: '오른쪽' } },
    ],
  },
  Grid: {
    props: { columns: 3 },
    children: [
      { type: 'Placeholder', props: { label: '1', height: 60 } },
      { type: 'Placeholder', props: { label: '2', height: 60 } },
      { type: 'Placeholder', props: { label: '3', height: 60 } },
    ],
  },
  Card: {
    props: { title: '카드 제목', subtitle: '부제' },
    children: [
      { type: 'Text', props: { content: '카드 본문', role: 'body' } },
      { type: 'Button', props: { label: '자세히' } },
    ],
  },
  Tabs: {
    props: { tabs: ['개요', '상세', '이력'], active: 0 },
    children: [{ type: 'Text', props: { content: '탭 내용', role: 'body' } }],
  },
  // **`items`가 4다.** 기본값 5보다 하나 적은 것은 `rowAlt`(짝수 줄)를 보이면서도 카드 하나
  // 높이에 들어가게 하려는 것이다 — 갤러리는 항목이 예순 개라 하나가 길면 전체가 길어진다.
  List: {
    props: { items: 4, columns: ['이름', '상태', '수정일'], pagination: true, selectable: true },
  },
  Tree: { props: { items: ['대시보드', '사용자', '설정'], depth: 2 } },
  KeyValue: {
    props: {
      pairs: [
        { key: '상태', value: '활성' },
        { key: '등록일', value: '2026-08-11' },
      ],
      columns: 1,
    },
  },
  SearchForm: {
    props: { collapsed: false },
    children: [
      { type: 'Field', props: { label: '키워드', control: 'text', placeholder: '검색어' } },
      { type: 'Field', props: { label: '상태', control: 'select' } },
    ],
  },
  EntryForm: {
    props: { title: '기본 정보' },
    children: [
      { type: 'Field', props: { label: '이름', control: 'text', required: true } },
      { type: 'Field', props: { label: '설명', control: 'textarea' } },
    ],
  },
  Field: { props: { label: '라벨', control: 'text', placeholder: '입력하세요' } },
  Button: { props: { label: '버튼' } },
  Link: { props: { label: '링크', target: '/projects' } },
  Text: { props: { content: '다람쥐 헌 쳇바퀴에 타고파', role: 'body' } },
  Media: { props: { kind: 'image', caption: '이미지 설명', ratio: '16/9' } },
  Divider: { props: { direction: 'horizontal' } },
  Placeholder: { props: { label: '미정 영역', height: 80 } },
}

/** 케이스가 낡은 항목을 세는 데 쓴다. 프로덕션에서 읽는 자리는 없다. */
export const GALLERY_SAMPLE_TYPES: readonly string[] = Object.keys(SAMPLES)

/** 케이스가 *"왜 빠졌는지"*를 그대로 읽는다. */
export const GALLERY_EXCLUDED: ReadonlyMap<string, string> = EXCLUDED

/**
 * 한 번만 만든다. **항목이 렌더마다 새 객체가 되면 안 된다** — `node.id`가 React 키이고,
 * 노드가 갈리면 예순 개 서브트리가 전부 마운트를 다시 한다. 카탈로그는 프로세스가 사는 동안
 * 안 바뀌므로(`installCatalog`이 멱등하고 지우는 경로가 프로덕션에 없다) 캐시가 성립한다.
 *
 * **모듈 평가 시점이 아니라 첫 호출 때 만드는 이유:** 위 `import '../catalog-setup'`이
 * 먼저 돌기는 하지만, 모듈 본문에서 만들면 갤러리를 한 번도 안 여는 화면도 그 값을 짓는다.
 */
let cached: readonly GalleryItem[] | null = null

export function galleryItems(): readonly GalleryItem[] {
  return (cached ??= buildItems())
}

function buildItems(): GalleryItem[] {
  const items: GalleryItem[] = []
  let seq = 0
  const nextId = (type: string): string => `g-${(seq += 1)}-${type}`

  for (const def of listComponents()) {
    if (EXCLUDED.has(def.type)) continue

    /**
     * **`variantFrom` 타입은 base를 안 낸다.** 그런 컴포넌트는 변형을 prop에서 파생하고
     * (`renderer/src/attrs.ts`의 `variantOf`) 그 prop에 기본값이 있으므로, base 항목은 아래
     * 변형 항목 중 하나와 **`data-wb-variant`까지 같은 노드**가 된다. 셋이 그렇다:
     * `Text`(role) · `Field`(control) · `Divider`(direction).
     *
     * **반대로 `variantFrom`이 없는 타입의 `default` 변형은 base와 다르다** — base 노드에는
     * `data-wb-variant`가 아예 없어 `[data-wb-variant="default"]`가 맞지 않는다. 둘 다 낸다.
     */
    if (def.variantFrom === undefined) {
      items.push({ node: makeNode(def, nextId), def, axis: 'base', name: '' })
    }

    for (const variant of def.variants) {
      const node = makeNode(def, nextId)
      if (def.variantFrom === undefined) node.variant = variant
      else node.props = { ...node.props, [def.variantFrom]: variant }
      items.push({ node, def, axis: 'variant', name: variant })
    }

    /**
     * **상태는 같은 이름의 prop이 `true`인 것에서 파생된다**(`activeStates`). 그 짝을
     * `defineComponent`가 강제하므로(P0 이월 #9) 여기서 이름이 어긋날 수 없다.
     */
    for (const state of def.states) {
      const node = makeNode(def, nextId)
      node.props = { ...node.props, [state]: true }
      items.push({ node, def, axis: 'state', name: state })
    }
  }

  return items
}

function makeNode(def: ComponentDef, nextId: (type: string) => string): WbNode {
  const sample = SAMPLES[def.type]
  const node: WbNode = { id: nextId(def.type), type: def.type, props: { ...(sample?.props ?? {}) } }

  const children = sample?.children
  if (children !== undefined && children.length > 0) {
    node.children = children.map((child) => ({
      id: nextId(child.type),
      type: child.type,
      props: { ...child.props },
    }))
  }

  return node
}

/**
 * 갤러리 항목 전부를 담은 페이지 문서.
 *
 * **그리는 데는 안 쓴다** — 항목 사이에 셸의 캡션이 들어가야 해서 갤러리는 `renderNode`를
 * 항목마다 부른다(`theme-gallery.tsx`). 이 함수가 있는 이유는 머리말의 *"왜 문서인가"*에
 * 있다: 샘플 데이터가 **사용자 문서와 같은 규칙을 지키는지**를 `validatePage`로 재기 위해서다.
 *
 * **노드를 복사하지 않는다.** `galleryItems()`가 든 것과 같은 객체다 — 복사하면 검증하는
 * 문서와 그려지는 노드가 갈릴 수 있고, 그러면 이 함수가 재는 것이 아무것도 아니게 된다.
 */
export function galleryDocument(): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'g-0-Page',
      type: 'Page',
      props: {},
      children: galleryItems().map((item) => item.node),
    },
  }
}

/**
 * 구조 선택을 문자열 하나로 접는다. **이 값이 같으면 갤러리가 그릴 DOM도 같다** — 노드는
 * 상수이고 갈리는 것은 `options.structures`뿐이기 때문이다.
 *
 * 쓰는 자리는 오류 경계의 리셋 키다(`theme-gallery.tsx`). 토큰 값 하나를 고칠 때마다 경계를
 * 되살리면 던지는 구조 구현체가 그 자리에서 계속 다시 던지고, 반대로 아무 때도 안 되살리면
 * 구조를 바꿔 고친 뒤에도 오류 문장이 남는다.
 *
 * **정렬한다.** `themeStructures`가 테마의 `components` 순서를 그대로 쓰므로, 같은 선택을
 * 다른 순서로 적은 두 초안이 다른 키를 내면 안 된다.
 */
export function structureKey(structures: Record<string, string>): string {
  return Object.keys(structures)
    .sort()
    .map((type) => `${type}:${structures[type]}`)
    .join('|')
}

/**
 * 이 타입이 오늘 카탈로그에 몇 가지 구조를 갖고 있는가. 캡션이 *"5개 중 bordered"*를 적는 데
 * 쓴다. **없는 타입은 0이다** — 갤러리 항목의 타입은 전부 카탈로그에서 왔으므로 그 값이
 * 나오면 레지스트리가 초기화된 것이다.
 */
export function structureCount(type: string): number {
  return getComponent(type)?.structures.length ?? 0
}
