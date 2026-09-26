/**
 * 테마 저작 화면이 공유하는 **초안**. **React·DOM·`fetch`를 import하지 않는다.**
 *
 * `EditorStore`와 같은 형식이고 근거도 같다 — 낙관적 적용·검증·되돌리기가 붙으면 그 상태는
 * 화면 없이 단위 테스트할 수 있어야 한다(`test/store/theme-draft-store.test.ts`가 DOM 없는
 * 환경에서 그것을 강제한다). React 바인딩은 `use-theme-draft.tsx`에 따로 있다.
 *
 * 상태는 **불변 객체 하나**다. 바뀐 필드가 있을 때만 새 객체로 교체하고 그때만 리스너를
 * 부른다 — `useSyncExternalStore` 때문이고, 그 두 규칙의 근거는 `editor-store.ts` 머리말에
 * 있다. `getState()`가 돌려준 객체를 **바꾸지 마라.**
 *
 * ---
 *
 * **`EditorStore`와 합치지 않는다.** 셋이 갈린다:
 *
 * 1. **생애가 다르다.** 편집 상태는 에디터 셸이 사는 동안 하나이고(`routes/editor.tsx`의
 *    `storeRef`), 초안은 **테마 편집 라우트가 사는 동안** 하나다. 두 화면은 서로의 라우트가
 *    아니다(테마 편집은 별도 주소다).
 * 2. **구독자가 겹치지 않는다.** 합치면 토큰을 한 글자 고칠 때마다 캔버스·구조 트리·속성
 *    패널의 구독자가 전부 깨어난다. `resyncToken`을 스토어에 두지 않은 것과 같은 판단이다
 *    (`routes/editor.tsx`).
 * 3. **되돌리기의 바탕이 다르다.** 페이지의 undo는 revision 로그 위에 서는데(설계서
 *    「개인 undo/redo」) 테마에는 그 로그가 없다 — **undo가 없다.** **되돌리기 버튼은 undo가
 *    아니다:** 한 걸음 뒤로 가는 것이 아니라 `saved` **한 점**으로 돌아가는 것이고, 그래서
 *    로그 없이 선다(`replaceDraft`).
 *
 * ---
 *
 * **초안 하나가 테마 문서 전체다.** 토큰 GUI·JSON 에디터·갤러리가 **같은 초안**을 본다 —
 * 절마다 스토어를 두면 *"토큰을 바꿨는데 갤러리가 안 바뀐다"*가 된다. 그래서 쓰기 문은
 * `putSection` 하나이고, 절 이름이 그 인자다.
 */
import type { Theme, ThemeIssue } from '@wirebound/themes'

/**
 * 저장이 지금 무엇을 하고 있는가.
 *
 * - `idle` — 보낼 것도 기다릴 것도 없다.
 * - `saving` — `PUT`(또는 `POST`)이 하나 떠 있다.
 *
 * **`recovering`이 없다.** 페이지 편집은 실패하면 서버 상태를 다시 받아야 하지만,
 * 테마 저장은 **통째 교체**라 실패해도 초안이 그대로 유효하다 — 사용자가 고쳐서
 * 다시 누르면 된다. 되돌릴 로컬 적용이 없다.
 */
export type ThemeSaveStatus = 'idle' | 'saving'

/**
 * 저장이 실패한 이유.
 *
 * **`api/failure.tsx`의 `Failure`와 같은 모양이고 그쪽 값이 그대로 들어온다** —
 * `EditorStore.EditFailure`와 같은 관계이고, 그 타입을 import하지 않는 이유도 같다(이 파일은
 * 런타임 의존을 갖지 않는데 그쪽은 React를 쓰는 `.tsx`다). **모양이 갈리면 대입에서 컴파일이
 * 막힌다** — 구조적 타이핑이라 필드가 어긋나는 순간 그 대입이 에러다.
 *
 * **`issues`를 따로 든다.** 서버가 422를 낼 때 봉투에 `ThemeIssue[]`를 실어 주는데
 * (`apps/api`의 `themeValidationFailed`), 그것을 문장 하나로 뭉개면 **어디를 고쳐야 하는지가
 * 사라진다** — *"저장이 막힐 때 무엇 때문인지 보여라"*가 이 필드의 몫이다.
 */
export interface ThemeSaveFailure {
  kind: 'signed-out' | 'message'
  /** `kind: 'signed-out'`이면 화면이 로그인으로 보내므로 쓰이지 않는다. */
  message: string
  /** 서버가 422 봉투에 실어 준 이슈. 없으면 빈 배열이다. */
  issues: ThemeIssue[]
}

/** 테마 문서의 절 이름. `meta`를 포함한다 — 이름·설명도 편집 대상이다. */
export type ThemeSection = keyof Theme

export interface ThemeDraftState {
  /**
   * **이 초안이 어느 테마의 것인가.** 초안이 없으면 `null`이다.
   *
   * `EditorState.openPageId`와 같은 자리다 — 주소가 바뀐 뒤 초안을 비우는 이펙트가 돌기까지의
   * 커밋 하나 동안, 스토어는 앞 테마의 것을 들고 있으면서 그렇다고 말하지 않는다. 읽는 쪽이
   * 주소와 대조할 수단을 스토어 안에 둔다.
   */
  openThemeId: string | null
  /**
   * **저장 전까지 서버에 안 보내는 편집 대상.** 없으면 `null`이다.
   *
   * 서버가 준 **파생 문서 그대로**다 — `meta.extends`를 지닌 채이고 병합되지 않았다.
   * 병합 결과를 여기 두면 저장이 파생을 잃는다(서버 README: *"저장되는 것은 파생 테마
   * 그대로다"*).
   */
  draft: Theme | null
  /**
   * **서버가 마지막으로 확인해 준 문서.** `draft`와 **참조가 같으면 저장할 것이 없다.**
   *
   * 값 비교(깊은 비교)를 하지 않는 것이 판정이다: 이 스토어의 쓰기는 전부 새 객체를 만들고
   * (`putSection`) *"손으로 고쳤다가 원래 값으로 되돌린" 초안*이 참조로는 달라 보인다.
   * **그 경우 저장 버튼이 켜져 있는 것은 손해가 아니다** — 통째 교체라 같은 문서를 다시
   * 보내도 결과가 같다. 반대로 깊은 비교는 문서 전체를 매 입력마다 훑는다.
   *
   * > **되돌리기 버튼은 그 경우가 아니다.** `replaceDraft(saved)`가 **같은 참조**를
   * > 싣기 때문에 저장 버튼이 실제로 꺼진다(케이스가 그것을 단언한다). 즉 이 판정이 남긴
   * > 여유는 *"사용자가 손으로 되돌린 경우"*에 대한 것이지 그 버튼에 대한 것이 아니다.
   */
  saved: Theme | null
  /**
   * 파생이면 **상속 대상 시스템 테마 전문**. 아니면 `null`이다.
   *
   * `resolveTheme(draft, base)`의 둘째 인자다 — base 없이는 파생 문서의 해석 자체가
   * `bad-extends`로 거부된다. **파생인데 `null`일 수 있다**(상속 대상이 코드에서 사라진
   * 낡은 파생 — 서버가 그때 `base` 키를 안 낸다). 그 상태는 *"열 수는 있지만 검증이 안 되는
   * 테마"*이고, 화면이 그것을 말해야 한다.
   */
  base: Theme | null
  /**
   * **읽기 전용인가**(설계서 「테마 관리」 — 시스템 테마는 누구도 편집할 수 없다).
   *
   * **역할이 아니라 대상의 성질이다.** owner가 아니어서 못 고치는 것은 화면이 `projectAbilities`로
   * 따로 판정한다 — 둘을 한 필드에 뭉치면 *"왜 못 고치는가"*가 사라지고, 시스템 테마에만
   * 있는 길(파생 만들기)을 화면이 고를 수 없게 된다.
   */
  readOnly: boolean
  saveStatus: ThemeSaveStatus
  /** 마지막 저장 실패. **새 편집을 내면 지워진다** — 남아 있으면 방금 고친 것도 실패로 읽힌다. */
  saveFailure: ThemeSaveFailure | null
  /**
   * 마지막 저장 응답의 `warnings`. **서버의 판정이다** — 편집 중 화면이 계산하는 이슈와 다른
   * 채널이다. 둘이 갈리면 그 자체가 결함이다.
   *
   * **응답에 그 키가 없으면 빈 배열이다** — 없는 것과 비어 있는 것을 화면이 가르지 않게
   * 여기서 한 번만 정규화한다. 키가 없는 것이 서버의 정상 응답이다.
   */
  serverWarnings: ThemeIssue[]
  /**
   * **화면의 글자 중 초안에 못 들어간 절.**
   *
   * 이것이 없으면 저장 버튼이 파싱 실패를 모른다 — 파싱 실패 중에 저장하면 **마지막으로
   * 읽힌 값**이 서버로 간다(상자에 읽히는 값을 넣고 이어서 읽히지 않는 글자를 친 뒤 저장을
   * 누르면 저장 버튼이 `disabled=false`이고 `updateTheme`이 **앞의 값**을 받는다).
   *
   * **`ThemeIssue`가 아니라 스토어의 상태다** — 이슈로 만들면 `ThemeIssueCode`에 **문서가
   * 아니라 편집기의 상태**가 섞인다. `resolveTheme`은 **읽힌 문서**만 받는데 이것은 읽히지
   * 않은 글자다.
   *
   * **세는 것은 절이지 상자가 아니다.** 절 하나에 상자 하나라는 것은 오늘 JSON 에디터의
   * 배치일 뿐이고, 계약은 *"이 절의 초안 값이 화면의 글자와 어긋나 있다"*이다.
   *
   * **정렬해 둔다** — 값이 *"어느 절들이 어긋났는가"*라는 집합이지 어긋난 차례가 아니다.
   * 화면이 이 배열을 그대로 문장에 싣는데, 정렬하지 않으면 같은 상태가 사용자의 타자
   * 순서에 따라 다른 문장이 된다.
   *
   * > **가져오기의 읽기 실패는 여기 안 들어온다 — 판정이다.** 그쪽은 **초안을 건드리지
   * > 않고** 화면의 글자도 초안의 어느 절에 대응하지 않는다(고르기 전의 대기 자리다).
   * > 즉 그 상태로 저장해도 사용자가 놀랄 것이 없다. 이 필드가 막는 것은
   * > *"내가 고친 줄 아는데 안 고쳐진 채로 저장되는 것"* 하나다.
   */
  unreadable: readonly ThemeSection[]
  /**
   * **초안을 통째로 갈아 끼운 횟수.** `putSection`은 안 올린다.
   *
   * **왜 필요한가 — `unreadable`을 스토어에 두면서 생긴 거울이 어긋나는 자리가 있다.**
   * JSON 상자는 *"내 텍스트가 대응하는 초안 값"*(`Editing.source`)을 들고 그 참조가
   * 달라질 때만 텍스트를 새로 만든다. 그런데 **없는 절은 앞뒤가 둘 다
   * `undefined`라 그 비교가 안 걸린다** — 가져오기로 문서를 통째로 갈아 끼워도 그 상자만
   * 읽지 못한 글자를 든 채 남고, 스토어의 `unreadable`은 비워져 **둘이 갈린다.**
   *
   * 그래서 JSON 에디터가 이 수를 상자의 `key`에 싣는다. 값이 바뀌면 상자가 다시 마운트되어
   * 초안에서 텍스트를 새로 만든다 — **통째로 갈아 끼우는 문이 하나라는 규칙이 화면에서도
   * 하나로 지켜지는 자리다.**
   *
   * **`ackSave`는 안 올린다.** 그쪽도 문서를 통째로 갈아 끼우지만, 읽지 못한 글자가 있으면
   * `beginSave`가 막으므로 **그 상태로는 저장에 도달할 수 없다.** 올리면 저장할 때마다
   * 상자가 다시 마운트되어 *"내가 친 글자를 왕복으로 다시 포맷하지 않는다"*가 무너진다.
   */
  draftEpoch: number
}

/**
 * 초기 상태. 상수 하나를 공유하지 않고 매번 새로 만드는 것은 `EditorStore.initialState`와
 * 같은 이유다 — 한쪽에서 새어 나간 수정이 다른 스토어에 옮지 않게 한다.
 */
function initialState(): ThemeDraftState {
  return {
    openThemeId: null,
    draft: null,
    saved: null,
    base: null,
    readOnly: false,
    saveStatus: 'idle',
    saveFailure: null,
    serverWarnings: [],
    unreadable: [],
    draftEpoch: 0,
  }
}

type Listener = () => void

export class ThemeDraftStore {
  #state: ThemeDraftState = initialState()

  readonly #listeners = new Set<Listener>()

  /**
   * 공개 메서드를 화살표 필드로 두는 이유는 `EditorStore`와 같다 — React가 이 함수들을
   * 인스턴스에서 떼어 내 받는다(`useSyncExternalStore(store.subscribe, …)`).
   */
  readonly getState = (): ThemeDraftState => this.#state

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * 서버에서 받은 테마를 싣는다. **초안 상태를 서버 것으로 놓는 자리는 여기 하나다.**
   *
   * 그래서 저장 상태도 여기서 함께 재설정한다 — `EditorStore.loadPage`가 큐와 undo 스택을
   * 함께 비우는 것과 같은 근거다. 앞 테마의 실패 통지나 경고가 새 테마의 화면에 남으면
   * 사용자는 방금 연 테마가 실패한 줄로 읽는다.
   *
   * **`draft`와 `saved`에 같은 참조를 싣는다** — 막 받은 것은 저장할 것이 없다.
   */
  readonly loadTheme = (
    themeId: string,
    theme: Theme,
    options: { base?: Theme | null; readOnly?: boolean } = {},
  ): void => {
    this.#apply({
      openThemeId: themeId,
      draft: theme,
      saved: theme,
      base: options.base ?? null,
      readOnly: options.readOnly ?? false,
      saveStatus: 'idle',
      saveFailure: null,
      // 이미 비어 있으면 같은 배열을 그대로 넘긴다(`EditorStore`의 `pending`과 같은 이유) —
      // 새 빈 배열을 만들면 참조가 달라져 구독자가 테마를 열 때마다 헛일을 한다.
      serverWarnings: this.#state.serverWarnings.length === 0 ? this.#state.serverWarnings : [],
      // **읽지 못한 글자는 앞 테마의 것이다.** 남기면 새 테마의 저장이 이유 없이 막힌다 —
      // `saveFailure`·`saveStatus`를 여기서 함께 재설정하는 것과 같은 근거다.
      unreadable: this.#state.unreadable.length === 0 ? this.#state.unreadable : [],
      // **새 문서다.** 상자들이 다시 마운트되어야 앞 테마의 글자가 남지 않는다.
      draftEpoch: this.#nextEpoch(theme),
    })
  }

  /**
   * 열린 테마가 없어졌을 때. `loadTheme`의 짝이고 **같은 필드를 함께 비운다** — 넷이 한 번에
   * 움직여야 "초안은 없는데 어느 테마가 열려 있다고 말하는" 중간 상태가 생기지 않는다.
   */
  readonly clearTheme = (): void => {
    const { serverWarnings, unreadable } = this.#state
    this.#apply({
      openThemeId: null,
      draft: null,
      saved: null,
      base: null,
      readOnly: false,
      saveStatus: 'idle',
      saveFailure: null,
      serverWarnings: serverWarnings.length === 0 ? serverWarnings : [],
      unreadable: unreadable.length === 0 ? unreadable : [],
    })
  }

  /**
   * 초안의 절 하나를 갈아 끼운다. **이것이 이 스토어의 유일한 쓰기 문이다**(토큰 GUI와 JSON 에디터가 공유한다).
   *
   * `value`가 `undefined`면 **그 절을 지운다** — 테마 문서에서 절이 없는 것과 비어 있는 것은
   * 다르다(`{}`인 `components`는 *"컴포넌트 스타일을 하나도 안 준다"*이고, 없는 것은
   * *"이 절을 안 쓴다"*이다. 저장이 통째 교체이므로 그 차이가 서버까지 간다).
   *
   * **초안이 없으면 아무것도 안 한다.** 던지지 않는 것은 `EditorStore.applyEdit`가 문서 없이
   * `null`을 내는 것과 같은 판단이다 — 이 호출은 이펙트 뒤의 이벤트 핸들러에서 오고, 그
   * 자리에서 던지면 화면이 통째로 죽는다.
   *
   * **`saveFailure`를 지운다.** 남겨 두면 방금 고친 값도 실패한 것으로 읽힌다
   * (`EditorStore`가 새 편집마다 `editFailure`를 지우는 것과 같다).
   *
   * **`serverWarnings`는 지우지 않는다.** 그것은 *"마지막으로 저장된 문서에 대한 서버의
   * 판정"*이고 초안을 고쳤다고 거짓이 되지 않는다 — 거짓이 되는 것은 다음 저장 때이고,
   * 그때 `ackSave`가 갈아 끼운다. **편집 중 이슈는 클라이언트가 따로 계산한다.**
   */
  readonly putSection = <K extends ThemeSection>(section: K, value: Theme[K] | undefined): void => {
    const { draft } = this.#state
    if (draft === null) return

    const next = { ...draft }
    if (value === undefined) delete next[section]
    else next[section] = value

    this.#apply({ draft: next, saveFailure: null })
  }

  /**
   * 초안 문서 전체를 갈아 끼운다. **JSON 에디터가 절 여럿을 한 번에 바꿀 때와, 되돌리기
   * 버튼이 `saved`로 돌아갈 때** 쓴다.
   *
   * `putSection`이 있는데도 두는 이유: 절 이름을 모르는 채로 문서가 통째로 오는 경로가 있다
   * (붙여 넣은 JSON). 그때 절을 하나씩 넣으면 **없어진 절이 안 지워진다.**
   *
   * ---
   *
   * **가져오기와 되돌리기가 같은 이 문을 쓴다** — *"초안을 통째로 갈아 끼우는 것"*의 규칙이
   * 하나여야 한다.
   *
   * **셋을 함께 움직인다.**
   *
   * 1. `saveFailure`를 지운다 — 앞 문서의 실패이고, 새 문서에 대해서는 아직 아무 판정이 없다.
   * 2. **`unreadable`을 비운다** — 읽지 못한 글자는 앞 문서의 절에 대한 것이다. 남기면
   *    가져오기로 고친 뒤에도 저장이 막힌 채로 남는다.
   * 3. **`draftEpoch`를 올린다** — 상자들이 다시 마운트되어 새 문서에서 텍스트를 만든다.
   *    2와 3이 함께 가야 스토어와 화면이 안 갈린다(`draftEpoch`의 주석).
   *
   * **올리는 조건이 *"문서가 갈렸다"* 하나가 아니다.** 읽지 못한 글자만 있고
   * 문서는 그대로인 되돌리기(`replaceDraft(saved)`인데 `draft === saved`)가 실제로 있다 —
   * 그때 참조만 보면 안 올라가고, `unreadable`은 비워지는데 상자는 못 읽은 글자를 그대로
   * 들어 **둘이 갈린다.** 그래서 *"상자가 텍스트를 새로 만들어야 하는가"*로 판정한다.
   */
  readonly replaceDraft = (draft: Theme): void => {
    if (this.#state.draft === null) return
    const { unreadable } = this.#state
    const reseed = draft !== this.#state.draft || unreadable.length > 0
    this.#apply({
      draft,
      saveFailure: null,
      unreadable: unreadable.length === 0 ? unreadable : [],
      draftEpoch: reseed ? this.#state.draftEpoch + 1 : this.#state.draftEpoch,
    })
  }

  /**
   * **이 절의 글자를 읽지 못했다고(또는 다시 읽었다고) 알린다.**
   *
   * 쓰기 문을 `putSection` 하나로 둔 것과 어긋나 보이지만 **다른 축이다** — `putSection`은
   * *문서*를 바꾸고 이것은 *편집기의 상태*를 바꾼다. 한 문으로 합치면 *"읽지 못했으니
   * 문서는 그대로 두고 상태만 바꾼다"*를 표현할 수 없다.
   *
   * **바뀔 때만 새 배열을 만든다.** 타자 한 글자마다 같은 절이 계속 `true`로 들어오는데,
   * 매번 새 배열을 만들면 참조가 달라져 구독자가 전부 깨어난다(`#apply`가 참조로 비교한다).
   */
  readonly setUnreadable = (section: ThemeSection, unreadable: boolean): void => {
    const current = this.#state.unreadable
    if (current.includes(section) === unreadable) return
    const next = unreadable
      ? [...current, section].sort()
      : current.filter((entry) => entry !== section)
    this.#apply({ unreadable: next })
  }

  /**
   * 저장을 시작한다. **`true`면 시작한 것이고 반드시 `ackSave`나 `failSave`로 닫아야 한다.**
   * 이미 떠 있으면 `false`다 — 통째 교체 둘이 겹치면 **나중에 도착한 응답이 이긴다**(서버에
   * `head_seq` 같은 방어가 테마에는 없다. api README가 그 공백을 적어 두었다).
   *
   * **읽기 전용이면 `false`다.** 시스템 테마는 서버가 403으로 막지만, 여기서 먼저 막는 것은
   * *"눌러 봐야 실패할 버튼을 활성으로 두지 않는다"*는 이 저장소의 관례다.
   * **저장할 것이 없어도 `false`다** — 같은 문서를 다시 보낼 이유가 없다.
   *
   * **읽지 못한 절이 있어도 `false`다 — 넷째 갈래다.**
   * 앞의 셋과 성격이 다르다: 그쪽은 *"보낼 수 없다/보낼 것이 없다"*이고 이쪽은
   * **보낼 수는 있는데 보내면 사용자가 놀란다**이다. 막지 않으면 화면에 *"JSON을 읽지
   * 못했습니다"*가 떠 있는 채로 **마지막으로 읽힌 값**이 서버로 간다 — 통째 교체라
   * 그 값이 서버의 문서가 된다.
   *
   * **왜 화면이 아니라 여기인가.** 이 관문이 이미 셋을 한 자리에서 판정하고 있고,
   * 화면이 넷째만 따로 세면 *"왜 못 누르는가"*의 규칙이 두 곳이 된다
   * (`SaveTools`의 주석이 그 셋을 갈라 두는 이유를 적었다).
   */
  readonly beginSave = (): boolean => {
    const { draft, saved, readOnly, saveStatus, unreadable } = this.#state
    if (draft === null || readOnly || saveStatus === 'saving' || draft === saved) return false
    if (unreadable.length > 0) return false
    this.#apply({ saveStatus: 'saving', saveFailure: null })
    return true
  }

  /**
   * 저장이 성공했다. **서버가 돌려준 문서를 `saved`와 `draft` 둘 다에 싣는다.**
   *
   * 왜 `draft`까지 갈아 끼우나. 저장은 통째 교체이므로 서버가 돌려준 것이 곧 새 진실이고,
   * `saved`만 갈면 **초안과 저장본이 값은 같은데 참조가 달라** 저장 버튼이 켜진 채로 남는다.
   *
   * **`warnings` 키가 없을 수 있다**(없으면 키 자체가 없다). 그래서 인자가 옵셔널이고
   * 여기서 `[]`로 정규화한다. 화면이 그 구분을 다시 하지 않게 하는 것이 이 자리의 몫이다.
   */
  readonly ackSave = (theme: Theme, warnings?: ThemeIssue[]): void => {
    const next = warnings ?? []
    this.#apply({
      draft: theme,
      saved: theme,
      saveStatus: 'idle',
      saveFailure: null,
      // 둘 다 비어 있으면 참조를 유지한다 — 경고 없는 저장이 반복될 때 구독자가 헛일을 하지 않는다.
      serverWarnings:
        next.length === 0 && this.#state.serverWarnings.length === 0
          ? this.#state.serverWarnings
          : next,
    })
  }

  /**
   * 저장이 실패했다. **초안을 되돌리지 않는다** — 사용자가 방금 적은 것을 지우는 셈이고,
   * 통째 교체라 되돌릴 서버 상태도 없다(`EditorStore.failEdits`가 문서를 되돌리지 않는 것과
   * 같은 근거의 다른 형태다).
   *
   * **`serverWarnings`도 안 건드린다.** 그것은 *"마지막으로 저장에 성공한 문서"*에 대한
   * 판정이고, 이번 저장이 실패한 것이 그 사실을 바꾸지 않는다.
   */
  readonly failSave = (failure: ThemeSaveFailure): void => {
    this.#apply({ saveStatus: 'idle', saveFailure: failure })
  }

  /** 실패 통지를 치운다. 사용자가 닫을 수 있어야 한다. */
  readonly clearSaveFailure = (): void => {
    this.#apply({ saveFailure: null })
  }

  /** 프로젝트를 떠날 때. `clearTheme`이 남기는 것이 없으므로 오늘은 같은 일이지만, 짝을 맞춰 둔다. */
  readonly reset = (): void => {
    this.#apply(initialState())
  }

  /**
   * `loadTheme`의 다음 `draftEpoch`. **문서가 실제로 갈렸을 때만 오른다.**
   *
   * 그냥 `+ 1`로 두면 *"같은 값으로 다시 불러도 알리지 않는다"*가 깨진다 — `#apply`가
   * 참조로 비교하는데 이 수만 달라져 있으면 바뀐 것이 없는데도 구독자가 깨어난다
   * (`test/store/theme-draft-store.test.ts`가 그것을 지킨다 — `+ 1`로 두면 거기서 죽는다).
   * **세는 단위가 *"통째 교체를 시도한 횟수"*가 아니라 *"상자가 텍스트를 새로
   * 만들어야 한 횟수"*다.** `loadTheme`은 `unreadable`을 어차피 비우고 문서도 새것이므로
   * 참조 하나로 갈린다 — `replaceDraft`는 조건이 하나 더 있고 그쪽에 적어 두었다.
   */
  #nextEpoch(draft: Theme | null): number {
    return draft === this.#state.draft ? this.#state.draftEpoch : this.#state.draftEpoch + 1
  }

  /** 바뀐 필드가 있을 때만 상태를 교체하고 알린다. 근거는 `EditorStore.#apply`와 같다. */
  #apply(next: Partial<ThemeDraftState>): void {
    let changed = false
    for (const key of Object.keys(next) as (keyof ThemeDraftState)[]) {
      if (next[key] !== this.#state[key]) {
        changed = true
        break
      }
    }
    if (!changed) return

    this.#state = { ...this.#state, ...next }
    // 사본을 순회한다 — 리스너가 알림을 받는 중에 구독을 해제할 수 있다.
    for (const listener of [...this.#listeners]) listener()
  }
}

/**
 * **저장할 것이 있는가.** 상태에 필드로 두지 않고 여기서 판정하는 것은, 그 값이 두 필드의
 * 함수라 스토어가 들면 **셋이 어긋날 수 있는 자리**가 생기기 때문이다.
 *
 * 참조 비교인 이유는 `ThemeDraftState.saved`의 주석에 있다.
 */
export function isDirty(state: ThemeDraftState): boolean {
  return state.draft !== null && state.draft !== state.saved
}
