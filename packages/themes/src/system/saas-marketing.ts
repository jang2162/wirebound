import type { Theme } from '../spec/theme'

/**
 * 내장 시스템 테마 — 랜딩·제품 소개 사이트.
 *
 * **`admin`의 반대쪽 끝이다.** 그쪽이 스스로 *"좁은 여백과 표 중심의 밀도"*라고 적었으므로
 * 이 테마는 그 축의 반대가 무엇인지를 보여야 한다 — 넓은 여백, 큰 타이포, 이미지 중심.
 * 갈리는 것을 만든 순서대로 적으면 **토큰(타이포 스케일이 두 배 가까이 크다) → 골격
 * (섹션 세로 리듬이 32px → 80px) → 구조(잡은 컴포넌트 18 중 **열**이 `admin`과 다른 구조다) →
 * 스킨** 이다.
 *
 * ---
 *
 * **설계서 「페이지 스키마 노드」가 이름으로 지목한 자리가 여기다.** *"같은 `List` 노드가 관리자 테마에서는
 * 테이블로, 마케팅 테마에서는 카드 그리드로."* 그 문장의 오른쪽 절반이
 * `List: { structure: 'cardGrid' }` 한 줄이다.
 *
 * ---
 *
 * **구조는 용도로 골랐지 개수로 고르지 않았다.** 커버리지를 채우려고 어색한
 * 구조를 고르면 설계서 「열린 질문」이 받을 입력(*"안 쓰는 구조를 뺀다"*)이 오염된다. 안 고른 것과 그 이유는
 * 이 파일 아래쪽 각 컴포넌트의 주석에 적었다.
 *
 * **DOM이 같은 다섯 묶음은 스킨이 전부다.**
 * `Card:elevated`·`Tabs:pill`·`EntryForm:labelTop`·`Field:filled`·`Button:outline` 다섯이
 * 그 묶음에서 고른 것이고, 이 다섯은 `data-wb-structure` 값 말고는 `admin`이 고른 것과
 * DOM이 글자까지 같다. **그래서 다섯 자리의 인상은 전부 아래 `base`·`parts`가 만든다.**
 *
 * ---
 *
 * **`primitives`를 컴포넌트 스타일이 가리킨다.**
 *
 * `Section.parts.inner.maxWidth`가 `'container.maxWidth'`이고, 그 값은 `primitives`에
 * 한 번만 적힌다. 컴파일 결과는 `max-width: var(--wb-container-maxWidth)`다. 그 문법은
 * **스타일 전용** 이름공간 셋(`STYLE_PRIMITIVE_NAMESPACES`)이 연다 — 토큰 표와 표가
 * 다르므로 `TOKEN_NAMESPACES`에 더하지 않았다.
 */
export const SAAS_MARKETING_THEME: Theme = {
  meta: {
    id: 'saas-marketing',
    name: '마케팅',
    description:
      '랜딩·제품 소개 사이트 테마. 넓은 여백과 큰 타이포, 카드 그리드와 이미지 중심의 구성을 갖는다.',
    version: '1.0.0',
  },

  tokens: {
    /**
     * 원시 팔레트. 스타일이 이것을 직접 가리킬 수 없다(설계서 「tokens — 3단 분리」).
     *
     * **`admin`의 slate/blue와 겹치지 않게 골랐다** — 중성색에 보라 기가 도는 잉크 계열과
     * 보라 브랜드색이다. 두 테마를 나란히 놓았을 때 색만으로도 갈리는 것이 목적이고,
     * 그것이 「tokens — 3단 분리」가 `semantic`을 둔 이유(*"브랜드 교체"*)의 실사용례다.
     */
    palette: {
      'ink.900': '#0b0b14',
      'ink.700': '#26263a',
      'ink.500': '#5c5c78',
      'ink.300': '#9d9db6',
      'ink.100': '#e7e7f1',
      'ink.50': '#f5f5fc',
      'violet.700': '#4526cf',
      'violet.600': '#5b3df5',
      'violet.400': '#9280ff',
      'violet.50': '#f0edff',
      'teal.500': '#0fb7a6',
      'teal.50': '#e4f8f5',
      'rose.500': '#e5484d',
    },
    semantic: {
      primary: 'palette.violet.600',
      primaryStrong: 'palette.violet.700',
      primarySoft: 'palette.violet.50',
      accent: 'palette.teal.500',
      accentSoft: 'palette.teal.50',
      surface: '#ffffff',
      canvas: 'palette.ink.50',
      border: 'palette.ink.100',
      borderStrong: 'palette.ink.300',
      text: 'palette.ink.900',
      textMuted: 'palette.ink.500',
      textInverse: '#ffffff',
      danger: 'palette.rose.500',
    },
    scale: {
      /**
       * **`unit`은 `admin`과 같은 `4px`다 — 그리고 그것이 요점이다.**
       *
       * 마케팅의 넓은 여백은 **눈금을 키워서가 아니라 큰 눈금을 써서** 만든다.
       * 눈금을 `8px`로 올리면 `space.1`이 8px이 되어 버튼 안쪽 여백처럼 촘촘해야 하는
       * 자리를 표현할 수 없고, `space.24`가 192px이 되어 섹션 리듬이 화면을 넘긴다.
       * 갈리는 것은 아래 `primitives.section`이 `space.20`(80px)을 쓰고 `admin`이
       * `space.8`(32px)을 쓴다는 것이다.
       */
      space: { unit: '4px' },
      // 크게 굴린다. `admin`은 4/6/10이다. `full`은 「tokens — 3단 분리」의 예시가 든 이름이고
      // 알약 버튼·필 탭이 그것을 쓴다.
      radius: { sm: '8px', md: '14px', lg: '24px', full: '999px' },
      /**
       * **두 겹이다** — 가까운 곳의 윤곽선 대용 그림자와 멀리 퍼지는 부드러운 그림자.
       * `admin`의 한 겹 그림자는 표 위의 카드를 띄우는 용도이고, 여기는 흰 배경 위에서
       * 카드가 떠 보이는 것 자체가 인상이다.
       */
      shadow: {
        sm: '0 1px 2px rgba(11,11,20,.04), 0 8px 24px rgba(11,11,20,.06)',
        md: '0 2px 4px rgba(11,11,20,.04), 0 18px 48px rgba(11,11,20,.10)',
        lg: '0 4px 8px rgba(11,11,20,.05), 0 32px 80px rgba(11,11,20,.16)',
      },
      /**
       * 타이포 스케일. **항목 이름이 `Text.variants`와 같다**(`variantFrom: 'role'`).
       *
       * **`family`가 여기 있다 — `admin`에는 없다.** **두 층이 갈려 있고 둘 다 있어야
       * 화면에 보인다** — `assets.fonts`가 서체를 싣고(`@font-face`), 이 토큰을
       * `fontFamily` 어휘가 가리켜 컴포넌트에 건다.
       *
       * **`admin`과 가장 크게 갈리는 수가 여기 있다.** `display` 32px → 64px,
       * `h1` 24px → 48px, `body` 14px → 18px. 관리자 화면은 한 화면에 정보를 많이 담고,
       * 랜딩 페이지는 한 화면에 문장 하나를 담는다.
       */
      typography: {
        family: {
          display:
            '"Wirebound Marketing Display", "Wirebound Marketing Sans", system-ui, sans-serif',
          sans: '"Wirebound Marketing Sans", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
        },
        display: { fontSize: '64px', lineHeight: 1.04, fontWeight: 800, letterSpacing: '-0.03em' },
        h1: { fontSize: '48px', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.02em' },
        h2: { fontSize: '36px', lineHeight: 1.16, fontWeight: 700, letterSpacing: '-0.015em' },
        h3: { fontSize: '26px', lineHeight: 1.28, fontWeight: 700 },
        h4: { fontSize: '20px', lineHeight: 1.36, fontWeight: 600 },
        h5: { fontSize: '17px', lineHeight: 1.45, fontWeight: 600 },
        h6: { fontSize: '14px', lineHeight: 1.5, fontWeight: 600, letterSpacing: '0.04em' },
        body: { fontSize: '18px', lineHeight: 1.7, fontWeight: 400 },
        caption: { fontSize: '14px', lineHeight: 1.6, fontWeight: 400 },
      },
      motion: { fast: '120ms', base: '220ms', easing: 'cubic-bezier(.4,0,.2,1)' },
    },
  },

  /**
   * 설계서 「primitives — 사이트 골격」이 이 테마를 이름으로 들어 적었다 — *"관리자 화면은 `maxWidth: fluid`에 좁은 섹션
   * 여백을, 마케팅 사이트는 `1200px`에 넉넉한 여백을 쓴다."* 그대로 옮겼다.
   * `admin`은 `none`(폭을 가두지 않는다) · `space.8`(32px)이다.
   */
  primitives: {
    container: { maxWidth: '1200px', gutter: 'space.6' },
    grid: { columns: 12, gap: 'space.8' },
    section: { paddingY: 'space.20', paddingYCompact: 'space.10' },
    breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280 },
  },

  /**
   * **`@font-face`로 나가는 층.**
   *
   * **`src`가 `local()`이고 네트워크를 쓰지 않는다.** data URI도 네트워크 없이 되지만
   * `local()`을 고른 이유는 폰트 바이너리를 소스에 심지 않아도 되기 때문이다. **한계:** 그
   * 이름의 로컬 폰트가 없으면 face의 `status`가 `error`가 된다(등록은 되고 로드만 실패한다).
   * 그때는 위 `typography.family`의 뒷줄(`system-ui` 이하)이 그려진다.
   *
   * **`weights`는 값마다 블록 하나가 나간다**(범위로 안 접는다). 그래서 아래 둘이
   * `@font-face` **넷**이 된다. 가변 폰트 이름을 `src`의 맨 앞에 둔 것은 이 부류를 피하려는
   * 것이다 — 정적 400 폰트를 700 face의 `src`로 주면 굵게가 말없이 사라진다.
   *
   * **`icons`·`placeholder`는 CSS로 나가지 않는다.** `placeholder.style: 'photo'`는
   * 설계서 「assets」가 *"실제 사이트에 가깝게 보여야 하면 `photo`"*라고 적은 그 값이고 이
   * 테마가 실제로 원하는 것인데, **컴파일되지 않는다**(테마→렌더러 채널이 `structures`
   * 하나뿐이다). 선언만 남겨 두는 것은 시스템 테마 중 몇이 이 값을 필요로 하는지 셀 수
   * 있게 하려는 것이다.
   */
  assets: {
    fonts: [
      {
        family: '"Wirebound Marketing Display"',
        src: 'local("Inter Variable"), local("InterVariable"), local("Inter"), local("Helvetica Neue"), local("Arial")',
        weights: [700, 800],
      },
      {
        family: '"Wirebound Marketing Sans"',
        src: 'local("Inter Variable"), local("InterVariable"), local("Inter"), local("Helvetica Neue"), local("Arial")',
        weights: [400, 600],
      },
    ],
    icons: 'lucide',
    placeholder: { style: 'photo' },
  },

  /**
   * **순서가 곧 우선순위다**(`emit/index.ts`). 조각 규칙이 자손 결합자라 중첩된 컴포넌트의
   * 같은 이름 조각까지 받으므로, **바깥이 되기 쉬운 것을 먼저, 안이 되기
   * 쉬운 것을 나중에** 둔다 — `admin`과 같은 그룹 순서(골격 → 데이터 → 입력 → 액션 → 문서)가
   * 그 성질을 이미 갖고 있어 그대로 따랐다.
   */
  components: {
    // ── 골격 ────────────────────────────────────────────────────────────────
    /**
     * **`Page`를 테마가 잡는다 — `admin`은 안 잡는다.**
     *
     * 서체를 사이트 전체에 거는 자리가 여기다. 컴파일된 CSS는 컴포넌트 규칙만 내므로
     * (`:root`는 변수뿐이다) 어딘가 최상위에 `font-family`를 걸지 않으면 조각 스킨이
     * 가리키지 않는 글자는 전부 브라우저 기본 서체로 남는다. `Page`는 문서의 뿌리이고
     * `font-family`·`color`는 상속되므로 한 줄이 아래 전부에 닿는다.
     */
    Page: {
      structure: 'default',
      base: {
        bg: 'semantic.surface',
        fg: 'semantic.text',
        fontFamily: 'typography.family.sans',
        typography: 'body',
      },
    },

    /**
     * **`splitBg`를 고른다 — `admin`은 `contained`다.**
     *
     * 셋 중 이것인 이유는 **테마가 칠할 수 있는 상자가 하나 더 있다**는 것 하나다.
     * `contained`는 `inner` 하나뿐이고 `fullBleed`는 폭을 가두는 자리조차 없다.
     * 랜딩 페이지의 섹션은 *"전체 폭에 깔린 배경 + 가운데 모인 내용"*인데, 그 배경이
     * 단색이 아니라 **그라디언트 워시**인 것이 오늘 마케팅 사이트의 인상이다.
     * `band`가 그 워시를 담는다 — 구현체가 *"`band`는 빈 상자다. 무엇을 그릴지는 테마가
     * 정한다"*고 적어 둔 그 자리다.
     *
     * **렌더러의 `display: grid; grid-template-columns: 1fr 1fr`를 `display: block`으로
     * 덮는다.** 그것이 허용된 것임을 구현체가 스스로 적었다 — *"`display`·`gridColumns`
     * 둘 다 `STYLE_PROPERTIES`에 있어 테마가 이 두 줄을 그대로 덮을 수 있다. `flex-grow`로
     * 갈랐으면 되돌릴 길이 없는 선언이 된다."* 즉 좌우 반분은 이 구조의 **기본값**이지
     * 계약이 아니다.
     *
     * **그 대신 치른 것:** 구조 선택이 컴포넌트 타입 단위라, 히어로만 진짜
     * 좌우 분할로 두고 나머지 섹션은 워시로 두는 것을 **못 한다.**
     */
    Section: {
      structure: 'splitBg',
      base: {
        display: 'block',
        position: 'relative',
        overflow: 'hidden',
        bg: 'semantic.surface',
        paddingY: 'space.20',
      },
      parts: {
        // 내용 뒤에 깔리는 워시. `inner`가 `position: relative`라 그 위에 그려진다.
        band: {
          position: 'absolute',
          inset: '0',
          bgGradient:
            'linear-gradient(180deg, semantic.canvas 0%, semantic.surface 55%, semantic.surface 100%)',
          zIndex: 0,
        },
        inner: {
          position: 'relative',
          zIndex: 1,
          maxWidth: 'container.maxWidth',
          marginX: 'auto',
          paddingX: 'space.6',
        },
      },
      variants: {
        hero: {
          paddingY: 'space.24',
          parts: {
            band: {
              bgGradient:
                'linear-gradient(160deg, semantic.primarySoft 0%, semantic.accentSoft 60%, semantic.surface 100%)',
            },
          },
        },
        muted: {
          bg: 'semantic.canvas',
          parts: {
            band: {
              bgGradient:
                'linear-gradient(180deg, semantic.canvas 0%, semantic.canvas 100%)',
            },
          },
        },
      },
      responsive: {
        md: { base: { paddingY: 'space.12' } },
        sm: { base: { paddingY: 'space.10' }, parts: { inner: { paddingX: 'space.4' } } },
      },
    },

    /**
     * **손잡이 어휘를 쓰지 않는다.** `Flex:default`의 `direction`·`align`·`justify`·`wrap`
     * 넷이 노드 손잡이(`NODE_HANDLES`)라, 테마가 같은 셀렉터에서 그 프로퍼티를 내면 노드가
     * 나르는 값을 덮는다(`node-handle-overwrite` 경고). 그래서 여기서는 `gap`만 정한다. 방향과 정렬은 문서의
     * 것이다.
     */
    Flex: { structure: 'default', base: { gap: 'space.6' } },
    /**
     * 같은 이유로 `gridColumns`를 안 쓴다 — `Grid.columns`가 노드 prop이다.
     */
    Grid: { structure: 'default', base: { gap: 'space.8' } },

    /**
     * **`elevated`를 고른다 — `admin`은 `plain`이다.** DOM은 글자까지 같고,
     * 갈리는 것은 **그림자와 여백과 굴림**뿐이다. 그래서 이 자리의 판정은 *"구조를 골랐다"*가
     * 아니라 *"`data-wb-structure="elevated"` 셀렉터에 어떤 스킨을 얹었는가"*이다.
     */
    Card: {
      structure: 'elevated',
      base: {
        bg: 'semantic.surface',
        radius: 'radius.lg',
        padding: 'space.8',
        shadow: 'shadow.md',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        transition: 'motion.base motion.easing',
      },
      parts: {
        header: { marginY: 'space.3' },
        title: { typography: 'h3', fg: 'semantic.text', fontFamily: 'typography.family.display' },
        subtitle: { typography: 'body', fg: 'semantic.textMuted' },
        body: { fg: 'semantic.textMuted', typography: 'body' },
      },
      variants: {
        featured: { shadow: 'shadow.lg', borderColor: 'semantic.primary' },
      },
    },

    /**
     * **`pill`을 고른다 — `admin`은 `underline`이다.** 여기도 DOM이 같으므로 알약 모양은
     * 전부 `list`·`tab` 조각 스킨이 만든다(`radius.full` + 배경 있는 목록 상자).
     *
     * 요금제 월/연 전환처럼 **선택지가 둘셋인 토글**이 랜딩 페이지의 탭이고, 그 모양이
     * 밑줄이 아니라 알약이다.
     */
    Tabs: {
      structure: 'pill',
      parts: {
        list: {
          display: 'inline-flex',
          gap: 'space.1',
          bg: 'semantic.canvas',
          radius: 'radius.full',
          padding: 'space.1',
        },
        tab: {
          paddingX: 'space.5',
          paddingY: 'space.2',
          radius: 'radius.full',
          fg: 'semantic.textMuted',
          typography: 'h5',
          transition: 'motion.fast motion.easing',
        },
        panel: { paddingY: 'space.10' },
      },
    },

    // ── 데이터 ──────────────────────────────────────────────────────────────
    /**
     * **「페이지 스키마 노드」의 약속이 이 한 줄이다.** *"같은 `List` 노드가 관리자 테마에서는 테이블로,
     * 마케팅 테마에서는 카드 그리드로."*
     *
     * 설계서 「components — 구조 + 스킨」이 `List:cardGrid`의 예시로 든 조각이 `item`·`media`·`title` 셋이고 이 테마가
     * 그 셋을 그대로 쓴다. `meta`는 그 예시에 없지만 구현체가 내는 조각이라 함께 잡았다 —
     * 안 잡으면 카드마다 스킨 없는 줄이 하나씩 남는다.
     *
     * **`gridColumns: 3`은 손잡이를 덮지 않는다.** `List:cardGrid`의 기본 CSS는 트랙을
     * **리터럴 `repeat(2, 1fr)`**로 내지 노드 변수를 읽지 않는다(구현체가 *"열 수는 이
     * 구현체가 정하지 않는다 … 테마가 정한다"*고 적었다). `gridColumns`가 노드 손잡이를 덮는
     * 자리는 `Grid:default`와 `KeyValue:cardGrid` 둘이고 이 테마는 그 둘에서 이 어휘를 안 쓴다.
     */
    List: {
      structure: 'cardGrid',
      base: { gap: 'space.8', gridColumns: 3 },
      parts: {
        item: {
          bg: 'semantic.surface',
          radius: 'radius.lg',
          shadow: 'shadow.sm',
          padding: 'space.6',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          transition: 'motion.base motion.easing',
        },
        media: {
          aspectRatio: '16/9',
          objectFit: 'cover',
          radius: 'radius.md',
          bg: 'semantic.canvas',
          marginY: 'space.4',
        },
        title: { typography: 'h4', fg: 'semantic.text' },
        meta: { typography: 'caption', fg: 'semantic.textMuted' },
        pagination: { paddingY: 'space.6', textAlign: 'center', fg: 'semantic.textMuted' },
      },
      variants: {
        featured: { parts: { item: { shadow: 'shadow.lg', borderColor: 'semantic.primary' } } },
        compact: { parts: { item: { padding: 'space.4' } } },
      },
      states: {
        selected: { parts: { item: { borderColor: 'semantic.primary', borderWidth: '2px' } } },
        disabled: { opacity: 0.45 },
        loading: { opacity: 0.6 },
        empty: { parts: { item: { bg: 'semantic.canvas', shadow: 'none' } } },
      },
      responsive: {
        md: { base: { gridColumns: 2, gap: 'space.6' } },
        sm: { base: { gridColumns: 1 } },
      },
    },

    /**
     * **`accordion`을 고른다 — `admin`은 `indent`다.** 랜딩 페이지에서 트리 모양으로
     * 쓰이는 것은 파일 트리가 아니라 **FAQ**이고, 그 모양이 아코디언이다.
     *
     * **덤이 하나 있다:** `indent`의 들여쓰기 규칙(`--wb-node-tree-level` × `--wb-tree-indent`)은
     * `:where([data-wb-structure="indent"])`로 좁혀져 있어 **이 테마에는 아예 안 걸린다.**
     * 즉 노드 손잡이 중 `paddingX`(= `Tree [node]`) 한 자리는 이 테마에서 덮일 것이
     * 없다 — 구조를 고른 것만으로 부류 하나가 사라진다.
     */
    Tree: {
      structure: 'accordion',
      base: { fg: 'semantic.text', typography: 'body' },
      parts: {
        node: { paddingY: 'space.4', borderColor: 'semantic.border' },
        label: { typography: 'h4', fg: 'semantic.text' },
        toggle: { fg: 'semantic.primary', marginX: 'space.2' },
        panel: { paddingY: 'space.2', paddingX: 'space.6', fg: 'semantic.textMuted' },
      },
      states: {
        selected: { parts: { label: { fg: 'semantic.primary' } } },
        disabled: { opacity: 0.45 },
      },
    },

    /**
     * **`cardGrid`를 고른다 — `admin`은 `table`이다.** 랜딩 페이지의 키-값은 스펙 표가
     * 아니라 **지표 타일**(`99.9%` / `가동률`)이라 격자에 큰 수를 놓는다.
     *
     * **`gridColumns`를 안 쓴다.** 이 구조는 `KeyValue.columns`(1..4) 노드 prop을
     * `--wb-node-keyvalue-columns`로 읽는데, 테마가 `gridColumns`를 쓰면 그 값이
     * 무시된다(노드 손잡이 — `NODE_HANDLES`). 열 수는 문서의 것으로 둔다.
     */
    KeyValue: {
      structure: 'cardGrid',
      base: { gap: 'space.6' },
      parts: {
        row: {
          bg: 'semantic.canvas',
          radius: 'radius.lg',
          padding: 'space.8',
          textAlign: 'center',
        },
        key: {
          typography: 'h6',
          fg: 'semantic.textMuted',
          textTransform: 'uppercase',
        },
        value: {
          typography: 'h2',
          fg: 'semantic.text',
          fontFamily: 'typography.family.display',
        },
      },
    },

    // ── 입력 ────────────────────────────────────────────────────────────────
    /**
     * **`inline`이다 — 이 자리만 `admin`과 구조가 같다.**
     *
     * 억지로 다른 것을 고르지 않았다(머리말 — 구조는 용도로 고른다). 마케팅 사이트의
     * 검색 폼은 히어로의 **한 줄짜리 입력 + 버튼**이고 그것이 `inline`이다. `stacked`는
     * 필터 패널의 모양이고 `collapsible`은 접히는 조건 검색이라 둘 다 이 사이트에 없다.
     *
     * 갈리는 것은 스킨이다 — 알약 모양의 떠 있는 검색 바다.
     */
    SearchForm: {
      structure: 'inline',
      base: {
        display: 'flex',
        align: 'center',
        gap: 'space.3',
        bg: 'semantic.surface',
        padding: 'space.3',
        paddingX: 'space.4',
        radius: 'radius.full',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        shadow: 'shadow.sm',
      },
      parts: {
        fields: { display: 'flex', align: 'center', gap: 'space.3' },
        actions: { display: 'flex', gap: 'space.2', fg: 'semantic.primary', typography: 'h5' },
      },
    },

    /**
     * **`labelTop`을 고른다 — `admin`은 `labelLeft`다.** DOM은 같고
     * 갈리는 것은 `Field` 루트의 흐름이다 — 아래 `Field.base`가 `display: grid`라 라벨이
     * 컨트롤 위에 선다. 문의·데모 신청 폼이 한 열로 흐르는 것이 이 사이트의 폼이다.
     *
     * **`parts.label`이 폼 제목을 담는다**(구현체의 판정 — 필드의 라벨과 이름이 같다).
     * 그래서 이 규칙이 **중첩된 `Field`·`Button`의 `label`에도 걸린다**(조각 규칙이
     * 자손 결합자다). 아래 `Field.parts.label`·`Button.parts.label`이 같은 프로퍼티를
     * **뒤에서** 다시 선언해 막는다 — 모델이 아니라 카탈로그 순서가 막고 있는 것이고,
     * 그 실측은 `apps/web/test/theme/saas-marketing.test.tsx`에 있다.
     */
    EntryForm: {
      structure: 'labelTop',
      base: {
        display: 'grid',
        gap: 'space.6',
        bg: 'semantic.surface',
        padding: 'space.10',
        radius: 'radius.lg',
        shadow: 'shadow.md',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
      },
      parts: {
        label: {
          typography: 'h2',
          fg: 'semantic.text',
          fontFamily: 'typography.family.display',
        },
        row: { display: 'grid', gap: 'space.5' },
        actions: { display: 'flex', gap: 'space.3', marginY: 'space.2' },
      },
    },

    /**
     * **`filled`를 고른다 — `admin`은 `outlined`다.** DOM이 같으므로 *"채워진 상자"*는
     * 전부 `control` 조각 스킨이다 — 테두리를 0으로 두고 배경을 준다. 구현체가 그 모양을
     * 판정의 근거로 들었다(*"채워진 상자 안에 라벨이 든 모습 — 된다"*).
     *
     * `label`에 `fontFamily`를 다시 선언한 것은 위 `EntryForm.parts.label`의 누수를
     * 막기 위해서다. **중복이지만 다른 방법이 없다**(「components — 구조 + 스킨」의 `parts`
     * 모델에 *"내 것"*을 말하는 문법이 없다).
     */
    Field: {
      structure: 'filled',
      base: { display: 'grid', gap: 'space.2' },
      parts: {
        label: {
          typography: 'h6',
          fg: 'semantic.textMuted',
          fontFamily: 'typography.family.sans',
          textTransform: 'uppercase',
        },
        control: {
          bg: 'semantic.canvas',
          borderWidth: '0',
          borderStyle: 'solid',
          borderColor: 'semantic.canvas',
          radius: 'radius.md',
          paddingX: 'space.5',
          paddingY: 'space.4',
          fg: 'semantic.textMuted',
          typography: 'body',
          transition: 'motion.fast motion.easing',
        },
        help: { typography: 'caption', fg: 'semantic.textMuted' },
      },
      // 아홉 중 모양이 실제로 다른 둘만 손댄다 — 나머지는 채워진 상자 그대로다.
      variants: {
        textarea: { parts: { control: { minHeight: '120px' } } },
        checkbox: {
          parts: { control: { width: '20px', minHeight: '20px', paddingX: '0', radius: 'radius.sm' } },
        },
      },
      states: {
        required: { parts: { label: { fg: 'semantic.primary' } } },
        invalid: {
          parts: { control: { bg: 'semantic.surface', borderWidth: '2px', borderColor: 'semantic.danger' } },
        },
        disabled: { opacity: 0.45 },
      },
    },

    // ── 액션 ────────────────────────────────────────────────────────────────
    /**
     * **`outline`을 고른다 — `admin`은 `solid`다.**
     *
     * 랜딩 페이지의 버튼은 대부분 보조 행동(`더 알아보기`·`문서 보기`)이고 **주 CTA 하나만**
     * 채워져 있다. 구조는 *"이 사이트의 버튼이 무엇인가"*(테마가 정한다)이고 변형은
     * *"이 버튼 하나가 무엇인가"*(노드가 정한다)이므로, 기본을 아웃라인으로 두고
     * `primary` 변형이 채우는 것이 그 두 채널을 정확히 쓰는 모양이다. 구현체
     * (`structures/action.tsx`)가 든 예 그대로다 — *"이 사이트의 버튼은 전부 아웃라인이고, 그중 이 버튼만 danger."*
     */
    Button: {
      structure: 'outline',
      base: {
        bg: 'semantic.surface',
        fg: 'semantic.text',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.borderStrong',
        radius: 'radius.full',
        paddingX: 'space.6',
        paddingY: 'space.3',
        typography: 'h5',
        fontFamily: 'typography.family.sans',
        transition: 'motion.base motion.easing',
      },
      // `EntryForm.parts.label`의 누수를 막는 자리이기도 하다 — `Field`와 같은 부류.
      parts: { label: { fontFamily: 'typography.family.sans', typography: 'h5' } },
      variants: {
        primary: {
          bg: 'semantic.primary',
          fg: 'semantic.textInverse',
          borderColor: 'semantic.primary',
          shadow: 'shadow.sm',
        },
        secondary: { fg: 'semantic.primary', borderColor: 'semantic.primary' },
        danger: {
          bg: 'semantic.danger',
          fg: 'semantic.textInverse',
          borderColor: 'semantic.danger',
        },
        ghost: { fg: 'semantic.textMuted', borderColor: 'semantic.surface' },
      },
      states: { disabled: { opacity: 0.45 }, loading: { opacity: 0.7 } },
    },
    Link: {
      structure: 'default',
      base: { fg: 'semantic.primary', textDecoration: 'none', fontWeight: 600 },
      variants: { muted: { fg: 'semantic.textMuted' } },
      states: { disabled: { opacity: 0.45, textDecoration: 'none' } },
    },

    // ── 문서 ────────────────────────────────────────────────────────────────
    /**
     * **큰 제목에만 디스플레이 서체를 건다.** `display`·`h1`·`h2` 셋이 그 자리이고
     * 나머지는 본문 서체를 상속한다 — 두 서체를 쓰는 사이트에서 갈리는 선이 대개 거기다.
     *
     * `variantFrom: 'role'`이 만든 채널이 없었다면 아홉 역할이 전부 같은 스킨을 받았다.
     */
    Text: {
      structure: 'default',
      base: { fg: 'semantic.text', typography: 'body', fontFamily: 'typography.family.sans' },
      variants: {
        display: { typography: 'display', fontFamily: 'typography.family.display' },
        h1: { typography: 'h1', fontFamily: 'typography.family.display' },
        h2: { typography: 'h2', fontFamily: 'typography.family.display' },
        h3: { typography: 'h3' },
        h4: { typography: 'h4' },
        h5: { typography: 'h5' },
        h6: { typography: 'h6', fg: 'semantic.textMuted', textTransform: 'uppercase' },
        body: { typography: 'body', fg: 'semantic.textMuted' },
        caption: { typography: 'caption', fg: 'semantic.textMuted' },
      },
    },

    /**
     * **`illustration`을 고른다 — `admin`은 `image`다.**
     *
     * 랜딩 페이지에 실리는 그림은 사진보다 **그린 것**(제품 일러스트·다이어그램)이 많다.
     * 그리고 이 구조만 `glyph` 조각을 내므로, 빈 상자 넷이 전부 "사진"으로 읽히는 것을
     * 이 테마가 실제로 피한다 — 조각을 쓰지 않을 구조를 고르면 그 판단이 화면에 안 남는다.
     *
     * **`frame`에 `aspectRatio`를 걸지 않는다.** 그 셀렉터가 `--wb-node-media-ratio`를
     * 읽는 규칙과 같아서, 걸면 노드의 `ratio` prop이 무시된다
     * (노드 손잡이 — `NODE_HANDLES`). 비율은 문서의 것이다.
     */
    Media: {
      structure: 'illustration',
      parts: {
        frame: {
          bg: 'semantic.canvas',
          radius: 'radius.lg',
          objectFit: 'cover',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          display: 'grid',
          align: 'center',
          justify: 'center',
        },
        glyph: { fg: 'semantic.primary', fontSize: '32px' },
        caption: {
          typography: 'caption',
          fg: 'semantic.textMuted',
          marginY: 'space.3',
          textAlign: 'center',
        },
      },
    },
    Divider: {
      structure: 'default',
      base: {
        borderWidth: '0',
        borderColor: 'semantic.border',
        bg: 'semantic.border',
        marginY: 'space.10',
      },
      // `variantFrom: 'direction'`이 만든 채널이다.
      variants: {
        horizontal: { height: '1px', width: '100%' },
        vertical: { width: '1px', minHeight: '100%' },
      },
    },
    /**
     * **`height`를 안 쓴다** — `Placeholder:default`의 루트 규칙이 `--wb-node-placeholder-height`를
     * 읽는 자리이고 그것이 노드의 `height` prop이다(노드 손잡이 — `NODE_HANDLES`).
     *
     * 점선 상자 대신 **부드러운 채움**으로 둔 것은 `assets.placeholder.style: 'photo'`와
     * 같은 방향이다 — 다만 그 선언은 컴파일되지 않으므로(위 `assets`) 여기서 손으로 흉내 낸다.
     */
    Placeholder: {
      structure: 'default',
      base: {
        bg: 'semantic.canvas',
        radius: 'radius.lg',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        fg: 'semantic.textMuted',
        typography: 'caption',
        display: 'grid',
        align: 'center',
        justify: 'center',
        textAlign: 'center',
      },
    },
  },
}
