/**
 * **스토어의 페이지 상태를 `useOpenDocument`를 거치지 않고 읽는 것을 막는다.**
 *
 * 무엇을 지키는가. 주소가 바뀐 뒤 문서를 비우는 일은 `routes/editor.tsx`의 passive
 * `useEffect`에 있어 커밋보다 뒤에 돈다. 그 커밋 하나 동안 주소는 새 페이지인데 스토어는
 * 앞 페이지의 문서·`headSeq`·`openPageId`를 그대로 들고 있다. 그것을 걸러 내는 대조가
 * `store/use-editor-store.tsx`의 `useOpenDocument` 한 곳에 있고, **그 한 곳을 지나지 않는
 * 읽기는 대조가 없다.**
 *
 * **왜 테스트인가.** 주석만 있는 규칙은 조용히 깨지고, 깨지면 이 창(주소가 바뀐 커밋에 앞
 * 페이지가 그려진다)이 열린다. 이 저장소에는 린트 도구가 없으므로(설정 0,
 * `scripts` 항목 0) `pnpm test`가 보는 형태로 둔다. 검사 로직은 `./store-access-guard.ts`에
 * 있고, 선례는 셸 CSS 누수 검사(`shell-css.test.ts` + `shell-css-guard.ts`)다.
 *
 * 아래 **심기 표가 이 파일의 요점이다.** "지금 트리에 0건"은 검사가 일한다는 증거가
 * 아니다 — 우회를 하나씩 심어 그것이 실제로 걸리는지를 함께 잰다. 반대편(거짓 양성)은
 * `지금 트리에는 우회가 없다`와 음성 대조 표가 본다.
 *
 * **잡지 못하는 형태는 `store-access-guard.ts` 머리말에 잰 값으로 적어 두었다.**
 * 이 표에 없는 형태가 안전하다는 뜻이 아니다.
 */
import { describe, expect, it } from 'vitest'
import {
  findViolations,
  isExempt,
  scanSources,
  type CheckName,
} from './store-access-guard'

/**
 * `apps/web/src`의 소스 전문. **`?raw`로 원문을 그대로 읽는다** — vite가 파일 내용을
 * 문자열로 넣어 준다.
 *
 * 경로가 어긋나거나 파일이 비면 아래 표가 통째로 헛돈다(`?raw`가 빈 문자열을 넣으면 심기
 * 표가 전부 초록이 된다 — 우회를 빈 소스 뒤에 심어도 잡히는 것은 그대로라 표만으로는 그
 * 사실이 안 보인다). `검사가 진짜 소스를 읽는다`가 그것을 잡는다.
 */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** 심은 우회와, 그것을 물어야 하는 검사. */
const PLANTED: { code: string; check: CheckName }[] = [
  // 셀렉터로 페이지 필드를 곧장 고르는 형태. 앞 페이지가 그려지는 창을 되살리는 가장 짧은 길이다.
  { code: 'const doc = useEditorStore(store, (s) => s.document)', check: 'selector-page-field' },
  { code: 'const seq = useEditorStore(store, (s) => s.headSeq)', check: 'selector-page-field' },
  { code: 'const open = useEditorStore(store, (s) => s.openPageId)', check: 'selector-page-field' },
  // 포맷은 결과를 바꾸지 않는다 — 괄호 없는 화살표, 인자 이름, 타입 주석, 체이닝, 여러 줄.
  { code: 'const root = useEditorStore(store, s => s.document?.root)', check: 'selector-page-field' },
  {
    code: 'const doc = useEditorStore(store, (state: EditorState) => state.document)',
    check: 'selector-page-field',
  },
  { code: 'const doc = useEditorStore(store, ({ document }) => document)', check: 'selector-page-field' },
  { code: 'const doc = useEditorStore(\n  store,\n  (s) => s.document,\n)', check: 'selector-page-field' },
  // 훅을 아예 거치지 않는 형태. 구독 없이 읽으므로 화면이 갱신되지도 않는다.
  { code: 'const doc = store.getState().document', check: 'get-state-page-field' },
  { code: "const doc = store.getState()['document']", check: 'get-state-page-field' },
  { code: 'const seq = useEditorStoreInstance().getState().headSeq', check: 'get-state-page-field' },
  { code: 'const { document } = store.getState()', check: 'get-state-page-field' },
  { code: 'const {\n  headSeq,\n  zoom,\n} = store.getState()', check: 'get-state-page-field' },
  // 상태 **전체**를 고르면 위 둘이 무력해진다 — 필드는 그 뒤 어디서든 읽힌다. 이 형태는
  // 리렌더 폭도 함께 망가뜨린다(`use-editor-store.tsx` 머리말: 다섯 액션 전부에서 리렌더).
  { code: 'const state = useEditorStore(store, (s) => s)', check: 'whole-state-selector' },
  { code: 'const state = useEditorStore(store, (s: EditorState) => s)', check: 'whole-state-selector' },
  // 주석 걷기가 문자열 안의 `//`를 주석 여는 기호로 읽으면 그 뒤가 통째로 안 보인다.
  // 그 자리에 우회를 두어 잰다.
  {
    code: "const url = 'http://example.com'\nconst doc = store.getState().document",
    check: 'get-state-page-field',
  },
  // 템플릿 리터럴 안에서 실행되는 코드. 문자열의 내용을 남기는 덕에 잡힌다
  // (`store-access-guard.ts` 머리말의 "거짓 양성으로 남겨 둔 것"이 같은 성질의 반대편이다).
  { code: 'const label = `${store.getState().document?.root.id ?? ""}`', check: 'get-state-page-field' },
  // 읽지 못하는 형태를 조용히 지나가지 않는다.
  { code: 'const doc = useEditorStore(store, (s) => s.mode', check: 'unreadable' },
]

/**
 * 걸리면 **안 되는** 것들. 심기 표만 있으면 "무조건 위반이라고 하는 검사"도 전부
 * 통과하므로 반대편을 함께 잰다. 여기 있는 것 중 여럿은 지금 트리에 실제로 있는 형태다.
 */
const ALLOWED: string[] = [
  // 페이지에 매이지 않은 필드는 스토어에서 직접 읽는 것이 정상이다. 대조할 주소가 없다.
  'const mode = useEditorStore(store, (s) => s.mode)',
  'const zoom = useEditorStore(store, (s) => s.zoom)',
  'const width = useEditorStore(store, (s) => s.viewportWidth)',
  'const nodeId = useEditorStore(store, (s) => s.selectedNodeId)',
  // 정당한 경로 그 자체.
  'const doc = useOpenDocument(props.pageId)',
  // 스토어에 **싣는** 쪽. 같은 이름이 나오지만 읽는 것이 아니다(`routes/editor.tsx`의 형태).
  'store.loadPage(openPageId, page.schema, page.headSeq)',
  'const page = await api.getPage(projectId, openPageId)',
  'async function load(openPageId: string): Promise<void> {}',
  // 서버 응답 계약. 같은 이름의 필드가 있다(`api/types.ts`의 형태).
  'export interface PageDetail { headSeq: number }',
  // 전역 DOM의 `document`. `main.tsx`와 테스트 헬퍼가 쓰는 형태다.
  "const root = document.getElementById('root')",
  'document.body.querySelector(".wb-shell")',
  // 페이지 필드가 아닌 것을 `getState()`로 읽는 것은 이 검사의 대상이 아니다.
  'const mode = store.getState().mode',
  'const { zoom } = store.getState()',
  // 스토어를 쓰기만 하는 자리.
  'store.clearPage()',
  'store.selectNode(null)',
  'store.reset()',
  // 주석 안의 언급. `routes/editor.tsx`가 실제로 `s.document`를 주석에 적고 있고,
  // `use-editor-store.tsx`의 머리말에는 `(s) => s`가 코드 블록으로 들어 있다.
  '// 셋이 `s.document`를 곧장 읽게 하면 앞 페이지가 그려진다',
  '/* store.getState().document 를 쓰지 마라 */',
  '// const state = useEditorStore(store, (s) => s)',
]

describe('스토어 페이지 상태 우회 검사', () => {
  it('검사가 진짜 소스를 읽는다', () => {
    // `?raw`가 빈 문자열을 넣거나 glob 경로가 어긋나면 아래 표가 통째로 헛돈다.
    // **실제 파일 안에 있는 우회 형태로 확인한다** — `use-editor-store.tsx`는 대조를 하는
    // 곳이라 제외 대상이지만, 그 파일 안에는 `(s) => s.document`가 실제로 있다. 제외를
    // 걷고 검사하면 위반이 나온다.
    const source = SOURCES['../src/store/use-editor-store.tsx']
    expect(source).toContain('export function useOpenDocument')
    expect(findViolations(source ?? '').map((violation) => violation.check)).toContain(
      'selector-page-field',
    )
  })

  it('제외 파일 둘을 실제로 걸러 낸다', () => {
    // 위 케이스가 보듯 제외 파일에는 우회 형태가 들어 있다. 제외가 이름만 맞고 실제로
    // 걸러 내지 않으면 `지금 트리에는 우회가 없다`가 그 파일 때문에 죽는다 —
    // 그때 이 케이스가 "제외가 문제"라고 먼저 말한다.
    const exempt = Object.keys(SOURCES).filter((path) => isExempt(path))

    expect([...exempt].sort()).toEqual([
      '../src/store/editor-store.ts',
      '../src/store/use-editor-store.tsx',
    ])
  })

  it('지금 트리에는 우회가 없다', () => {
    // 실패하면 메시지에 어느 파일의 어느 조각인지가 그대로 나온다.
    expect(scanSources(SOURCES)).toEqual([])
  })

  it('검사가 도는 파일이 열 개를 넘고 그중에 아는 파일이 있다', () => {
    // 위 케이스가 "0건"인 이유가 **파일을 하나도 안 봤기 때문**일 수 있다. glob이 아무것도
    // 잡지 못하면 `scanSources`는 조용히 빈 배열을 낸다. 수를 못박지 않는 것은 파일을
    // 더할 때 이 케이스가 이유 없이 깨지지 않게 하기 위해서다 — 이름도 단언이 실제로 재는
    // 만큼만 말한다.
    const scanned = Object.keys(SOURCES).filter((path) => !isExempt(path))

    expect(scanned.length).toBeGreaterThan(10)
    expect(scanned).toContain('../src/routes/editor.tsx')
    expect(scanned).toContain('../src/panels/property-panel.tsx')
  })

  describe('우회를 심으면 잡는다', () => {
    it.each(PLANTED)('$check ← $code', ({ code, check }) => {
      const violations = findViolations(`${SOURCES['../src/canvas/canvas.tsx'] ?? ''}\n${code}\n`)
      expect(violations.map((violation) => violation.check)).toContain(check)
    })
  })

  describe('대상이 아닌 것은 물지 않는다', () => {
    it.each(ALLOWED)('%s', (code) => {
      expect(findViolations(`${SOURCES['../src/canvas/canvas.tsx'] ?? ''}\n${code}\n`)).toEqual([])
    })
  })

  it('위반 메시지가 갈 수 있는 길을 지목한다', () => {
    // **가드가 길을 지목하지 못하면 다음 사람은 가드를 무력화한다.** `useOpenDocument`는
    // `PageDocument | null`만 내주므로 `headSeq`·`openPageId`에는 그 훅이 답이 아니고,
    // 편집이 `headSeq`를 `baseSeq`로 쓰므로 **그것을 곧장 읽는 자리는 반드시 걸린다.**
    // 위 심기 표는 `check` 이름만 보므로 메시지가 조용히 되돌아가도 알려 주지 않는다 —
    // 그래서 여기서 따로 잡는다.
    for (const field of ['headSeq', 'openPageId']) {
      const violations = findViolations(`useEditorStore(store, (s) => s.${field})`)
      expect(violations[0]?.message, field).toContain('src/store/use-editor-store.tsx')
    }

    // `document`에는 곧장 쓸 훅이 있으므로 그쪽을 지목한다. **둘이 갈리는 것이 요점이다** —
    // 한 문장으로 뭉뚱그리면 `headSeq`를 읽는 사람이 없는 훅을 찾아 헤맨다.
    const document = findViolations('useEditorStore(store, (s) => s.document)')
    expect(document[0]?.message).toContain('useOpenDocument(pageId)')
    expect(document[0]?.message).not.toContain('src/store/use-editor-store.tsx')

    // **메시지를 만드는 자리는 셋이다** — selector 하나와 `getState()` 둘(프로퍼티 접근,
    // 구조 분해). 자리마다 문장을 따로 조립하므로 **셋을 각각 봐야 한다**: 둘만 보면 구조
    // 분해 자리의 메시지는 조용히 되돌아갈 수 있다(그 자리만 관문을 가리키지 않는 문장으로
    // 바꾸면 아래 둘째 단언만 죽는다).
    expect(findViolations('const s = store.getState().headSeq')[0]?.message).toContain(
      'src/store/use-editor-store.tsx',
    )
    expect(findViolations('const { headSeq } = store.getState()')[0]?.message).toContain(
      'src/store/use-editor-store.tsx',
    )
  })

  it('알려진 오탐 — 이름만 보는 판정의 대가다', () => {
    // 페이지 필드와 **같은 이름이 스토어가 아닌 것에 붙어 있으면** 걸린다. 아래 둘에서
    // `document`·`headSeq`는 각각 undo 스택 항목과 pending 항목의 프로퍼티다.
    // **이 부류가 둘뿐이라는 뜻이 아니다** — guard 머리말이 다섯을 심어 잰 값을 적고 있고,
    // 여기 둘은 그중 성질이 갈리는 둘(체이닝 / 콜백 안)을 골라 온 것이다.
    //
    // 좁히지 않기로 한 근거는 `store-access-guard.ts`의 `checkSelectors` 주석에 있다
    // (좁히면 오탐 다섯이 사라지는 대신 사각 하나가 남는데, 그 하나가 이 검사의 핵심 형태
    // 위에 나는 조용한 구멍이다 — 실측).
    //
    // **이 케이스가 죽는 것은 검사를 좁혔다는 뜻이다.** 그때는 그 사각이 생기지 않았는지
    // 함께 재라.
    for (const selector of [
      '(s) => s.undoStack.at(-1)?.document',
      '(s) => s.pending.some((p) => p.headSeq < base)',
    ]) {
      const violations = findViolations(`useEditorStore(store, ${selector})`)
      expect(violations.map((violation) => violation.check), selector).toEqual([
        'selector-page-field',
      ])
    }
  })
})
