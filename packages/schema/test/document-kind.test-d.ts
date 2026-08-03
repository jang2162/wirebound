import type { LayoutDocument, PageDocument, WbNode } from '../src/node'

const root: WbNode = { id: 'n_000000000001', type: 'Page' }

// 리터럴로는 양쪽 다 만들 수 있다
const page: PageDocument = { version: 1, root }
const layout: LayoutDocument = { version: 1, root }

// 서로 대입되지 않는다
// @ts-expect-error 레이아웃을 페이지 자리에 대입할 수 없다
const wrong1: PageDocument = layout
// @ts-expect-error 페이지를 레이아웃 자리에 대입할 수 없다
const wrong2: LayoutDocument = page

// 검증 함수가 종류를 구분한다
declare function validatePageStub(doc: PageDocument): void
// @ts-expect-error 레이아웃을 페이지 검증기에 넣을 수 없다
validatePageStub(layout)

// 합성 함수의 인자 뒤바꿈이 잡힌다
declare function composeStub(page: PageDocument, layout: LayoutDocument): string
composeStub(page, layout)
// @ts-expect-error 인자 순서가 뒤바뀌었다
composeStub(layout, page)

// 유니온을 받는 함수는 양쪽 다 받는다
declare function anyStub(doc: PageDocument | LayoutDocument): void
anyStub(page)
anyStub(layout)

void [wrong1, wrong2]
