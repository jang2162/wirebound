/**
 * **카탈로그 설치가 번들의 계약이다.**
 *
 * `installCatalog()`를 빠뜨린 번들에서 무엇이 조용해지고 무엇이 시끄러운지를 가른다.
 *
 * ---
 *
 * **렌더 경로의 관찰값은 *조용하지* 않다 — 시끄럽다.** 레지스트리가 빈 채로 그리면
 * 렌더러의 모양 가드가 노드마다 폴백을 그리고 `errors`에 담는다(아래 첫 케이스가 그 값을
 * 든다).
 *
 * > **`validatePage`도 침묵 쪽이 아니다.** 카탈로그가 없으면 `validatePage`는 **노드마다
 * > `unknown-type`을 낸다** — 그쪽도 시끄럽다. **조용해지는 것은 `invalid-props` 한
 * > 종뿐이고**, 그것도 사라지는 이유가 *"props 스키마를 아는 것이 카탈로그"*라 물음 자체가
 * > 성립하지 않아서다. 아래 `validatePage` 절이 그 둘을 값으로 든다.
 *
 * **진짜 침묵은 상호작용 판정**(`checkNodeAction`)의 것이다 — 카탈로그 없이 판정하면 깨진
 * 규칙이 아무 말 없이 지나가고 없는 prop이 그대로 얹힌다. `exportBundle`은 그것을 부르지
 * 않고 번들 런타임이 브라우저에서 부른다(렌더러의 상호작용 런타임) — 런타임의 진입(`browser/runtime.tsx`)이 스스로 설치하는
 * 것은 `build-test/runtime-dist.test.ts` 가 나가는 글자로 잰다(설치가 없으면 노드가 폴백으로 그려진다).
 *
 * **그래도 계약을 세우는 이유는 침묵이 아니라 산출물이다.** 폴백이 든 HTML은 **눈으로는
 * 그럴듯한 한 장**이고, 그것이 남에게 전달된다. 그리고 `installCatalog`는
 * **이미 등록된 것을 건너뛰므로**(멱등) 부르는 것이 남의 등록을 덮지 않는다 —
 * 값을 잃을 위험이 없는 쪽에서 잊을 수 있는 자리를 없앤다.
 *
 * **이 파일은 전역 레지스트리를 비운다.** 케이스마다 자기 몸통에서 비우므로 실행 순서에
 * 기대지 않고, vitest가 파일 단위로 모듈을 격리하므로 다른 파일에 새지 않는다.
 */
import { NO_THEME, renderDocument } from '@wirebound/renderer'
import { installCatalog, listComponents, resetRegistry, validatePage, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [{ id: 'n_000000000002', type: 'List' }],
  },
}

/** 아무것도 설치되지 않은 상태로 되돌린다. */
function empty(): void {
  resetRegistry()
  expect(listComponents()).toEqual([])
}

describe('설치 없이 부르면 무엇이 관찰되는가', () => {
  /**
   * **렌더러를 맨손으로 부른 값이다.** `exportBundle`이 아니라 `renderDocument`를 직접
   * 부른다 — 이것이 계약이 없을 때의 관찰값이고, 아래 케이스들이 그것과 갈리는지 본다.
   */
  it('renderDocument를 맨손으로 부르면 노드마다 폴백이다', () => {
    empty()
    const errors: { nodeId: string; type: string; message: string }[] = []
    const html = renderToStaticMarkup(renderDocument(DOC, { theme: NO_THEME, onNodeError: (error) => errors.push(error) }))

    expect(errors).toEqual([
      { nodeId: 'n_000000000002', type: 'List', message: '알 수 없는 컴포넌트 타입: List' },
      { nodeId: 'n_000000000001', type: 'Page', message: '알 수 없는 컴포넌트 타입: Page' },
    ])
    expect(html).toContain('data-wb-error="알 수 없는 컴포넌트 타입: Page"')
    expect(html).not.toContain('data-wb-component=')
  })
})

/** 번들 한 벌 — 런타임은 글자만 둔다(여기서 재는 것은 설치와 구조 판정이다). */
function bundle() {
  return exportBundle({ pages: [{ title: '회원 목록', document: DOC }], runtimeJs: '/* runtime */' })
}

/**
 * **번들이 설치를 계약으로 든다** — 번들은 목업을 그리지 않지만 기본 뷰로도 못 그리는 노드를 서버에서 센다(`errors` — `bundle/index.ts`
 * 의 `structuralErrors`). 설치 없이 세면 위 첫 케이스처럼 노드마다 «알 수 없는 컴포넌트»가 선다.
 */
describe('exportBundle이 설치를 계약으로 든다', () => {
  it('아무것도 설치되지 않은 채 불려도 구조 판정이 조용하다', () => {
    empty()
    expect(bundle().errors).toEqual([])
  })

  it('부른 뒤에는 레지스트리가 차 있다', () => {
    empty()
    bundle()

    expect(listComponents().length).toBeGreaterThan(0)
  })

  /**
   * **멱등이라 남의 등록을 덮지 않는다.** 이미 설치된 뒤에 다시 불러도 던지지 않고
   * (`registerComponent` 자신은 중복 등록에 던진다) 결과가 같다.
   */
  it('이미 설치돼 있으면 두 번 불러도 같다', () => {
    empty()
    installCatalog()
    const before = listComponents().length

    const first = bundle()
    const second = bundle()

    expect(second.files).toEqual(first.files)
    expect(listComponents().length).toBe(before)
  })
})

/**
 * **`validatePage`가 카탈로그 없이 무엇을 내는가.**
 *
 * 번들은 이 함수를 부르지 않는다. 그래도 여기서 재는 것은 **머리말이 계약의 근거로
 * 쓴 문장**(무엇이 조용해지나)**이 참인지**가 걸려 있기 때문이고, 산문으로만 적으면 다시
 * 낡는다.
 */
describe('카탈로그가 없을 때 validatePage는 시끄럽다', () => {
  const PROPS_DOC: PageDocument = {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'List', props: { 없는프롭: 1 } },
        { id: 'n_000000000003', type: 'Text', props: { content: 'ㄱ' } },
      ],
    },
  }

  function codesOf(): string[] {
    return validatePage(PROPS_DOC).map((issue) => `${issue.severity} ${issue.code} ${issue.path}`)
  }

  it('설치돼 있으면 깨진 prop 하나를 짚는다', () => {
    empty()
    installCatalog()
    expect(codesOf()).toEqual(['error invalid-props /root/children/0/props'])
  })

  /**
   * **노드마다 하나씩 난다.** 세는 단위를 문장으로 못박는다 — *"문서의 노드 하나당
   * `unknown-type` 하나"*. 그래서 수를 손으로 적지 않고 노드 경로로 든다.
   */
  it('설치 안 돼 있으면 노드마다 unknown-type을 낸다 — 조용하지 않다', () => {
    empty()
    expect(codesOf()).toEqual(['error unknown-type /root', 'error unknown-type /root/children/0', 'error unknown-type /root/children/1'])
  })

  /**
   * **조용해지는 것은 `invalid-props` 한 종뿐이다.** 그 코드가 사라지는 이유는 props
   * 스키마를 아는 것이 카탈로그라 **물음 자체가 성립하지 않아서**이지, 검사가 봐 놓고
   * 넘어가서가 아니다.
   */
  it('사라지는 코드는 invalid-props 하나뿐이다', () => {
    empty()
    installCatalog()
    const withCatalog = new Set(validatePage(PROPS_DOC).map((issue) => issue.code))

    empty()
    const without = new Set(validatePage(PROPS_DOC).map((issue) => issue.code))

    expect([...withCatalog].filter((code) => !without.has(code))).toEqual(['invalid-props'])
    expect([...without].filter((code) => !withCatalog.has(code))).toEqual(['unknown-type'])
  })
})
