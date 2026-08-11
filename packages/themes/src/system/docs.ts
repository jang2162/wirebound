import type { Theme } from '../spec/theme'

/**
 * 내장 시스템 테마 — **문서 사이트**.
 *
 * 좌측 내비게이션이 있고 본문이 중심이며, 읽기 폭이 좁고 행간이 넓다. 코드·표·주의 상자가
 * 자주 나온다. `admin`이 *"넓은 컨테이너와 좁은 섹션 여백"*이라면 이쪽은 정확히 그 반대다.
 *
 * ---
 *
 * ## 이 테마가 `admin`과 갈리는 네 자리
 *
 * | 층 | `admin` | `docs` |
 * |---|---|---|
 * | 토큰 | 파란 회색 팔레트, 서체 없음 | 잉크/종이 팔레트 + **서체 셋**(세리프 본문 · 산세리프 UI · 모노 코드) |
 * | 골격 | `container.maxWidth: 1440px` | **`720px`** — 그리고 그 값을 실제로 거는 자리가 따로 있다(아래 "읽기 폭") |
 * | 구조 | 새 구조 0개 | **8개**(`Card:horizontal` · `Tabs:enclosed` · `List:stackedList` · `Tree:accordion` · `KeyValue:definitionList` · `EntryForm:labelTop` · `Field:underlined` · `Button:text`) |
 * | 스킨 | 면과 테두리로 밀도를 만든다 | **선 하나로 만든다** — `borderWidth`의 다중값(`'0 0 1px'`)이 이 테마의 주된 도구다 |
 *
 * ---
 *
 * ## 읽기 폭을 어디에 적었는가 — **이제 한 곳이다** (2026-08-11, P4c-1 T1)
 *
 * `primitives.container.maxWidth: '720px'` 하나가 그 값의 유일한 자리이고,
 * `Section.parts.inner.maxWidth`가 `'container.maxWidth'`로 그것을 가리킨다.
 *
 * **P4b-3까지는 그렇지 않았다. 지우지 않고 무엇이 왜 바뀌었는지 남긴다:**
 *
 * > *"`primitives.container.maxWidth: '720px'`는 §6.4가 시키는 자리다. 그런데 **그 값을
 * > 스타일이 가리킬 문법이 없다.** 토큰 참조의 이름공간은 일곱뿐이고 `container`는 없다.
 * > 그리고 `resolveTheme`이 `checkThemeComponents`에 `tokens.table`만 넘긴다. …
 * > **그래서 `Section.parts.inner.maxWidth`에 `'720px'`을 리터럴로 적었다.** 같은 수가 두
 * > 곳에 있고 **어긋나도 아무것도 안 죽는다.**"*
 *
 * **P4b-3 이월이 바로 이 중복을 병의 증거로 지목했다** — *"`docs`가 읽기 폭 720px을 두 곳에
 * 손으로 적은 것이 그 증거다. 문법이 있었으면 한 곳이다."* P4c-1 T1이 스타일 전용
 * 이름공간 셋(`container`·`grid`·`section`)을 열어 그 문법을 만들었고, 여기가 그것을 쓰는
 * 자리다. 컴파일 결과는 `max-width: 720px` → `max-width: var(--wb-container-maxWidth)`이고
 * **계산값은 같다**(`:root`가 그 변수에 `720px`을 낸다).
 *
 * > **그리고 이 파일이 그 함정의 교과서였다.** 위 문단이 *"`admin`이 `container.maxWidth`를
 * > 적었는데 풀리지 않는다"*고 규탄해 놓고, 같은 파일 200줄 아래에서 `admin`의
 * > `gap: 'grid.gap'`을 **그대로 복사했다**(P4b-3의 ③이 찾아 `'space.5'`로 고쳤다).
 * > *산문 경고는 복사를 막지 못한다* — 그것을 잡은 것은
 * > `packages/themes/test/system-unresolved-literals.test.ts`의 **수 케이스**였다.
 *
 * **읽기 폭은 사실 세 층이다.** 컨테이너(720px)가 칼럼을 자르고, `Text`의 `body` 변형이
 * `maxWidth: '68ch'`로 **글자 수 기준의 행 길이**를 다시 자른다. 세리프 17px에서 68ch가
 * 720px보다 좁으므로 실제로 본문을 지배하는 것은 뒤쪽이다 — 문서 사이트에서 폭의 단위는
 * 픽셀이 아니라 글자 수다.
 *
 * ---
 *
 * ## `Code` 컴포넌트가 없다 — **`Placeholder`로 대신했다** (계획서 재라 #7)
 *
 * 카탈로그 19개 중 코드 블록에 해당하는 것이 없다. 후보를 셋 놓고 골랐다:
 *
 * | 후보 | 왜 아닌가 / 왜 골랐나 |
 * |---|---|
 * | `Text` (`body`·`caption` 역할에 모노를 건다) | **역할 채널을 도둑질한다.** `Text`는 `variantFrom: 'role'`이라 변형 아홉이 전부 문서 개요(`<h1>`~`<p>`)에 묶여 있다. 코드에 `caption`을 쓰면 그 문서의 모든 캡션이 코드가 된다 |
 * | `Media:chart`·`illustration` | 틀(`frame`)이 비율을 갖는 상자다. 코드는 줄 수만큼 길어지므로 비율이 뜻을 갖지 않는다 |
 * | **`Placeholder`** (고른 것) | 자유 문자열(`label`)과 높이(`height`)를 노드가 갖는 **유일한** 컴포넌트다. 와이어프레임에서 코드 블록은 *"모노 글자가 든 상자"*이고 그것이 정확히 이 컴포넌트의 모양이다 |
 *
 * **대가가 있고 그것이 §16의 입력이다:** `Placeholder`는 `structures`가 하나(`default`)이고
 * **`variants`가 비어 있다.** 즉 이 테마에서 `Placeholder`를 코드 블록으로 스킨하는 순간
 * *"미정 영역"*이라는 원래 쓰임을 **표현할 채널이 하나도 남지 않는다.** 구조 선택이 타입
 * 단위라는 벽(P4b-2 이월 1번)보다 한 칸 더 나쁜 자리다 — 그쪽은 적어도 변형 채널이 남는다.
 *
 * **높이는 건드리지 않았다.** `Placeholder:default`의 기본 CSS가
 * `height: var(--wb-node-placeholder-height, 120px)`인데 여기서 `height`를 쓰면 노드가 정한
 * 줄 수가 **말없이 사라진다**(P4b-2 이월 5번의 손잡이 표). 코드 블록의 길이는 테마가 아니라
 * 그 코드가 정한다.
 *
 * ---
 *
 * ## 주의 상자 — `Card:horizontal` + `featured`
 *
 * 문서의 NOTE/WARNING 상자는 *"왼쪽에 표시, 오른쪽에 제목과 글"*이다. `horizontal`이 그
 * DOM을 가진 **유일한** 구조다(`media` + `content`, 그리고 `content`는 CSS로 만들 수 없다 —
 * 감싸는 상자를 만드는 선언이 없다). `media`를 작은 정사각형으로 줄여 표시 자리로 쓴다.
 *
 * **종류가 둘뿐이다.** `Card.variants`가 `default`·`featured` 둘이므로 *"정보"*와 *"경고"*는
 * 표현되지만 *"위험"*·*"팁"*은 표현할 채널이 없다. §16의 입력이다.
 */
export const DOCS_THEME: Theme = {
  meta: {
    id: 'docs',
    name: '문서',
    description: '문서 사이트 테마. 좁은 읽기 폭과 넓은 행간, 좌측 내비와 코드·정의 목록 중심.',
    version: '1.0.0',
  },

  tokens: {
    /**
     * 잉크와 종이. **`admin`의 파란 회색(`slate`)과 색상(hue)이 다르다** — 문서는 오래 읽는
     * 화면이라 중성에 가까운 따뜻한 회색을 쓰고, 강조는 하나(`indigo`)로 줄인다.
     */
    palette: {
      'ink.900': '#1b1b1f',
      'ink.700': '#3c3c43',
      'ink.500': '#67676c',
      'ink.300': '#98989f',
      'ink.200': '#e2e2e3',
      'paper.0': '#ffffff',
      'paper.50': '#f6f6f7',
      'paper.100': '#ebebef',
      'indigo.600': '#3451b2',
      'indigo.50': '#eef2ff',
      'amber.600': '#915930',
      'amber.50': '#fdf6e3',
      'red.600': '#d1383d',
    },
    semantic: {
      primary: 'palette.indigo.600',
      primarySoft: 'palette.indigo.50',
      surface: 'palette.paper.0',
      canvas: 'palette.paper.50',
      border: 'palette.ink.200',
      borderStrong: 'palette.ink.300',
      text: 'palette.ink.900',
      textMuted: 'palette.ink.500',
      danger: 'palette.red.600',
      // 주의 상자 — `Card.variants.featured`가 쓴다.
      notice: 'palette.amber.600',
      noticeSoft: 'palette.amber.50',
      // 코드 블록 — `Placeholder`가 쓴다. `canvas`와 값이 같지만 **이름이 다른 것이 요점이다**
      // (§6.3의 의미 계층 — 파생 테마가 코드 배경만 어둡게 바꿀 수 있어야 한다).
      code: 'palette.paper.100',
      codeText: 'palette.ink.700',
    },
    scale: {
      space: { unit: '4px' },
      // 문서의 상자는 거의 사각이다. `admin`(4·6·10px)보다 한 단계씩 낮췄다.
      radius: { sm: '3px', md: '6px', lg: '8px' },
      // 문서 사이트는 그림자를 거의 안 쓴다 — 면을 가르는 것은 선이다. 둘만 둔다.
      shadow: {
        sm: '0 1px 0 rgba(27,27,31,.05)',
        md: '0 6px 24px rgba(27,27,31,.08)',
      },
      /**
       * **이 테마의 절반이 여기 있다.**
       *
       * `admin`이 예고한 자리다 — *"시스템 테마 다섯을 만들 때 여기에 `family`와
       * `fontFamily`가 함께 온다."* `family`는 **토큰**이고 컴포넌트에 거는 것은
       * `fontFamily` **어휘**다. 둘 다 있어야 화면에 보인다(P4b-3 ①이 그 두 층을 갈랐다).
       *
       * **셋으로 나눈 이유:** 문서 사이트의 서체는 한 벌이 아니다. 본문은 오래 읽으므로
       * 세리프, 내비·버튼·필드 같은 UI는 짧게 읽으므로 산세리프, 코드는 열을 맞춰야 하므로
       * 모노다. 한 벌로 통일하면 그 세 읽기가 구별되지 않는다.
       *
       * **`ui`·`code` 항목은 `Text.variants`에 대응하지 않는다.** 타이포 스케일의 항목
       * 이름은 `Text`의 역할 아홉과 같을 **필요가 없다** — `typography: 'ui'`는 스케일 항목을
       * 가리킬 뿐이고, 그 이름이 변형 채널과 이어지는 것은 `Text`뿐이다. `admin`은 아홉을
       * 그대로 두어 이 자유도가 안 보였다.
       */
      typography: {
        family: {
          serif: '"Wirebound Docs Serif", "Noto Serif KR", Georgia, "Times New Roman", serif',
          sans: '"Wirebound Docs Sans", Pretendard, "Noto Sans KR", system-ui, sans-serif',
          mono: '"Wirebound Docs Mono", D2Coding, ui-monospace, SFMono-Regular, Menlo, monospace',
        },
        display: { fontSize: '40px', lineHeight: 1.25, fontWeight: 700, letterSpacing: '-0.02em' },
        h1: { fontSize: '32px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.015em' },
        h2: { fontSize: '25px', lineHeight: 1.35, fontWeight: 700 },
        h3: { fontSize: '20px', lineHeight: 1.4, fontWeight: 600 },
        h4: { fontSize: '17px', lineHeight: 1.5, fontWeight: 600 },
        h5: { fontSize: '15px', lineHeight: 1.5, fontWeight: 600 },
        h6: { fontSize: '12px', lineHeight: 1.5, fontWeight: 600, letterSpacing: '0.06em' },
        // **본문이 17px/1.75다** — `admin`은 14px/1.6이다. 읽는 화면과 다루는 화면의 차이가
        // 한 줄로 드러나는 자리다.
        body: { fontSize: '17px', lineHeight: 1.75, fontWeight: 400 },
        caption: { fontSize: '13px', lineHeight: 1.6, fontWeight: 400 },
        code: { fontSize: '14px', lineHeight: 1.7, fontWeight: 400 },
        ui: { fontSize: '14px', lineHeight: 1.5, fontWeight: 500 },
      },
      motion: { base: '120ms' },
    },
  },

  /**
   * §6.4: *"실제 사이트처럼 보이는 인상의 절반은 여기서 나온다."*
   *
   * **`admin`의 1440px과 정반대다.** 그리고 섹션 여백은 반대로 넓다 — 관리자 화면은 한
   * 화면에 많이 담아야 하고, 문서는 한 화면에 한 생각만 담는다.
   *
   * **브레이크포인트를 둘만 둔다.** 문서 사이트가 실제로 갈리는 지점은 *"좌측 내비가 접히는
   * 폭"* 하나이고, 그 위아래로 하나씩이면 충분하다. §6.4의 예시가 넷인 것은 예시일 뿐이다
   * (`spec/primitives.ts`가 고정 목록이 아니라고 적어 두었다).
   */
  primitives: {
    // **읽기 폭 720px을 적는 자리는 이제 여기 하나다**(P4c-1 T1). `Section.parts.inner`가
    // `'container.maxWidth'`로 이것을 가리킨다 — 아래 "읽기 폭을 어디에 적었는가"를 보라.
    container: { maxWidth: '720px', gutter: 'space.6' },
    grid: { columns: 12, gap: 'space.6' },
    section: { paddingY: 'space.10', paddingYCompact: 'space.5' },
    breakpoints: { sm: 640, md: 900 },
  },

  /**
   * **순서가 캐스케이드다.** 같은 조각 이름을 둘 이상이 쓰면 **뒤에 선언한 것이 이긴다**
   * (`emit/index.ts`가 이 객체의 키 순서로 규칙을 낸다).
   *
   * 그래서 **자식을 담는 것(`Card`·`Tabs`·`SearchForm`·`EntryForm`)을 앞에, 그 안에 들어가는
   * 것(`List`·`Tree`·`KeyValue`·`Field`·`Button`)을 뒤에** 두었다. `parts` 규칙이 자손
   * 결합자라 바깥의 조각 스킨이 안쪽의 같은 이름 조각까지 잡기 때문이다(P4b-2 이월 4-1).
   * 이 순서가 그것을 **막는 것이 아니라 덮는다** — 자세한 것은 아래 각 자리의 주석에 있다.
   */
  components: {
    // ── 골격 ────────────────────────────────────────────────────────────────

    /**
     * **`admin`은 `Page`를 선언하지 않는다.** 서체를 문서 전체에 걸려면 뿌리가 필요하고,
     * 그 뿌리가 이것이다 — `font-family`는 상속되므로 여기 한 번이면 스킨을 안 준
     * 컴포넌트까지 산세리프를 받는다.
     */
    Page: {
      structure: 'default',
      base: {
        bg: 'semantic.surface',
        fg: 'semantic.text',
        fontFamily: 'typography.family.sans',
      },
    },

    Section: {
      structure: 'contained',
      base: { bg: 'semantic.surface', paddingY: 'space.10' },
      parts: {
        // `marginX: 'auto'`가 없으면 좁힌 칼럼이 왼쪽에 붙는다. `admin`에는 이 줄이 없다 —
        // 1440px 컨테이너는 대개 화면을 다 쓰므로 가운데 정렬이 눈에 안 띈다.
        inner: { maxWidth: 'container.maxWidth', marginX: 'auto', paddingX: 'space.6' },
      },
      variants: {
        hero: { bg: 'semantic.canvas', paddingY: 'space.16' },
        muted: { bg: 'semantic.canvas' },
      },
      responsive: {
        md: { base: { paddingY: 'space.6' }, parts: { inner: { paddingX: 'space.4' } } },
      },
    },

    Flex: { structure: 'default', base: { gap: 'space.4' } },
    /**
     * **`gap`이 `'grid.gap'`이 아니라 `'space.5'`다** (P4b-3 ③이 고쳤다).
     *
     * 이 자리에 `'grid.gap'`이라고 적혀 있었다 — `admin`에서 옮겨 온 줄이다. **머리말이
     * 바로 그 함정을 규탄하면서 같은 줄을 복사했다.** `primitives`는 참조 이름공간에 없으므로
     * (`TOKEN_NAMESPACES` 일곱) 그것은 참조로 안 풀리고 **리터럴로 통과해 `gap: grid.gap;`이
     * CSS에 실린다.** Chromium 151이 그 선언을 버리는 것까지 확인했다 — 이 규칙이 통째로
     * **빈 규칙(`{ }`)**이 되어 문서 격자에 간격이 하나도 없었다.
     *
     * `admin`의 같은 줄은 **고치지 않았다**(D7이 `admin`의 CSS 불변을 요구한다). `docs`는
     * 이 슬라이스가 처음 만드는 테마라 지킬 이전 화면이 없으므로 여기서 고친다.
     *
     * 값이 `space.5`인 것은 본문 흐름(`Flex`의 `space.4`)보다 한 칸 넓히려는 것이고,
     * **`primitives.grid.gap`을 가리키고 싶었던 원래 뜻은 규격에 문법이 없어 표현할 수 없다** —
     * 이월 §A가 후보와 비용을 적었고 P4c의 첫 태스크다.
     */
    Grid: { structure: 'default', base: { gap: 'space.5' } },

    /**
     * **주의 상자.** 머리말의 판정 그대로다.
     *
     * `media`에 `aspectRatio: '1 / 1'`을 준다 — 구조 기본 CSS의 `Card [media]`가
     * `aspect-ratio: 16 / 9`를 내는데, 표시 자리는 정사각이어야 한다. **이것은 노드 손잡이를
     * 덮는 것이 아니다**(`--wb-node-media-ratio`는 `Media [frame]`에 있다). 구조가 정한
     * 기본값을 테마가 덮는 것이고 §6.5가 그러라고 만든 자리다.
     */
    Card: {
      structure: 'horizontal',
      base: {
        bg: 'semantic.primarySoft',
        borderWidth: '0 0 0 3px',
        borderStyle: 'solid',
        borderColor: 'semantic.primary',
        radius: 'radius.sm',
        padding: 'space.4',
        gap: 'space.4',
        align: 'start',
      },
      parts: {
        media: {
          width: 'space.5',
          aspectRatio: '1 / 1',
          bg: 'semantic.primary',
          radius: 'radius.sm',
        },
        content: { gap: 'space.2' },
        title: { typography: 'h5', fg: 'semantic.text', fontFamily: 'typography.family.sans' },
        subtitle: { typography: 'caption', fg: 'semantic.textMuted' },
        body: { typography: 'body', fg: 'semantic.text', fontFamily: 'typography.family.serif' },
      },
      variants: {
        featured: {
          bg: 'semantic.noticeSoft',
          borderColor: 'semantic.notice',
          parts: { media: { bg: 'semantic.notice' } },
        },
      },
      // 좁은 화면에서 표시와 글이 위아래로 선다. `Card:horizontal`의 기본 CSS가 내는
      // `display: flex`는 그대로 두고 방향만 바꾼다.
      responsive: { sm: { base: { direction: 'column' } } },
    },

    /**
     * **코드 예제의 언어 전환 탭.** `enclosed`를 고른 이유는 탭이 **패널에 붙어 있어야**
     * 하기 때문이다 — `npm`/`pnpm`/`yarn` 탭은 그 아래 코드 상자의 뚜껑이다.
     *
     * **`vertical`을 안 골랐다.** 계획서의 참고 표가 그것을 적었지만(지시가 아니다),
     * 세로 탭은 좌측 레일이고 이 테마에는 이미 `Tree:accordion`이 그 자리에 있다. 하나의
     * 화면에 세로 목록 둘이 나란히 서는 것은 문서 사이트의 모양이 아니다. **D3이 요구한
     * 정직함이 이쪽이라고 판단했다** — 안 고른 구조가 남는 것은 §16의 입력이지 결함이 아니다.
     *
     * `underline`·`pill`과 **DOM이 글자까지 같다**(P4b-2 ③이 쟀다). 그러므로 뚜껑처럼
     * 보이게 하는 것은 전부 아래 `parts`다.
     */
    Tabs: {
      structure: 'enclosed',
      base: { marginY: 'space.6' },
      parts: {
        list: {
          gap: 'space.1',
          borderWidth: '1px 1px 0',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: 'radius.md radius.md 0 0',
          bg: 'semantic.canvas',
          paddingX: 'space.2',
        },
        tab: {
          paddingX: 'space.3',
          paddingY: 'space.2',
          fg: 'semantic.textMuted',
          typography: 'ui',
          fontFamily: 'typography.family.sans',
        },
        panel: {
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: '0 radius.md radius.md radius.md',
          padding: 'space.5',
          bg: 'semantic.surface',
        },
      },
    },

    SearchForm: {
      structure: 'inline',
      base: {
        bg: 'semantic.canvas',
        padding: 'space.3',
        radius: 'radius.md',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        display: 'flex',
        gap: 'space.3',
        align: 'center',
      },
      parts: { fields: { display: 'flex', gap: 'space.3' }, actions: { display: 'flex', gap: 'space.2' } },
    },

    /**
     * **`labelTop`을 골랐다. 그런데 라벨을 위로 올리는 것은 이 구조가 아니다.**
     *
     * `labelLeft`와 DOM이 글자까지 같고(P4b-2 ③이 쟀다), 라벨과 컨트롤의 짝은 이 폼이 아니라
     * 자식 `Field` 안에 있다. 실제로 위로 올린 것은 아래 `Field.base.direction: 'column'`이다.
     * 렌더러의 `EntryFormRows` 주석이 그것을 미리 적어 두었고(*"결국 `Field` 루트의
     * `flex-direction` 하나"*), 이 테마가 그 문장이 참임을 실제로 확인한 첫 자리다.
     *
     * **그래도 `labelTop`이라고 적는다** — `data-wb-structure`가 그 값으로 나가므로 파생
     * 테마가 *"이 폼은 라벨이 위인 폼"*을 셀렉터로 잡을 수 있고, 무엇보다 **테마가 고른
     * 것이 무엇인지를 문서가 말해야** 한다.
     *
     * `parts.label`은 **폼 제목**이다(필드의 라벨이 아니다 — 이름이 겹치는 것을 P0 이월이
     * 이미 지적했다). 아래 `Field`가 뒤에 오므로 중첩된 필드 라벨은 `Field` 쪽이 이긴다.
     */
    EntryForm: {
      structure: 'labelTop',
      base: {
        bg: 'semantic.surface',
        padding: 'space.5',
        radius: 'radius.md',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        display: 'flex',
        direction: 'column',
        gap: 'space.4',
      },
      parts: {
        label: { typography: 'h4', fg: 'semantic.text', fontFamily: 'typography.family.sans' },
        row: { display: 'flex', direction: 'column', gap: 'space.4' },
        actions: { display: 'flex', gap: 'space.2' },
      },
    },

    // ── 데이터 ──────────────────────────────────────────────────────────────

    /**
     * **문서 목록·색인.** `admin`의 표와 정반대 쓰임이다.
     *
     * **`item`에 `display: 'block'`을 준다 — 불릿을 끄는 유일한 길이다.** §6.8에
     * `listStyle`이 없어 `list-style-type: none`을 낼 어휘가 없는데, 마커는 요소가
     * `display: list-item`일 때만 생기므로 `block`으로 바꾸면 사라진다. **우회이고 대가가
     * 있다** — `<li>`의 뜻은 남지만 그것이 목록 항목으로 그려지지 않는다. §16의 입력이다.
     *
     * **`title`을 여기서 다시 선언하는 것이 중요하다.** 위 `Card.parts.title`이 자손
     * 결합자라 **카드 안에 넣은 목록의 제목까지 잡는다**(P4b-2 이월 4-1). 이 선언이 뒤에
     * 오므로 중첩된 목록은 이쪽을 받는다 — **막는 것이 아니라 덮는 것이고, 지우면 조용히
     * 샌다.** 아래 보고서에 그 실측이 있다.
     */
    List: {
      structure: 'stackedList',
      base: { fg: 'semantic.text', typography: 'body', padding: '0' },
      parts: {
        item: {
          display: 'block',
          paddingY: 'space.3',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        title: {
          typography: 'h5',
          fg: 'semantic.primary',
          fontFamily: 'typography.family.sans',
        },
        meta: { typography: 'caption', fg: 'semantic.textMuted' },
        pagination: {
          display: 'block',
          paddingY: 'space.4',
          textAlign: 'center',
          typography: 'caption',
          fg: 'semantic.textMuted',
        },
      },
      variants: { compact: { parts: { item: { paddingY: 'space.1' } } } },
      states: {
        selected: { parts: { item: { bg: 'semantic.primarySoft' } } },
        disabled: { opacity: 0.5 },
        empty: { parts: { item: { fg: 'semantic.textMuted' } } },
      },
    },

    /**
     * **좌측 내비게이션.** `accordion`이 문서 사이트의 사이드바 그대로다 — 한 묶음만 펴져
     * 있고 나머지는 접혀 있다.
     *
     * **`node`에 `paddingX`를 준다. 이것이 손잡이를 덮지 않는 이유는 하나뿐이다** —
     * 구조 기본 CSS의 `Tree [node]` 규칙이 `:where([data-wb-structure="indent"])`로 좁혀져
     * 있어(P4b-2 ③) 아코디언의 마디에는 **아예 안 맞는다.** 좁혀지기 전이었다면 이 한 줄이
     * `--wb-node-tree-level` 들여쓰기를 말없이 지웠을 자리다.
     *
     * **`treeIndent` 어휘를 안 쓴다.** 아코디언은 깊이를 DOM 중첩으로 내므로 단계 변수를
     * 싣지 않는다 — 값을 넣어도 읽는 규칙이 없다. 대신 `panel`의 왼쪽 선이 깊이를 보인다.
     */
    Tree: {
      structure: 'accordion',
      base: {
        fg: 'semantic.text',
        typography: 'ui',
        fontFamily: 'typography.family.sans',
        padding: '0',
      },
      parts: {
        node: { display: 'block', paddingY: 'space.1', paddingX: 'space.2' },
        label: { fg: 'semantic.textMuted' },
        toggle: { fg: 'semantic.borderStrong' },
        panel: {
          display: 'block',
          paddingX: 'space.3',
          marginY: 'space.1',
          borderWidth: '0 0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
      },
      states: {
        selected: { parts: { label: { fg: 'semantic.primary', fontWeight: 600 } } },
        disabled: { opacity: 0.5 },
      },
    },

    /**
     * **API 레퍼런스의 파라미터 목록.** `<dl>/<dt>/<dd>`가 *"용어와 그 뜻"*을 그대로 나르고
     * 읽는 도구에도 그렇게 전달된다 — `admin`의 표(`<th>/<td>`)는 행렬의 칸이라 뜻이 다르다.
     *
     * `key`에 모노를 건다 — 파라미터 이름은 코드다.
     *
     * **`value`에 `marginX: '0'`이 필요하다.** `<dd>`의 브라우저 기본값이
     * `margin-inline-start: 40px`이라 안 지우면 값이 통째로 밀려 있다. 구조 기본 CSS가 그것을
     * 지우지 않는 것은 옳다 — 그것은 스킨이지 *"구조가 서기 위한 최소 선언"*이 아니다.
     */
    KeyValue: {
      structure: 'definitionList',
      base: { typography: 'body', fg: 'semantic.text' },
      parts: {
        row: {
          paddingY: 'space.3',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        key: {
          fontFamily: 'typography.family.mono',
          typography: 'code',
          fontWeight: 600,
          fg: 'semantic.text',
        },
        value: { marginX: '0', marginY: 'space.1', fg: 'semantic.textMuted' },
      },
    },

    // ── 입력 ────────────────────────────────────────────────────────────────

    /**
     * **밑줄만 있는 필드.** `outlined`·`filled`와 DOM이 글자까지 같으므로(P4b-2 ③이 쟀다)
     * 갈리는 것은 아래 `control` 스킨 하나다.
     *
     * **`borderWidth: '0 0 1px'`이 그 전부다.** §6.8에 한 변만 겨냥하는 어휘가 없어
     * (`borderBottomWidth` 같은 이름이 없다) 처음에는 표현 불가로 보였는데, `border-width`가
     * CSS 단축이라 **다중값 리터럴이 그대로 통과한다**(값 규칙은 함수와 탈출 문자만 본다).
     * 이 테마가 선을 다루는 주된 방법이 이것이고, 여덟 자리에서 쓴다.
     *
     * **`base.direction: 'column'`이 라벨을 위로 올린다** — `EntryForm:labelTop`이 아니라
     * 여기다(위 `EntryForm`의 주석).
     */
    Field: {
      structure: 'underlined',
      base: {
        display: 'flex',
        direction: 'column',
        gap: 'space.1',
        fontFamily: 'typography.family.sans',
      },
      parts: {
        label: { typography: 'h6', fg: 'semantic.textMuted', textTransform: 'uppercase' },
        control: {
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: '0',
          paddingX: '0',
          paddingY: 'space.2',
          bg: 'transparent',
          fg: 'semantic.textMuted',
          typography: 'ui',
          transition: 'motion.base',
        },
        help: { typography: 'caption', fg: 'semantic.textMuted' },
      },
      variants: {
        textarea: { parts: { control: { minHeight: '96px' } } },
        // 체크박스만 상자로 되돌린다 — 밑줄 하나로는 켜짐/꺼짐이 보이지 않는다.
        checkbox: {
          parts: {
            control: {
              width: '16px',
              minHeight: '16px',
              paddingX: '0',
              paddingY: '0',
              borderWidth: '1px',
              radius: 'radius.sm',
            },
          },
        },
      },
      states: {
        // `admin`이 안 쓰는 상태다. 문서의 폼은 필수 항목이 적어 그 표시가 눈에 띄어야 한다.
        required: { parts: { label: { fg: 'semantic.danger' } } },
        invalid: { parts: { control: { borderColor: 'semantic.danger' } } },
        disabled: { opacity: 0.5 },
      },
    },

    // ── 액션 ────────────────────────────────────────────────────────────────

    /**
     * **문서 사이트의 버튼은 링크에 가깝다.** 그래서 구조가 `text`다.
     *
     * **그리고 그것이 `variants`를 비워 두지 않는 이유다.** 구조는 테마가 컴포넌트 전체에
     * 고르고 변형은 노드가 자기 하나에 고르므로(§6.5), *"이 사이트의 버튼은 전부 텍스트인데
     * 이 하나만 채운 CTA"*가 표현된다. `primary`가 그 하나다 — `admin`은 `base`가 이미
     * 채운 버튼이라 이 변형을 선언할 이유가 없었다.
     */
    Button: {
      structure: 'text',
      base: {
        bg: 'transparent',
        fg: 'semantic.primary',
        borderWidth: '0',
        borderStyle: 'solid',
        borderColor: 'transparent',
        radius: 'radius.sm',
        paddingX: 'space.2',
        paddingY: 'space.1',
        typography: 'ui',
        fontFamily: 'typography.family.sans',
        textDecoration: 'none',
        transition: 'motion.base',
      },
      parts: { label: { fg: 'semantic.primary' } },
      variants: {
        primary: {
          bg: 'semantic.primary',
          paddingX: 'space.5',
          paddingY: 'space.3',
          radius: 'radius.md',
          parts: { label: { fg: 'semantic.surface' } },
        },
        secondary: {
          bg: 'semantic.canvas',
          borderWidth: '1px',
          borderColor: 'semantic.border',
          paddingX: 'space.4',
          paddingY: 'space.2',
          parts: { label: { fg: 'semantic.text' } },
        },
        danger: { parts: { label: { fg: 'semantic.danger' } } },
        ghost: { parts: { label: { fg: 'semantic.textMuted' } } },
      },
      states: { disabled: { opacity: 0.45 }, loading: { opacity: 0.7 } },
    },

    Link: {
      structure: 'default',
      base: {
        fg: 'semantic.primary',
        textDecoration: 'underline',
        transition: 'motion.base',
      },
      // 사이드바·꼬리말의 링크는 본문 링크처럼 튀면 안 된다.
      variants: { muted: { fg: 'semantic.textMuted', textDecoration: 'none' } },
      states: { disabled: { opacity: 0.5, textDecoration: 'none' } },
    },

    // ── 문서 ────────────────────────────────────────────────────────────────

    /**
     * **서체가 여기서 갈린다.** 본문은 세리프, 제목은 산세리프다 — 제목은 훑는 글이고
     * 본문은 읽는 글이다.
     *
     * `body` 변형의 `maxWidth: '68ch'`가 이 테마의 **진짜 읽기 폭**이다(머리말의 "읽기 폭").
     * `ch`는 글꼴의 `0` 폭이라 서체를 바꾸면 픽셀 폭이 따라 바뀐다 — 픽셀로 적으면 그 성질을
     * 잃는다.
     *
     * `h2`의 아래 선은 문서에서 절이 갈리는 표시다. `admin`에는 그런 것이 없다 —
     * 관리자 화면의 제목은 상자의 이름표이지 글의 마디가 아니다.
     */
    Text: {
      structure: 'default',
      base: { fg: 'semantic.text', typography: 'body', fontFamily: 'typography.family.serif' },
      variants: {
        display: { typography: 'display', fontFamily: 'typography.family.sans' },
        h1: { typography: 'h1', fontFamily: 'typography.family.sans', marginY: 'space.6' },
        h2: {
          typography: 'h2',
          fontFamily: 'typography.family.sans',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          paddingY: 'space.2',
          marginY: 'space.6',
        },
        h3: { typography: 'h3', fontFamily: 'typography.family.sans', marginY: 'space.5' },
        h4: { typography: 'h4', fontFamily: 'typography.family.sans', marginY: 'space.4' },
        h5: { typography: 'h5', fontFamily: 'typography.family.sans' },
        h6: {
          typography: 'h6',
          fontFamily: 'typography.family.sans',
          fg: 'semantic.textMuted',
          textTransform: 'uppercase',
        },
        body: { typography: 'body', maxWidth: '68ch', marginY: 'space.4' },
        caption: {
          typography: 'caption',
          fg: 'semantic.textMuted',
          fontFamily: 'typography.family.sans',
        },
      },
    },

    /**
     * 문서의 그림은 대개 스크린샷이라 `image`다(`admin`과 같다 — 우연이 아니라 같은 답이다).
     *
     * **`frame`에 `aspectRatio`를 주지 않는다.** 주면 노드의 `ratio` prop이 **말없이**
     * 사라진다(P4b-2 이월 5번의 손잡이 표 — `--wb-node-media-ratio`). 스크린샷의 비율은
     * 그 스크린샷이 정한다.
     */
    Media: {
      structure: 'image',
      parts: {
        frame: {
          bg: 'semantic.canvas',
          radius: 'radius.md',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          objectFit: 'cover',
        },
        caption: {
          typography: 'caption',
          fg: 'semantic.textMuted',
          fontFamily: 'typography.family.sans',
          textAlign: 'center',
          marginY: 'space.2',
        },
      },
    },

    Divider: {
      structure: 'default',
      base: {
        borderWidth: '0',
        borderColor: 'semantic.border',
        bg: 'semantic.border',
        marginY: 'space.8',
      },
      variants: {
        horizontal: { height: '1px', width: '100%' },
        vertical: { width: '1px', minHeight: '100%' },
      },
    },

    /**
     * **코드 블록.** 머리말의 재라 #7 판정 그대로다.
     *
     * `borderWidth: '0 0 0 3px'`의 왼쪽 막대가 *"여기는 본문이 아니다"*를 말한다 —
     * 위 `Card`(주의 상자)와 같은 어휘를 쓰되 색이 다르다. 문서에서 본문 흐름을 끊는 상자는
     * 그 둘뿐이고 같은 문법으로 읽혀야 한다.
     *
     * **`height`를 안 쓴다** — 노드의 손잡이다(머리말).
     */
    Placeholder: {
      structure: 'default',
      base: {
        display: 'block',
        bg: 'semantic.code',
        fg: 'semantic.codeText',
        fontFamily: 'typography.family.mono',
        typography: 'code',
        borderWidth: '0 0 0 3px',
        borderStyle: 'solid',
        borderColor: 'semantic.borderStrong',
        radius: '0 radius.md radius.md 0',
        paddingX: 'space.5',
        paddingY: 'space.4',
        textAlign: 'left',
        overflow: 'auto',
      },
    },
  },

  /**
   * §6.7. **`@font-face`로 나간다**(P4b-3 D5가 그 경로를 만들었다).
   *
   * **`src`가 `local()`뿐이다 — 네트워크를 쓰지 않는다.** ①이 그 선택의 한계까지 쟀다:
   * 그 이름의 로컬 폰트가 없으면 face의 `status`가 `error`가 되고 **등록은 되고 로드만
   * 실패한다.** 그래서 토큰의 `family` 값이 face 이름 **뒤에 일반 폰트 이름들을 더 늘어놓는다**
   * — 두 층이 서로를 받친다.
   *
   * **`weights`가 값마다 블록 하나를 낸다**(①이 정했다 — 범위로 접으면 문서에 없는 굵기가
   * 생긴다). 셋을 합쳐 여덟 블록이 나간다.
   *
   * **`placeholder`를 선언하지 않았다.** `photo`가 필요했다 — 이 테마의 `Media`는
   * 스크린샷 자리이고 회색 상자보다 더미 이미지가 문서에 가깝다. 그런데 D5가
   * `placeholder.style`을 컴파일하지 않기로 했으므로, 선언하면 **아무 일도 하지 않는 설정이
   * 테마에 남는다.** 필요했다는 사실만 보고로 넘긴다.
   */
  assets: {
    fonts: [
      {
        family: '"Wirebound Docs Serif"',
        src: 'local("Noto Serif KR"), local("Nanum Myeongjo"), local("Georgia"), local("Times New Roman")',
        weights: [400, 700],
      },
      {
        family: '"Wirebound Docs Sans"',
        src: 'local("Pretendard"), local("Noto Sans KR"), local("Helvetica Neue"), local("Arial")',
        weights: [400, 500, 600, 700],
      },
      {
        family: '"Wirebound Docs Mono"',
        src: 'local("JetBrains Mono"), local("D2Coding"), local("SFMono-Regular"), local("Menlo"), local("Consolas")',
        weights: [400, 600],
      },
    ],
    icons: 'lucide',
  },
}
