/**
 * **JSON 에디터.** 설계서 「테마 관리」의 *"`components`·`patterns`·`primitives`는 스키마
 * 검증이 붙은 JSON 에디터로 편집한다"*가 이 파일이다.
 *
 * 이 파일이 `token-editor.tsx`와 따로 있는 까닭: 편집기 셋을 한 파일에서 등록하면 병합이
 * 충돌하고 **그 충돌은 회귀가 못 잡는다**.
 *
 * ---
 *
 * # 계약
 *
 * - **초안은 `useThemeDraftStore()`에서 꺼내고 쓰기는 `putSection` 하나다.**
 * - **`<textarea>`다. 새 런타임 의존을 더하지 않는다**(사용자가 정한 것이다). 구문 강조·접기는 없다.
 * - **서버를 부르지 않는다.** `test/api-consumers.test.ts`가 실행으로 지킨다.
 * - **검증 이슈를 여기서 그리지 않는다** — `theme/theme-issues.tsx`가 `path`까지 갖춰 한 곳에서
 *   그린다. 여기서 그리는 것은 **파싱 실패 하나**이고, 그것은 이슈 채널에 **없는** 정보다.
 *
 * ---
 *
 * # 상자를 절마다 가른다 — **넷이다**
 *
 * `components` · `patterns` · `primitives`가 계약의 셋이고, **`assets`도 여기서 편집한다** —
 * GUI로 빼지 않는다:
 *
 * 1. **설계서 「테마 규격」의 여섯 절 중 여기 말고는 편집할 길이 없는 절이다.** `meta`는 라우트의 이름
 *    입력이, `tokens`는 토큰 편집기(`token-editor.tsx`)가, 나머지 셋은 이 파일이 연다. `assets`가 빠지면 **저장이
 *    통째 교체(`PUT`)이므로 값은 살아남지만 고칠 수단이 없다.**
 * 2. **GUI로 빼는 비용이 크다.** `fonts[]`는 `family`·`src`·`weights[]`의
 *    배열이고 `src`는 `url(...) format("woff2")` 꼴을 받는다(`FONT_SRC_FUNCTIONS`) —
 *    폼으로 만들면 그 문법을 다시 구현하는 일이 된다.
 * 3. **비용이 상자 하나다.** 아래 `SectionEditor`가 절 이름 하나로 도는 형태라 넷째 항목이다.
 *
 * > **`placeholder.style`은 컴파일되지 않는다** — 편집은 되는데 아무 일도 안 일어나므로
 * > 아래 `SECTIONS`의 `assets` 항목이 그 사실을 **화면에** 적는다.
 *
 * ---
 *
 * # 파싱 실패와 검증 실패를 가른다 — **그 선이 이 파일의 뼈대다**
 *
 * | 무엇 | 언제 | 초안에 | 어디에 보이나 |
 * |---|---|---|---|
 * | **파싱 실패** | `JSON.parse`가 던진다 | **안 넣는다** | **여기.** `role="alert"` |
 * | **검증 실패** | 파싱은 됐다 | **넣는다** | 이슈 패널(`theme-issues.tsx`) |
 *
 * **파싱 실패한 것을 초안에 넣지 않는 이유**: 못 읽은 것을 초안으로 만들면
 * 갤러리가 앞 값으로 남아 *"고쳤는데 안 바뀐다"*가 된다. **그런데 넣지 않는 것만으로는 그
 * 사고가 안 닫힌다** — 갤러리는 여전히 앞 값이고 사용자는 이유를 모른다. 그래서 경보가
 * *"지금 보이는 것은 마지막으로 읽힌 값이다"*까지 말한다.
 *
 * **`bad-spec`은 셋째 부류가 아니다 — 잰 것이다.** 모양이 어긋난 값
 * (`components: 42` · `patterns: null` · 배열)을 초안에 넣어도 `resolveTheme`은 **던지지 않고**
 * `bad-spec`(`error`)을 낸다 — 그 함수가 입력을 `unknown`으로 받아 `ThemeSchema.safeParse`를
 * 경계로 두기 때문이다. 즉 **모양 위반은 검증 실패이고 이슈 패널의 몫이다.** 케이스가
 * `test/theme/json-editor.test.tsx`에 있다(`던지지 않는다`).
 *
 * ---
 *
 * # 텍스트와 초안의 동기 — **어느 쪽이 진실인가**
 *
 * 상자마다 **자기 텍스트를 든다.** 초안이 진실이면 파싱 실패 중인 텍스트를 들 자리가 없고,
 * 텍스트가 진실이면 밖에서 초안이 갈릴 때(저장 응답의 `ackSave`가 문서를 통째로 갈아 끼운다)
 * 상자가 낡은 채로 남는다. **그래서 텍스트가 대응하는 초안 값을 함께 든다**(`Editing.source`):
 *
 * - `source`가 지금 초안의 값과 **참조로 같으면** 텍스트가 진실이다 — 내가 쓴 것이 왕복해
 *   돌아온 것뿐이므로 **다시 포맷하지 않는다**(포맷하면 타자 중에 커서가 튄다).
 * - **다르면 밖에서 갈린 것**이므로 초안에서 텍스트를 새로 만든다.
 *
 * 참조 비교인 것은 스토어와 같은 근거다(`ThemeDraftState.saved`의 주석) — `putSection`이
 * 늘 새 객체를 만들므로 값 비교가 필요 없다.
 */
import { useState, type ReactElement } from 'react'
import type { Theme } from '@wirebound/themes'
import { useThemeDraft, useThemeDraftStore } from '../store/use-theme-draft'

/** 이 화면이 여는 절. **`meta`·`tokens`는 여기 없다** — 라우트와 토큰 편집기의 것이다. */
type JsonSection = 'components' | 'patterns' | 'primitives' | 'assets'

interface SectionSpec {
  section: JsonSection
  /** 절이 무엇인가. **한 줄이다** — 여기는 참고서가 아니다. */
  gloss: string
  /**
   * *"이 절에서만 알아야 하는 것"*. **없으면 안 그린다** — 상자마다 문장을 채우면 넷이
   * 다 같은 무게로 읽혀 진짜 함정(`patterns`·`assets`)이 묻힌다.
   */
  caveat?: string
}

/**
 * 상자 넷과 그 순서. **계약의 셋을 먼저, `assets`를 뒤에 둔다.**
 *
 * `caveat`이 붙은 둘이 요점이다 — 둘 다 ***"편집은 되는데 아무 일도 안 일어난다"***이고,
 * 그것은 이슈 채널에 **없는** 정보다(경고가 안 난다). 이 화면이 말하지 않으면 아무도 말하지
 * 않는다.
 */
const SECTIONS: readonly SectionSpec[] = [
  {
    section: 'components',
    gloss: '컴포넌트별 구조와 스타일 — 카탈로그의 컴포넌트 이름이 키입니다.',
  },
  {
    section: 'patterns',
    gloss: '재사용 패턴 — `<범주>.<변형>`이 키입니다.',
    // **그 사실을 UI가 말한다.** 이 화면의 약속이 *"고치면 오른쪽에 바로 보인다"*인데 패턴은 그 약속에 단서가
    // 둘 붙는다 — 슬롯이 빈 채로 그려지고, 초안에 오류가 있으면 안 그려진다(`theme-gallery.tsx`). 침묵하면
    // *"고쳤는데 안 바뀐다"*가 정상 동작으로 읽힌다. 「」 안의 이름은 구조 툴바의 버튼 글자다 — 케이스가 맞댄다.
    caveat:
      '패턴은 갤러리 아래쪽에 페이지에 넣은 직후의 모양(슬롯은 비어 있음)으로 그려집니다. 초안에 오류가 있으면 그리지 않습니다. ' +
      '페이지에 넣으려면 저장한 뒤 이 테마를 쓰는 프로젝트의 페이지에서 「패턴 넣기」를 누르세요.',
  },
  {
    section: 'primitives',
    gloss: '사이트 골격 — 컨테이너·그리드·섹션·브레이크포인트.',
    // **이슈 패널은 틀린 뒤에만 말한다**(판정은 `resolveTheme`이 이슈로 낸다) — 이 문장은 틀리기 전에 말한다.
    caveat:
      '이 절의 값은 토큰만 가리킬 수 있습니다 — primitives끼리 가리키면 오류입니다. ' +
      'breakpoints는 어느 자리에서도 가리킬 수 없습니다(변수로 나가지 않습니다).',
  },
  {
    section: 'assets',
    gloss: '폰트·아이콘·placeholder.',
    // **편집은 되는데 아무 일도 안 일어나는 절이라 그 사실을 적는다.** 다시 재는 법: 시스템 테마
    // (`packages/themes/src/system/`) 중 `'photo'`를 선언한 것이 있고, `packages/themes/src/emit/`에서
    // `placeholder`를 grep 하면 0건이다.
    caveat:
      'placeholder.style은 아무 일도 하지 않습니다 — 검증은 지나지만 CSS로 나가지 ' +
      '않습니다(미구현). fonts는 @font-face로 나갑니다.',
  },
]

/**
 * 절 넷을 각각의 상자로 그린다. **한 상자에 몰지 않는다** — 서로 다른 절이고 이슈 경로도
 * 갈린다. 한 덩어리로 두면 한 절의 문법 오류가 나머지 셋의 편집까지 막는다.
 *
 * **초안이 없으면 아무것도 안 그린다.** 라우트는 조회가 끝난 뒤에만 이 컴포넌트를 그리지만
 * (`routes/theme-editor.tsx`), 초안이 비는 창(주소가 바뀌고 이펙트가 돌기 전)에 상자를 그리면
 * `putSection`이 조용히 아무것도 안 하는 자리가 열린다 — 사용자가 친 글자가 어디로도 가지
 * 않는 상태다.
 */
export function JsonEditor(props: { locked: boolean }): ReactElement | null {
  const store = useThemeDraftStore()
  const hasDraft = useThemeDraft(store, (s) => s.draft !== null)
  // **`base`를 든 것이 아니라 파생인지만 본다** — selector는 원시값을 내야 한다
  // (`use-theme-draft.tsx`의 규칙).
  const isDerived = useThemeDraft(store, (s) => s.base !== null)
  /**
   * **초안이 통째로 갈아 끼워진 횟수.** 상자의 `key`에 실어 **다시 마운트**시킨다.
   *
   * 아래 `SectionEditor`의 교정(`editing.source !== value`)만으로는 **없는 절이 안 걸린다** —
   * 가져오기 전후로 그 절이 둘 다 `undefined`면 참조가 같아서, 읽지 못한 글자를 든 상자가
   * 새 문서 위에 그대로 남는다. 그러면 스토어의 `unreadable`(가져오기가 비운다)과 화면이
   * 갈리고, **화면은 읽지 못한 글자를 드는데 스토어는 읽지 못한 절이 없다고 본다.**
   *
   * `putSection`은 이 수를 안 올리므로 **타자 중에는 다시 마운트되지 않는다** —
   * *"내가 친 글자를 왕복으로 다시 포맷하지 않는다"*가 그대로 산다.
   */
  const draftEpoch = useThemeDraft(store, (s) => s.draftEpoch)

  if (!hasDraft) return null

  return (
    <div className="wb-shell-theme-json">
      {isDerived && (
        <p className="wb-shell-theme-json-derived" role="status">
          파생 테마입니다 — <strong>덮어쓸 것만</strong> 적습니다. 상자를 비우면 상속한
          값이 그대로 옵니다. 상속한 것을 <strong>지우려면 `null`</strong>을 적습니다.
        </p>
      )}
      {SECTIONS.map((spec) => (
        <SectionEditor key={`${spec.section}:${draftEpoch}`} spec={spec} locked={props.locked} />
      ))}
    </div>
  )
}

/**
 * 상자 하나가 든 것. **텍스트만으로는 부족하다** — 머리말의 동기 절 참고.
 */
interface Editing {
  /** 이 텍스트가 대응하는 **초안 안의 값**. 참조로 비교한다. */
  source: unknown
  text: string
  /** 파싱 실패 메시지. 실패가 아니면 `null`이다. */
  parseError: string | null
}

/** 초안 값에서 상자의 상태를 만든다. **절이 없으면 빈 상자다**(`{}`와 다르다 — 아래 참고). */
function seed(value: unknown): Editing {
  return {
    source: value,
    text: value === undefined ? '' : JSON.stringify(value, null, 2),
    parseError: null,
  }
}

function SectionEditor(props: { spec: SectionSpec; locked: boolean }): ReactElement {
  const { section } = props.spec
  const store = useThemeDraftStore()
  // 스토어가 든 참조를 그대로 낸다 — 매 렌더 새 객체를 만드는 selector는 렌더를 멈추지
  // 못한다(`use-theme-draft.tsx`).
  const value = useThemeDraft(store, (s) => s.draft?.[section])

  const [editing, setEditing] = useState<Editing>(() => seed(value))
  // **렌더 중 상태 교정이다.** 이펙트로 하면 한 커밋 동안 낡은 텍스트가 보이고, 그 사이의
  // 입력이 앞 절의 값을 덮는다. React가 이 자리를 위해 허용하는 형태다(같은 컴포넌트의
  // 자기 상태이고, 조건이 참조 비교라 즉시 수렴한다).
  //
  // **여기서 `setUnreadable(section, false)`를 부르지 않는다** — 렌더 중에 스토어를 쓰면
  // 남의 구독자를 렌더 중에 깨우게 된다. 부를 필요도 없다: 이 교정이 파싱 실패를 지우며
  // 도는 경로가 **`ackSave` 하나뿐인데**(`replaceDraft`·`loadTheme`은 `draftEpoch`로 다시
  // 마운트시킨다) 읽지 못한 절이 있으면 `beginSave`가 막아 **그 저장에 도달할 수 없다.**
  if (editing.source !== value) setEditing(seed(value))

  function change(text: string): void {
    /**
     * **빈 상자는 *"이 절을 안 쓴다"*이고 `{}`는 *"빈 절"*이다.** 저장이 통째 교체라 그
     * 차이가 서버까지 간다(`putSection`의 주석이 그것을 못박는다). 공백만 남은 것도 빈 것으로
     * 본다 — `JSON.parse('  ')`는 *"입력이 갑자기 끝났다"*를 던지는데, 그 문장은 지금
     * 사용자가 한 일(지웠다)을 설명하지 못한다.
     */
    if (text.trim() === '') {
      store.putSection(section, undefined)
      // **지운 것은 읽은 것이다.** 절이 없는 문서가 정상이므로(`ThemeSchema`가 `meta`만
      // 필수로 둔다) 여기서 저장을 막을 이유가 없다.
      store.setUnreadable(section, false)
      setEditing({ source: undefined, text, parseError: null })
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (caught) {
      // **초안을 건드리지 않는다.** `source`를 그대로 들고 있으므로 위 교정이 이 텍스트를
      // 덮지 않는다 — 초안이 안 바뀌었기 때문이다.
      //
      // **그리고 스토어에 그 사실을 알린다.** 화면에 경보를 띄우는 것만으로는
      // 저장이 안 막힌다 — 스토어가 읽지 못한 절을 알아야 `beginSave`가 막는다.
      store.setUnreadable(section, true)
      setEditing((previous) => ({
        source: previous.source,
        text,
        parseError: parseMessage(caught),
      }))
      return
    }

    /**
     * **모양을 여기서 보지 않는다.** `ThemeSchema`로 걸러 되돌리면 *"검증 실패는 초안에
     * 들어간다"*가 깨지고, 이슈 패널이 가리킬 값이 사라져 **어디를 고쳐야 하는지가
     * 사라진다.** 넣어도 안전하다는 것은 머리말의 `bad-spec` 절에서 재서 적었다.
     *
     * 캐스트가 필요한 것은 그 판단의 결과다 — `JSON.parse`는 `any`를 내고 절의 타입은
     * `Theme[K]`인데, **틀린 값을 일부러 통과시키는 것**이 이 자리의 계약이다.
     */
    store.putSection(section, parsed as Theme[JsonSection])
    // **다시 읽혔다.** 이 자리가 없으면 한 번 실패한 절이 영원히 저장을 막는다.
    store.setUnreadable(section, false)
    setEditing({ source: parsed, text, parseError: null })
  }

  const errorId = `wb-json-error-${section}`
  const noteId = `wb-json-note-${section}`

  return (
    <section className="wb-shell-theme-json-section" aria-label={section}>
      <label className="wb-shell-theme-json-label" htmlFor={`wb-json-${section}`}>
        {section}
      </label>
      <p className="wb-shell-theme-json-gloss" id={noteId}>
        {props.spec.gloss}
      </p>
      {props.spec.caveat !== undefined && (
        // **`role="alert"`이 아니다.** 이것은 사고가 아니라 늘 참인 사실이고, 경보로 만들면
        // 보조 기술이 파싱 실패와 같은 무게로 읽는다(`theme-issues.tsx`가 `warning`에
        // alert을 안 붙이는 것과 같은 판단).
        <p className="wb-shell-theme-json-caveat">{props.spec.caveat}</p>
      )}
      <textarea
        id={`wb-json-${section}`}
        className="wb-shell-theme-json-input"
        value={editing.text}
        disabled={props.locked}
        rows={10}
        spellCheck={false}
        // 파싱이 실패한 동안에만 경보를 잇는다 — 늘 이어 두면 읽는 쪽이 빈 경보를 따라간다.
        aria-describedby={editing.parseError === null ? noteId : `${noteId} ${errorId}`}
        aria-invalid={editing.parseError !== null}
        onChange={(event) => change(event.target.value)}
      />
      {editing.parseError !== null && (
        /**
         * **여기서 그리는 유일한 것이다.** 이슈 채널에 없는 정보이므로 이슈 패널이 이것을
         * 대신 말할 수 없다 — `resolveTheme`은 **읽힌 문서**를 받고, 이것은 읽히지 않은 글자다.
         *
         * **둘째 문장이 머리말 «파싱 실패와 검증 실패를 가른다»의 구멍을 닫는다.** 초안에 안 넣는 것만으로는 갤러리가 앞 값으로
         * 남는 것이 안 고쳐진다. 그 사실을 말해야 *"고쳤는데 안 바뀐다"*가 아니라
         * *"아직 안 고쳐졌다"*로 읽힌다.
         */
        <p className="wb-shell-theme-json-error" id={errorId} role="alert">
          JSON을 읽지 못했습니다: {editing.parseError}
          <span className="wb-shell-theme-json-error-note">
            갤러리·검증·저장은 <strong>마지막으로 읽힌 값</strong> 그대로입니다.
          </span>
        </p>
      )}
    </section>
  )
}

/**
 * 던져진 것에서 보여 줄 문장을 꺼낸다.
 *
 * **메시지를 파싱하지 않는다.** V8의 문장은 자리를 실을 때도 있고 아닐 때도 있다
 * (Node 22.23.1 에서 깨진 입력을 `JSON.parse`에 넣어 재면: `Expected ':' after property name in
 * JSON at position 5 (line 1 column 6)`는 싣고 `Unexpected end of JSON input`은 안 싣는다).
 * 줄·칸을 우리가 다시 세면 **그 문장이 실을 때와 어긋날 수 있다** — *"두 곳이 같은 것을
 * 따로 말하다가 갈리는"* 부류다. **엔진이 아는 만큼만
 * 그대로 옮긴다.**
 */
function parseMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught)
}
