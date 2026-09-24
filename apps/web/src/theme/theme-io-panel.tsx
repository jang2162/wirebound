/**
 * **가져오기·내보내기·되돌리기.** 설계서 「테마 관리」의 가져오기/내보내기 줄이 화면에서
 * 서는 자리다 — *"테마는 JSON 한 벌로 내보내고 가져온다."*
 *
 * 셋이 한 상자에 있는 이유는 **셋 다 문서 전체에 대한 조작**이기 때문이다. 왼쪽 칸은
 * **절 단위** 편집이고(토큰 GUI·JSON 상자 넷), 이 셋은 저장과 같은 층이다 — 그래서 자리도
 * 저장 옆(머리)이다. 왼쪽 칸이 이미 세로로 매우 길다는 것이 그 판단의 두 번째 근거다.
 *
 * ---
 *
 * # 서버를 부르지 않는다
 *
 * 이 화면은 **초안 스토어와 글자만** 만진다. B(새 테마로)가 서버를 필요로 하는데,
 * 그 호출은 라우트가 `onImportAsNew`로 내려준다.
 *
 * **왜 여기서 직접 부르지 않나.** `test/api-consumers.test.ts`가
 * *"테마 저작 셋(`getTheme`·`createTheme`·`updateTheme`)은 `routes/theme-editor.tsx`
 * 한 파일에서만 불린다"*를 실행으로 지키고 있고, 그 줄의 뜻은
 * *"②의 화면들은 초안 스토어만 만지고 서버에는 닿지 않는다"*이다. 이 파일도 그 화면 중
 * 하나이므로 같은 선을 지킨다 — 라우트가 `DeriveButton`에서 이미 `createTheme`을 부르는
 * 자리이고, B는 그것과 **같은 모양**이다.
 *
 * ---
 *
 * # 가져오기는 두 문인데 **읽는 자리는 하나다**
 *
 * ```
 * 파일 고르기 ─┐
 *              ├─→ 대기 글자(text) ─→ ┌─ A. 초안에 넣기   (replaceDraft)
 * 붙여 넣기  ─┘                        └─ B. 새 테마로     (onImportAsNew)
 * ```
 *
 * 가져오는 문을 두 자리(테마 편집 화면 / 고르개 옆)에 둘 수도 있지만, **읽기를 두 번
 * 구현하지 않는 것**이 더 중요하다 — 읽기 실패 문안이 두 곳이 되면 갈린다.
 * 그래서 고르개 옆이 아니라 **여기**다. 근거 셋:
 *
 * 1. **고르개는 `<select>` 하나로 좁게 유지한다** — *"목록의 길이가
 *    프로젝트의 테마 수라 상한이 없고, 버튼 목록이면 Tab 정지점이 그 수만큼 는다"*.
 *    파일 입력 + slug 입력 + 실패 문안을 셸 머리에 두면 그 판정이 깨진다.
 * 2. **A와 B가 같은 글자를 읽는다.** 나누면 읽기가 둘이 된다.
 * 3. **B는 `DeriveButton`과 같은 부류의 조작이고**(새 테마를 만들고 그 화면으로 간다)
 *    그것이 이미 이 화면에 있다.
 *
 * > **그러므로 프로젝트에 테마가 하나도 안 골라져 있으면 가져올 길이 없다 — 정직하게
 * > 적는다.** 고르개는 아무것도 안 골랐을 때 편집 링크를 안 그리기 때문이다
 * > (`theme-picker.tsx`의 판정: *"고른 것이 없으면 갈 곳이 없다"*). 시스템 테마 다섯이
 * > 늘 목록에 있으므로 **막다른 길은 아니다**(아무거나 열면 이 상자가 있고, 읽기 전용
 * > 테마에서도 B는 열려 있다 — 아래 `canCreate`). **아직 열린 자리다.**
 *
 * ---
 *
 * # 가져오기 쪽은 **기본이 접혀 있다**
 *
 * 펼쳐 두면 파일 고르개와 `테마 JSON` 상자가 화면 **머리**를 큰 상자로 상시 점유한다. 이 화면은
 * 글자가 빽빽한 화면이고(왼쪽 칸이 세로로 매우 길다) **가져오기는 한 테마를
 * 저작하는 동안 많아야 한두 번 하는 조작**인데, 늘 열려 있으면 저장·되돌리기와 토큰 편집
 * 사이를 가른다. **접으면 이 상자 자신이 262.5px에서 56px이 된다**(진짜 크로미움에서 잰
 * `clientHeight`) — 그만큼이 토큰 편집으로 간다.
 *
 * **판단의 근거는 `panels/page-json-panel.tsx`의 같은 절이 갖는다**(둘이 같은 사고이고 같은
 * 형태다 — 토글 버튼 + `aria-expanded` + 조건부 렌더, `<details>`도 팝오버도 아니다).
 * 여기서만 다른 것 둘만 적는다.
 *
 * - **접힘 밖에 남는 것이 셋이다** — `내보내기`·파일 이름·`마지막 저장으로 되돌리기`, 그리고
 *   파생의 대가를 말하는 줄. 넷 다 **내보내기·저장 쪽**이고 가져오기와 축이 다르다(아래 표).
 *
 *   **여기서 그쪽 절을 그대로 가져오면 안 된다.** 그쪽의 `페이지 내보내기`는 토글과 **같은
 *   줄**이라 접어서 버는 값이 0px이지만, **여기 셋은 토글과 다른 줄이라 26.5px이다**(크로미움에서
 *   잰 `clientHeight`). 그래도 밖에 두는 근거는 값이 아니라 이 둘이다:
 *
 *   1. **접으려면 토글이 하나 더 필요하다.** 이 셋은 가져오기가 아니라 `테마 JSON 가져오기`
 *      라는 이름 아래로 들어갈 수 없다. 그리고 새 토글은 다시 버튼 한 줄을 차지한다 — 접힌
 *      이 상자 56px이 그 셋의 줄(26.5px)과 토글 줄로 거의 다 차므로, 버튼 한 줄은 벌려는
 *      26.5px과 같은 자릿수다. **26.5px을 벌어 대부분을 도로 쓴다.**
 *   2. **축이 다르고 훨씬 자주 쓴다.** 저장·되돌리기는 한 테마를 저작하는 동안 계속 쓰는
 *      조작이고 가져오기는 많아야 한두 번이다. 되돌리기는 **저장의 짝**이라 저장이 막히는
 *      상태(읽지 못한 글자)에서 손이 가는 자리이기도 하다. *"읽지 못한 글자에서
 *      빠져나오는 **유일한** 문"*은 아니다 — 상자를 비우거나 JSON을 고쳐도 빠져나온다(브라우저에서
 *      재현된다). 밖에 두는 이유는 유일해서가 아니라 축과 빈도다.
 * - **결과(`OutcomeView`)도 접힘 밖이다.** *"초안에 넣었습니다"*는 폼을 접은 뒤에 읽는 문장이고,
 *   거절 이유는 파일을 고치러 가는 사람이 읽는 문장이다.
 *
 * ---
 *
 * # 무엇이 무엇을 막는가 — **축이 셋이다**
 *
 * | 조작 | 막는 축 | 왜 |
 * |---|---|---|
 * | **내보내기** | 아무것도 안 막는다 | 읽기 전용 테마를 내보내는 것이 「테마 관리」의 *"회사 디자인 시스템을 … 프로젝트마다 재사용한다"*의 출발점이다. 시스템 테마를 내보내 고쳐서 새 테마로 가져오는 길이 여기서 열린다 |
 * | **A. 초안에 넣기 · 되돌리기** | `locked` | 초안을 바꾸는 조작이다 |
 * | **B. 새 테마로** | `canCreate` | **다른 축이다** — 시스템 테마를 열어 둔 owner는 그 초안을 못 고치지만 새 테마는 만들 수 있다(`DeriveButton`이 정확히 그 상태에서 산다) |
 */
import { useState, type ReactElement } from 'react'
import type { Theme, ThemeIssue } from '@wirebound/themes'
import { useThemeDraft, useThemeDraftStore } from '../store/use-theme-draft'
import { resolveDraft } from './draft-css'
import { downloadTextFile, readTextFile } from '../files/file-io'
import { ThemeIssueList, blocksSave } from './theme-issues'
import { exportFileName, exportText, fromImport } from './theme-io'

/** 이 상자가 낸 마지막 결과. 없으면 아무것도 안 그린다. */
type Outcome =
  /** 글자를 못 읽었거나 봉투가 아니다. **초안은 안 건드렸다.** */
  | { kind: 'unreadable'; message: string }
  /** 읽었는데 그 문서가 안 선다. 초안은 안 건드렸다. */
  | { kind: 'rejected'; message: string; issues: readonly ThemeIssue[] }
  /** 넣었다. `notes`는 *"넣었지만 알아야 하는 것"*이다(아래 `notesFor`). */
  | { kind: 'applied'; message: string; notes: readonly string[] }

interface PanelProps {
  /** 초안을 고칠 수 없는가. A와 되돌리기를 막는다. */
  locked: boolean
  /** 새 테마를 만들 수 있는가. **`locked`와 다른 축이다** — 머리말의 표 참고. */
  canCreate: boolean
  /**
   * B(새 테마로). **던지면 이 화면이 그 문안을 보인다** — `DeriveButton`과 같은 형식이다.
   * 성공하면 라우트가 새 테마의 주소로 옮기므로 이 화면은 사라진다.
   */
  onImportAsNew: (theme: Theme) => Promise<void>
}

/**
 * **초안이 없으면 아무것도 안 그린다.** 본체를 따로 둔 것은 `JsonEditor`가 `SectionEditor`를
 * 가른 것과 같은 형식이고, 여기서는 이유가 하나 더 있다 — 본체가 `draft`를 **`Theme`으로**
 * 받으므로 그 안의 함수들이 `null` 갈래를 다시 세지 않는다.
 */
export function ThemeIoPanel(props: PanelProps): ReactElement | null {
  const store = useThemeDraftStore()
  const draft = useThemeDraft(store, (s) => s.draft)
  if (draft === null) return null
  return <ThemeIoBody {...props} draft={draft} />
}

function ThemeIoBody(props: PanelProps & { draft: Theme }): ReactElement {
  const { draft } = props
  const store = useThemeDraftStore()
  const saved = useThemeDraft(store, (s) => s.saved)
  const base = useThemeDraft(store, (s) => s.base)
  const dirty = useThemeDraft(store, (s) => s.draft !== null && s.draft !== s.saved)
  /**
   * **읽지 못한 절이 있는가.** 되돌리기의 조건이 `dirty` 하나가 아니다 —
   * 아래 버튼의 주석 참고. selector는 원시값을 내야 하므로 배열이 아니라 불린이다
   * (`use-theme-draft.tsx`의 규칙).
   */
  const hasUnreadable = useThemeDraft(store, (s) => s.unreadable.length > 0)

  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingRevert, setConfirmingRevert] = useState(false)
  /** 가져오기 쪽이 펼쳐졌는가. **기본은 접힘이다**(머리말). */
  const [importOpen, setImportOpen] = useState(false)

  /**
   * 대기 글자를 문서로 읽는다. **A와 B가 공유한다.**
   *
   * `fromImport`가 봉투까지 보고, 문서가 서는지는 **화면이 이미 쓰는 `resolveDraft`**가
   * 본다(*"둘 다 검증을 지난다"*). 판정 주체를 새로 만들지 않는 것이 요점이다:
   * 같은 함수가 왼쪽 이슈 상자를 채우고 있으므로 **가져오기가 거절한 이유와 편집 중 검증이
   * 같은 문장으로 나온다.**
   */
  function read(): { theme: Theme } | null {
    const result = fromImport(text)
    if (result.status === 'failed') {
      setOutcome({ kind: 'unreadable', message: result.message })
      return null
    }
    return { theme: result.theme }
  }

  /** A — 초안에 넣는다(아래 되돌리기와 **같은 문**을 쓴다). */
  function applyToDraft(): void {
    const read1 = read()
    if (read1 === null) return
    const incoming = read1.theme

    /**
     * **상속 대상이 바뀌는 가져오기는 여기서 거절한다** — 아래 `notesFor`의 `meta.id`(막지 않는다)와 달리 막는다.
     *
     * 스토어의 `base`는 **서버가 준 문서**다(`GET`의 `detail.base`). 가져온 문서가 다른
     * 시스템 테마를 상속하면 그 `base`로는 해석 자체가 틀린다. 클라이언트가
     * `systemTheme()`으로 base를 스스로 만들 수도 있지만 **그러면 base의 출처가 둘이 되고**,
     * *"같은 것을 두 곳이 따로 말하다가 갈리는"* 부류가 된다.
     *
     * **B가 그 경우를 이미 다룬다** — 서버가 base를 찾아 판정하고, 새 편집 화면이 그것을
     * 받아 온다. 그래서 문안이 B를 가리킨다.
     */
    const currentExtends = extendsOf(draft)
    const incomingExtends = extendsOf(incoming)
    if (incomingExtends !== currentExtends) {
      setOutcome({
        kind: 'rejected',
        message: `상속 대상이 다른 테마입니다(${describeExtends(currentExtends)} → ${describeExtends(incomingExtends)}) — 아래 "새 테마로 가져오기"를 쓰세요.`,
        issues: [],
      })
      return
    }

    const { issues } = resolveDraft(incoming, base)
    if (blocksSave(issues)) {
      setOutcome({
        kind: 'rejected',
        message: '이 문서는 테마로 서지 않습니다 — 초안을 바꾸지 않았습니다.',
        issues,
      })
      return
    }

    // **`replaceDraft`를 부르는 자리는 여기와 되돌리기 둘이다** — 되돌리기도 같은 문이다.
    store.replaceDraft(incoming)
    setOutcome({
      kind: 'applied',
      message: '초안에 넣었습니다 — 갤러리로 확인한 뒤 저장하세요.',
      notes: notesFor(incoming, draft),
    })
  }

  /** B — 새 테마로 만든다. */
  async function importAsNew(): Promise<void> {
    const read1 = read()
    if (read1 === null) return

    setBusy(true)
    try {
      /**
       * **slug를 사용자가 정한다.** 파일의 `meta.id`가 이 프로젝트에 이미 있으면 서버가
       * 409를 내는데(`(project_id, slug)` 유일성), 그것을 그대로 보이면
       * *"파일을 고쳐서 다시 가져오세요"*가 되어 도구가 아니다.
       *
       * **형식은 클라이언트가 다시 안 본다** — `DeriveButton`과 같은 판단이다
       * (*"규칙을 두 곳에 두면 어긋난다"*). 빈 값만 막고 나머지는 서버의 400·409가 말한다.
       */
      await props.onImportAsNew({ ...read1.theme, meta: { ...read1.theme.meta, id: slug } })
      // 성공하면 라우트가 새 주소로 옮긴다 — 이 화면은 그때 사라지므로 결과를 안 남긴다.
    } catch (caught) {
      setOutcome({
        kind: 'rejected',
        message: caught instanceof Error ? caught.message : '새 테마를 만들지 못했습니다',
        // **서버가 422 봉투에 이슈를 싣는다**(`themeValidationFailed`). `ApiErrorIssue`가
        // `ThemeIssue`의 부분집합이 아니라 캐스트가 필요한 것은 라우트의 `SaveTools`와
        // 같은 자리다.
        issues: issuesOf(caught),
      })
    } finally {
      setBusy(false)
    }
  }

  /**
   * 되돌리기. **가져오기와 같은 문(`replaceDraft`)을 쓴다.**
   *
   * ## **묻는다. 다만 `window.confirm`이 아니다**
   *
   * 이 버튼은 *"저장 안 한 변경"*을 **되돌릴 수 없게** 만드는 유일한 버튼이다.
   * *"들고 나갈 때 알리되 막지 않는다"*(`routes/theme-editor.tsx`의 머리말)와 성격이 다르다 — 그쪽은 사용자가
   * **떠나는** 조작이고 이쪽은 **버리는** 조작이다.
   *
   * - **2단계 버튼이다.** `window.confirm`은 이 저장소에 **0건**이고(검산:
   *   `grep -rn 'window\.confirm(' apps/web/src` → 0), 블로킹 다이얼로그는 브라우저·확장·
   *   모바일에서 억제될 수 있다.
   *
   *   > **검산을 `grep -rn "confirm(" …`으로 하면 1이 나온다** — 걸리는 것이
   *   > **이 주석 자신**이다. 명령이 자기 문서를 세는 형태다.
   *   > `api-consumers.test.ts`가 *"소스를 세는 검사는 그 검사 자신이 세어지면 안 된다"*로
   *   > 적어 둔 함정과 같은 것이다. `project-crud`의 삭제 확인도 *"모달이 아니라 그 항목 자리에 연다"*는
   *   같은 판단이다(`shell.css`의 그 절).
   * - **버릴 것이 없으면 애초에 못 누른다**(`dirty`가 아니면 `disabled`). 그때는 물을
   *   것도 없다.
   */
  function revert(): void {
    if (saved === null) return
    store.replaceDraft(saved)
    setConfirmingRevert(false)
    setOutcome(null)
  }

  const exportable = exportFileName(draft)
  const derivedFrom = extendsOf(draft)

  return (
    <section className="wb-shell-theme-io" aria-label="가져오기·내보내기">
      <div className="wb-shell-theme-io-row">
        <button
          type="button"
          className="wb-shell-theme-action"
          onClick={() => downloadTextFile(exportable, exportText(draft))}
        >
          내보내기
        </button>
        <span className="wb-shell-theme-io-file">{exportable}</span>
        {/* **되돌리기는 저장의 짝이라 같은 줄에 둔다.** */}
        {confirmingRevert ? (
          <span className="wb-shell-theme-io-confirm" role="status">
            저장 안 한 변경과 읽지 못한 글자를 버립니다.
            <button type="button" className="wb-shell-theme-action" onClick={revert}>
              되돌립니다
            </button>
            <button
              type="button"
              className="wb-shell-theme-action"
              onClick={() => setConfirmingRevert(false)}
            >
              그만둡니다
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="wb-shell-theme-action"
            /**
             * **`dirty`만으로 가르면 못 빠져나오는 자리가 생긴다.**
             *
             * 파싱 실패는 초안을 안 바꾸므로 `dirty`가 아니다. 그런데 그 상태에서는
             * **저장도 막혀 있다**(`json-editor.tsx`의 «파싱 실패와 검증 실패를 가른다»). 즉 *"고칠 수 없는 글자가 남았는데 되돌릴 수도
             * 없다"*가 된다 — 손으로 원래 JSON을 다시 쳐야 빠져나온다.
             *
             * **되돌리기가 정확히 그 문이다.** `replaceDraft(saved)`가 스토어의
             * `unreadable`을 비우고 상자들을 다시 마운트시키므로(스토어의 `draftEpoch`)
             * 글자가 저장본으로 돌아온다.
             */
            disabled={props.locked || (!dirty && !hasUnreadable)}
            onClick={() => setConfirmingRevert(true)}
          >
            마지막 저장으로 되돌리기
          </button>
        )}
      </div>

      {/* **파생의 대가를 내보내는 자리에서 말한다.** 봉투에는 안 적는다
          (`theme-io.ts`의 머리말이 후보 셋을 놓고 고른 근거를 든다). */}
      {derivedFrom !== null && (
        <p className="wb-shell-theme-io-note">
          이 테마는 <code>{derivedFrom}</code>을 상속합니다 — 합치지 않고 덮어쓴 값만 나갑니다.
          받는 쪽의 내장 테마가 다르면 <strong>같은 파일이 다른 테마가 됩니다.</strong>
        </p>
      )}

      {/* **가져오기는 여기서부터다.** 위의 셋(내보내기·파일 이름·되돌리기)과 파생 줄은 접힘
          밖이고, 아래 결과 상자도 밖이다 — 근거는 머리말. */}
      <div className="wb-shell-theme-io-row">
        <button
          type="button"
          className="wb-shell-theme-action"
          aria-expanded={importOpen}
          onClick={() => setImportOpen((was) => !was)}
        >
          테마 JSON 가져오기
        </button>
      </div>

      {importOpen && (
        <div className="wb-shell-theme-io-import" role="group" aria-label="테마 JSON 가져오기">
          <div className="wb-shell-theme-io-row">
            <label className="wb-shell-theme-field">
              테마 파일
              <input
                className="wb-shell-theme-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file === undefined) return
                  void readTextFile(file).then(
                    (read1) => {
                      setText(read1)
                      setOutcome(null)
                    },
                    // 파일 자체를 못 읽는 것(권한·삭제)과 내용이 JSON이 아닌 것은 다르다.
                    (error: unknown) => {
                      /**
                       * **대기 글자를 비운다.**
                       *
                       * 안 비우면 화면은 *"파일을 읽지 못했습니다"*라고 말하는데 대기 글자에는 **앞에
                       * 읽힌 것**이 그대로 남아, 그 상태로 *"초안에 넣기"*를 누르면 **고르지도
                       * 않은 앞 문서**가 들어간다(대기 글자가 남고 · 넣기 버튼 `disabled=false` ·
                       * 누르면 초안 이름이 앞 파일의 것이 된다).
                       *
                       * 스토어의 `unreadable`이 막는 부류와 같다 —
                       * *"화면이 못 읽었다고 말하는데 조작은 마지막으로 읽힌 값에 대해 일어난다."*
                       */
                      setText('')
                      setOutcome({
                        kind: 'unreadable',
                        message: error instanceof Error ? error.message : '파일을 읽지 못했습니다',
                      })
                    },
                  )
                }}
              />
            </label>
          </div>

          <label className="wb-shell-theme-io-paste">
            테마 JSON
            {/* **테마 전문을 JSON으로 붙여 넣는 길은 여기다** — 파일 고르기와 **같은 대기 글자**를
                채운다. */}
            <textarea
              className="wb-shell-theme-json-input"
              value={text}
              rows={4}
              spellCheck={false}
              onChange={(event) => {
                setText(event.target.value)
                setOutcome(null)
              }}
            />
          </label>

          <div className="wb-shell-theme-io-row">
            <button
              type="button"
              className="wb-shell-theme-action"
              disabled={props.locked || text.trim() === ''}
              onClick={applyToDraft}
            >
              초안에 넣기
            </button>
            <label className="wb-shell-theme-field">
              가져올 테마의 id
              <input
                className="wb-shell-theme-input"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="wb-shell-theme-action"
              disabled={!props.canCreate || busy || slug === '' || text.trim() === ''}
              onClick={() => void importAsNew()}
            >
              새 테마로 가져오기
            </button>
          </div>
        </div>
      )}

      {outcome !== null && <OutcomeView outcome={outcome} />}
    </section>
  )
}

/** 결과 하나. **거절과 성공을 다른 무게로 읽게 한다.** */
function OutcomeView(props: { outcome: Outcome }): ReactElement {
  const { outcome } = props
  if (outcome.kind === 'applied') {
    return (
      <div className="wb-shell-theme-io-outcome">
        <p role="status">{outcome.message}</p>
        {outcome.notes.length > 0 && (
          <ul className="wb-shell-theme-io-notes">
            {outcome.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="wb-shell-theme-io-outcome">
      <p role="alert">{outcome.message}</p>
      {/* **거절한 이유를 `path`까지 보인다** — 편집 중 검증과 **같은 상자 모양**이다.
          제목이 다르므로 셋이 한 화면에 떠도 갈린다(`ThemeIssueList`가 제목을 `<h2>`로 세우는
          까닭이 여기서 하중이 된다). */}
      {outcome.kind === 'rejected' && (
        <ThemeIssueList title="가져오기가 거절한 이유" issues={outcome.issues} />
      )}
    </div>
  )
}

/**
 * 넣었지만 알아야 하는 것. **막지 않고 말한다** — 이 저장소가 여러 자리에서 고른 형태다
 * (편집기를 들고 나갈 때 *"알리되 막지 않는다"*, `DeriveButton`의 slug 형식).
 */
function notesFor(incoming: Theme, previous: Theme): string[] {
  const notes: string[] = []

  /**
   * **`meta.id`가 바뀌는 것을 막지 않는다.**
   *
   * 서버가 그 규칙을 이미 갖고 있고 **스스로 그렇게 판정했다** —
   * `routes/themes.ts`의 `PUT`: *"`meta.id`를 바꾸면 slug도 바뀐다 — 그 자체를 막을 근거가
   * 없고, 충돌하면 아래 409가 말한다."* 클라이언트가 다시 막으면 규칙이 두 곳이 되고,
   * **막는 쪽이 틀리면 할 수 있는 일을 못 하게 된다**(`blocksSave`의 주석이 같은 비대칭을
   * 적었다). 409 문안은 `SaveTools`의 실패 상자가 그대로 보인다.
   */
  const nextId = idOf(incoming)
  const previousId = idOf(previous)
  if (nextId !== previousId) {
    notes.push(
      `테마 id가 ${previousId ?? '(없음)'}에서 ${nextId ?? '(없음)'}로 바뀝니다 — 이 프로젝트에 이미 쓰는 id면 저장이 거절됩니다.`,
    )
  }

  /**
   * **폰트 리소스는 함께 오지 않는다. 알리고 막지 않는다.**
   *
   * `spec/assets.ts`가 `src`의 **문법만** 보고 리소스를 가져오지 않는다. 다른 기계에서
   * 만든 테마의 `local()`이나 상대 URL은 **여기서 없을 수 있다.** 막을 수는 없다 —
   * 그것이 참인지 알려면 실제로 받아 봐야 하고, 그것은 가져오기가 아니라
   * `@font-face`가 브라우저에서 도는 시점의 일이다.
   */
  const fonts = fontCount(incoming)
  if (fonts > 0) {
    notes.push(
      `폰트 ${fonts}종을 선언한 테마입니다 — 폰트 파일은 함께 오지 않습니다. src의 URL이 이 환경에서 열리는지 확인하세요.`,
    )
  }

  return notes
}

/**
 * 아래 넷은 **초안이 검증을 안 지났을 수 있다는 사실**을 다룬다. 타입은 `Theme`이지만
 * JSON 에디터가 모양이 어긋난 값을 일부러 통과시키므로(`json-editor.tsx`의 «파싱 실패와 검증 실패를 가른다») `meta` 자체가 없을 수
 * 있다 — `theme-io.ts`의 `exportFileName`이 같은 이유로 같은 형태를 쓴다.
 */
function extendsOf(theme: Theme): string | null {
  const value: unknown = (theme as { meta?: { extends?: unknown } }).meta?.extends
  return typeof value === 'string' ? value : null
}

function idOf(theme: Theme): string | null {
  const value: unknown = (theme as { meta?: { id?: unknown } }).meta?.id
  return typeof value === 'string' ? value : null
}

function fontCount(theme: Theme): number {
  const value: unknown = (theme as { assets?: { fonts?: unknown } }).assets?.fonts
  return Array.isArray(value) ? value.length : 0
}

function issuesOf(caught: unknown): readonly ThemeIssue[] {
  const value: unknown = (caught as { issues?: unknown }).issues
  return Array.isArray(value) ? (value as ThemeIssue[]) : []
}

/** `extends`가 없는 것도 상태다 — 문장에서 빈칸이 되지 않게 이름을 준다. */
function describeExtends(value: string | null): string {
  return value ?? '상속 없음'
}
