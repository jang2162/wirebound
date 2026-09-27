import { installCatalog, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, renderNode, type NodeRenderError } from '../src/render'

beforeAll(() => {
  installCatalog()
})

function markup(element: ReturnType<typeof renderNode>): string {
  return renderToStaticMarkup(element)
}

/**
 * 마크업에서 폴백 메시지만 뽑는다. 폴백 개수를 세는 데도 쓴다.
 * React가 속성값에 넣은 HTML 엔티티는 되돌린다 — 원래 메시지와 비교해야 하기 때문이다.
 */
function errorMessages(html: string): string[] {
  return [...html.matchAll(/data-wb-error="([^"]*)"/g)].map((m) =>
    m[1]!
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&'),
  )
}

describe('렌더 실패 폴백', () => {
  it('알 수 없는 타입은 던지지 않고 폴백을 그린다', () => {
    const node: WbNode = { id: 'n_000000000001', type: 'NoSuchThing' }

    let html = ''
    expect(() => {
      html = markup(renderNode(node))
    }).not.toThrow()

    expect(errorMessages(html)).toEqual(['알 수 없는 컴포넌트 타입: NoSuchThing'])
  })

  it('폴백 메시지는 한국어다', () => {
    // items는 min(0)이라 -1이면 zod가 거른다. 로케일을 주지 않으면
    // "Too small: expected number to be >=0"이 나온다.
    const html = markup(renderNode({ id: 'n_000000000001', type: 'List', props: { items: -1 } }))

    const message = errorMessages(html)[0]!
    // 콜론 뒤가 zod가 만든 부분이다. 앞부분("List의 props가…")은 우리가 쓴 한국어라
    // 전체 문자열에 한글이 있는지만 보면 zod 부분이 영문이어도 통과한다.
    const fromZod = message.slice(message.indexOf(':') + 1)
    expect(fromZod).toMatch(/[가-힣]/)
    expect(fromZod).not.toMatch(/Too small|expected|Invalid input/i)
  })

  it('props 폴백 메시지는 validate.ts의 invalid-props 메시지와 글자까지 같다', () => {
    // 검증 경로가 둘(서버 검증·렌더)인데 문구가 갈라지면 사용자가 같은 문제를
    // 다른 문제로 읽는다. 어느 쪽이 바뀌어도 이 테스트가 깨진다.
    // 이슈를 둘 만든다 — 하나만 틀리면 이슈를 잇는 ', '와 경로 표기가 검사되지 않는다.
    const broken: WbNode = {
      id: 'n_000000000002',
      type: 'List',
      props: { items: -1, columns: 5 },
    }
    const doc: PageDocument = {
      version: 1,
      root: { id: 'n_000000000001', type: 'Page', children: [broken] },
    }

    const issue = validatePage(doc).find((i) => i.code === 'invalid-props')
    expect(issue).toBeDefined()
    expect(errorMessages(markup(renderNode(broken)))).toEqual([issue!.message])
  })

  it('props가 잘못돼도 형제 노드는 정상으로 그려진다', () => {
    const html = markup(
      renderNode({
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'List', props: { items: -1 } },
          { id: 'n_000000000003', type: 'Text', props: { content: '살아남은 형제' } },
        ],
      }),
    )

    // 폴백은 깨진 노드 하나뿐이다.
    expect(errorMessages(html)).toHaveLength(1)
    expect(html).toContain('data-wb-id="n_000000000002"')
    // 형제는 폴백이 아니라 제 뷰로 그려졌다.
    expect(html).toContain(
      // `data-wb-variant="body"`는 `role`의 기본값에서 파생된다(`variantFrom`).
      '<p data-wb-structure="default" data-wb-id="n_000000000003" data-wb-component="Text" data-wb-variant="body">살아남은 형제</p>',
    )
  })

  it('깨진 노드의 자식은 폴백 안에 그대로 그려진다', () => {
    const html = markup(
      renderNode({
        id: 'n_000000000001',
        type: 'NoSuchThing',
        children: [{ id: 'n_000000000002', type: 'Text', props: { content: '자식은 살아남는다' } }],
      }),
    )

    expect(html).toContain('data-wb-component="Text"')
    expect(html).toContain('자식은 살아남는다')
    // 자식이 폴백 '옆'이 아니라 '안'에 있다는 확인: 자식 엘리먼트를 닫자마자
    // 폴백이 닫히고 마크업이 끝난다. 형제로 붙였다면 </p>로 끝난다.
    expect(html).toMatch(/<\/p><\/div>$/)
  })

  it('onNodeError가 노드마다 불린다', () => {
    const errors: NodeRenderError[] = []

    markup(
      renderNode(
        {
          id: 'n_000000000001',
          type: 'Page',
          children: [
            { id: 'n_000000000002', type: 'NoSuchThing' },
            { id: 'n_000000000003', type: 'List', props: { items: -1 } },
            { id: 'n_000000000004', type: 'Text', props: { content: '정상' } },
          ],
        },
        { onNodeError: (error) => errors.push(error) },
      ),
    )

    expect(errors.map((e) => e.nodeId)).toEqual(['n_000000000002', 'n_000000000003'])
    expect(errors.map((e) => e.type)).toEqual(['NoSuchThing', 'List'])
    expect(errors[0]!.message).toBe('알 수 없는 컴포넌트 타입: NoSuchThing')
  })

  it('정상 문서는 폴백을 그리지 않고 onNodeError도 안 부른다', () => {
    const errors: NodeRenderError[] = []
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Text', props: { content: '본문' } },
          { id: 'n_000000000003', type: 'List', props: { items: 3 } },
        ],
      },
    }

    const html = markup(renderDocument(doc, { onNodeError: (error) => errors.push(error) }))

    expect(html).not.toContain('data-wb-error')
    expect(errors).toEqual([])
    // 폴백이 없는 게 "아무것도 안 그렸기 때문"이 아님을 확인한다.
    expect(html).toContain('본문')
    expect(html).toContain('data-wb-component="List"')
  })

  it('폴백에도 data-wb-id가 있다', () => {
    // 캔버스가 id로 노드를 찾아 선택한다. 폴백에도 같은 엘리먼트에 있어야 한다.
    const html = markup(renderNode({ id: 'n_000000000042', type: 'NoSuchThing' }))

    expect(html).toMatch(/<div[^>]*data-wb-id="n_000000000042"[^>]*data-wb-error=/)
  })

  it('폴백은 메시지를 눈에 보이게 표시한다', () => {
    // 속성에만 있으면 사용자는 화면에서 이유를 알 수 없다.
    const html = markup(renderNode({ id: 'n_000000000001', type: 'NoSuchThing' }))

    expect(html).toContain('>알 수 없는 컴포넌트 타입: NoSuchThing<')
  })
})

/**
 * 여기부터는 "노드가 아닌 것"이 들어오는 경우다. 타입은 `WbNode`를 요구하지만 이 렌더러가
 * 받는 문서는 서버 검증 전에 낙관적 패치가 지나간 것이라(설계서 「정방향 흐름」) 일시적으로 타입을
 * 만족하지 않을 수 있다. 이 자리에서 던지면 캔버스가 흰 화면이 된다.
 */
describe('모양이 깨진 노드', () => {
  it('root가 없는 문서도 던지지 않고 폴백을 그린다', () => {
    // 낙관적 패치가 /root를 지운 중간 상태. 여기서 TypeError가 나면 캔버스가 흰 화면이 된다.
    const doc = { version: 1 } as PageDocument

    let html = ''
    expect(() => {
      html = markup(renderDocument(doc))
    }).not.toThrow()

    expect(errorMessages(html)).toEqual(['노드가 객체가 아닙니다: undefined'])
  })

  it('문서 자체가 없어도 던지지 않고 폴백을 그린다', () => {
    // 캔버스가 문서를 받기 전에 한 번 그리는 경우.
    let html = ''
    expect(() => {
      html = markup(renderDocument(undefined as unknown as PageDocument))
    }).not.toThrow()

    expect(errorMessages(html)).toEqual(['노드가 객체가 아닙니다: undefined'])
  })

  it('id·type이 문자열이 아닌 노드도 폴백이다', () => {
    const noId = { type: 'Text', props: { content: '무시된다' } } as unknown as WbNode
    const noIdHtml = markup(renderNode(noId))
    expect(errorMessages(noIdHtml)).toEqual(['노드의 id가 문자열이 아닙니다'])
    // id를 읽지 못했으므로 data-wb-id는 빈 문자열이다. 캔버스가 [data-wb-id]로
    // 훑는다면 빈 id를 선택 대상으로 삼지 않도록 걸러야 한다.
    expect(noIdHtml).toContain('data-wb-id=""')

    const badType = { id: 'n_000000000042', type: 42 } as unknown as WbNode
    const badTypeHtml = markup(renderNode(badType))
    expect(errorMessages(badTypeHtml)).toEqual(['노드의 type이 문자열이 아닙니다'])
    // type만 깨진 경우 id는 읽을 수 있다 — 캔버스가 이 노드를 선택해서 고칠 수 있어야 한다.
    expect(badTypeHtml).toContain('data-wb-id="n_000000000042"')
  })

  it('children이 배열이 아니면 자식 없이 그리고 던지지 않는다', () => {
    const node = {
      id: 'n_000000000001',
      type: 'Page',
      children: '자식이 아니다',
    } as unknown as WbNode

    let html = ''
    expect(() => {
      html = markup(renderNode(node))
    }).not.toThrow()

    // 노드 자신은 멀쩡하므로 폴백이 아니라 제 뷰로 그려진다. 자식만 없다.
    expect(errorMessages(html)).toEqual([])
    expect(html).toBe(
      '<div data-wb-structure="default" data-wb-id="n_000000000001" data-wb-component="Page"></div>',
    )
  })

  it('children 배열의 null 원소는 그 자리만 폴백이 된다', () => {
    const node = {
      id: 'n_000000000001',
      type: 'Page',
      children: [null, { id: 'n_000000000003', type: 'Text', props: { content: '살아남은 형제' } }],
    } as unknown as WbNode

    let html = ''
    expect(() => {
      html = markup(renderNode(node))
    }).not.toThrow()

    expect(errorMessages(html)).toEqual(['노드가 객체가 아닙니다: null'])
    // 형제는 제 뷰로 그대로 그려진다 — 구멍 하나가 배열 전체를 죽이지 않는다.
    expect(html).toContain(
      // `data-wb-variant="body"`는 `role`의 기본값에서 파생된다(`variantFrom`).
      '<p data-wb-structure="default" data-wb-id="n_000000000003" data-wb-component="Text" data-wb-variant="body">살아남은 형제</p>',
    )
  })

  it('onNodeError는 renderDocument가 돌아오기 전에 트리 전체를 보고한다', () => {
    // RenderOptions.onNodeError의 주석이 권하는 패턴("지역 배열에 모아 같은 렌더에서
    // 바로 쓴다")은 이 성질에 기대고 있다. 자식 렌더가 지연되면(컴포넌트로 감싸는 등)
    // 성질이 조용히 깨지고, 그러면 배너가 한 렌더 늦게 뜬다.
    const errors: NodeRenderError[] = []
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'NoSuchThing' },
          {
            id: 'n_000000000003',
            type: 'Page',
            children: [{ id: 'n_000000000004', type: 'AlsoNoSuchThing' }],
          },
        ],
      },
    }

    // renderToStaticMarkup을 부르기 전에 단언한다.
    renderDocument(doc, { onNodeError: (error) => errors.push(error) })

    expect(errors.map((e) => e.nodeId).sort()).toEqual(['n_000000000002', 'n_000000000004'])
  })
})
