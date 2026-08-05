import { installCatalog, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, renderNode, type NodeRenderError } from '../src/render'
import { registerStructure, resetStructures } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  resetStructures()

  registerStructure('Page', 'default', ({ attrs, children }) => <div {...attrs}>{children}</div>)
  registerStructure('Text', 'default', ({ attrs, props }) => (
    <p {...attrs}>{String(props.content)}</p>
  ))
  registerStructure('List', 'table', ({ attrs }) => <table {...attrs} />)
  // List의 'mediaList'·'cardGrid'는 일부러 등록하지 않는다 — 카탈로그에는 있지만
  // 구현이 없는 조합을 만들기 위해서다.
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
    // 형제는 폴백이 아니라 제 구조로 그려졌다.
    expect(html).toContain(
      '<p data-wb-id="n_000000000003" data-wb-component="Text" data-wb-structure="default">살아남은 형제</p>',
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

  it('구현되지 않은 구조도 폴백이다', () => {
    const html = markup(
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'mediaList' } }),
    )

    expect(errorMessages(html)).toEqual(['구현되지 않은 구조: List:mediaList'])
  })

  it('카탈로그에 없는 구조를 지정해도 폴백이다', () => {
    // resolveStructure가 던지던 경로다. 테마가 오타난 구조를 지정해도 화면이 남아야 한다.
    const html = markup(
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'bogus' } }),
    )

    expect(errorMessages(html)).toEqual(['List에 없는 구조입니다: bogus'])
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
    // 캔버스(태스크 9)가 id로 노드를 찾아 선택한다. 폴백에도 같은 엘리먼트에 있어야 한다.
    const html = markup(renderNode({ id: 'n_000000000042', type: 'NoSuchThing' }))

    expect(html).toMatch(/<div[^>]*data-wb-id="n_000000000042"[^>]*data-wb-error=/)
  })

  it('폴백은 메시지를 눈에 보이게 표시한다', () => {
    // 속성에만 있으면 사용자는 화면에서 이유를 알 수 없다.
    const html = markup(renderNode({ id: 'n_000000000001', type: 'NoSuchThing' }))

    expect(html).toContain('>알 수 없는 컴포넌트 타입: NoSuchThing<')
  })
})
