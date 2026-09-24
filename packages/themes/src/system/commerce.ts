import type { Theme } from '../spec/theme'

/**
 * 내장 시스템 테마 — 커머스(상품 목록·상세).
 *
 * **무엇이 이 테마를 `admin`과 다르게 만드는가.** 관리자 화면이 *"좁은 여백과 표 중심의
 * 밀도"*라면 커머스는 **이미지가 먼저 오고 가격과 구매 액션이 그 다음**이다. 그래서
 * 갈리는 자리가 넷이다.
 *
 * | 층 | `admin` | 여기 |
 * |---|---|---|
 * | 토큰 | 차가운 slate·blue, 본문 14px | 따뜻한 stone·orange, 본문 16px, **선언한 서체** |
 * | 골격 | `maxWidth: 1440px` · 섹션 여백 `space.8` | `1200px` · `space.14` (상품이 숨 쉴 자리) |
 * | 구조 | 표·평카드·밑줄탭·들여쓴트리 | **미디어줄·이미지카드·알약탭·아코디언** |
 * | 스킨 | 각진 모서리(4~10px) | 둥근 모서리(6~16px)와 **알약 버튼** |
 *
 * ---
 *
 * **`List`를 `mediaList`로 고른 이유 — 그리고 그 대가.**
 *
 * 커머스에서 `List`가 필요한 자리는 둘이다: **상품 격자**(PLP)와 **줄 목록**(장바구니·주문
 * 내역·검색 결과). **구조 선택이 컴포넌트 타입 단위라 둘을 한 문서에 둘 수 없다.**
 *
 * 격자를 포기한 것이 아니라 **다른 길이 있어서** 줄 목록을 골랐다. 상품 격자는
 * `Grid` + `Card:mediaTop`으로 조립된다(둘 다 이 테마가 스킨을 갖는다). 반대로 줄 목록의
 * *"썸네일 옆에 제목 위 가격"*은 `mediaList`의 `body` 조각이 없으면 **어떤 테마도 표현할 수
 * 없다** — `cardGrid`·`stackedList`에는 그 조각이 아예 없다.
 *
 * **대가는 `List.items` 손잡이다.** 격자를 `Grid`로 조립하면 카드 수를 노드 하나로 정할 수
 * 없어 `Card`를 그 수만큼 두어야 한다.
 *
 * ---
 *
 * **`primitives`를 스타일 값이 가리킨다.**
 *
 * `Section.parts.inner.maxWidth: 'container.maxWidth'`가 `primitives`의 1200px을 가리키고,
 * 폭은 한 곳에만 적힌다. 스타일 전용 이름공간 셋(`container`·`grid`·`section` —
 * `STYLE_PRIMITIVE_NAMESPACES`)이 그 문법을 열고, 컴파일 결과는
 * `max-width: var(--wb-container-maxWidth)`다.
 */
export const COMMERCE_THEME: Theme = {
  meta: {
    id: 'commerce',
    name: '커머스',
    description:
      '상품 목록·상세 중심의 쇼핑몰 테마. 이미지가 먼저 오고 가격과 구매 액션이 강조된다.',
    version: '1.0.0',
  },

  tokens: {
    // 따뜻한 중립(stone) 위에 강한 액센트 하나. `admin`의 차가운 slate·blue와 갈리는 첫 자리다.
    palette: {
      'stone.50': '#fafaf9',
      'stone.100': '#f5f5f4',
      'stone.200': '#e7e5e4',
      'stone.300': '#d6d3d1',
      'stone.500': '#78716c',
      'stone.900': '#1c1917',
      'amber.50': '#fffbeb',
      'orange.600': '#ea580c',
      'rose.600': '#e11d48',
      'emerald.600': '#059669',
    },
    semantic: {
      primary: 'palette.orange.600',
      primarySoft: 'palette.amber.50',
      surface: '#ffffff',
      canvas: 'palette.stone.50',
      border: 'palette.stone.200',
      borderStrong: 'palette.stone.300',
      text: 'palette.stone.900',
      textMuted: 'palette.stone.500',
      danger: 'palette.rose.600',
      /** 가격을 쓰는 자리. 커머스에서 값은 본문 색이 아니다. */
      price: 'palette.rose.600',
      /** 재고·배송 같은 긍정 표시. */
      success: 'palette.emerald.600',
    },
    scale: {
      space: { unit: '4px' },
      // 각진 관리자와 갈리는 자리. `pill`은 탭과 버튼이 함께 쓴다.
      radius: { sm: '6px', md: '10px', lg: '16px', pill: '999px' },
      shadow: {
        sm: '0 1px 3px rgba(28,25,23,.06)',
        md: '0 6px 16px rgba(28,25,23,.08)',
        lg: '0 16px 40px rgba(28,25,23,.12)',
      },
      /**
       * **`family`가 여기 있고 `assets.fonts`가 그것을 싣는다.** `admin`에는 둘 다 없다.
       *
       * **두 층이 갈려 있고 둘 다 있어야 화면에 보인다:**
       * `assets.fonts`는 `@font-face`를 내고, 그것을 **컴포넌트에 거는 것은 `fontFamily`
       * 어휘**다. 아래 `Page.base`가 그 한 자리이고 상속으로 문서 전체에 퍼진다.
       *
       * `price`는 `Text.variants`에 없는 항목이다 — 아홉 역할과 이름이 겹치지 않으므로
       * 조각(`List.parts.meta`·`Card.parts.subtitle`)에서만 쓴다.
       */
      typography: {
        family: { sans: '"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif' },
        display: { fontSize: '44px', lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' },
        h1: { fontSize: '32px', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.015em' },
        h2: { fontSize: '26px', lineHeight: 1.3, fontWeight: 700 },
        h3: { fontSize: '21px', lineHeight: 1.35, fontWeight: 600 },
        h4: { fontSize: '18px', lineHeight: 1.4, fontWeight: 600 },
        h5: { fontSize: '16px', lineHeight: 1.45, fontWeight: 600 },
        h6: { fontSize: '13px', lineHeight: 1.4, fontWeight: 600, letterSpacing: '0.04em' },
        body: { fontSize: '16px', lineHeight: 1.65, fontWeight: 400 },
        caption: { fontSize: '13px', lineHeight: 1.5, fontWeight: 400 },
        price: { fontSize: '20px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.01em' },
      },
      motion: { base: '180ms', fast: '120ms' },
    },
  },

  /**
   * 설계서 「primitives — 사이트 골격」: *"실제 사이트처럼 보이는 인상의 절반은 여기서 나온다."* 커머스는 관리자보다
   * **좁고 높다** — 폭을 가둬 카드 폭을 고르게 하고, 섹션 여백을 넉넉히 줘 상품 묶음이
   * 서로 밀리지 않게 한다.
   *
   * 브레이크포인트도 `admin`(640·768·1024)과 다르다 — 모바일 커머스가 실제 트래픽의 축이라
   * 좁은 쪽 경계를 480으로 내리고 데스크톱 경계를 1120으로 올렸다.
   */
  primitives: {
    container: { maxWidth: '1200px', gutter: 'space.6' },
    grid: { columns: 12, gap: 'space.6' },
    section: { paddingY: 'space.14', paddingYCompact: 'space.7' },
    breakpoints: { sm: 480, md: 768, lg: 1120 },
  },

  /**
   * 설계서 「assets」. **`placeholder.style`은 컴파일되지 않는다** — 선언은 검증을
   * 지나지만 CSS로 나가는 경로가 없다. 그래도 `photo`를 적어 둔 것은 **커머스가 그것을
   * 실제로 필요로 하는 테마**이기 때문이다: 상품 목록의 빈 상자가 점선 스켈레톤이면
   * 설계서가 쇼핑몰로 안 읽힌다.
   *
   * **`src`는 `local()`뿐이다 — 네트워크를 쓰지 않는다.** data URI도 네트워크 없이 되지만
   * `local()`이면 폰트 바이너리를 소스에 심지 않아도 된다. 한계: **그 이름의 로컬 폰트가
   * 없으면 face가 등록은 되고 로드만 실패한다.** 그래서 `typography.family.sans`의 폴백
   * 사슬이 실제로 쓰인다.
   *
   * `weights`는 **값마다 `@font-face` 블록 하나**가 나간다(범위로 접지 않는다).
   */
  assets: {
    fonts: [
      {
        family: 'Pretendard',
        src: "local('Pretendard Variable'), local('Pretendard')",
        weights: [400, 600, 700],
      },
    ],
    icons: 'lucide',
    placeholder: { style: 'photo' },
  },

  /**
   * 설계서 「patterns — 테마가 소유한 구성 레시피」. 하나를 선언해 둔 것은 커머스의 대표
   * 화면이 **정확히 한 덩어리**이기 때문이다 — *"큰 이미지 옆에 이름·가격·담기"*. 이름
   * 범주는 그 절의 고정 목록 안이다(`content`).
   *
   * **props를 카탈로그 그대로 적었다.** `checkPatterns`가 카탈로그의 zod로 `props`를
   * 보므로, 없는 prop 하나가 `bad-pattern-node`가 되어 **이 테마 전체가 해석되지 않는다**
   * (그 절의 예시에 있는 `Grid.props.gap`이 그 부류다 — 카탈로그에 없는 prop이라 그대로
   * 옮기면 이 오류가 난다). 그래서 `Grid`에는 `columns`만, `Flex`에는 `direction`만 준다.
   */
  patterns: {
    'content.product': {
      name: '상품 상세 — 이미지와 구매',
      slots: { image: 'media', title: 'text', price: 'text', cart: 'action' },
      schema: {
        type: 'Section',
        children: [
          {
            type: 'Grid',
            props: { columns: 2 },
            children: [
              { type: 'Media', slot: 'image', props: { kind: 'image', ratio: '1/1' } },
              {
                type: 'Flex',
                props: { direction: 'column' },
                children: [
                  { type: 'Text', slot: 'title', props: { role: 'h1' } },
                  { type: 'Text', slot: 'price', props: { role: 'h2' } },
                  {
                    type: 'Button',
                    slot: 'cart',
                    variant: 'primary',
                    props: { label: '장바구니 담기' },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },

  /**
   * **순서가 곧 캐스케이드다**(설계서 「컴파일」 — 같은 특이도에서 나중이 이긴다). 그리고
   * 조각 규칙이 **자손 결합자**라 그 순서가 중첩된 컴포넌트의 같은 이름 조각에서 승패를
   * 정한다. 이 테마에서 실제로 겹치는 짝은 아래 주석에 적었다.
   */
  components: {
    // ── 골격 ────────────────────────────────────────────────────────────────
    /**
     * **`admin`이 매핑하지 않는 컴포넌트다.** 여기 두는 이유는 하나 — **선언한 서체를 문서
     * 전체에 거는 자리가 여기뿐**이기 때문이다. 테마가 스타일할 수 있는 것은 컴포넌트
     * 루트와 조각뿐이라(「components — 구조 + 스킨」) `:root`나 `body`에 손댈 어휘가 없고, `Page`가 문서의 유일한
     * 최상위 상자다. `font-family`는 상속되므로 한 줄이 전부에 퍼진다.
     */
    Page: {
      structure: 'default',
      base: {
        bg: 'semantic.canvas',
        fg: 'semantic.text',
        fontFamily: 'typography.family.sans',
        typography: 'body',
      },
    },
    Section: {
      structure: 'contained',
      base: { bg: 'semantic.canvas', paddingY: 'space.14' },
      parts: { inner: { maxWidth: 'container.maxWidth', paddingX: 'space.6' } },
      variants: {
        hero: { bg: 'semantic.primarySoft', paddingY: 'space.20' },
        muted: { bg: 'semantic.surface' },
      },
      responsive: {
        sm: { base: { paddingY: 'space.6' }, parts: { inner: { paddingX: 'space.4' } } },
        md: { base: { paddingY: 'space.10' } },
      },
    },
    Flex: { structure: 'default', base: { gap: 'space.4' } },
    Grid: { structure: 'default', base: { gap: 'space.6' } },
    /**
     * **상품 카드.** `mediaTop`을 고른 것이 이 테마에서 가장 큰 구조 결정이다 — 상품 격자를
     * `Grid` + 이 카드로 조립하기 때문이다(파일 머리말).
     *
     * **`parts.media`에 `aspectRatio`를 건다.** 구조 기본 CSS가 거기 `16 / 9`를 두는데
     * 상품 이미지는 정사각 격자가 기본형이다. **이것은 노드 손잡이를 덮는 것이 아니다** —
     * `Card`에는 `ratio` prop이 없어 그 규칙의 값이 상수이고, 렌더러가 스스로
     * *"테마는 `aspectRatio` 어휘로 이 값을 그대로 덮는다"*고 적어 둔 자리다.
     * (같은 어휘를 `Media.parts.frame`에 걸면 그때는 **노드의 `ratio`가 죽는다** —
     * 그래서 아래 `Media`에서는 안 건다.)
     *
     * **중첩 주의:** `Card.parts.media`·`title`·`body`는 자손 결합자라 **카드 안에 넣은
     * `List`의 같은 이름 조각까지 받는다.** 아래 `List`가 뒤에 오므로 중첩된 목록에서는
     * `List` 쪽이 이긴다 — 모델이 막은 것이 아니라 **순서가 막고 있다.**
     */
    Card: {
      structure: 'mediaTop',
      base: {
        bg: 'semantic.surface',
        radius: 'radius.lg',
        overflow: 'hidden',
        shadow: 'shadow.sm',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        transition: 'motion.base',
      },
      parts: {
        media: { aspectRatio: '1 / 1', bg: 'semantic.canvas' },
        header: { paddingX: 'space.4', paddingY: 'space.3' },
        title: { typography: 'h4', fg: 'semantic.text' },
        subtitle: { typography: 'price', fg: 'semantic.price' },
        body: { paddingX: 'space.4', paddingY: 'space.2', typography: 'caption', fg: 'semantic.textMuted' },
      },
      variants: { featured: { shadow: 'shadow.lg', borderColor: 'semantic.primary' } },
      responsive: { sm: { parts: { header: { paddingX: 'space.3' } } } },
    },
    /**
     * **알약 탭.** `underline`·`pill`·`enclosed`는 **DOM이 글자까지 같다.**
     * 그러므로 `structure: 'pill'`만으로는 화면이 한 글자도 안 바뀌고,
     * 갈리는 모습은 **전부 아래 스킨이 만든다** — 둥근 배경과 테두리를 얹은 `tab` 조각이 그것이다.
     *
     * 커머스가 알약을 고르는 이유: 카테고리·필터 칩이 이 사이트 형태의 기본 어휘다.
     */
    Tabs: {
      structure: 'pill',
      parts: {
        list: { display: 'flex', gap: 'space.2', wrap: 'wrap', paddingY: 'space.2' },
        tab: {
          paddingX: 'space.4',
          paddingY: 'space.2',
          radius: 'radius.pill',
          bg: 'semantic.surface',
          fg: 'semantic.textMuted',
          typography: 'h6',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          transition: 'motion.base',
        },
        panel: { paddingY: 'space.6' },
      },
    },

    // ── 데이터 ──────────────────────────────────────────────────────────────
    /**
     * **미디어 줄 목록.** 장바구니·주문 내역·검색 결과가 전부 이 모양이다.
     *
     * **`display: flex`를 여기서 안 낸다.** 그것은 스킨이 아니라 *"미디어가 옆에 선다"*는
     * 구조의 이름이라 **구조 기본 CSS가 낸다**(`structures/data.tsx`). 테마가 내는 것은 간격·색·굵기다. `Flex`·`Grid`가 이미 같은 분담이다.
     *
     * `meta`가 가격 자리다 — `typography: 'price'`가 그 자리를 본문과 갈라 놓는다.
     */
    List: {
      structure: 'mediaList',
      base: { fg: 'semantic.text', typography: 'body' },
      parts: {
        item: {
          gap: 'space.4',
          align: 'center',
          paddingY: 'space.4',
          borderWidth: '0 0 1px 0',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        media: { width: '112px', radius: 'radius.md', bg: 'semantic.canvas' },
        body: { display: 'flex', direction: 'column', gap: 'space.1' },
        title: { typography: 'h5', fg: 'semantic.text' },
        meta: { typography: 'price', fg: 'semantic.price' },
        pagination: { paddingY: 'space.6', textAlign: 'center', fg: 'semantic.textMuted' },
      },
      variants: {
        compact: { parts: { item: { paddingY: 'space.2' } } },
        featured: { parts: { item: { bg: 'semantic.primarySoft' } } },
      },
      states: {
        selected: { parts: { item: { bg: 'semantic.primarySoft' } } },
        disabled: { opacity: 0.5 },
        loading: { opacity: 0.6 },
        empty: { parts: { item: { opacity: 0.4 } } },
      },
      responsive: { sm: { parts: { media: { width: '72px' } } } },
    },
    /**
     * **접히는 카테고리 내비.** 커머스의 좌측 카테고리는 깊이가 아니라 **여닫힘**으로
     * 읽힌다 — `indent`의 들여쓰기 대신 `accordion`의 중첩 묶음을 고른다.
     *
     * `panel`에 왼쪽 선을 그어 묶음의 범위를 보이게 한다 — `accordion`이 `indent`와
     * 갈리는 조각이 그것이다(`indent`에는 `panel`이 없다).
     *
     * **`paddingX`를 `node`에 걸지 않는다.** 그 조각의 `padding-left`는 `indent`의 단계
     * 손잡이(`--wb-node-tree-level`)가 쓰는 자리다 — 여기서 `accordion`을 고르므로 그
     * 규칙이 애초에 안 걸리지만, 어휘를 그 조각에 두면 구조를 바꾸는 날 덮는다.
     */
    Tree: {
      structure: 'accordion',
      base: { fg: 'semantic.text', typography: 'body' },
      parts: {
        node: { paddingY: 'space.2' },
        label: { fg: 'semantic.text' },
        toggle: { fg: 'semantic.textMuted', marginX: 'space.1' },
        panel: {
          marginX: 'space.3',
          paddingX: 'space.3',
          borderWidth: '0 0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
      },
      states: {
        selected: { parts: { label: { fg: 'semantic.primary', fontWeight: 700 } } },
        disabled: { opacity: 0.5 },
      },
    },
    /**
     * **스펙을 카드 격자로.** 소재·원산지·배송 같은 속성이 표의 행이 아니라 **각자 상자**를
     * 갖는 것이 커머스의 상세 화면이다.
     *
     * **`gridColumns`를 쓰지 않는다 — 판단이고 근거가 있다.** `KeyValue.columns`는 수(1~4)이고
     * 속성 패널에서 늘 닿는 **노드의 손잡이**다(`--wb-node-keyvalue-columns`). 테마가
     * `gridColumns`를 걸면 같은 셀렉터에서 그 값을 덮는다(노드 손잡이 — `NODE_HANDLES`,
     * `node-handle-overwrite` 경고). 열 수는 페이지마다 다른 것이 옳으므로 노드에 남긴다.
     */
    KeyValue: {
      structure: 'cardGrid',
      base: { gap: 'space.3', typography: 'body' },
      parts: {
        row: {
          bg: 'semantic.surface',
          radius: 'radius.md',
          padding: 'space.4',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        key: {
          typography: 'caption',
          fg: 'semantic.textMuted',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        },
        value: { typography: 'h5', fg: 'semantic.text' },
      },
    },

    // ── 입력 ────────────────────────────────────────────────────────────────
    /**
     * **접히는 필터.** 커머스의 검색 조건은 늘 펴 두면 상품을 밀어낸다 — 접힌 상태가
     * 기본형이고 `collapsible`만 그 상태를 DOM으로 표현한다(`toggle` 조각).
     */
    SearchForm: {
      structure: 'collapsible',
      base: {
        bg: 'semantic.surface',
        padding: 'space.5',
        radius: 'radius.lg',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
      },
      parts: {
        toggle: {
          display: 'flex',
          justify: 'space-between',
          align: 'center',
          typography: 'h5',
          fg: 'semantic.text',
        },
        fields: { display: 'flex', wrap: 'wrap', gap: 'space.4', paddingY: 'space.4' },
        actions: { display: 'flex', gap: 'space.2', justify: 'flex-end' },
      },
    },
    /**
     * **라벨이 위에 오는 폼.** 주문서·회원가입은 모바일에서 채워지므로 라벨을 왼쪽에 두면
     * 입력 폭이 남지 않는다. `labelLeft`와 **DOM이 같다** —
     * 갈리는 모습은 아래 `Field.base`의 세로 쌓기가 만든다.
     *
     * **`parts.label`이 자손 결합자라 중첩된 `Field`·`Button`·`Tree`의 `label`까지 받는다**
     * 이 테마에서는 `Field`·`Button`이 **뒤에 와서** 자기 라벨을 되찾는다 —
     * `Tree`는 앞에 있어 되찾지 못한다(폼 안의 트리는 이 테마의 정상 구성이 아니지만,
     * **막은 것은 모델이 아니라 순서**라는 사실은 그대로다).
     */
    EntryForm: {
      structure: 'labelTop',
      base: {
        bg: 'semantic.surface',
        padding: 'space.6',
        radius: 'radius.lg',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
      },
      parts: {
        label: { typography: 'h3', fg: 'semantic.text', marginY: 'space.2' },
        row: { display: 'flex', direction: 'column', gap: 'space.4' },
        actions: { display: 'flex', gap: 'space.3', justify: 'flex-end', marginY: 'space.5' },
      },
    },
    /**
     * **채워진 입력.** `outlined`·`filled`·`underlined`는 **DOM이 글자까지 같다.**
     * 그러므로 갈리는 것은 전부 스킨이다 — 여기서는 **면을 채우고 아래만 굵게** 그어
     * `admin`의 사면 테두리와 반대로 간다.
     */
    Field: {
      structure: 'filled',
      base: { display: 'flex', direction: 'column', gap: 'space.1' },
      parts: {
        label: { typography: 'h6', fg: 'semantic.textMuted' },
        control: {
          bg: 'semantic.canvas',
          borderWidth: '0 0 2px 0',
          borderStyle: 'solid',
          borderColor: 'semantic.borderStrong',
          radius: 'radius.sm',
          paddingX: 'space.3',
          paddingY: 'space.3',
          fg: 'semantic.textMuted',
          transition: 'motion.base',
        },
        help: { typography: 'caption', fg: 'semantic.textMuted' },
      },
      variants: {
        textarea: { parts: { control: { minHeight: '96px' } } },
        checkbox: {
          parts: { control: { width: '18px', minHeight: '18px', paddingX: '0', paddingY: '0' } },
        },
        radio: {
          parts: {
            control: {
              width: '18px',
              minHeight: '18px',
              paddingX: '0',
              paddingY: '0',
              radius: 'radius.pill',
            },
          },
        },
      },
      states: {
        required: { parts: { label: { fg: 'semantic.danger' } } },
        invalid: { parts: { control: { borderColor: 'semantic.danger' } } },
        disabled: { opacity: 0.5 },
      },
    },

    // ── 액션 ────────────────────────────────────────────────────────────────
    /**
     * **구매 버튼.** `solid`를 고른 것은 커머스의 주요 액션이 *"담기"*·*"구매"*이고 그것이
     * 화면에서 가장 진해야 하기 때문이다 — 아웃라인 구매 버튼은 이 사이트 형태에 없다.
     *
     * `admin`도 `solid`이므로 **구조로는 안 갈린다.** 갈리는 것은 전부 스킨이다 —
     * 알약 모서리·넓은 좌우 여백·주황·그림자.
     */
    Button: {
      structure: 'solid',
      base: {
        bg: 'semantic.primary',
        fg: 'semantic.surface',
        radius: 'radius.pill',
        paddingX: 'space.6',
        paddingY: 'space.3',
        typography: 'h5',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.primary',
        shadow: 'shadow.sm',
        transition: 'motion.base',
      },
      parts: { label: { letterSpacing: '0.01em' } },
      variants: {
        secondary: {
          bg: 'semantic.surface',
          fg: 'semantic.text',
          borderColor: 'semantic.borderStrong',
          shadow: 'none',
        },
        danger: { bg: 'semantic.danger', borderColor: 'semantic.danger' },
        ghost: {
          bg: 'transparent',
          fg: 'semantic.primary',
          borderColor: 'transparent',
          shadow: 'none',
        },
      },
      states: { disabled: { opacity: 0.45 }, loading: { opacity: 0.7 } },
    },
    /**
     * **밑줄 없는 링크.** 커머스의 링크 대부분은 상품 이름이라 본문 색으로 두고, 밑줄은
     * 격자를 어지럽힌다. `admin`(주황 아닌 파랑 + 밑줄)과 정확히 반대다.
     */
    Link: {
      structure: 'default',
      base: { fg: 'semantic.text', textDecoration: 'none', transition: 'motion.base' },
      variants: { muted: { fg: 'semantic.textMuted' } },
      states: { disabled: { opacity: 0.5, textDecoration: 'line-through' } },
    },

    // ── 문서 ────────────────────────────────────────────────────────────────
    Text: {
      structure: 'default',
      base: { fg: 'semantic.text', typography: 'body' },
      variants: {
        display: { typography: 'display' },
        h1: { typography: 'h1' },
        h2: { typography: 'h2' },
        h3: { typography: 'h3' },
        h4: { typography: 'h4' },
        h5: { typography: 'h5' },
        h6: { typography: 'h6', fg: 'semantic.textMuted', textTransform: 'uppercase' },
        body: { typography: 'body' },
        caption: { typography: 'caption', fg: 'semantic.textMuted' },
      },
    },
    /**
     * **`parts.frame`에 `aspectRatio`를 걸지 않는다 — 걸고 싶은 자리다.**
     *
     * 상품 이미지는 정사각 격자가 기본형이라 `aspectRatio: "1 / 1"`이 커머스의 자연스러운
     * 선택이다. **그런데 그 규칙이 읽는 값이 노드의 손잡이다** — `Media.ratio` prop이
     * `--wb-node-media-ratio`로 실리고 구조 기본 CSS가 `aspect-ratio: var(…)`로 읽는다.
     * 테마 어휘가 **같은 셀렉터에서** 같은 CSS 프로퍼티를 내므로 시트 순서로 늘 이기고,
     * **저자가 패널에서 고른 비율이 사라진다**(노드 손잡이 — `NODE_HANDLES`).
     *
     * 그래서 안 건다. 카드 안의 이미지 자리는 `Card.parts.media`가 정사각으로 잡으므로
     * 격자의 인상은 그쪽에서 얻는다 — 그 조각에는 노드 손잡이가 없다.
     */
    Media: {
      structure: 'image',
      parts: {
        frame: { bg: 'semantic.canvas', radius: 'radius.lg', objectFit: 'cover' },
        caption: { typography: 'caption', fg: 'semantic.textMuted', marginY: 'space.2' },
      },
    },
    Divider: {
      structure: 'default',
      base: { borderWidth: '0', bg: 'semantic.border' },
      variants: {
        horizontal: { height: '1px', width: '100%' },
        vertical: { width: '1px', minHeight: '100%' },
      },
    },
    /**
     * **`height`를 안 건다.** `Placeholder.height`가 노드 손잡이
     * (`--wb-node-placeholder-height`)이고 이 어휘가 같은 셀렉터에서 그것을 덮는다 —
     * `Media.parts.frame`과 같은 부류라 같은 판단을 한다.
     */
    Placeholder: {
      structure: 'default',
      base: {
        bg: 'semantic.canvas',
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: 'semantic.borderStrong',
        radius: 'radius.lg',
        fg: 'semantic.textMuted',
        typography: 'caption',
        display: 'grid',
        textAlign: 'center',
      },
    },
  },
}
