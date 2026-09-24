/**
 * **토큰 GUI**(설계서 「테마 관리」 — *"`tokens`는 전용 GUI(컬러 피커, 스케일 에디터, 타이포 미리보기)로
 * 편집한다"*).
 *
 * ---
 *
 * # 이 화면이 무엇을 보이는가 — 설계서 「tokens — 3단 분리」
 *
 * `palette`(원시) → `semantic`(의미) → `scale`(치수·타이포·모션). **3단은 UI에서 보여야
 * 성립한다.** 그 절이 층을 둔 이유를 스스로 적었다 — *"다크 테마와 브랜드 교체 때문이다.
 * `semantic`만 갈아끼우면 전체가 바뀐다."* 그 성질은 **스타일이 `palette`를 직접 가리키지
 * 못할 때만** 유지되고(`resolve/style.ts`의 `STYLE_FORBIDDEN_NAMESPACES`), 그 규칙은
 * 검증기 안에만 있다. 그래서 이 화면이 셋으로 보인다:
 *
 * 1. **층마다 무엇을 값으로 받는지**를 머리에 적는다(`palette`=원시값만 /
 *    `semantic`=`palette`·`semantic` 참조 또는 리터럴 / `scale`=리터럴만).
 * 2. **`palette` 항목마다 그것을 가리키는 `semantic`의 수**를 센다. **0이면 그 색은
 *    어느 스타일에서도 쓸 수 없다** — 규칙을 문장으로 적는 것보다 이쪽이 규칙을 *보인다*.
 * 3. **`semantic`의 이름공간 드롭다운이 실제로 둘뿐이다.** 목록이 짧다는 사실 자체가 3단이다.
 *
 * ---
 *
 * # **텍스트 입력이 진실이다. 컬러 피커는 파생이다**
 *
 * *"컬러 피커와 텍스트 입력 중 어느 쪽이 진실인가"*의 답이다.
 *
 * **`<input type="color">`는 값 공간이 문서보다 좁다 — 좁은 쪽을 진실로 두면 데이터가 죽는다.**
 * jsdom 25에서 잰 값이다(브라우저에서는 재지 않았다 — 다만 이것은 jsdom의 버릇이 아니라
 * HTML의 value sanitization이다):
 *
 * | # | 넣은 값 | `input.value`로 다시 읽은 값 |
 * |---|---|---|
 * | 1 | `palette.blue.600` (참조) | **`#000000`** |
 * | 2 | `rgba(0,0,0,.5)` | **`#000000`** |
 * | 3 | `#abc` (3자리 — 유효한 CSS다) | **`#000000`** |
 * | 4 | `rebeccapurple` | **`#000000`** |
 * | 5 | `#AABBCC` | **`#aabbcc`** — 대소문자가 조용히 바뀐다 |
 * | 6 | 같은 값을 `type="text"`에 | `palette.blue.600` 그대로 |
 *
 * **1이 3단을 무너뜨리는 자리다.** 피커가 진실이면 `semantic.primary:
 * "palette.blue.600"`인 테마를 여는 것만으로 화면이 검정을 보이고, 한 번 만지면 참조가
 * `#000000`으로 바뀐다. 2·3·4는 **적법한 CSS 색**이 같은 길로 죽는 것이고, 5는 아무도 안
 * 고쳤는데 저장 버튼이 켜지는 자리다.
 *
 * **그래서 이렇게 가른다:**
 *
 * - **텍스트 입력이 값을 든다.** 문서에 적힌 그대로이고, 쓰는 것도 이쪽 하나다.
 * - **컬러 피커는 값이 `#rrggbb`일 때만 나온다.** 담을 수 있는 값일 때만 나타나므로
 *   *"피커에 보이는 색"*과 *"문서의 값"*이 갈릴 수 없다.
 * - **색 미리보기(swatch)는 늘 나온다.** 그것은 입력이 아니라 **엔진이 해석한 결과**다 —
 *   참조는 풀린 값으로, `rgba()`는 그대로 그려진다.
 *
 * > **이 화면 전체를 지배하는 규칙이 그것이다: 입력은 문서의 값 그대로(진실), 미리보기는
 * > 엔진이 해석한 것(파생). 파생이 진실을 덮어쓰지 않는다.** 타이포 미리보기와 스케일
 * > 파생 목록도 같은 선 위에 있다 — 전부 `resolveTokens`가 낸 표에서 읽는다.
 *
 * ---
 *
 * # 이름공간을 손으로 적되 엔진에서 다시 잰다
 *
 * 이름공간 목록은 자리마다 다르다 — **스타일 값**(토큰 7 + primitives 3 = 열) · **`primitives` 값**
 * (토큰 7) · `breakpoints`(없다). **이 화면은 그 셋 중 어느 자리도 아니다** —
 * `tokens` 층의 값을 편집한다. 그 층의 어휘는 이렇다
 * (`resolveTokens`를 직접 돌려 잰 값. 절차와 값은 `test/theme/token-editor.test.tsx`가 다시 잰다):
 *
 * | 자리 | 고를 수 있는 이름공간 | 수 |
 * |---|---|---|
 * | `semantic` 값 | `palette` · `semantic` | **둘** |
 * | `palette` 값 | **없다** — 참조를 쓰면 `bad-token-value`(error) | 0 |
 * | `scale.*` 값 | **없다** — 같은 코드 | 0 |
 *
 * **`SEMANTIC_NAMESPACES`를 손으로 적되 케이스가 엔진에서 다시 잰다.** `TOKEN_NAMESPACES`를
 * 그대로 쓰면 **일곱을 제안해 다섯이 조용히 리터럴이 되고**(아래 절), `themes`는 그
 * 목록을 상수로 내보내지 않는다. 그래서 목록은
 * 여기 있고 **엔진과 갈리면 케이스가 죽는다.**
 *
 * ---
 *
 * # **`tokens` 층에는 `suspicious-literal`이 없다** — 그래서 화면이 말한다
 *
 * `semantic.primary`에 `"spce.4"`(오타)를 넣으면:
 *
 * ```
 * resolveTokens({ semantic: { primary: 'spce.4' } })
 *   → issues: []            ← 아무 말도 안 한다
 *   → table:  semantic.primary = "spce.4"   ← 리터럴로 실린다
 * ```
 *
 * `palette`·`scale.radius`에 같은 값을 넣어도 **이슈 0건**이다. `suspicious-literal`이 나는
 * 것은 **primitives 층**까지이고, 토큰 층은 조용하다 — `REFERENCE_SHAPED`가
 * `resolve/style.ts`에만 있기 때문이다.
 *
 * **엔진이 말하지 않으므로 화면이 그 자리에서 말한다:**
 * 값이 참조처럼 생겼는데 이름공간이 목록 밖이면 *"리터럴로 실립니다"*라고 적는다.
 * **이것은 `ThemeIssue`가 아니다** — 엔진이 이슈를 안 내므로 이슈 패널과 겹칠 것이 없고,
 * 이 파일은 `severity`를 읽지도 `partitionIssues`를 부르지도 않는다.
 * **엔진이 토큰 층에서도 이 판정을 내게 되면 이 경고는 이슈 패널과 두 벌이 된다** — 그때
 * 이 자리를 걷는다.
 *
 * ---
 *
 * # *"같은 값을 연결할까요?"* 제안은 이 화면에서 성립하지 않는다 — 재료를 재서 판정했다
 *
 * 제안의 모양: *"이 값이 `section.paddingY`와 같습니다. 연결할까요?"*
 *
 * 1. **그 재료가 이 화면에 없다.** 5/5로 겹치는 둘은 `components.Section.base.paddingY`
 *    ↔ `primitives.section.paddingY`다. 이 화면은 `tokens`를 편집하고,
 *    `components`·`primitives`는 **`<textarea>`**(`theme/json-editor.tsx`)로 편집한다 — **값 하나를 짚을
 *    UI 자체가 없다.** 만들려면 컴포넌트 스타일 GUI를 먼저 만들어야 한다.
 * 2. **이 화면에 있는 유일한 유사 재료는 0/5다.** 같은 모양의 제안을 토큰 층에서 세우면
 *    *"이 `semantic` 리터럴이 `palette.<x>`와 같은 값입니다"*가 된다. **시스템 테마 다섯을
 *    훑어 잰 값: 겹치는 항목 0건**(semantic 리터럴은 다섯 테마 합쳐 다섯 개뿐이고
 *    그중 어느 것도 palette 값과 같지 않다).
 *
 * **그래서 그 제안은 이 화면에서 성립하지 않는다.** 다만 **그 제안을 거는 자리 자체는
 * 있다**(아래 `paletteMatch`) — 조건이 맞을 때만 나타나므로 시스템 테마에서는 **한 번도
 * 안 나타난다.** 값이 0건이라는 사실과 함께 남긴다.
 *
 * ---
 *
 * # 계약
 *
 * - **초안은 `useThemeDraftStore()`에서 꺼낸다.** props로 받지 않는다.
 * - **쓰기는 `store.putSection('tokens', …)` 하나다.** 이 파일에 다른 쓰기 문이 없다.
 * - **서버를 부르지 않는다**(`api.*`가 없다). **`.role`을 읽지 않는다**(`locked` 하나만 본다).
 * - **이슈를 그리지 않는다** — `theme/theme-issues.tsx`가 한 곳에서 그린다.
 *
 * > **입력의 접근성 이름이 이슈의 `path`와 글자까지 같다**(`tokens.palette.blue.600`).
 * > 이슈에서 그 자리로 가는 배선(`theme-issues.tsx` — 지금은 글자로만 짚는다)에 **필요한
 * > 것은 id 체계가 아니라 이 일치 하나다.** `onSelectPath`는 없다 — 그것은
 * > `theme-issues.tsx`의 계약이다.
 */
import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import {
  SPACE_MAX,
  isTokenReference,
  mergeTheme,
  resolveTokens,
  type Theme,
  type ThemeTokens,
  type TokenTable,
} from '@wirebound/themes'
import { useThemeDraft, useThemeDraftStore } from '../store/use-theme-draft'

/**
 * `semantic` 값이 가리킬 수 있는 이름공간. **머리말의 표가 이 상수의 근거이고,
 * `test/theme/token-editor.test.tsx`가 `resolveTokens`를 돌려 이것을 다시 잰다** —
 * 엔진이 하나라도 더 받거나 덜 받으면 그 케이스가 죽는다.
 *
 * `TOKEN_NAMESPACES`(일곱)를 쓰지 않는 이유가 그 케이스의 관측값이다: 나머지 다섯은
 * 거부되고(`bad-token-value`), `container`·`grid`·`section`은 **거부조차 되지 않고 리터럴로
 * 실린다.** 일곱을 제안하는 드롭다운은 사용자를 그 침묵으로 밀어 넣는다.
 */
export const SEMANTIC_NAMESPACES = ['palette', 'semantic'] as const

/**
 * `typography: "h1"` 참조가 펼치는 키(`resolve/style.ts`의 `TYPOGRAPHY_KEYS`). **그 상수는
 * 내보내지지 않으므로 여기 옮겨 적고 케이스가 `styleDeclarations`로 다시 잰다.**
 *
 * 이 목록이 있어야 *"이 타이포 항목을 `typography:`로 가리킬 수 있는가"*를 화면이 말할 수
 * 있다 — 「tokens — 3단 분리」의 `typography.family`는 이 넷을 하나도 갖지 않아 **가리키면
 * `unknown-token`이 난다**(`resolve/style.ts`의 머리말이 그렇게 적었고 케이스가 다시 잰다).
 */
export const TYPOGRAPHY_TEXT_KEYS = ['fontSize', 'lineHeight', 'fontWeight', 'letterSpacing'] as const

/** `<input type="color">`가 그대로 담을 수 있는 값. 머리말의 표 3번이 3자리를 뺀 근거다. */
const HEX6 = /^#[0-9a-fA-F]{6}$/

/**
 * 값이 **참조처럼 생겼는가**. 이름공간을 보지 않는다 — `isTokenReference`가 목록 안을
 * 보므로, 그 둘의 차이가 곧 *"참조인 줄 알았는데 리터럴로 실리는 값"*이다.
 *
 * `resolve/style.ts`의 `REFERENCE_SHAPED`보다 **좁게** 둔다: 이름 쪽을 토큰 이름 문자
 * 집합으로 제한해 `rgba(0,0,0,.5)`·`0 1px 2px rgba(...)`·`1.5`가 걸리지 않게 한다.
 * 넓히면 멀쩡한 CSS 리터럴마다 경고가 붙어 소음이 된다(그 함정을 그쪽 머리말이 적어 두었다).
 */
const REFERENCE_SHAPED = /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z0-9_.-]+$/

/** 층 셋의 머리말. **무엇을 값으로 받는가**가 3단의 전부다. */
const LAYER_RULES = {
  palette: '원시값만 받습니다 — 참조를 쓰면 오류입니다. 스타일은 palette를 직접 가리킬 수 없고 semantic을 거칩니다.',
  semantic:
    'palette·semantic 참조 또는 리터럴을 받습니다. 스타일이 색을 가리키는 자리는 여기 하나입니다 — semantic만 갈아 끼우면 전체가 바뀝니다.',
  scale: '리터럴만 받습니다 — 참조를 쓰면 오류입니다.',
} as const

export function TokenEditor(props: { locked: boolean }): ReactElement | null {
  const store = useThemeDraftStore()
  const draft = useThemeDraft(store, (s) => s.draft)
  const base = useThemeDraft(store, (s) => s.base)

  // **훅을 다 부른 뒤에 빠져나간다.** 초안이 없는 것은 조회 중이거나 라우트가 막 바뀐
  // 순간이고, 그때 이 화면이 그릴 것이 없다(`ThemeNameField`와 같은 자리다).
  if (draft === null) return null

  const own = draft.tokens ?? {}
  /**
   * **화면이 보이는 것은 병합 결과다 — 쓰는 것은 이 테마의 절이다.**
   *
   * 설계서 「상속과 병합」이 *"대부분의 프로젝트는 시스템 테마를 상속해 `semantic` 색 몇 개와
   * `typography.family`만 덮어쓴다"*고 적었으므로 **파생이 흔한 경우다.** 자기 절만 그리면
   * 그런 테마의 편집기는 줄 몇 개짜리 빈 화면이 되고, 물려받은 팔레트가 보이지 않아
   * *"이 테마가 무엇을 입고 있는지"*를 이 화면에서 알 수 없다.
   */
  const effective = effectiveTokens(draft, base)
  /**
   * **파생과 미리보기는 전부 이 표에서 읽는다.** 스케일 파생(`space.1`…)을 화면이 다시
   * 계산하면 엔진과 갈릴 자리가 생긴다 — `space.unit`의 반올림 규칙(`round`의 유효숫자
   * 12자리)까지 베껴야 한다. **보여야 하는 것은 *엔진이 만든 값*이지 같은 규칙의 사본이 아니다.**
   */
  const { table } = resolveTokens(effective)

  const write = (next: ThemeTokens): void => {
    // **절이 통째로 비면 절을 지운다**(`putSection`의 계약 — `undefined`는 삭제다).
    // 저장이 통째 교체라 빈 `{}`가 서버까지 간다.
    store.putSection('tokens', isEmptyTokens(next) ? undefined : next)
  }

  const palette = entriesOf(effective.palette)
  const semantic = entriesOf(effective.semantic)

  return (
    <div className="wb-shell-token-editor">
      <p className="wb-shell-token-intro">
        토큰은 3단입니다 — <b>palette</b>(원시) → <b>semantic</b>(의미) →{' '}
        <b>scale</b>(치수·타이포·모션). 아래 값은 이 테마가 실제로 쓰는 것이고,{' '}
        {base === null ? '전부 이 테마가 정한 것입니다.' : '상속받은 것과 이 테마가 덮어쓴 것이 섞여 있습니다.'}
      </p>

      <TokenLayer title="palette — 원시값" note={LAYER_RULES.palette}>
        {palette.length === 0 && <EmptyNote what="palette" />}
        {palette.map(([name, value]) => (
          <ValueRow
            key={name}
            path={`tokens.palette.${name}`}
            name={name}
            value={value}
            resolved={table.get(`palette.${name}`)}
            color
            locked={props.locked}
            overridden={own.palette?.[name] !== undefined}
            inheritable={base !== null}
            // **이 색을 가리키는 semantic의 수.** 0이면 그 색은 어느 스타일에서도
            // 쓸 수 없다 — 스타일이 palette를 직접 가리킬 수 없기 때문이다(「tokens — 3단 분리」).
            meta={referrerNote(semantic, `palette.${name}`)}
            onChange={(next) => write(putRecord(own, 'palette', name, next))}
            onReset={() => write(putRecord(own, 'palette', name, undefined))}
          />
        ))}
        <AddRow
          what="palette"
          locked={props.locked}
          placeholder="blue.600"
          initial="#2563eb"
          onAdd={(name, value) => write(putRecord(own, 'palette', name, value))}
        />
      </TokenLayer>

      <TokenLayer title="semantic — 의미" note={LAYER_RULES.semantic}>
        {semantic.length === 0 && <EmptyNote what="semantic" />}
        {semantic.map(([name, value]) => (
          <ValueRow
            key={name}
            path={`tokens.semantic.${name}`}
            name={name}
            value={value}
            resolved={table.get(`semantic.${name}`)}
            color
            locked={props.locked}
            overridden={own.semantic?.[name] !== undefined}
            inheritable={base !== null}
            // **이름공간 드롭다운이 붙는 유일한 자리다** — 머리말의 표 참고.
            reference={{ targets: referenceTargets(effective, name) }}
            // *"같은 값을 연결할까요?"* 제안의 자리. 시스템 테마에서는 0건이다(머리말).
            promote={paletteMatch(effective, value)}
            onChange={(next) => write(putRecord(own, 'semantic', name, next))}
            onReset={() => write(putRecord(own, 'semantic', name, undefined))}
          />
        ))}
        <AddRow
          what="semantic"
          locked={props.locked}
          placeholder="primary"
          initial={palette.length > 0 ? `palette.${palette[0]![0]}` : '#2563eb'}
          onAdd={(name, value) => write(putRecord(own, 'semantic', name, value))}
        />
      </TokenLayer>

      <TokenLayer title="scale — 치수·타이포·모션" note={LAYER_RULES.scale}>
        <SpaceScale
          unit={effective.scale?.space?.unit}
          table={table}
          locked={props.locked}
          overridden={own.scale?.space !== undefined}
          inheritable={base !== null}
          onChange={(next) => write(putSpaceUnit(own, next))}
        />

        {(['radius', 'shadow', 'motion'] as const).map((group) => (
          <ScaleGroup
            key={group}
            group={group}
            entries={entriesOf(effective.scale?.[group])}
            ownEntries={own.scale?.[group]}
            table={table}
            locked={props.locked}
            inheritable={base !== null}
            onChange={(name, next) => write(putScaleRecord(own, group, name, next))}
          />
        ))}

        <Typography
          entries={effective.scale?.typography ?? {}}
          own={own.scale?.typography}
          table={table}
          locked={props.locked}
          inheritable={base !== null}
          onChange={(entry, key, next) => write(putTypography(own, entry, key, next))}
        />
      </TokenLayer>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   층 하나
   ──────────────────────────────────────────────────────────────────────────── */

function TokenLayer(props: { title: string; note: string; children: ReactNode }): ReactElement {
  return (
    <section className="wb-shell-token-layer" aria-label={props.title}>
      <h3 className="wb-shell-token-layer-title">{props.title}</h3>
      <p className="wb-shell-token-note">{props.note}</p>
      <div className="wb-shell-token-rows">{props.children}</div>
    </section>
  )
}

function EmptyNote(props: { what: string }): ReactElement {
  return <p className="wb-shell-token-empty">{props.what} 토큰이 없습니다.</p>
}

/* ────────────────────────────────────────────────────────────────────────────
   값 한 줄 — «텍스트 입력이 진실, 컬러 피커는 파생»(머리말)이 이 컴포넌트다
   ──────────────────────────────────────────────────────────────────────────── */

interface ReferenceChoice {
  /** 이름공간 → 그 안에서 고를 수 있는 이름들. **순서가 드롭다운의 순서다.** */
  targets: ReadonlyMap<string, readonly string[]>
}

function ValueRow(props: {
  path: string
  name: string
  value: string
  /** 엔진이 해석한 값. 참조면 풀린 리터럴이고, 못 풀었으면 `undefined`다. */
  resolved: string | undefined
  color?: boolean
  locked: boolean
  /** 이 테마가 직접 정한 값인가(파생에서 덮어쓴 것인가). */
  overridden: boolean
  /** 상속이 있는 문서인가. 없으면 *"되돌리기"*는 곧 *"지우기"*라 문안이 달라진다. */
  inheritable: boolean
  meta?: string
  reference?: ReferenceChoice
  promote?: string
  onChange: (value: string) => void
  onReset: () => void
}): ReactElement {
  const { value, resolved, promote } = props
  const reference = isTokenReference(value)
  // **참조처럼 생겼는데 참조가 아니다.** 엔진이 이 층에서는 아무 말도 안 하므로(머리말)
  // 화면이 말한다. `severity`를 읽지 않는다 — 이것은 `ThemeIssue`가 아니다.
  const looksLikeReference = !reference && REFERENCE_SHAPED.test(value)
  const swatch = resolved ?? value

  return (
    <div className="wb-shell-token-row">
      <span className="wb-shell-token-name">{props.name}</span>

      {props.color === true && (
        // **미리보기는 파생이다** — 참조는 풀린 값으로 그린다. 입력이 아니므로 값을 바꾸지 않는다.
        <span className="wb-shell-token-swatch" style={{ background: swatch }} aria-hidden="true" />
      )}

      {/* **진실.** 문서의 값 그대로이고 쓰는 문이 이것 하나다. */}
      <input
        className="wb-shell-token-input"
        type="text"
        aria-label={props.path}
        value={value}
        disabled={props.locked}
        onChange={(event) => props.onChange(event.target.value)}
      />

      {/* **컬러 피커는 담을 수 있을 때만 나온다**(머리말의 표). 참조·`rgba()`·3자리 hex에는
          나오지 않으므로, 보이는 색과 문서의 값이 갈릴 수 없다. */}
      {props.color === true && HEX6.test(value) && (
        <input
          className="wb-shell-token-picker"
          type="color"
          aria-label={`${props.path} 색 고르기`}
          value={value.toLowerCase()}
          disabled={props.locked}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}

      <span className="wb-shell-token-kind">
        {reference ? '참조' : '리터럴'}
        {props.overridden && props.inheritable ? ' · 이 테마' : ''}
        {!props.overridden && props.inheritable ? ' · 상속' : ''}
      </span>

      {props.meta !== undefined && <span className="wb-shell-token-meta">{props.meta}</span>}

      {looksLikeReference && (
        <span className="wb-shell-token-warn">
          참조처럼 보이지만 리터럴로 실립니다 — 참조로 쓰려면 {SEMANTIC_NAMESPACES.join('·')}만
          가리킬 수 있습니다.
        </span>
      )}

      {props.reference !== undefined && !props.locked && (
        <ReferencePicker
          path={props.path}
          value={value}
          targets={props.reference.targets}
          onPick={props.onChange}
        />
      )}

      {promote !== undefined && !props.locked && (
        <button type="button" className="wb-shell-token-mini" onClick={() => props.onChange(promote)}>
          {promote}와 같은 값입니다 — 참조로 바꾸기
        </button>
      )}

      {props.overridden && !props.locked && (
        <button type="button" className="wb-shell-token-mini" onClick={props.onReset}>
          {props.inheritable ? '상속값으로' : '지우기'}
        </button>
      )}
    </div>
  )
}

/**
 * **이름공간 드롭다운.** 하드코딩이 아니라 `SEMANTIC_NAMESPACES`에서 나오고, 그 상수는
 * 케이스가 엔진에서 다시 잰다(머리말).
 *
 * 이름공간과 이름을 **두 드롭다운으로 가른 것이 판정이다.** 하나로 합치면
 * (`palette.blue.600` 한 목록) 고르기는 편하지만 **고를 수 있는 이름공간이 둘뿐이라는
 * 사실이 화면에서 사라진다** — 그 짧은 목록이 3단을 보이는 자리다.
 *
 * `semantic`이 자기 자신을 가리키면 순환이다. 목록에서 **자기 이름만** 뺀다 — 두 칸짜리
 * 순환(`a → b → a`)까지 여기서 막지 않는 것은 그것이 `circular-token`으로 이슈 패널에
 * 나오고, 화면이 그 판정을 두 번 하면 규칙이 둘이 되기 때문이다.
 */
function ReferencePicker(props: {
  path: string
  value: string
  targets: ReadonlyMap<string, readonly string[]>
  onPick: (value: string) => void
}): ReactElement {
  const current = isTokenReference(props.value) ? props.value : ''
  const namespace = current === '' ? '' : current.slice(0, current.indexOf('.'))
  const names = props.targets.get(namespace) ?? []

  return (
    <span className="wb-shell-token-ref">
      <select
        className="wb-shell-token-drop"
        aria-label={`${props.path} 이름공간`}
        value={namespace}
        onChange={(event) => {
          const picked = event.target.value
          if (picked === '') return
          const first = props.targets.get(picked)?.[0]
          if (first !== undefined) props.onPick(`${picked}.${first}`)
        }}
      >
        <option value="">리터럴</option>
        {[...props.targets.keys()].map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
      {namespace !== '' && (
        <select
          className="wb-shell-token-drop"
          aria-label={`${props.path} 토큰`}
          value={current}
          onChange={(event) => props.onPick(event.target.value)}
        >
          {names.map((name) => (
            <option key={name} value={`${namespace}.${name}`}>
              {name}
            </option>
          ))}
        </select>
      )}
    </span>
  )
}

/** 새 토큰 하나. 이름과 값을 함께 받는다 — 이름만 만들면 빈 값이 문서에 남는다. */
function AddRow(props: {
  what: string
  locked: boolean
  placeholder: string
  initial: string
  onAdd: (name: string, value: string) => void
}): ReactElement | null {
  const [name, setName] = useState('')
  if (props.locked) return null

  return (
    <div className="wb-shell-token-add">
      <input
        className="wb-shell-token-input"
        type="text"
        aria-label={`${props.what} 토큰 추가`}
        placeholder={props.placeholder}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="button"
        className="wb-shell-token-mini"
        // **층마다 이름이 갈려야 한다** — 층이 넷이라 `추가`만으로는 어느 것인지 알 수 없다.
        // 보이는 글자를 접근성 이름이 품고 있으므로(`… 추가`) 그 규칙도 지킨다.
        aria-label={`${props.what} 추가`}
        disabled={name === ''}
        onClick={() => {
          props.onAdd(name, props.initial)
          setName('')
        }}
      >
        추가
      </button>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   스케일 에디터 — 그 파생을 보여 주는 것이 이 에디터의 쓸모다
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * `space.unit` 하나가 `space.1`~`space.24`를 낳는다(「tokens — 3단 분리」). **그 파생을 보인다.**
 *
 * **값을 여기서 곱하지 않는다** — `resolveTokens`가 낸 표에서 읽는다. 곱셈은 같아 보여도
 * 반올림(`round`의 유효숫자 12자리)과 단위 철자를 잇는 규칙이 엔진에 있고, 베끼면 그 둘이
 * 갈리는 날 화면만 거짓말을 한다.
 *
 * **막대의 길이가 그 값 자체다.** 수만 스물넷 늘어놓으면 *"배수로 파생된다"*가 안 보인다.
 *
 * 단위가 규격 밖이면(`4`·`0px`) 표에 `space.*`가 하나도 없다 — 그때 이 자리는 *"파생되지
 * 않았습니다"*라고만 말한다. **왜인지는 이슈 패널이 말한다**(`bad-token-value`). 화면이
 * 그 판정을 다시 하지 않는 것이 공유 제약 8이다.
 */
function SpaceScale(props: {
  unit: string | undefined
  table: TokenTable
  locked: boolean
  overridden: boolean
  inheritable: boolean
  onChange: (unit: string | undefined) => void
}): ReactElement {
  const steps: [number, string][] = []
  for (let step = 1; step <= SPACE_MAX; step += 1) {
    const value = props.table.get(`space.${step}`)
    if (value !== undefined) steps.push([step, value])
  }

  return (
    <div className="wb-shell-token-group" aria-label="space">
      <h4 className="wb-shell-token-group-title">space</h4>
      <div className="wb-shell-token-row">
        <span className="wb-shell-token-name">unit</span>
        <input
          className="wb-shell-token-input"
          type="text"
          aria-label="tokens.scale.space.unit"
          value={props.unit ?? ''}
          disabled={props.locked}
          onChange={(event) =>
            props.onChange(event.target.value === '' ? undefined : event.target.value)
          }
        />
        <span className="wb-shell-token-kind">
          {props.overridden && props.inheritable ? '이 테마' : props.inheritable ? '상속' : '리터럴'}
        </span>
      </div>

      {steps.length === 0 ? (
        <p className="wb-shell-token-empty">
          {props.unit === undefined || props.unit === ''
            ? 'unit이 없어 space.1~space.24가 없습니다.'
            : '파생되지 않았습니다 — 이슈 목록을 보세요.'}
        </p>
      ) : (
        <ol className="wb-shell-token-derived" aria-label={`space.1~space.${SPACE_MAX}`}>
          {steps.map(([step, value]) => (
            <li key={step} className="wb-shell-token-derived-row">
              <span className="wb-shell-token-name">space.{step}</span>
              {/* 막대의 폭이 곧 그 값이다 — 파생을 눈으로 보이는 자리. */}
              <span className="wb-shell-token-bar" style={{ width: value }} aria-hidden="true" />
              <span className="wb-shell-token-meta">{value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** `radius`·`shadow`·`motion`. 값마다 **그 값으로 그린 상자**를 곁들인다. */
function ScaleGroup(props: {
  group: 'radius' | 'shadow' | 'motion'
  entries: [string, string][]
  ownEntries: Record<string, string> | undefined
  table: TokenTable
  locked: boolean
  inheritable: boolean
  onChange: (name: string, value: string | undefined) => void
}): ReactElement {
  return (
    <div className="wb-shell-token-group" aria-label={props.group}>
      <h4 className="wb-shell-token-group-title">{props.group}</h4>
      {props.entries.length === 0 && <EmptyNote what={props.group} />}
      {props.entries.map(([name, value]) => {
        const resolved = props.table.get(`${props.group}.${name}`)
        return (
          <div key={name} className="wb-shell-token-row">
            <span className="wb-shell-token-name">{name}</span>
            {props.group !== 'motion' && (
              <span
                className="wb-shell-token-preview"
                style={previewStyle(props.group, resolved ?? value)}
                aria-hidden="true"
              />
            )}
            <input
              className="wb-shell-token-input"
              type="text"
              aria-label={`tokens.scale.${props.group}.${name}`}
              value={value}
              disabled={props.locked}
              onChange={(event) => props.onChange(name, event.target.value)}
            />
            <span className="wb-shell-token-kind">
              {props.ownEntries?.[name] !== undefined && props.inheritable
                ? '이 테마'
                : props.inheritable
                  ? '상속'
                  : '리터럴'}
            </span>
            {props.ownEntries?.[name] !== undefined && !props.locked && (
              <button
                type="button"
                className="wb-shell-token-mini"
                onClick={() => props.onChange(name, undefined)}
              >
                {props.inheritable ? '상속값으로' : '지우기'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function previewStyle(group: 'radius' | 'shadow' | 'motion', value: string): CSSProperties {
  if (group === 'radius') return { borderRadius: value }
  return { boxShadow: value }
}

/* ────────────────────────────────────────────────────────────────────────────
   타이포 미리보기 — 항목마다 실제 글자로
   ──────────────────────────────────────────────────────────────────────────── */

/** 미리보기에 쓰는 문장. 한글·라틴·수를 함께 둔다 — 세 벌의 자형이 한 줄에서 갈린다. */
const SAMPLE = '다람쥐 헌 쳇바퀴 Handgloves 0123'

/**
 * `scale.typography`의 항목마다 **실제 글자로** 보인다.
 *
 * **항목의 모양이 두 가지다**(「tokens — 3단 분리」의 예시가 그렇다):
 *
 * | 항목 | 키 | `typography: "이름"`으로 가리킬 수 있나 |
 * |---|---|---|
 * | `h1`·`body`… | `fontSize`·`lineHeight`·`fontWeight`·`letterSpacing` | **된다** |
 * | `family` | `sans`·`serif`·`mono` | **안 된다** — `unknown-token`이 난다 |
 *
 * **그 둘을 무엇으로 가르는가**가 이 컴포넌트의 유일한 판단이다. `TYPOGRAPHY_TEXT_KEYS`를
 * 하나라도 가지면 글자 스타일 항목이고, 아니면 그 키 각각이 **자기 이름의 토큰**이다
 * (`typography.family.sans` → `--wb-typography-family-sans`). 그래서 후자는 키마다 한 줄씩
 * 그 폰트로 그린다.
 *
 * **그 사실을 화면이 말한다.** 폰트 토큰을 만들어 놓고 `typography: "family"`로 걸려다
 * 실패하는 것은 실재하는 함정이고(`resolve/style.ts`가 *"폰트 토큰은 이미 만들어지는데
 * 그것을 가리킬 프로퍼티가 없던 것"*이라고 적었다), 그 답은 `fontFamily` 어휘로
 * **토큰을 직접** 가리키는 것이다.
 */
function Typography(props: {
  entries: Record<string, Record<string, string | number>>
  own: Record<string, Record<string, string | number>> | undefined
  table: TokenTable
  locked: boolean
  inheritable: boolean
  onChange: (entry: string, key: string, value: string | number | undefined) => void
}): ReactElement {
  const names = Object.keys(props.entries)

  return (
    <div className="wb-shell-token-group" aria-label="typography">
      <h4 className="wb-shell-token-group-title">typography</h4>
      {names.length === 0 && <EmptyNote what="typography" />}
      {names.map((name) => {
        const entry = props.entries[name] ?? {}
        const textual = TYPOGRAPHY_TEXT_KEYS.some((key) => entry[key] !== undefined)

        return (
          <div key={name} className="wb-shell-token-entry" aria-label={`typography.${name}`}>
            <p className="wb-shell-token-group-title">
              {name}
              <span className="wb-shell-token-meta">
                {textual
                  ? `typography: "${name}"으로 가리킬 수 있습니다`
                  : `typography: "${name}"으로는 가리킬 수 없습니다 — fontFamily로 토큰을 직접 가리키세요`}
              </span>
            </p>

            {/* **미리보기는 표에서 읽는다**(파생). 입력은 아래에서 문서의 값 그대로를 든다. */}
            {textual ? (
              <p className="wb-shell-token-sample" style={sampleStyle(props.table, name)}>
                {SAMPLE}
              </p>
            ) : (
              Object.keys(entry).map((key) => (
                <p
                  key={key}
                  className="wb-shell-token-sample"
                  style={{ fontFamily: String(props.table.get(`typography.${name}.${key}`) ?? '') }}
                >
                  {key} — {SAMPLE}
                </p>
              ))
            )}

            {Object.entries(entry).map(([key, value]) => (
              <div key={key} className="wb-shell-token-row">
                <span className="wb-shell-token-name">{key}</span>
                <input
                  className="wb-shell-token-input"
                  type="text"
                  aria-label={`tokens.scale.typography.${name}.${key}`}
                  value={String(value)}
                  disabled={props.locked}
                  // **원래 수였던 값은 수로 되돌려 쓴다.** 규격이 `string | number`를 둘 다
                  // 받으므로(`lineHeight: 1.1`) 문자열로 굳혀 버리면 JSON 에디터에서 보는
                  // 문서 모양이 편집만으로 바뀐다.
                  onChange={(event) =>
                    props.onChange(name, key, keepShape(value, event.target.value))
                  }
                />
                <span className="wb-shell-token-kind">
                  {props.own?.[name]?.[key] !== undefined && props.inheritable
                    ? '이 테마'
                    : props.inheritable
                      ? '상속'
                      : '리터럴'}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 항목 하나를 실제 글자 스타일로. **표에 없는 키는 선언하지 않는다** — 엔진의
 * `TYPOGRAPHY_KEYS`가 *"스케일 항목에 없는 키는 선언을 내지 않는다"*인 것과 같은 규칙이고,
 * 그래서 「tokens — 3단 분리」의 `body`처럼 `letterSpacing`이 없는 항목이 화면에서도 그것을 갖지 않는다.
 *
 * **폰트는 지어내지 않는다.** 글자 스타일 항목에는 `family`가 없으므로 셸의 글꼴로 그린다 —
 * 임의로 `family.sans`를 끌어다 쓰면 화면이 문서에 없는 조합을 보이게 된다.
 */
function sampleStyle(table: TokenTable, name: string): CSSProperties {
  const style: CSSProperties = {}
  const fontSize = table.get(`typography.${name}.fontSize`)
  const lineHeight = table.get(`typography.${name}.lineHeight`)
  const fontWeight = table.get(`typography.${name}.fontWeight`)
  const letterSpacing = table.get(`typography.${name}.letterSpacing`)
  if (fontSize !== undefined) style.fontSize = fontSize
  if (lineHeight !== undefined) style.lineHeight = lineHeight
  if (fontWeight !== undefined) style.fontWeight = fontWeight
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing
  return style
}

/** 원래가 수였고 새 값도 수로 읽히면 수로 쓴다. 그 외에는 문자열이다. */
function keepShape(before: string | number, next: string): string | number {
  if (typeof before !== 'number') return next
  const parsed = Number(next)
  return next.trim() !== '' && Number.isFinite(parsed) ? parsed : next
}

/* ────────────────────────────────────────────────────────────────────────────
   순수 함수 — 화면 없이 잴 수 있다
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * **화면이 보이는 토큰.** 파생이면 상속 대상과 병합한 결과다.
 *
 * 병합을 손으로 하지 않고 `mergeTheme`을 부르는 것은 「상속과 병합」의 규칙 넷(깊은 병합 · 배열 교체 ·
 * `null` 삭제 · 깊이 1)을 이 파일이 다시 구현하면 **엔진과 갈릴 자리가 생기기 때문**이다.
 *
 * **병합이 실패하면 자기 절만 보인다.** 실패는 `bad-extends` 하나이고(상속 대상이 사라진
 * 파생), 그 사실은 이슈 패널이 말한다 — 여기서 다시 말하면 같은 것을 두 번 말하게 된다.
 */
export function effectiveTokens(draft: Theme, base: Theme | null): ThemeTokens {
  const own = draft.tokens ?? {}
  if (base === null || draft.meta.extends === undefined) return own

  const merged = mergeTheme(base, draft)
  return merged.theme?.tokens ?? own
}

/** 키 순서를 지킨다 — 다시 정렬하면 편집 중에 줄이 뛴다. */
function entriesOf(record: Record<string, string> | undefined): [string, string][] {
  return Object.entries(record ?? {})
}

/**
 * `palette`·`semantic`의 값 하나를 갈아 끼운다. **`undefined`면 이 테마의 것을 지운다** —
 * 파생이면 상속값으로 돌아가고, 아니면 토큰이 사라진다.
 *
 * **빈 record는 남기지 않는다.** 저장이 통째 교체이므로 `{ palette: {} }`가 서버까지 가고,
 * 그 문서는 *"팔레트를 비우겠다"*처럼 읽힌다.
 */
export function putRecord(
  tokens: ThemeTokens,
  layer: 'palette' | 'semantic',
  name: string,
  value: string | undefined,
): ThemeTokens {
  const next = { ...tokens }
  const record = { ...(tokens[layer] ?? {}) }
  if (value === undefined) delete record[name]
  else record[name] = value

  if (Object.keys(record).length === 0) delete next[layer]
  else next[layer] = record
  return next
}

export function putSpaceUnit(tokens: ThemeTokens, unit: string | undefined): ThemeTokens {
  const scale = { ...(tokens.scale ?? {}) }
  if (unit === undefined) delete scale.space
  else scale.space = { unit }
  return withScale(tokens, scale)
}

export function putScaleRecord(
  tokens: ThemeTokens,
  group: 'radius' | 'shadow' | 'motion',
  name: string,
  value: string | undefined,
): ThemeTokens {
  const scale = { ...(tokens.scale ?? {}) }
  const record = { ...(scale[group] ?? {}) }
  if (value === undefined) delete record[name]
  else record[name] = value

  if (Object.keys(record).length === 0) delete scale[group]
  else scale[group] = record
  return withScale(tokens, scale)
}

export function putTypography(
  tokens: ThemeTokens,
  entryName: string,
  key: string,
  value: string | number | undefined,
): ThemeTokens {
  const scale = { ...(tokens.scale ?? {}) }
  const typography = { ...(scale.typography ?? {}) }
  const entry = { ...(typography[entryName] ?? {}) }
  if (value === undefined) delete entry[key]
  else entry[key] = value

  if (Object.keys(entry).length === 0) delete typography[entryName]
  else typography[entryName] = entry

  if (Object.keys(typography).length === 0) delete scale.typography
  else scale.typography = typography
  return withScale(tokens, scale)
}

function withScale(tokens: ThemeTokens, scale: NonNullable<ThemeTokens['scale']>): ThemeTokens {
  const next = { ...tokens }
  if (Object.keys(scale).length === 0) delete next.scale
  else next.scale = scale
  return next
}

/** 절이 통째로 비었는가. 비었으면 `putSection`이 절을 지운다. */
function isEmptyTokens(tokens: ThemeTokens): boolean {
  return Object.keys(tokens).length === 0
}

/**
 * `semantic` 값 드롭다운이 고를 수 있는 것 전부. **이름공간 목록이 `SEMANTIC_NAMESPACES`고
 * 그 안의 이름은 지금 문서에 실제로 있는 것뿐이다** — 없는 이름을 제안하면 `unknown-token`을
 * 만들어 주는 셈이다.
 *
 * `semantic`에서 **자기 자신은 뺀다**(1칸 순환).
 */
export function referenceTargets(tokens: ThemeTokens, self: string): ReadonlyMap<string, string[]> {
  const out = new Map<string, string[]>()
  for (const namespace of SEMANTIC_NAMESPACES) {
    const names = Object.keys(tokens[namespace] ?? {}).filter(
      (name) => !(namespace === 'semantic' && name === self),
    )
    if (names.length > 0) out.set(namespace, names)
  }
  return out
}

/** `palette.<이름>`을 직접 가리키는 `semantic`의 수. 0이면 그 색은 스타일에서 쓸 수 없다. */
function referrerNote(semantic: [string, string][], reference: string): string {
  const count = semantic.filter(([, value]) => value === reference).length
  return count === 0 ? 'semantic 0 — 스타일에서 쓸 수 없습니다' : `semantic ${count}`
}

/**
 * 리터럴 값과 **똑같은 값을 가진 `palette` 항목**. 있으면 참조로 바꾸자고 제안한다(머리말의
 * *"같은 값을 연결할까요?"*).
 *
 * **시스템 테마에서는 0건이다**(머리말 — 시스템 테마 다섯에서 겹치는 항목이 하나도 없다).
 * 색 표기가 다르면(`#FFF` vs `#ffffff`) 못 찾는다 — 표기를 정규화하지 않는 것은 그 규칙이
 * 이 화면의 것이 아니기 때문이다(엔진도 표기를 건드리지 않는다).
 */
function paletteMatch(tokens: ThemeTokens, value: string): string | undefined {
  if (isTokenReference(value) || value === '') return undefined
  for (const [name, literal] of Object.entries(tokens.palette ?? {})) {
    if (literal === value) return `palette.${name}`
  }
  return undefined
}
