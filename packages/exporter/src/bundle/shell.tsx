/**
 * **뷰어 셸의 마크업**(D2·D3·D6). §9의 3분할을 정적 HTML로 세운다.
 *
 * ```
 * ┌──────────────┬────────────────────────────┬──────────────────┐
 * │ 페이지 트리   │  목업                       │ [설명|코멘트|상호]│
 * └──────────────┴────────────────────────────┴──────────────────┘
 * ```
 *
 * ---
 *
 * ## D2 — 페이지마다 셸을 통째로 갖는다
 *
 * §11.3의 파일 목록은 *"`index.html`이 셸이고 페이지를 싣는다"*로도 읽히지만 그쪽은
 * `file://`에서 iframe 제약이 크고, 무엇보다 **번들에는 서버가 없다.** 각 페이지가 셸을
 * 가지면 **페이지 하나를 열면 그것만으로 완전하다** — 링크를 그대로 남에게 줄 수 있다.
 *
 * **대가는 중복이다.** 셸 마크업이 페이지 수만큼 반복되고, 트리 네비가 페이지 전부를 드니
 * **한 페이지의 크기가 페이지 수에 비례한다** — 번들 전체로는 제곱이다. 그 값을 실제로
 * 재서 `test/bundle-size.test.ts`가 든다.
 *
 * ## D3 — 우측 탭 셋과 번호 마커
 *
 * 탭은 §9의 **뷰 모드** 구성이다: 페이지 설명 · 코멘트 · 상호작용. `apps/web`의
 * `PANEL_TABS.view`가 같은 셋이라는 것을 재서 확인했다(재라 #2).
 *
 * **번호 마커를 목업 위에 겹쳐 그리지 않는다 — 판정이다.** 겹layer는 노드의 **자리**를
 * 알아야 하는데 그 자리는 문서에 없다. 캔버스는 그린 뒤에 `getBoundingClientRect`로 잰다
 * (`apps/web`의 `canvas.tsx`). 정적 HTML은 그릴 때 그 값을 모른다.
 *
 * - 문서에 있는 것은 **번호와 노드 id**이고(§4.3의 `marker`), 그 둘로 할 수 있는 것은
 *   **목록**이다. 코멘트 탭이 그것을 그린다.
 * - 겹layer는 P8-3의 `runtime.js`가 잰다. 그래서 이 셸은 각 줄에 `data-wb-marker-for`와
 *   `data-wb-marker`를 실어 **번호와 노드를 짝지어 둔다** — 런타임이 문서를 다시 읽지 않아도
 *   된다.
 *
 * **상호작용 탭은 `describeInteraction`의 문장을 그린다**(§8.2가 *"HTML 번들도 이 문장을
 * 싣는다"*고 적었다). 실제 동작은 P8-3이고, **문장화는 순수 함수라 런타임과 무관하다.**
 */
import { listInteractionSentences, type InteractionSentence } from '@wirebound/schema'
import type { ReactElement, ReactNode } from 'react'
import type { PageDocument } from '@wirebound/schema'
import type { CommentEntry } from './comments'
import { nodesOnly } from '../nodes'

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
  /** §11.2 봉투의 `page.description`. **없으면 빈 상태를 말한다** — 탭 자체는 §9가 든다. */
  description: string | null
  comments: readonly CommentEntry[]
  /** 문장화의 재료. 셸이 문서를 받아 스스로 문장을 만든다 — 호출자가 두 번 순회하지 않는다. */
  page: PageDocument
  /** 가운데에 놓을 그려진 문서. `exportPage`와 **같은 렌더 경로**에서 온 것이다. */
  documentTree: ReactNode
  /** `<body>` 끝에 얹을 `<script>` 둘(P8-3 D7). `shellScripts`가 만든다. */
  scripts: ReactNode
}

/**
 * `<body>` 끝에 얹는 **`<script>` 정확히 둘**(P8-3 D7·D8).
 *
 * 앞 슬라이스는 *"`<script>`를 하나도 안 낸다"*를 지켰다. 상호작용 런타임이 오면서 그
 * 명제가 **거짓이 되는 것이 아니라 좁아진다** — *"정확히 이 둘을 낸다"*로 바꾼다.
 *
 * | 무엇 | 왜 |
 * |---|---|
 * | `type="application/json"`인 데이터 | **실행되지 않는다.** 판정 결과와 미리 그린 판이 값이므로 코드일 이유가 없다 |
 * | `assets/runtime.js`를 가리키는 고전 스크립트 | `file://`에서 **외부 모듈 스크립트가 CORS로 막힌다**(T1의 실측). `type="module"`을 쓰지 않는다 |
 *
 * **데이터를 `scriptJson`으로 심는다**(D8). `<script>`는 raw text 요소라 파서가 문자열
 * 안을 안 보고 `</script>`에서 그대로 끊긴다 — 그 규칙은 이월의 스니펫이 아니라 그 함수가
 * 든다. `type="application/json"`이어도 파서에게는 같은 raw text다.
 */
export function shellScripts(input: { dataJson: string; runtimeHref: string }): ReactElement {
  return (
    <>
      <script
        type="application/json"
        id="wb-export-runtime-data"
        // React는 `<script>`의 텍스트 자식도 이스케이프한다(`&lt;`). 그러면 JSON이 아니게
        // 되므로 raw로 넣고, 안전은 `scriptJson`이 낸 리터럴이 든다.
        dangerouslySetInnerHTML={{ __html: input.dataJson }}
      />
      <script src={input.runtimeHref} defer />
    </>
  )
}

/** `<head>`에 얹는 것. **오늘은 스타일시트 링크뿐이다**(D6 — CSS를 인라인하지 않는다). */
export function shellHead(stylesheets: readonly string[]): ReactElement {
  return (
    <>
      {stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </>
  )
}

/** 탭 셋. **표로 둔다** — §9가 탭을 늘리면 여기 한 줄이지 조건이 아니다. */
const TABS = [
  { id: 'description', label: '페이지 설명' },
  { id: 'comments', label: '코멘트' },
  { id: 'interactions', label: '상호작용' },
] as const

type TabId = (typeof TABS)[number]['id']

const RADIO_NAME = 'wb-export-tab'

function radioId(tab: TabId): string {
  return `wb-export-tab-${tab}`
}

function panelId(tab: TabId): string {
  return `wb-export-panel-${tab}`
}

/**
 * 문장화에 넘길 문서.
 *
 * **`listInteractionSentences`가 `walkNodes`를 쓰고 그 함수는 노드가 객체라고 믿는다** —
 * 자식이 `null`이면 거기서 던진다. 렌더 경로는 그 노드를 **폴백 상자로 그리고** `errors`에
 * 담으므로, 문장화만 던지면 **그리는 데 성공한 페이지가 번들에서 통째로 사라진다.**
 *
 * **앞 판은 그때 문장 목록을 통째로 비웠는데 그것이 D9를 깼다**(P8-3 리뷰 발견 4):
 * 깨진 자식 **하나**가 멀쩡한 규칙들의 문장까지 지우는데 **버튼은 그대로 눌린다** —
 * 런타임 쪽은 견디는 순회를 쓰기 때문이다. 화면이 *"상호작용이 없습니다"*라고 말하면서
 * 실제로는 동작하는 것이고, 그것이 이 저장소가 여섯 번 만난 부류다.
 *
 * **그래서 던지는 원인만 걷어 낸다**(`nodesOnly`). 근거는 그 함수의 머리말에 있다.
 */
function sentencesOf(page: PageDocument): InteractionSentence[] {
  const tree = nodesOnly(page.root)
  if (tree === null) return []
  return listInteractionSentences({ ...page, root: tree })
}

/** `<body>` 안 전부. */
export function shellBody(input: ShellInput): ReactElement {
  const sentences = sentencesOf(input.page)
  return (
    <>
    <div className="wb-export">
      <nav className="wb-export-nav" aria-label="페이지">
        <p className="wb-export-nav-heading">페이지</p>
        <ul className="wb-export-nav-list">
          {input.nav.map((item) => (
            <li key={item.href} className="wb-export-nav-item">
              <a
                className="wb-export-nav-link"
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="wb-export-mockup">
        <div className="wb-export-canvas">{input.documentTree}</div>
        {/* **런타임이 못 한 것을 말하는 자리**(P8-3 D1·D6). 비어 있고 `hidden`이므로
            스크립트가 없으면 아무것도 아니다 — 그것이 D5다. */}
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
            <label
              key={tab.id}
              className={`wb-export-tab wb-export-tab-${tab.id}`}
              htmlFor={radioId(tab.id)}
            >
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

function DescriptionTab({ description }: { description: string | null }): ReactElement {
  if (description === null) return <p className="wb-export-empty">페이지 설명이 없습니다</p>
  return <p className="wb-export-description">{description}</p>
}

/**
 * 코멘트 탭. **고아 마커도 줄을 갖는다**(D4) — 목업에 ①이 찍혀 있는데 목록이 비어 있으면
 * 읽는 사람이 *"내가 못 찾은 것"*으로 읽는다.
 */
function CommentTab({ entries }: { entries: readonly CommentEntry[] }): ReactElement {
  if (entries.length === 0) return <p className="wb-export-empty">코멘트가 없습니다</p>
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
            <p className="wb-export-entry-meta">코멘트가 달려 있지 않습니다</p>
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
 * 작성자·시각. **둘 다 없으면 줄 자체를 안 그린다**(D4) — 빈 자리를 두면 *"이름이 없는
 * 사람"*과 *"이름을 안 실은 경로"*가 같은 화면이 된다.
 */
function CommentMeta({
  authorName,
  createdAt,
}: {
  authorName: string | null
  createdAt: string | null
}): ReactElement | null {
  const parts = [authorName, createdAt].filter((part): part is string => part !== null)
  if (parts.length === 0) return null
  return <p className="wb-export-entry-meta">{parts.join(' · ')}</p>
}

function InteractionTab({
  sentences,
}: {
  sentences: readonly InteractionSentence[]
}): ReactElement {
  if (sentences.length === 0) return <p className="wb-export-empty">상호작용이 없습니다</p>
  return (
    <ul className="wb-export-list">
      {sentences.map((sentence) => (
        <li
          key={`${sentence.nodeId}-${sentence.index}`}
          className="wb-export-entry"
          data-wb-interaction-for={sentence.nodeId}
        >
          <span className="wb-export-entry-body">{sentence.text}</span>
        </li>
      ))}
    </ul>
  )
}
