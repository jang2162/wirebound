import type { Theme } from '../spec/theme'

/**
 * 내장 시스템 테마 — 관리자 화면.
 *
 * **렌더러에 구현체가 있는 구조만 고른다.** 없는 구조를 고르면 렌더러가 *"구현되지 않은
 * 구조"* 폴백을 그린다. 그 대조는 두 패키지를 함께 볼 수 있는
 * `apps/web/test/theme/system-theme.test.ts`가 렌더러의 `listStructureKeys()`로 한다 —
 * `themes`는 `renderer`를 보지 않는다(설계서 「각 패키지의 책임과 의존」).
 *
 * **`meta.id`가 `system:admin`이 아니라 `admin`이다.** **규격이 콜론을 받지 않는다** —
 * `THEME_ID_PATTERN`이 `[A-Za-z0-9_-]`라 콜론이 없다(이 값이 파일 이름과 `extends` 문자열에
 * 실린다). `system:` 접두어는 **가리키는 쪽의 문법**이고(`EXTENDS_PATTERN`) 테마 자신의
 * 이름이 아니다. `test/fixtures/minimal.ts`가 그 꼴이다(`id: 'portal'` ← `extends: 'system:portal'`).
 *
 * **최소본이되 외형이 실제로 바뀌는 것이 보여야 한다.** 그래서 색·간격·타이포·모서리가
 * 전부 토큰에서 나오고, `Text`의 변형이 타이포 스케일을 건다 — `variantFrom`이
 * 실제로 쓸모 있는지 보이는 자리다.
 */
export const ADMIN_THEME: Theme = {
  meta: {
    id: 'admin',
    name: '관리자',
    description: '관리자 화면 기본 테마. 좁은 여백과 표 중심의 밀도를 갖는다.',
    version: '1.0.0',
  },

  tokens: {
    // 원시 팔레트. **스타일이 이것을 직접 가리킬 수 없다** — `semantic`만 갈아끼워
    // 다크 테마·브랜드 교체가 되게 하는 것이 설계서 「tokens — 3단 분리」다.
    palette: {
      'gray.50': '#f8fafc',
      'gray.100': '#f1f5f9',
      'gray.200': '#e2e8f0',
      'gray.400': '#94a3b8',
      'gray.600': '#475569',
      'gray.900': '#0f172a',
      'blue.50': '#eff6ff',
      'blue.500': '#3b82f6',
      'blue.600': '#2563eb',
      'red.500': '#ef4444',
    },
    semantic: {
      primary: 'palette.blue.600',
      primarySoft: 'palette.blue.50',
      surface: '#ffffff',
      canvas: 'palette.gray.50',
      border: 'palette.gray.200',
      borderStrong: 'palette.gray.400',
      text: 'palette.gray.900',
      textMuted: 'palette.gray.600',
      danger: 'palette.red.500',
    },
    scale: {
      // 「tokens — 3단 분리」: `unit`만 정의하면 `space.1`~`space.24`가 배수로 파생된다.
      space: { unit: '4px' },
      radius: { sm: '4px', md: '6px', lg: '10px' },
      shadow: {
        sm: '0 1px 2px rgba(15,23,42,.06)',
        md: '0 4px 12px rgba(15,23,42,.10)',
      },
      /**
       * 타이포 스케일. **항목 이름이 `Text.variants`와 같다** — `variantFrom: 'role'`이
       * `role` 값을 `data-wb-variant`로 내보내므로 아래 `Text.variants.<이름>`이
       * `typography: '<이름>'`을 걸면 스케일이 그대로 붙는다.
       *
       * **`family`를 넣지 않는다 — 이 최소본은 서체를 선언하지 않는다.** 그래서 글자는
       * 물려받은 서체 그대로 그려진다. 서체를 걸려면 두 층이 다 있어야 한다 — `family`
       * 토큰과, 그것을 컴포넌트에 거는 `fontFamily` 어휘(설계서 「스타일 프로퍼티
       * 화이트리스트」 밖의 어휘다 — `STYLE_PROPERTIES_BEYOND_SPEC`). 나머지 네 시스템
       * 테마가 그 꼴이다.
       */
      typography: {
        display: { fontSize: '32px', lineHeight: 1.2, fontWeight: 700 },
        h1: { fontSize: '24px', lineHeight: 1.3, fontWeight: 700 },
        h2: { fontSize: '20px', lineHeight: 1.35, fontWeight: 700 },
        h3: { fontSize: '17px', lineHeight: 1.4, fontWeight: 600 },
        h4: { fontSize: '15px', lineHeight: 1.45, fontWeight: 600 },
        h5: { fontSize: '14px', lineHeight: 1.5, fontWeight: 600 },
        h6: { fontSize: '13px', lineHeight: 1.5, fontWeight: 600 },
        body: { fontSize: '14px', lineHeight: 1.6, fontWeight: 400 },
        caption: { fontSize: '12px', lineHeight: 1.5, fontWeight: 400 },
      },
      motion: { base: '150ms' },
    },
  },

  /**
   * 「primitives — 사이트 골격」: *"관리자 화면은 `maxWidth: fluid`에 좁은 섹션 여백을, 마케팅 사이트는 `1200px`에
   * 넉넉한 여백을 쓴다."* 관리자 화면은 표·폼이 화면 폭을 다 쓰므로 칼럼 폭을 가두지 않는다.
   *
   * **`fluid`는 CSS 값이 아니라 `'none'`으로 적는다.** 이 값은 `:root`의 `--wb-container-maxWidth`로 나가고
   * `Section.parts.inner`가 `max-width: var(--wb-container-maxWidth)`로 받는다 — `none`이 그 자리에서 폭 제한을
   * 없애는 유효한 값이다. `'100%'`는 지금 구조에서 같은 폭을 내지만(`inner`가 `width: auto`라 묶이지 않는다)
   * 「제한 없음」이 아니라 「부모 폭까지」라는 제한이어서, `inner`의 `width`·`box-sizing`을 바꾸는 층이 생기면
   * `paddingX`와 겹쳐 뜻이 달라진다. 재는 법: 헤드리스 Chrome 에서 `exportPage`로 `Page > Section > Text`를 뽑아
   * `setContent`하고 1920 폭에서 잰다 — `inner`의 안쪽 폭이 섹션 폭 `− 2 × paddingX`, 좌우 여백이 `paddingX`뿐이다.
   */
  primitives: {
    container: { maxWidth: 'none', gutter: 'space.6' },
    grid: { columns: 12, gap: 'space.5' },
    section: { paddingY: 'space.8', paddingYCompact: 'space.4' },
    breakpoints: { sm: 640, md: 768, lg: 1024 },
  },

  components: {
    // ── 골격 ────────────────────────────────────────────────────────────────
    Section: {
      structure: 'contained',
      base: { bg: 'semantic.canvas', paddingY: 'space.8' },
      // **`marginX: 'auto'`가 가둔 칼럼을 가운데로 둔다.** 설계서 「컴포넌트 카탈로그」가 `Section`을
      // *"화면 전체 폭 배경 + 가운데 정렬된 콘텐츠"*로 정한다. 빠뜨려도 아무것도 실패하지 않고, 뷰포트가
      // `maxWidth`보다 넓을 때 칼럼이 왼쪽에 붙어 오른쪽에만 빈 띠가 선다(`maxWidth`를 거는 시스템 테마
      // 다섯이 이 줄을 같이 갖는다). 재는 법: `exportPage`로 `Section` 하나를 뽑아 실브라우저에서 뷰포트를
      // 칼럼 폭보다 넓게 두고 `inner`와 섹션의 좌우 간격을 잰다 — 가운데면 둘이 같다(1920 폭에서 `portal`
      // 292 / 292). jsdom 은 레이아웃을 안 해 못 잰다.
      //
      // **이 테마에서는 칼럼이 가둬지지 않는다** — `container.maxWidth`가 `none`이라(위 `primitives`) `auto`가
      // 0 으로 계산되어 1920 폭에서도 좌우 간격이 0 / 0 이다. 그래도 이 줄을 둔다: `container.maxWidth`를 유한한
      // 폭으로 바꾸는 파생 테마가 가운데 정렬을 그대로 물려받고, `test/system-section-centered.test.ts`가
      // 값과 무관하게 `maxWidth`를 거는 층마다 이 줄을 요구한다.
      parts: { inner: { maxWidth: 'container.maxWidth', marginX: 'auto', paddingX: 'space.6' } },
      variants: {
        hero: { bg: 'semantic.primarySoft', paddingY: 'space.16' },
        muted: { bg: 'semantic.canvas' },
      },
      responsive: { sm: { base: { paddingY: 'space.4' } } },
    },
    Flex: { structure: 'default', base: { gap: 'space.4' } },
    Grid: { structure: 'default', base: { gap: 'grid.gap' } },
    Card: {
      structure: 'plain',
      base: {
        bg: 'semantic.surface',
        radius: 'radius.lg',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        padding: 'space.5',
      },
      parts: {
        title: { typography: 'h3', fg: 'semantic.text' },
        subtitle: { typography: 'caption', fg: 'semantic.textMuted' },
        body: { fg: 'semantic.text' },
      },
      variants: { featured: { shadow: 'shadow.md', borderColor: 'semantic.primary' } },
    },
    Tabs: {
      structure: 'underline',
      parts: {
        list: { gap: 'space.4', borderColor: 'semantic.border' },
        tab: { paddingY: 'space.2', fg: 'semantic.textMuted', typography: 'h5' },
        panel: { paddingY: 'space.4' },
      },
    },

    // ── 데이터 ──────────────────────────────────────────────────────────────
    List: {
      structure: 'table',
      base: { width: '100%', bg: 'semantic.surface', fg: 'semantic.text', typography: 'body' },
      parts: {
        header: { bg: 'semantic.canvas', fg: 'semantic.textMuted', typography: 'h6' },
        cell: { paddingX: 'space.3', paddingY: 'space.2', borderColor: 'semantic.border' },
        rowAlt: { bg: 'semantic.canvas' },
        pagination: { paddingY: 'space.3', textAlign: 'center', fg: 'semantic.textMuted' },
      },
      variants: { compact: { parts: { cell: { paddingY: 'space.1' } } } },
      states: {
        // 「components — 구조 + 스킨」이 상태 스킨의 쓸모로 든 예 그대로다 — *"선택된 행 강조"*.
        selected: { parts: { row: { bg: 'semantic.primarySoft' } } },
        disabled: { opacity: 0.5 },
      },
    },
    Tree: {
      structure: 'indent',
      base: { fg: 'semantic.text', typography: 'body' },
      parts: {
        node: { paddingY: 'space.1' },
        toggle: { fg: 'semantic.textMuted' },
      },
      states: { selected: { parts: { node: { bg: 'semantic.primarySoft' } } } },
    },
    KeyValue: {
      structure: 'table',
      base: { typography: 'body', fg: 'semantic.text' },
      parts: {
        key: { fg: 'semantic.textMuted', paddingY: 'space.2', textAlign: 'left' },
        value: { paddingY: 'space.2' },
      },
    },

    // ── 입력 ────────────────────────────────────────────────────────────────
    SearchForm: {
      structure: 'inline',
      base: { bg: 'semantic.surface', padding: 'space.4', radius: 'radius.md' },
      parts: { fields: { gap: 'space.4' }, actions: { gap: 'space.2' } },
    },
    EntryForm: {
      structure: 'labelLeft',
      base: { bg: 'semantic.surface', padding: 'space.5', radius: 'radius.md' },
      parts: { label: { fg: 'semantic.textMuted', typography: 'h5' }, actions: { gap: 'space.2' } },
    },
    Field: {
      structure: 'outlined',
      base: { gap: 'space.1' },
      parts: {
        label: { typography: 'h6', fg: 'semantic.textMuted' },
        control: {
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: 'radius.sm',
          paddingX: 'space.3',
          paddingY: 'space.2',
          bg: 'semantic.surface',
          fg: 'semantic.textMuted',
        },
        help: { typography: 'caption', fg: 'semantic.textMuted' },
      },
      /**
       * `variantFrom: 'control'`이 만든 채널이다. 아홉 중 모양이 실제로 다른 둘만 손댄다 —
       * 최소본이므로 나머지는 기본 스킨을 그대로 쓴다.
       */
      variants: {
        textarea: { parts: { control: { minHeight: '72px' } } },
        checkbox: { parts: { control: { width: '16px', minHeight: '16px', paddingX: '0' } } },
      },
      states: {
        invalid: { parts: { control: { borderColor: 'semantic.danger' } } },
        disabled: { opacity: 0.5 },
      },
    },

    // ── 액션 ────────────────────────────────────────────────────────────────
    Button: {
      structure: 'solid',
      base: {
        bg: 'semantic.primary',
        fg: 'semantic.surface',
        radius: 'radius.sm',
        paddingX: 'space.4',
        paddingY: 'space.2',
        typography: 'h6',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.primary',
        transition: 'motion.base',
      },
      variants: {
        secondary: {
          bg: 'semantic.surface',
          fg: 'semantic.text',
          borderColor: 'semantic.border',
        },
        danger: { bg: 'semantic.danger', borderColor: 'semantic.danger' },
        ghost: { bg: 'semantic.surface', fg: 'semantic.primary', borderColor: 'semantic.surface' },
      },
      states: { disabled: { opacity: 0.5 }, loading: { opacity: 0.7 } },
    },
    Link: {
      structure: 'default',
      base: { fg: 'semantic.primary', textDecoration: 'underline' },
      variants: { muted: { fg: 'semantic.textMuted' } },
      states: { disabled: { opacity: 0.5, textDecoration: 'none' } },
    },

    // ── 문서 ────────────────────────────────────────────────────────────────
    /**
     * **`variantFrom: 'role'`이 실제로 쓸모 있는지 보이는 자리.** `role`이 `data-wb-variant`가 되므로
     * 타이포 스케일을 변형에 걸 수 있다. 이 채널이 없으면 `Text`는 아홉 역할이 전부
     * 같은 스킨을 받거나 계약 밖 속성(`data-wb-role`)이 필요했다.
     */
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
        h6: { typography: 'h6' },
        body: { typography: 'body' },
        caption: { typography: 'caption', fg: 'semantic.textMuted' },
      },
    },
    Media: {
      structure: 'image',
      parts: {
        frame: { bg: 'semantic.canvas', radius: 'radius.md', objectFit: 'cover' },
        caption: { typography: 'caption', fg: 'semantic.textMuted', marginY: 'space.2' },
      },
    },
    Divider: {
      structure: 'default',
      base: { borderWidth: '0', borderColor: 'semantic.border', bg: 'semantic.border' },
      // `variantFrom: 'direction'`이 만든 채널이다.
      variants: {
        horizontal: { height: '1px', width: '100%' },
        vertical: { width: '1px', minHeight: '100%' },
      },
    },
    Placeholder: {
      structure: 'default',
      base: {
        bg: 'semantic.canvas',
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: 'semantic.borderStrong',
        radius: 'radius.md',
        fg: 'semantic.textMuted',
        typography: 'caption',
        display: 'grid',
      },
    },
  },
}
