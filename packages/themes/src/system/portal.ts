import type { Theme } from '../spec/theme'

/**
 * 내장 시스템 테마 — 기관·사내 포털.
 *
 * **`admin`과 가장 가까운 이웃이다.** 정보 밀도가 비슷하고 목록·트리·폼이 화면의 대부분을
 * 채운다. 그래서 이 파일이 답해야 하는 물음은 *"밀도가 같은데 무엇이 다른가"*다.
 *
 * **답 셋.**
 *
 * 1. **읽는 화면이지 조작하는 화면이 아니다.** `admin`의 목록은 **표**(행렬을 훑는다)이고
 *    포털의 목록은 **제목 + 날짜 줄**(하나를 골라 들어간다)이다. 그래서 `List:stackedList`,
 *    본문 `body`가 14px/1.6이 아니라 **15px/1.7**, 좌우 폭이 1440px이 아니라 **1280px**이다.
 *    간격 씨앗(`space.unit`)은 `admin`과 **같은 4px다** — 밀도가 실제로 비슷하다는 사실을
 *    다른 수로 덮지 않았다.
 * 2. **면이 아니라 선으로 나눈다.** `admin`은 카드에 그림자와 10px 모서리를 준다. 기관
 *    포털은 **1px 실선과 2~4px 모서리**로 구역을 가른다 — `Card:bordered`(머리 띠 + 테두리),
 *    `Tabs:enclosed`(박스 탭), 목록의 위쪽 굵은 선과 행마다 아래 실선. `shadow` 토큰은
 *    선언만 하고 컴포넌트에서 **한 번도 쓰지 않는다.**
 * 3. **접고 펴는 것이 화면의 문법이다.** 좌측 분류는 `Tree:accordion`, 검색은
 *    `SearchForm:collapsible`, 신청서는 `EntryForm:sectioned`(구획)다. `admin`은 셋 다
 *    펼쳐 둔 형태(`indent`·`inline`·`labelLeft`)를 고른다.
 *
 * **`admin`이 안 고르는 구조 일곱을 고른다** — `Card:bordered` · `Tabs:enclosed` ·
 * `List:stackedList` · `Tree:accordion` · `KeyValue:definitionList` ·
 * `SearchForm:collapsible` · `EntryForm:sectioned`. 나머지
 * (`Section:contained`·`Field:outlined`·`Button:solid`·`Media:image`)는 **`admin`과 같다.**
 * 우연이 아니라 판단이다 — 기관 포털의 입력칸은 흰 바탕에 회색 테두리이고 주요 버튼은
 * 채운 버튼이다. **커버리지를 채우려고 다른 것을 고르면 §16이 받을 입력이 오염된다**(D3).
 *
 * ---
 *
 * **여기서 `primitives`를 스타일 값으로 가리키지 않는다 — 가리킬 문법이 없다.**
 *
 * `admin`이 `Section.parts.inner.maxWidth: 'container.maxWidth'`와 `Grid.base.gap: 'grid.gap'`을
 * 쓰는데, `TOKEN_NAMESPACES`에 `container`·`grid`·`section`이 **없다.** 그래서 그 값은 참조로
 * 인식되지 않고 **글자 그대로** CSS에 실린다 — 컴파일해서 봤다:
 * `max-width: container.maxWidth;` · `gap: grid.gap;` **둘 다 무효 선언이다.**
 * (`:root`에는 `--wb-container-maxWidth: 1440px`가 정상적으로 나가지만 그것을 읽는 코드가
 * 저장소에 하나도 없다.) `var()`는 §6.8이 막으므로 우회로도 없다.
 *
 * **그래서 이 테마는 폭을 리터럴로 적고 `primitives`에 같은 값을 함께 선언한다.** 값이 두
 * 곳에 적히는 것이 오늘의 대가이고, 그 대가를 없애는 것은 §6.8/§6.3을 넓히는 판단이라
 * 여기서 하지 않는다. **보고에 적었다.**
 *
 * **방향별 테두리 어휘도 없다.** §6.8에 `borderTop` 같은 이름이 없다. 대신 `borderWidth`가
 * `border-width`로 그대로 나가므로 **다중값 shorthand**(`'0 0 1px'`)로 적는다 — 포털의
 * 인상 절반이 그 한 줄에 걸려 있다(목록의 행 구분선·박스 탭·카드 머리 띠).
 */
export const PORTAL_THEME: Theme = {
  meta: {
    id: 'portal',
    name: '포털',
    description:
      '기관·사내 포털 테마. 선으로 구역을 나누고, 목록은 제목과 날짜 줄로, 분류는 접었다 편다.',
    version: '1.0.0',
  },

  /**
   * **서체가 두 층이다.** 아래 `assets.fonts`가 `@font-face`를 내고(P4b-3 ①), 여기
   * `typography.family.sans`가 그것을 가리킬 토큰을 만들며, 컴포넌트가 `fontFamily`로 건다.
   * **셋 다 있어야 화면에 보인다.**
   */
  tokens: {
    // 원시 팔레트. 스타일은 이것을 직접 가리킬 수 없다(§6.3의 3단 분리).
    //
    // **채도를 낮춘 남색이 이 테마의 색이다.** `admin`의 `blue.600`(#2563eb)은 밝고 선명해서
    // 조작 화면의 강조에 맞는다. 기관 포털의 남색은 그보다 어둡고 탁하다 — 글이 오래
    // 읽히는 화면이라 색이 앞으로 나오면 안 된다.
    palette: {
      'navy.900': '#0b2545',
      'navy.700': '#13497e',
      'navy.600': '#1b5e9e',
      'navy.100': '#dbe7f4',
      'navy.50': '#eff4fa',
      'gray.700': '#48566a',
      'gray.400': '#93a1b3',
      'gray.300': '#c6d0dc',
      'gray.200': '#dde4ec',
      'gray.100': '#eef2f6',
      'gray.50': '#f7f9fb',
      'red.600': '#c0392b',
      'red.50': '#fdf2f1',
    },
    semantic: {
      primary: 'palette.navy.700',
      // 머리글·제목이 본문보다 진하다. 포털에서 위계를 만드는 것은 크기보다 이 한 단계다.
      primaryStrong: 'palette.navy.900',
      primarySoft: 'palette.navy.50',
      primaryLine: 'palette.navy.100',
      surface: '#ffffff',
      // 카드 머리 띠·구획 머리글·액션 바가 쓰는 회색. `canvas`와 갈라 둔다 —
      // 하나로 합치면 흰 카드 위의 띠와 카드 밖 바탕이 같은 색이 되어 경계가 사라진다.
      surfaceMuted: 'palette.gray.100',
      canvas: 'palette.gray.50',
      border: 'palette.gray.200',
      borderStrong: 'palette.gray.400',
      divider: 'palette.gray.300',
      text: 'palette.navy.900',
      textMuted: 'palette.gray.700',
      textFaint: 'palette.gray.400',
      danger: 'palette.red.600',
      dangerSoft: 'palette.red.50',
    },
    scale: {
      // **`admin`과 같은 4px다.** 밀도가 실제로 비슷하다 — 다른 씨앗을 골라 인상을
      // 만들어 내는 것은 이 테마가 답해야 할 물음(*"밀도가 같은데 무엇이 다른가"*)을
      // 피하는 것이다.
      space: { unit: '4px' },
      // **각지다.** `admin`은 4·6·10, 여기는 2·3·4다. 기관 포털에서 둥근 모서리는
      // 버튼 하나에나 쓰이고 구역에는 안 쓰인다.
      radius: { none: '0', sm: '2px', md: '3px', lg: '4px' },
      // **선언은 하되 컴포넌트가 한 번도 안 쓴다.** 이 테마가 면을 띄우지 않기 때문이다.
      // 지우지 않는 것은 파생 프로젝트 테마(§6.10)가 강조 카드 하나쯤 띄울 때 쓸 자리라서다.
      shadow: {
        sm: '0 1px 0 rgba(11,37,69,.05)',
        md: '0 2px 8px rgba(11,37,69,.08)',
      },
      /**
       * 타이포. 항목 이름이 `Text.variants`와 같다(`variantFrom: 'role'`).
       *
       * **`admin`보다 본문이 한 단 크고 행간이 넓다**(14/1.6 → 15/1.7). 표를 훑는 화면과
       * 글을 읽는 화면의 차이가 여기다. 반대로 제목은 **더 작다**(h1 24 → 26이지만
       * display 32 → 30, h2 20 → 21) — 포털의 페이지 제목은 한 화면에 여럿 놓이므로
       * 랜딩처럼 크면 안 된다.
       *
       * `family`는 항목 하나가 되어 `typography.family.sans` 토큰을 만든다.
       * **`typography: 'family'`로는 쓸 수 없다** — 그 어휘가 펼치는 넷
       * (`fontSize`·`lineHeight`·`fontWeight`·`letterSpacing`) 중 아무것도 아니라서다.
       * 거는 것은 `fontFamily` 어휘다(P4b-1이 열었다).
       */
      typography: {
        family: { sans: '"Portal Sans", "Noto Sans KR", system-ui, sans-serif' },
        display: { fontSize: '30px', lineHeight: 1.25, fontWeight: 700 },
        h1: { fontSize: '26px', lineHeight: 1.3, fontWeight: 700 },
        h2: { fontSize: '21px', lineHeight: 1.35, fontWeight: 700 },
        h3: { fontSize: '18px', lineHeight: 1.4, fontWeight: 700 },
        h4: { fontSize: '16px', lineHeight: 1.45, fontWeight: 700 },
        h5: { fontSize: '15px', lineHeight: 1.5, fontWeight: 600 },
        // 라벨·구획 머리글이 쓴다. 자간을 벌리는 것이 이 테마에서 **크기 대신 쓰는 위계**다.
        h6: { fontSize: '13px', lineHeight: 1.5, fontWeight: 700, letterSpacing: '0.02em' },
        body: { fontSize: '15px', lineHeight: 1.7, fontWeight: 400 },
        caption: { fontSize: '13px', lineHeight: 1.6, fontWeight: 400 },
      },
      motion: { base: '120ms' },
    },
  },

  /**
   * §6.4. **여기 적은 값을 컴포넌트가 가리킬 수 없다**(머리말 참고) — 그래서 폭·여백은
   * 아래 `components`에 리터럴로 한 번 더 적혀 있다. 이 절을 지우지 않는 것은 §6.4가
   * 사이트 골격을 여기 선언하라고 정했고 `:root` 변수로는 정상적으로 나가기 때문이다.
   */
  primitives: {
    // `admin`은 1440이다. 포털은 좌측 분류 + 본문 2단이 들어가도 글줄이 길어지지 않는 폭이다.
    container: { maxWidth: '1280px', gutter: 'space.5' },
    grid: { columns: 12, gap: 'space.5' },
    section: { paddingY: 'space.10', paddingYCompact: 'space.5' },
    breakpoints: { sm: 640, md: 768, lg: 1024 },
  },

  components: {
    // ── 골격 ────────────────────────────────────────────────────────────────
    /**
     * **`admin`이 손대지 않는 컴포넌트다.** 여기에 거는 이유가 둘 있다.
     *
     * 1. **서체를 한 번만 건다.** `font-family`는 상속되므로 문서 뿌리에 걸면 아래가
     *    전부 받는다. (`<button>`만 예외다 — UA 스타일시트가 자기 폰트를 박으므로
     *    `Button.base`에 한 번 더 건다.)
     * 2. **바탕색과 본문 크기의 기준선**을 문서 뿌리가 갖는다. `Section`마다 반복하면
     *    섹션 밖에 놓인 노드가 기준선을 못 받는다.
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
      base: { bg: 'semantic.canvas', paddingY: 'space.10' },
      // **`marginX: 'auto'`가 `admin`에 없다.** 폭을 가둬도 가운데로 안 오면 가둔 것이
      // 보이지 않는다. (`admin`은 `maxWidth`가 무효 선언이라 이 문제를 만난 적이 없다.)
      parts: { inner: { maxWidth: '1280px', marginX: 'auto', paddingX: 'space.5' } },
      variants: {
        // 포털 첫 화면의 상단 띠. 진한 남색 바탕에 흰 글씨가 기관 사이트의 표지다.
        hero: { bg: 'semantic.primaryStrong', fg: 'semantic.surface', paddingY: 'space.14' },
        muted: { bg: 'semantic.surfaceMuted' },
      },
      responsive: {
        sm: { base: { paddingY: 'space.5' }, parts: { inner: { paddingX: 'space.4' } } },
      },
    },
    Flex: { structure: 'default', base: { gap: 'space.4' } },
    // **`gridColumns`를 안 쓴다** — 열 수는 노드가 나르는 값이고(`--wb-node-grid-columns`)
    // 테마가 같은 셀렉터에서 그 프로퍼티를 내면 노드의 값이 침묵으로 사라진다
    // (P4b-2가 전수로 잰 손잡이 부류). 간격만 정한다.
    Grid: { structure: 'default', base: { gap: 'space.5' } },
    /**
     * **`bordered` — `plain`과 DOM이 글자까지 같다**(P4b-2 ③이 전수로 쟀다. 나는 다시 재지
     * 않았고, 갈리는지만 렌더해서 확인했다). 그러므로 갈리는 모습은 **전부 여기 스킨이 만든다.**
     *
     * 만드는 모습: **머리에 회색 띠가 있고 테두리로 닫힌 상자.** `admin`의 `plain`은
     * 상자 전체에 여백을 주고 제목이 본문과 같은 면 위에 뜬다. 포털의 정보 구역은
     * *"제목 줄 / 내용"*으로 갈려 있어야 여러 구역이 한 화면에 놓였을 때 훑을 수 있다.
     *
     * `padding: '0'`을 루트에 두고 여백을 조각으로 내려보내는 것이 그 갈림의 본체다 —
     * 루트에 여백이 있으면 머리 띠가 상자 폭을 다 못 채운다. `overflow: 'hidden'`은
     * 그 띠가 둥근 모서리 밖으로 나가지 않게 한다.
     */
    Card: {
      structure: 'bordered',
      base: {
        bg: 'semantic.surface',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        radius: 'radius.md',
        padding: '0',
        overflow: 'hidden',
      },
      parts: {
        header: {
          bg: 'semantic.surfaceMuted',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          paddingX: 'space.4',
          paddingY: 'space.3',
          display: 'flex',
          align: 'baseline',
          gap: 'space.2',
        },
        title: { typography: 'h4', fg: 'semantic.primaryStrong' },
        subtitle: { typography: 'caption', fg: 'semantic.textMuted' },
        body: { padding: 'space.4', fg: 'semantic.text' },
      },
      variants: {
        featured: {
          borderColor: 'semantic.primary',
          parts: { header: { bg: 'semantic.primarySoft', borderColor: 'semantic.primaryLine' } },
        },
      },
    },
    /**
     * **`enclosed` — `underline`·`pill`과 DOM이 같다**(P4b-2 ③이 쟀다). 박스 탭은
     * 스킨으로만 만들어진다: 탭마다 위·좌·우 테두리와 회색 바탕, 목록 아래 진한 선,
     * 패널을 그 선에 이어 붙이는 좌·우·아래 테두리.
     *
     * **못 하는 것이 하나 있다 — 활성 탭을 갈라 그릴 수 없다.** 구현체는
     * `aria-selected`를 내지만 `Tabs`의 카탈로그에 `states`도 `variants`도 없고 조각도
     * `tab` 하나뿐이라, 테마가 활성 탭만 겨냥할 셀렉터가 **아예 없다.** 박스 탭에서
     * *"활성 탭이 패널과 이어진다"*가 그 구조의 요점인데 그것을 표현할 어휘가 없다.
     * **§16이 받을 입력이고 보고에 적었다.**
     */
    Tabs: {
      structure: 'enclosed',
      base: { margin: 'space.4 0 0' },
      parts: {
        list: {
          display: 'flex',
          gap: 'space.1',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.primary',
          paddingX: '0',
        },
        tab: {
          paddingX: 'space.5',
          paddingY: 'space.3',
          bg: 'semantic.surfaceMuted',
          borderWidth: '1px 1px 0',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: 'radius.md radius.md 0 0',
          typography: 'h5',
          fg: 'semantic.textMuted',
        },
        panel: {
          bg: 'semantic.surface',
          borderWidth: '0 1px 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          padding: 'space.5',
        },
      },
    },

    // ── 데이터 ──────────────────────────────────────────────────────────────
    /**
     * **`stackedList` — 이 테마의 이름표다.** `admin`의 `table`은 행렬을 훑게 하고,
     * 여기는 *"제목 왼쪽 · 날짜 오른쪽"* 한 줄이 하나의 글을 가리킨다.
     *
     * **구조 기본 CSS가 없는 구조다**(구현체 주석: *"`<ul>/<li>`의 기본 흐름이 이미 이
     * 구조"*). 그래서 브라우저 기본값을 걷어내는 것부터 테마의 몫이다 — `<ul>`의
     * `margin`·`padding-inline-start`, 그리고 **불릿.**
     *
     * **불릿을 끌 어휘가 §6.8에 없다**(`listStyle`이 없다). `item`에 `display: 'flex'`를
     * 걸면 `<li>`가 `list-item`이 아니게 되어 마커가 사라지는데, **그것은 부수 효과이지
     * 어휘가 아니다** — 가로 배치를 원하지 않는 목록이었다면 끌 방법이 없었다.
     * `apps/playground/src/debug.css`가 `[data-wb-component="Tree"] { list-style: none }`을
     * 손으로 적어 같은 구멍을 메우고 있다. **§16이 받을 입력이다.**
     */
    List: {
      structure: 'stackedList',
      base: {
        bg: 'semantic.surface',
        fg: 'semantic.text',
        typography: 'body',
        margin: '0',
        paddingX: '0',
        // 목록 위쪽의 굵은 선. 한국 기관 포털 게시판의 표식이다.
        borderWidth: '2px 0 0',
        borderStyle: 'solid',
        borderColor: 'semantic.primaryStrong',
      },
      parts: {
        item: {
          display: 'flex',
          justify: 'space-between',
          align: 'baseline',
          gap: 'space.4',
          paddingX: 'space.2',
          paddingY: 'space.3',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        title: { fg: 'semantic.text', typography: 'body' },
        // 날짜·부서. 오른쪽 끝에 서고 줄바꿈하지 않는다.
        meta: { fg: 'semantic.textFaint', typography: 'caption' },
        pagination: {
          display: 'block',
          textAlign: 'center',
          paddingY: 'space.5',
          fg: 'semantic.textMuted',
          typography: 'caption',
        },
      },
      variants: {
        // 좌측 배너 자리의 짧은 목록. 줄 높이를 줄인다.
        compact: { parts: { item: { paddingY: 'space.2', typography: 'caption' } } },
        featured: { parts: { title: { fg: 'semantic.primary', typography: 'h5' } } },
      },
      states: {
        selected: { parts: { item: { bg: 'semantic.primarySoft' } } },
        disabled: { opacity: 0.5 },
        empty: { parts: { item: { fg: 'semantic.textFaint' } } },
      },
    },
    /**
     * **`accordion` — `indent`와 진짜로 DOM이 다른 구조다.** 깊이를 커스텀 프로퍼티가
     * 아니라 **중첩**이 나른다.
     *
     * **`paddingX`를 `node`에 건다.** 이 어휘는 P4b-2가 센 손잡이 여덟 중 하나이고
     * (`--wb-node-tree-level`을 읽는 `padding-left`를 같은 셀렉터에서 덮는다), 여기가
     * 정확히 그 자리다. **그런데 이 테마에서는 덮을 것이 없다** — 그 규칙은 P4b-2 ③이
     * `:where(indent)`로 좁혔고 이 테마는 `accordion`을 고르므로 규칙이 아예 안 맞는다.
     * 렌더해서 확인한 값은 보고에 적었다.
     */
    Tree: {
      structure: 'accordion',
      base: {
        fg: 'semantic.text',
        typography: 'body',
        bg: 'semantic.surface',
        margin: '0',
        paddingX: '0',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        radius: 'radius.md',
      },
      parts: {
        node: {
          display: 'flex',
          align: 'center',
          wrap: 'wrap',
          gap: 'space.2',
          paddingX: 'space.4',
          paddingY: 'space.3',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        // 펴진 가지. 왼쪽 여백이 깊이를 보이고 바탕이 한 단 가라앉는다.
        //
        // `padding: '0'`·`borderWidth: '0'`은 **되돌리기다** — 조각 이름 `panel`을 `Tabs`도
        // 쓰므로, 탭 안에 트리를 넣으면 `Tabs.parts.panel`의 테두리와 여백이 자손
        // 결합자를 타고 여기까지 온다(실측: `border-width: 0 1px 1px`). 탭 안의 분류
        // 트리는 포털에서 흔한 구성이라 그냥 두면 눈에 보인다.
        panel: {
          display: 'block',
          width: '100%',
          bg: 'semantic.surfaceMuted',
          padding: '0',
          borderWidth: '0',
          margin: 'space.3 0 0',
          paddingX: 'space.4',
        },
        toggle: { fg: 'semantic.primary', typography: 'caption' },
        label: { typography: 'body' },
      },
      states: {
        selected: { parts: { node: { bg: 'semantic.primarySoft', fg: 'semantic.primary' } } },
        disabled: { opacity: 0.5 },
      },
    },
    /**
     * **`definitionList` — 공지 상세의 머리 정보다**(작성일 · 담당 부서 · 조회수).
     * `admin`의 `table`과 재는 것은 같고(`row`·`key`·`value`) 나르는 뜻이 다르다
     * (`<dt>`/`<dd>`). 브라우저가 `<dd>`에 40px 들여쓰기를 주므로 **`marginX: '0'`이
     * 필수다** — 안 지우면 값이 키에서 한참 떨어져 선다.
     */
    KeyValue: {
      structure: 'definitionList',
      base: { typography: 'body', fg: 'semantic.text', margin: '0' },
      parts: {
        row: {
          display: 'flex',
          gap: 'space.4',
          paddingY: 'space.2',
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        key: { fg: 'semantic.textMuted', typography: 'h6', width: '120px', minWidth: '120px' },
        value: { margin: '0', fg: 'semantic.text' },
      },
    },

    // ── 입력 ────────────────────────────────────────────────────────────────
    /**
     * **`collapsible` — 포털의 검색은 접혀 있는 것이 기본이다.** 목록 위에 늘 놓이므로
     * 펼쳐 두면 정작 목록이 접힌 화면 아래로 밀린다. `admin`의 `inline`은 조건이 둘셋인
     * 관리 화면의 형태다.
     *
     * `toggle`은 접혔을 때 화면에 남는 유일한 조각이라 **머리줄처럼** 그린다.
     */
    SearchForm: {
      structure: 'collapsible',
      base: {
        bg: 'semantic.surface',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        radius: 'radius.md',
        overflow: 'hidden',
      },
      parts: {
        toggle: {
          display: 'flex',
          justify: 'space-between',
          align: 'center',
          paddingX: 'space.4',
          paddingY: 'space.3',
          bg: 'semantic.surfaceMuted',
          typography: 'h5',
          fg: 'semantic.primaryStrong',
        },
        fields: { display: 'flex', wrap: 'wrap', gap: 'space.4', padding: 'space.4' },
        actions: {
          display: 'flex',
          justify: 'center',
          gap: 'space.2',
          paddingY: 'space.3',
          borderWidth: '1px 0 0',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          bg: 'semantic.surfaceMuted',
          fg: 'semantic.primary',
          typography: 'h6',
        },
      },
    },
    /**
     * **`sectioned` — 민원·신청 서식이다.** 신청인 / 신청 내용 / 첨부처럼 구획으로 나뉘는
     * 것이 기관 서식의 형태이고, 구획 머리글이 조각으로 나오는 구조는 이것뿐이다.
     * `admin`의 `labelLeft`는 항목이 대여섯인 관리 폼의 형태다.
     *
     * **`label`이 폼 제목이다**(구현체가 `props.title`을 여기 담는다 — 필드의 라벨과 이름이
     * 같다). 조각 규칙이 자손 결합자라 **이 스킨이 안에 든 `Field`·`Button`의 `label`에도
     * 걸린다.** 그래서 아래 `Field.parts.label`·`Button.parts.label`이 여백과 테두리를
     * **되돌린다** — 렌더해서 잰 값과 되돌리기 전의 값은 보고에 적었다(D6의 벽 둘째).
     */
    EntryForm: {
      structure: 'sectioned',
      base: {
        bg: 'semantic.surface',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.border',
        radius: 'radius.md',
        padding: '0',
      },
      parts: {
        label: {
          typography: 'h3',
          fg: 'semantic.primaryStrong',
          paddingX: 'space.5',
          paddingY: 'space.4',
          borderWidth: '0 0 2px',
          borderStyle: 'solid',
          borderColor: 'semantic.primaryStrong',
        },
        section: {
          borderWidth: '0 0 1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
        },
        sectionTitle: {
          typography: 'h6',
          fg: 'semantic.textMuted',
          bg: 'semantic.surfaceMuted',
          paddingX: 'space.5',
          paddingY: 'space.2',
        },
        row: {
          display: 'flex',
          direction: 'column',
          gap: 'space.3',
          paddingX: 'space.5',
          paddingY: 'space.4',
        },
        actions: {
          display: 'flex',
          justify: 'flex-end',
          gap: 'space.2',
          padding: 'space.4',
          bg: 'semantic.surfaceMuted',
        },
      },
    },
    Field: {
      structure: 'outlined',
      base: { display: 'flex', direction: 'column', gap: 'space.1' },
      parts: {
        // `padding`·`borderWidth`는 **되돌리기다** — `EntryForm.parts.label`이 자손 결합자로
        // 여기까지 오기 때문이다. 지우면 폼 안의 필드 라벨이 폼 제목처럼 그려진다(실측).
        label: {
          typography: 'h6',
          fg: 'semantic.textMuted',
          padding: '0',
          borderWidth: '0',
        },
        control: {
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.borderStrong',
          radius: 'radius.sm',
          paddingX: 'space.3',
          paddingY: 'space.2',
          minHeight: '34px',
          bg: 'semantic.surface',
          fg: 'semantic.textFaint',
          typography: 'body',
        },
        help: { typography: 'caption', fg: 'semantic.textMuted' },
      },
      // `variantFrom: 'control'`이 만든 채널. 아홉 중 상자 모양이 실제로 다른 셋만 손댄다.
      variants: {
        textarea: { parts: { control: { minHeight: '88px' } } },
        checkbox: { parts: { control: { width: '16px', minWidth: '16px', minHeight: '16px', paddingX: '0' } } },
        date: { parts: { control: { maxWidth: '200px' } } },
      },
      states: {
        // 기관 서식은 필수 항목을 라벨의 굵기로 알린다.
        required: { parts: { label: { fontWeight: 700, fg: 'semantic.text' } } },
        invalid: {
          parts: { control: { borderColor: 'semantic.danger', bg: 'semantic.dangerSoft' } },
        },
        disabled: { opacity: 0.5, parts: { control: { bg: 'semantic.surfaceMuted' } } },
      },
    },

    // ── 액션 ────────────────────────────────────────────────────────────────
    Button: {
      structure: 'solid',
      base: {
        bg: 'semantic.primary',
        fg: 'semantic.surface',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'semantic.primary',
        radius: 'radius.sm',
        paddingX: 'space.5',
        paddingY: 'space.2',
        minHeight: '34px',
        typography: 'h6',
        textAlign: 'center',
        transition: 'motion.base',
        // **`<button>`은 상속을 안 받는다** — UA 스타일시트가 자기 `font-family`를 박는다.
        // `Page`에 건 서체가 여기까지 오지 않아 한 번 더 건다.
        fontFamily: 'typography.family.sans',
      },
      // `EntryForm.parts.label`이 자손 결합자로 여기까지 온다 — `Field.parts.label`과 같은
      // 되돌리기다. `fg: 'inherit'`은 버튼 배경 위의 글자색을 base에서 받게 한다.
      parts: { label: { padding: '0', borderWidth: '0', typography: 'h6', fg: 'inherit' } },
      variants: {
        secondary: {
          bg: 'semantic.surface',
          fg: 'semantic.primary',
          borderColor: 'semantic.borderStrong',
        },
        danger: { bg: 'semantic.danger', borderColor: 'semantic.danger' },
        ghost: {
          bg: 'semantic.surface',
          fg: 'semantic.textMuted',
          borderColor: 'semantic.surface',
        },
      },
      states: { disabled: { opacity: 0.5 }, loading: { opacity: 0.7 } },
    },
    Link: {
      structure: 'default',
      base: { fg: 'semantic.primary', textDecoration: 'underline' },
      variants: { muted: { fg: 'semantic.textMuted', textDecoration: 'none' } },
      states: { disabled: { opacity: 0.5, textDecoration: 'none' } },
    },

    // ── 문서 ────────────────────────────────────────────────────────────────
    /**
     * **`admin`과 달리 `base`에 `fg`를 안 쓴다 — 그래야 `Section:hero`가 성립한다.**
     *
     * 포털 첫 화면의 상단 띠는 진한 남색 바탕에 흰 글씨다. 그 흰색은 `Section.variants.hero`가
     * 정하고 **상속으로** 안쪽 글자에 닿는데, `Text`가 자기 규칙에서 색을 선언하면 그
     * 상속이 끊긴다 — 요소 자신에 붙은 규칙이 물려받은 값을 이긴다. 그러면 남색 위에
     * 남색 제목이 그려진다(고치기 전 그 값을 쟀다).
     *
     * **테마가 *"이 섹션 안의 Text"*를 겨냥할 방법이 없다.** 조각도 상태도 아니고 §6.5의
     * 어휘에 자손 셀렉터를 쓰는 문법이 없다. 그래서 답은 *"색을 선언하지 않는 것"*이고,
     * 색은 `Page.base`에서 상속된다(`semantic.text`). **§16이 받을 입력이다.**
     *
     * `h6`·`caption`만 색을 갖는다 — 그 둘은 본문보다 흐린 것이 뜻이라 상속을 끊는 값이
     * 맞고, hero 안에 캡션을 두면 흐린 회색이 되는 것은 이 테마가 받아들인 대가다.
     */
    Text: {
      structure: 'default',
      base: { typography: 'body', margin: '0' },
      variants: {
        display: { typography: 'display' },
        h1: { typography: 'h1' },
        h2: { typography: 'h2' },
        h3: { typography: 'h3' },
        h4: { typography: 'h4' },
        h5: { typography: 'h5' },
        h6: { typography: 'h6', fg: 'semantic.textMuted' },
        body: { typography: 'body' },
        caption: { typography: 'caption', fg: 'semantic.textMuted' },
      },
    },
    Media: {
      structure: 'image',
      // `<figure>`의 기본 여백이 `1em 40px`다. 안 지우면 사진이 글보다 안으로 들어가 선다.
      base: { margin: '0' },
      parts: {
        // **`aspectRatio`를 안 쓴다** — 그 어휘는 `Media [frame]`에서 노드의 `ratio` prop을
        // 침묵으로 덮는다(손잡이 여덟 중 하나). 비율은 노드가 정할 값이다.
        frame: {
          bg: 'semantic.surfaceMuted',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'semantic.border',
          radius: 'radius.sm',
          objectFit: 'cover',
        },
        caption: {
          typography: 'caption',
          fg: 'semantic.textMuted',
          marginY: 'space.2',
          textAlign: 'center',
        },
      },
    },
    Divider: {
      structure: 'default',
      base: { borderWidth: '0', bg: 'semantic.divider', margin: 'space.4 0' },
      // `variantFrom: 'direction'`이 만든 채널이다.
      variants: {
        horizontal: { height: '1px', width: '100%' },
        vertical: { width: '1px', minHeight: '100%', margin: '0 space.4' },
      },
    },
    Placeholder: {
      structure: 'default',
      // **`height`를 안 쓴다** — 그 어휘는 노드의 `height` prop을 침묵으로 덮는다.
      base: {
        bg: 'semantic.surfaceMuted',
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: 'semantic.borderStrong',
        radius: 'radius.sm',
        fg: 'semantic.textFaint',
        typography: 'caption',
        display: 'grid',
        align: 'center',
        justify: 'center',
      },
    },
  },

  /**
   * **패턴 하나를 선언한다**(재라 #6 — 워커가 판단한다).
   *
   * 오늘 전개하는 코드가 없고(§6.6의 전개는 P7이다) `checkPatterns`가 검증만 한다.
   * 그래도 하나를 두는 이유: **포털에서 가장 반복되는 페이지가 "검색 + 목록"이고**,
   * P7이 전개를 만들 때 실제 시스템 테마가 소유한 패턴이 하나도 없으면 그 기능은
   * 손으로 만든 표본 위에서 만들어진다. 이 하나가 그 표본이다.
   *
   * **더 두지 않았다.** 전개도 저작 UI도 없는 절에 내용을 쌓으면 다음 사람이 그것이
   * 화면에 닿는다고 믿는다.
   */
  patterns: {
    'content.noticeBoard': {
      name: '공지 목록',
      slots: { title: 'text', keyword: 'text' },
      schema: {
        type: 'Section',
        children: [
          { type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' },
          {
            type: 'SearchForm',
            props: { collapsed: true },
            children: [
              { type: 'Field', props: { label: '검색어', control: 'text' }, slot: 'keyword' },
            ],
          },
          { type: 'List', props: { items: 10, pagination: true } },
        ],
      },
    },
  },

  /**
   * **§6.7의 `assets`. `fonts`가 이제 `@font-face`로 나간다**(P4b-3 ①이 만들었다).
   *
   * **`src`가 `local()`뿐이다 — 네트워크를 쓰지 않는다.** ①이 `local()`과 data URI를 둘 다
   * Chromium으로 재서 둘 다 통과했고(그쪽이 쟀다), `local()`을 고르면 폰트 바이너리를
   * 소스에 심지 않아도 된다. **그 한계도 ①이 쟀다:** 그 이름의 로컬 폰트가 없으면 face가
   * 등록은 되고 로드만 실패한다(`status: 'error'`) — 그때는 아래 `family` 토큰의 뒤쪽
   * 폴백(`"Noto Sans KR", system-ui, sans-serif`)이 그린다.
   *
   * **항목이 둘인데 `family`가 같다.** 굵기마다 다른 파일(=다른 `local()` 이름)을 가리키는
   * 방법이 이것뿐이다 — `ThemeFont`는 `src` 하나에 `weights` 여럿이라, 한 항목으로 적으면
   * 세 굵기가 **같은 얼굴**을 가리켜 굵게가 합성으로 그려진다. 규격의 한계가 아니라
   * 규격이 이렇게 쓰라고 만든 모양이다.
   */
  assets: {
    fonts: [
      {
        family: '"Portal Sans"',
        src: 'local("Pretendard"), local("Noto Sans KR"), local("Apple SD Gothic Neo")',
        weights: [400, 600],
      },
      {
        family: '"Portal Sans"',
        src: 'local("Pretendard SemiBold"), local("Noto Sans KR Bold"), local("Apple SD Gothic Neo Bold")',
        weights: [700],
      },
    ],
    icons: 'lucide',
    // **`placeholder`를 안 쓴다.** D5가 컴파일하지 않는다고 못박았고, 이 테마는
    // `Placeholder`·`Media`의 모습을 `base`·`parts` 스킨으로 전부 표현했다 —
    // 없어서 못 한 것이 없다.
  },
}
