/**
 * **뷰어 셸의 마크업.** 설계서 「설계서 화면 구조」의 3분할을 정적 HTML로 세운다.
 *
 * ```
 * ┌──────────────┬────────────────────────────┬──────────────────┐
 * │ 페이지 트리   │  목업                       │ [설명|코멘트|상호]│
 * └──────────────┴────────────────────────────┴──────────────────┘
 * ```
 *
 * ---
 *
 * ## 페이지마다 셸을 통째로 갖는다
 *
 * 설계서 「HTML 정적 번들」의 파일 목록은 *"`index.html`이 셸이고 페이지를 싣는다"*로도 읽히지만 그쪽은
 * `file://`에서 iframe 제약이 크고, 무엇보다 **번들에는 서버가 없다.** 각 페이지가 셸을
 * 가지면 **페이지 하나를 열면 그것만으로 완전하다** — 링크를 그대로 남에게 줄 수 있다.
 *
 * **대가는 중복이다.** 셸 마크업이 페이지 수만큼 반복되고, 트리 네비가 페이지 전부를 드니
 * **한 페이지의 크기가 페이지 수에 비례한다** — 번들 전체로는 제곱이다. 그 값을 실제로
 * 재서 `test/bundle-size.test.ts`가 든다.
 *
 * ## 우측 탭 셋과 번호 마커
 *
 * 탭은 「설계서 화면 구조」의 **뷰 모드** 구성이다: 페이지 설명 · 코멘트 · 상호작용.
 * `apps/web`의 `PANEL_TABS.view`와 같은 셋이다.
 *
 * **셸은 번호 마커를 목업 위에 겹쳐 그리지 않는다.** 마커는 노드의 **자리**를 알아야 하는데 목업은 브라우저가 그린다 —
 * 런타임이 그린 뒤에 렌더러의 `markerPoint` 로 잰다(`browser/mount.tsx`). 셸이 그리는 것은 **번호와 노드의 목록**(코멘트 탭)이고
 * 각 줄에 `data-wb-marker-for` · `data-wb-marker` 를 싣는다. 런타임의 마커는 같은 출처(`commentEntries`)에서 지은 페이지 JSON 의
 * `markers` 로 그린다.
 *
 * **상호작용 탭은 `schema`의 문장화가 낸 문장을 그린다**(`../sentences`의 `pageSentences` —
 * 설계서 「자동 문장화」가 *"우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다"*고 적는다).
 * 실제 동작은 `runtime.js`이고, **문장화는 순수 함수라 런타임과 무관하다.**
 *
 * ## 목업 자리는 비어 있다
 *
 * `.wb-export-canvas` 는 비어 있고 `runtime.js` 가 채운다(`bundle/index.ts` 머리말). 스크립트가 없으면 `<noscript>` 한 줄이 선다 —
 * 설계서 뷰어라 받아들인다(spec 「HTML 번들 — 브라우저 렌더」).
 */
import {
  DEFAULT_VIEW_STATE,
  viewStateName,
  viewStateOrder,
  type InteractionSentence,
  type PageDocument,
  type ViewState,
} from '@wirebound/schema'
import type { ReactElement, ReactNode } from 'react'
import type { CommentEntry } from './comments'
// **문장화는 `../sentences`가 한 자리에서 한다** — 여기서 다시 짜면 PPTX와 갈린다.
import {
  EMPTY_COMMENTS,
  EMPTY_DESCRIPTION,
  EMPTY_INTERACTIONS,
  MARKER_WITHOUT_COMMENT,
  PANEL_TABS,
  STATE_SWITCH_LABEL,
  type PanelTabId,
} from '../labels'
import { EXPORT_GLOBAL, PAGE_DATA_ID, STATE_SELECT_ID, THEME_SCRIPT_ID } from '../page-data'
import { pageSentences } from '../sentences'

/** 좌측 트리의 한 줄. */
export interface ShellNavItem {
  title: string
  /** 이 파일에서 그 페이지로 가는 상대 링크. `bundleHref`가 만든다. */
  href: string
  /** 지금 보고 있는 페이지인가. `aria-current="page"`가 된다. */
  current: boolean
}

export interface ShellInput {
  nav: readonly ShellNavItem[]
  /**
   * 「페이지 JSON」 봉투의 `page.description`. **없으면 빈 상태를 말한다** — 탭 자체는
   * 「설계서 화면 구조」가 든다.
   */
  description: string | null
  comments: readonly CommentEntry[]
  /** 문장화의 재료. 셸이 문서를 받아 스스로 문장을 만든다 — 호출자가 두 번 순회하지 않는다. */
  page: PageDocument
  /** `<body>` 끝에 얹을 `<script>` 들. `shellScripts`가 만든다. */
  scripts: ReactNode
}

/** 번들 페이지에서 목업이 스크립트로만 서는 것을 말하는 줄 — 스크립트가 꺼진 브라우저에서만 보인다. */
export const NOSCRIPT_LINE = '이 설계서의 화면은 자바스크립트로 그립니다'

/**
 * `<body>` 끝에 얹는 스크립트. **차례대로 돈다** — 모두 일반 스크립트이고 `defer` · `async` 가 없다.
 *
 * | 무엇 | 왜 |
 * |---|---|
 * | `type="application/json"`인 페이지 JSON | **실행되지 않는다.** 값이므로 코드일 이유가 없다 |
 * | `assets/runtime.js` | 공유 런타임 전역을 세운다 — 테마 번들보다 먼저여야 한다(`browser/runtime.tsx`) |
 * | `assets/theme/theme.js`(테마가 있을 때) | 테마 번들이 공유 런타임에 등록한다. 런타임이 **이 스크립트의 등록만** 받는다(`id`) |
 * | 인라인 `boot()` | 페이지를 세운다 |
 *
 * `file://`에서 **외부 모듈 스크립트가 CORS로 막히므로** `type="module"`을 쓰지 않는다(spec 「`.wbtheme` 파일」).
 *
 * **데이터를 `scriptJson`으로 심는다.** `<script>`는 raw text 요소라 파서가 문자열
 * 안을 안 보고 `</script>`에서 그대로 끊긴다 — 그 규칙은 그 함수가 든다.
 * `type="application/json"`이어도 파서에게는 같은 raw text다.
 */
export function shellScripts(input: { dataJson: string; runtimeHref: string; themeHref: string | null }): ReactElement {
  return (
    <>
      <script
        type="application/json"
        id={PAGE_DATA_ID}
        // React는 `<script>`의 텍스트 자식도 이스케이프한다(`&lt;`). 그러면 JSON이 아니게
        // 되므로 raw로 넣고, 안전은 `scriptJson`이 낸 리터럴이 든다.
        dangerouslySetInnerHTML={{ __html: input.dataJson }}
      />
      <script src={input.runtimeHref} />
      {input.themeHref !== null && <script src={input.themeHref} id={THEME_SCRIPT_ID} />}
      <script dangerouslySetInnerHTML={{ __html: `${EXPORT_GLOBAL}.boot()` }} />
    </>
  )
}

/** 머리의 시트 하나. `sheet` 는 런타임이 찾는 표지다(`theme` — 테마를 못 쓰면 떼고, 실리기를 기다린다). */
export interface ShellSheet {
  href: string
  sheet?: 'theme'
}

/** `<head>`에 얹는 것. **스타일시트 링크뿐이다** — CSS를 인라인하지 않는다. 적은 차례가 곧 겹침이다. */
export function shellHead(stylesheets: readonly ShellSheet[]): ReactElement {
  return (
    <>
      {stylesheets.map((item) => (
        <link key={item.href} rel="stylesheet" href={item.href} data-wb-sheet={item.sheet} />
      ))}
    </>
  )
}

/**
 * 탭 셋. **`../labels`가 소유한다** — PPTX가 같은 이름을 절 제목으로 쓰므로
 * 여기 사본을 두면 둘이 갈린다. 「설계서 화면 구조」가 탭을 늘리면 그 파일 한 줄이지 조건이
 * 아니다.
 */
const TABS = PANEL_TABS

type TabId = PanelTabId

const RADIO_NAME = 'wb-export-tab'

function radioId(tab: TabId): string {
  return `wb-export-tab-${tab}`
}

function panelId(tab: TabId): string {
  return `wb-export-panel-${tab}`
}

/** `<body>` 안 전부. */
export function shellBody(input: ShellInput): ReactElement {
  const sentences = pageSentences(input.page)
  return (
    <>
      <div className="wb-export">
        <nav className="wb-export-nav" aria-label="페이지">
          <p className="wb-export-nav-heading">페이지</p>
          <ul className="wb-export-nav-list">
            {input.nav.map((item) => (
              <li key={item.href} className="wb-export-nav-item">
                <a className="wb-export-nav-link" href={item.href} aria-current={item.current ? 'page' : undefined}>
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="wb-export-mockup">
          <StatePicker viewStates={input.page.viewStates} />
          <div className="wb-export-canvas" />
          <noscript>
            <p className="wb-export-noscript">{NOSCRIPT_LINE}</p>
          </noscript>
          {/* **런타임이 못 한 것을 말하는 자리.** 비어 있고 `hidden`이므로
            스크립트가 없으면 아무것도 아니다 — 번들은 스크립트 없이도 그대로 읽힌다. */}
          <div className="wb-export-status" role="status" aria-live="polite" hidden />
        </main>
        <aside className="wb-export-panel">
          {TABS.map((tab, index) => (
            <input
              key={tab.id}
              className="wb-export-tab-radio"
              type="radio"
              name={RADIO_NAME}
              id={radioId(tab.id)}
              defaultChecked={index === 0}
            />
          ))}
          <div className="wb-export-tablist">
            {TABS.map((tab) => (
              <label key={tab.id} className={`wb-export-tab wb-export-tab-${tab.id}`} htmlFor={radioId(tab.id)}>
                {tab.label}
              </label>
            ))}
          </div>
          <section className="wb-export-tabpanel" id={panelId('description')}>
            <DescriptionTab description={input.description} />
          </section>
          <section className="wb-export-tabpanel" id={panelId('comments')}>
            <CommentTab entries={input.comments} />
          </section>
          <section className="wb-export-tabpanel" id={panelId('interactions')}>
            <InteractionTab sentences={sentences} />
          </section>
        </aside>
      </div>
      {input.scripts}
    </>
  )
}

/**
 * **화면 상태 전환기** — 상태 목록이 있는 페이지만 싣는다(설계서 「HTML 정적 번들」 의 «상태가 없는 페이지는 지금 모양 그대로» — 빈 목록 ·
 * 목록 없음은 아무것도 안 그린다). 기본이 첫 항목이고 상태 트리 차례(`viewStateOrder`)가 뒤따른다 — 하위 상태는 깊이마다 빈칸 둘로 들여
 * 쓴다(`<option>` 은 글자만 받는다 · 앞뒤 공백을 접지 않게 줄바꿈 없는 빈칸). 고르면 런타임이 목업을 다시 그리고 주소 해시를 고친다
 * (`browser/boot.tsx`) — 스크립트가 없으면 목업도 없으므로 전환기만 남는다.
 */
/** 고르개의 하위 상태 들여쓰기 한 단 — 줄바꿈 없는 빈칸 둘. */
const STATE_INDENT = '\u00a0\u00a0'

function StatePicker({ viewStates }: { viewStates: readonly ViewState[] | undefined }): ReactElement | null {
  if (!Array.isArray(viewStates) || viewStates.length === 0) return null
  return (
    <div className="wb-export-states">
      <label className="wb-export-states-label" htmlFor={STATE_SELECT_ID}>
        {STATE_SWITCH_LABEL}
      </label>
      <select className="wb-export-state-select" id={STATE_SELECT_ID} defaultValue={DEFAULT_VIEW_STATE}>
        <option value={DEFAULT_VIEW_STATE}>{viewStateName(viewStates, DEFAULT_VIEW_STATE)}</option>
        {viewStateOrder(viewStates).map(({ state, depth }) => (
          <option key={state.id} value={state.id}>
            {`${STATE_INDENT.repeat(depth)}${state.name}`}
          </option>
        ))}
      </select>
    </div>
  )
}

function DescriptionTab({ description }: { description: string | null }): ReactElement {
  if (description === null) return <p className="wb-export-empty">{EMPTY_DESCRIPTION}</p>
  return <p className="wb-export-description">{description}</p>
}

/**
 * 코멘트 탭. **고아 마커도 줄을 갖는다** — 목업에 ①이 찍혀 있는데 목록이 비어 있으면
 * 읽는 사람이 *"내가 못 찾은 것"*으로 읽는다.
 */
function CommentTab({ entries }: { entries: readonly CommentEntry[] }): ReactElement {
  if (entries.length === 0) return <p className="wb-export-empty">{EMPTY_COMMENTS}</p>
  return (
    <ul className="wb-export-list">
      {entries.map((entry, index) => (
        <li
          key={`${entry.nodeId}-${index}`}
          className="wb-export-entry"
          data-wb-marker-for={entry.nodeId}
          data-wb-marker={entry.marker === null ? undefined : String(entry.marker)}
        >
          <span className="wb-export-entry-label">{entry.label}</span>
          {entry.kind === 'marker-without-comment' ? (
            <p className="wb-export-entry-meta">{MARKER_WITHOUT_COMMENT}</p>
          ) : (
            <>
              <p className="wb-export-entry-body">{entry.body}</p>
              <CommentMeta authorName={entry.authorName} createdAt={entry.createdAt} />
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * 작성자·시각. **둘 다 없으면 줄 자체를 안 그린다** — 빈 자리를 두면 *"이름이 없는
 * 사람"*과 *"이름을 안 실은 경로"*가 같은 화면이 된다.
 */
function CommentMeta({ authorName, createdAt }: { authorName: string | null; createdAt: string | null }): ReactElement | null {
  const parts = [authorName, createdAt].filter((part): part is string => part !== null)
  if (parts.length === 0) return null
  return <p className="wb-export-entry-meta">{parts.join(' · ')}</p>
}

function InteractionTab({ sentences }: { sentences: readonly InteractionSentence[] }): ReactElement {
  if (sentences.length === 0) return <p className="wb-export-empty">{EMPTY_INTERACTIONS}</p>
  return (
    <ul className="wb-export-list">
      {sentences.map((sentence) => (
        <li key={`${sentence.nodeId}-${sentence.index}`} className="wb-export-entry" data-wb-interaction-for={sentence.nodeId}>
          <span className="wb-export-entry-body">{sentence.text}</span>
        </li>
      ))}
    </ul>
  )
}
