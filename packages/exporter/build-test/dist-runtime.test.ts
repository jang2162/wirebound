// @vitest-environment jsdom
/**
 * **실제로 나가는 것을 잰다**(P8-3 리뷰 발견 2).
 *
 * ---
 *
 * ## 왜 이 파일이 필요한가 — 자가 산출물을 안 재고 있었다
 *
 * `assets/runtime.js`는 `installRuntime.toString()`으로 만들어진다. 그래서 **그 함수를
 * 무엇이 트랜스파일했는지에 따라 글자가 달라진다:**
 *
 * | 어디서 | 무엇이 옮겼나 |
 * |---|---|
 * | `test/**`(vitest) | vite의 **esbuild** |
 * | **받는 쪽이 쓰는 것**(`dist/index.js`) | tsdown의 **rolldown** |
 *
 * 즉 `test/runtime-bundle.test.ts`가 아무리 눌러 봐도 **그것은 받는 쪽이 받는 글자가
 * 아니다.** 리뷰가 그 갈림을 실측으로 짚었다. 이 저장소가 반복해 만난 부류이고(*"자와
 * 대상이 갈린다"*), P8-2 이월 §8이 *"`dist`가 로드되는지 지키는 케이스가 아직 없다"*고
 * 이름 붙여 넘긴 자리이기도 하다.
 *
 * **그래서 여기서는 `dist`를 그대로 불러 번들을 만들고, 그 번들이 낸 `runtime.js`를
 * 그대로 돌린다.** 같은 명제를 **받는 쪽의 글자**에 대고 다시 재는 것이다.
 *
 * ## 자기 이름으로 자기를 부른다
 *
 * `apps/playground`가 이 패키지를 의존하지 않아 그쪽을 cwd로 쓸 수 없다(P8-2 이월 §8).
 * 대신 **절대 경로로 `dist/index.js`를 직접 부른다** — vitest의 alias가 패키지 이름을
 * `src`로 돌리므로 이름으로 부르면 또 소스를 재게 된다.
 *
 * `pnpm test`에는 안 들어간다(`--project '!build'`). `pnpm test:build`가 돌린다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// **`import.meta.url`을 안 쓴다** — jsdom 환경에서는 그것이 `file:` 스킴이 아니라
// `fileURLToPath`가 던진다(실측). vitest의 cwd는 루트 설정이 사는 저장소 뿌리다.
const repoRoot = process.cwd()
const distPath = resolve(repoRoot, 'packages/exporter/dist/index.js')
const distEntry = pathToFileURL(distPath).href

/** `dist`가 내는 것 중 이 파일이 쓰는 것만. */
interface DistExporter {
  exportBundle: (options: {
    pages: readonly {
      title: string
      document: unknown
      comments?: readonly { nodeId: string; body: string }[]
      target?: string
    }[]
  }) => { files: { path: string; content: string }[]; errors: unknown[] }
}

/**
 * **미리 그린 판이 실려야 상호작용이 동작한다.** 중첩까지 넣는다 — 자리 하나로 재면
 * 섞여도 안 죽는다.
 */
const DOC = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_btn',
        type: 'Button',
        props: { label: '검색' },
        marker: 1,
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
              { type: 'switchTab', target: 'n_tabs', tab: 1 },
              { type: 'setVisible', target: 'n_card', value: false },
            ],
          },
        ],
      },
      {
        id: 'n_outer',
        type: 'Card',
        props: { title: '겉' },
        interactions: [
          {
            on: 'click',
            actions: [{ type: 'setProp', target: 'n_outer', prop: 'subtitle', value: '겉눌림' }],
          },
        ],
        children: [
          {
            id: 'n_inner',
            type: 'Button',
            props: { label: '속' },
            interactions: [
              {
                on: 'click',
                actions: [{ type: 'setProp', target: 'n_inner', prop: 'label', value: '속눌림' }],
              },
            ],
          },
        ],
      },
      { id: 'n_list', type: 'List', props: {}, marker: 2 },
      { id: 'n_tabs', type: 'Tabs', props: { tabs: ['ㄱ', 'ㄴ'], active: 0 } },
      { id: 'n_card', type: 'Card', props: { title: '회원' } },
    ],
  },
}

/**
 * 나가는 `assets/runtime.js`의 상한. **UTF-8 바이트다.**
 *
 * **자는 여기 산다.** 이 수가 이월 문서에 산문으로 적혀 있으면 아무도 안 지킨다.
 * 상한이므로 조금 늘어도 안 죽고, **자산이 배로 커지면 죽는다.**
 *
 * **단위가 바이트인 것이 판정이다.** `String.length`는 UTF-16 코드유닛이라 한국어가 든
 * 글자에서는 실제 바이트보다 **작게 나온다** — P8-3 이월이 넘긴 수가 그 함정에 빠졌고,
 * 리뷰가 다른 수를 재서 그것을 짚었다. 이 저장소는 파일 이름에서 이미 같은 판정을 했다
 * (`bundle/filename.ts` — *"ext4는 바이트 255다"*). 받는 쪽이 세는 것도 바이트다.
 */
const RUNTIME_BUDGET_BYTES = 16_000

/** UTF-8 바이트 수. `String.length`가 아니다(위 상한의 머리말). */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

let files: { path: string; content: string }[]

beforeAll(async () => {
  execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], {
    cwd: repoRoot,
    stdio: 'pipe',
  })
  const dist = (await import(/* @vite-ignore */ distEntry)) as DistExporter
  files = dist.exportBundle({
    pages: [
      {
        title: '회원 목록',
        document: DOC,
        target: 'page:회원/목록',
        comments: [{ nodeId: 'n_list', body: '기본 정렬은 가입일 역순' }],
      },
    ],
  }).files
}, 300_000)

function fileAt(path: string): string {
  const found = files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  return found.content
}

function load(): void {
  const parsed = new DOMParser().parseFromString(fileAt('pages/회원-목록.html'), 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
  new Function(fileAt('assets/runtime.js'))()
}

function press(nodeId: string): void {
  const target = document.querySelector(`.wb-export-canvas [data-wb-id="${nodeId}"]`)
  if (target === null) throw new Error(`누를 노드가 없습니다: ${nodeId}`)
  target.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
}

describe('dist가 낸 번들 (받는 쪽이 받는 글자다)', () => {
  it('순수 dist가 §11.3의 파일 트리를 낸다', () => {
    expect(files.map((file) => file.path)).toEqual([
      'index.html',
      'pages/회원-목록.html',
      'assets/shell.css',
      'assets/theme.css',
      'assets/runtime.js',
    ])
  })

  /**
   * **소스에서 만든 글자와 다르다는 것을 여기서 못박는다.** 같다고 믿고 소스만 재는 것이
   * 리뷰가 짚은 사고였다 — 다르다는 사실이 케이스로 남아 있어야 다음 사람이 안 속는다.
   */
  it('나가는 runtime.js가 소스를 vitest가 옮긴 것과 같은 글자가 아니다', async () => {
    const fromSource = (await import('../src/runtime/plan')).RUNTIME_JS
    expect(fromSource.length).toBeGreaterThan(0)
    expect(fileAt('assets/runtime.js')).not.toBe(fromSource)
  })

  it('나가는 runtime.js가 고전 스크립트다', () => {
    const js = fileAt('assets/runtime.js')
    expect(js).not.toMatch(/\bimport\s/)
    expect(js).not.toMatch(/\bexport\s/)
    expect(js).not.toContain('cssRules')
  })

  it('나가는 runtime.js가 상한 안이다', () => {
    expect(utf8Bytes(fileAt('assets/runtime.js'))).toBeLessThan(RUNTIME_BUDGET_BYTES)
  })

  /** 상한이 실제로 무언가를 재는지. 0바이트짜리를 통과시키면 아무것도 안 재는 것이다. */
  it('나가는 runtime.js가 비어 있지 않다 — 카나리아', () => {
    expect(utf8Bytes(fileAt('assets/runtime.js'))).toBeGreaterThan(1_000)
  })

  /**
   * **한국어가 들었으므로 바이트가 유닛보다 크다.** 이 케이스가 있어야 누가 상한을
   * `String.length`로 되돌렸을 때 죽는다 — 그것이 이월의 수를 틀리게 만든 함정이다.
   */
  it('바이트가 UTF-16 유닛보다 크다 — 단위가 실제로 갈린다', () => {
    const js = fileAt('assets/runtime.js')
    expect(utf8Bytes(js)).toBeGreaterThan(js.length)
  })
})

describe('나가는 글자를 실제로 돌린다', () => {
  it('누르면 setProp·switchTab·setVisible이 반영된다', () => {
    load()
    press('n_btn')
    const canvas = document.querySelector('.wb-export-canvas')!
    expect(canvas.querySelector('[data-wb-id="n_list"]')?.getAttribute('data-wb-state')).toBe(
      'loading',
    )
    expect(
      [...canvas.querySelectorAll('[data-wb-id="n_tabs"] [data-wb-part="tab"]')].map((tab) =>
        tab.getAttribute('aria-selected'),
      ),
    ).toEqual(['false', 'true'])
    expect(canvas.querySelector('[data-wb-id="n_card"]')).toBeNull()
  })

  it('중첩된 규칙이 안에서 밖으로 다 돈다', () => {
    load()
    press('n_inner')
    const canvas = document.querySelector('.wb-export-canvas')!
    expect(canvas.querySelector('[data-wb-id="n_inner"]')?.textContent).toBe('속눌림')
    expect(
      canvas.querySelector('[data-wb-id="n_outer"] [data-wb-part="subtitle"]')?.textContent,
    ).toBe('겉눌림')
  })

  it('번호 마커를 그린다', () => {
    load()
    expect(
      [...document.querySelectorAll('.wb-export-marker')].map((badge) => [
        badge.getAttribute('data-wb-marker-for'),
        badge.textContent,
      ]),
    ).toEqual([
      ['n_btn', '1'],
      ['n_list', '2'],
    ])
  })

  /** 소스 파일에도 날 제어 바이트가 없어야 하듯, **나가는 자산에도** 없어야 한다. */
  it('나가는 자산에 날 제어 바이트가 없다', () => {
    for (const file of files) {
      expect(CONTROL_BYTES.test(file.content), file.path).toBe(false)
    }
  })
})

/** 날 제어 바이트. **소스에 날로 적지 않는다** — census가 이 파일도 훑는다. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

/** 이 파일이 진짜 `dist`를 봤는지. 경로가 어긋나면 위가 전부 공허하게 통과한다. */
describe('자가 dist를 본다 — 카나리아', () => {
  it('cwd가 저장소 뿌리다', () => {
    expect(existsSync(resolve(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
  })

  it('dist/index.js가 실재하고 소스가 아니다', () => {
    expect(existsSync(distPath), distPath).toBe(true)
    const text = readFileSync(distPath, 'utf8')
    expect(text.length).toBeGreaterThan(1_000)
    expect(text).not.toContain('from \'@wirebound/schema\'')
  })
})
