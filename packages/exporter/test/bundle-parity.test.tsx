// @vitest-environment jsdom
/**
 * **번들의 목업이 `exportPage`가 낸 문서와 정확히 같은가.**
 *
 * ---
 *
 * # 왜 이 견주기가 *"화면과 같다"*를 잇는가
 *
 * `packages/exporter`는 `apps/web`의 캔버스를 볼 수 없으므로 직접 견줄 수 없다. 대신 **사슬**을
 * 잇는다:
 *
 * | 어디 | 무엇을 견주나 |
 * |---|---|
 * | `apps/web/test/canvas/bundle-parity.test.tsx` | 진짜 캔버스 ↔ `exportPage` |
 * | **여기** | `exportPage` ↔ **번들의 페이지** |
 *
 * 둘이 다 참이면 캔버스와 번들이 같다. **그 사슬이 성립하려면 이쪽이 `exportPage`를
 * 재현이 아니라 그대로 불러야 한다** — 그래서 아래는 같은 문서·같은 테마로 두 함수를
 * 부르고 그 결과만 견준다.
 *
 * # 견주는 자와 픽스처를 새로 짜지 않는다
 *
 * `@wirebound/exporter/test-support`의 `describeTree`가 갈림 셋(㉠ `style`의 적는 꼴 ·
 * ㉡ 텍스트 노드 경계 · ㉢ 선언 없는 `style`)만 접는다. 두 벌을 두면 *"같다"*의 뜻이
 * 둘이 된다.
 *
 * # 테마를 하나만 고르지 않는다 — `admin`은 특히
 *
 * `admin`은 카탈로그의 첫 구조와 다른 것을 **하나도 안 고른다**(아래 *"테마가 실제로 구조를
 * 가르는지부터 본다"*가 값으로 든다).
 * 그 테마로만 재면 구조 배선이 끊겨도 안 죽는다. 시스템 테마 **전부**와 *"테마 없음"*을
 * 돌리고, 테마가 실제로 구조를 갈랐는지도 함께 잰다.
 */
import { installStructures } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import {
  resolveTheme,
  systemTheme,
  SYSTEM_THEME_IDS,
  THEME_ISSUE_SEVERITY,
  type ResolvedTheme,
} from '@wirebound/themes'
import {
  broadFixture,
  describeTree,
  slotFixture,
  variantFixture,
} from '@wirebound/exporter/test-support'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import { exportPage } from '../src/page'

beforeAll(() => {
  installCatalog()
  installStructures()
})

function resolved(id: string): ResolvedTheme {
  const { theme, issues } = resolveTheme(systemTheme(id)!)
  const errors = issues.filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  expect(theme).not.toBeNull()
  return theme!
}

function parse(html: string): globalThis.Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** `exportPage`가 그린 문서 뿌리. `body`의 첫 원소가 곧 그것이다(`exportPage`의 계약). */
function pageRoot(page: PageDocument, theme: ResolvedTheme | null): Element {
  const { html } = exportPage({ document: page, title: '견주기', theme })
  const root = parse(html).body.firstElementChild
  if (root === null) throw new Error('페이지에 문서가 없습니다')
  return root
}

/** 번들 안의 한 파일이 그린 문서 뿌리. 셸의 상자들은 `data-wb-id`를 안 달므로 첫 것이 뿌리다. */
function bundleRootIn(bundle: ReturnType<typeof exportBundle>, path: string): Element {
  const file = bundle.files.find((item) => item.path === path)
  if (file === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  const root = parse(file.content).querySelector('[data-wb-id]')
  if (root === null) throw new Error('번들에 문서가 없습니다')
  return root
}

/** 페이지 하나짜리 번들의 문서 뿌리. */
function bundleRoot(page: PageDocument, theme: ResolvedTheme | null, path: string): Element {
  return bundleRootIn(exportBundle({ pages: [{ title: '견주기', document: page }], theme }), path)
}

const FIXTURES: [label: string, make: () => PageDocument][] = [
  ['넓게 덮는 문서', broadFixture],
  ['variant를 전부 쓰는 문서', variantFixture],
]

const THEMES: [label: string, theme: () => ResolvedTheme | null][] = [
  ['테마 없음', () => null],
  ...SYSTEM_THEME_IDS.map(
    (id): [string, () => ResolvedTheme | null] => [id, () => resolved(id)],
  ),
]

describe('번들의 목업이 exportPage의 문서와 같다', () => {
  for (const [themeLabel, makeTheme] of THEMES) {
    for (const [fixtureLabel, makeDocument] of FIXTURES) {
      it(`${themeLabel} · ${fixtureLabel}`, () => {
        const page = makeDocument()
        const theme = makeTheme()
        expect(describeTree(bundleRoot(page, theme, 'pages/견주기.html'))).toEqual(
          describeTree(pageRoot(page, theme)),
        )
      })
    }
  }

  it('index.html이 담은 문서도 같다', () => {
    const page = broadFixture()
    const theme = resolved('portal')
    expect(describeTree(bundleRoot(page, theme, 'index.html'))).toEqual(
      describeTree(pageRoot(page, theme)),
    )
  })
})

/**
 * **번들의 가장 큰 약속** — 페이지 파일 하나를 열면 **그 페이지가** 그려져 있다.
 *
 * **페이지 0만 보는 자로는 이것이 안 재진다.** 셸에 넘기는 트리를 `rendered[index]`에서
 * `rendered[0]`으로 바꿔 **모든 페이지가 첫 페이지의 목업을 그리게 해도**, 페이지 하나짜리
 * 번들(위 견주기)이나 `index.html`·첫 페이지만 보는 자리는 전부 통과한다 — 셋 다 같은
 * 문서이기 때문이다.
 *
 * **세는 단위를 못박는다:** 페이지 파일의 **목록**을 자리까지 견주고(빠지거나 늘면 죽는다),
 * 그 다음 **자리마다** 그 페이지의 `exportPage`와 견준다.
 */
describe('페이지가 여럿이어도 페이지마다 자기 문서를 그린다', () => {
  const MANY: [title: string, make: () => PageDocument][] = [
    ['넓게 덮는 문서', broadFixture],
    ['variant를 전부 쓰는 문서', variantFixture],
    ['Slot을 든 문서', slotFixture],
  ]

  const PATHS = [
    'pages/넓게-덮는-문서.html',
    'pages/variant를-전부-쓰는-문서.html',
    'pages/Slot을-든-문서.html',
  ]

  it('페이지 셋이 각각 자기 문서와 같다', () => {
    const theme = resolved('portal')
    const documents = MANY.map(([, make]) => make())
    const bundle = exportBundle({
      pages: MANY.map(([title], index) => ({ title, document: documents[index]! })),
      theme,
    })

    /**
     * **셋이 서로 다른 그림인지부터 본다.** 같으면 아래 반복이 *"자리마다 제 것"*을 재는
     * 것이 아니라 **아무거나 그려도 통과하는 검사**가 된다 — 위 머리말의 구멍이 정확히
     * 그 모양이다.
     */
    const expected = documents.map((page) => describeTree(pageRoot(page, theme)))
    expect(new Set(expected.map((lines) => lines.join('\n'))).size).toBe(expected.length)

    // 세는 단위 — 파일 목록이 자리까지 같아야 아래 index가 뜻을 갖는다.
    expect(bundle.files.filter((file) => file.path.startsWith('pages/')).map((f) => f.path)).toEqual(
      PATHS,
    )

    for (const [index, path] of PATHS.entries()) {
      expect(describeTree(bundleRootIn(bundle, path)), path).toEqual(expected[index])
    }
  })

  /** `index.html`은 **첫 페이지**를 담는다. 그것도 자리로 재 둔다. */
  it('index.html은 첫 페이지를 담는다 — 아무 페이지나가 아니다', () => {
    const theme = resolved('portal')
    const documents = MANY.map(([, make]) => make())
    const bundle = exportBundle({
      pages: MANY.map(([title], index) => ({ title, document: documents[index]! })),
      theme,
    })
    expect(describeTree(bundleRootIn(bundle, 'index.html'))).toEqual(
      describeTree(pageRoot(documents[0]!, theme)),
    )
  })
})

describe('테마가 실제로 구조를 가르는지부터 본다', () => {
  /**
   * **이 케이스가 없으면 위 견주기가 공허할 수 있다.** 두 경로가 나란히 *"테마 없음"*을
   * 그리면 구조 배선이 끊겨도 두 목록이 같다. 테마마다 문서가 실제로 다른 구조를 그리는지
   * 여기서 센다 — `admin`이 하나도 안 가르는 것까지 값으로 든다.
   */
  it('테마마다 그려진 구조 집합이 있고 admin만 카탈로그 기본과 같다', () => {
    const structuresFor = (theme: ResolvedTheme | null): string[] => {
      const root = bundleRoot(broadFixture(), theme, 'pages/견주기.html')
      return [...root.querySelectorAll('[data-wb-structure]')]
        .map((element) => `${element.getAttribute('data-wb-component')}:${element.getAttribute('data-wb-structure')}`)
        .sort()
    }
    const base = structuresFor(null)
    expect(base.length).toBeGreaterThan(0)

    const differing = SYSTEM_THEME_IDS.filter(
      (id) => JSON.stringify(structuresFor(resolved(id))) !== JSON.stringify(base),
    )
    expect(differing.length).toBeGreaterThan(0)
    expect(differing).not.toContain('admin')
  })
})

describe('셸이 문서에 손대지 않는다', () => {
  /**
   * 견주기는 뿌리 **아래**만 잰다. 셸이 문서를 감싸는 것은 그것으로 안 잡히므로
   * `bundle.test.tsx`가 감싸개를 이름으로 든다. 여기서는 **반대쪽**을 든다 — 셸의 상자에
   * `data-wb-id`가 없다는 것. 그것이 위 `querySelector('[data-wb-id]')`가 문서 뿌리를
   * 집는다는 전제다.
   */
  it('셸의 상자에 data-wb-id가 없다', () => {
    const bundle = exportBundle({
      pages: [{ title: '견주기', document: broadFixture() }],
      theme: resolved('portal'),
    })
    const file = bundle.files.find((item) => item.path === 'pages/견주기.html')!
    const parsed = parse(file.content)
    const first = parsed.querySelector('[data-wb-id]')!
    expect(first.getAttribute('data-wb-component')).toBe('Page')
    for (const shell of [...parsed.querySelectorAll('[class^="wb-export"]')]) {
      expect(shell.hasAttribute('data-wb-id')).toBe(false)
    }
  })
})
