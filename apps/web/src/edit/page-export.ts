/**
 * 서버가 준 페이지·코멘트를 **§11.2의 파일 한 벌**로 옮긴다(P7-3 T2 — D3·D10).
 *
 * **순수 함수이고 React도 DOM도 `fetch`도 모른다** — `./ops.ts`·`./preset-apply.ts`와 같은
 * 층이다. 파일을 실제로 내려받는 것은 `../files/file-io.ts`, 화면은
 * `../panels/page-json-panel.tsx`다.
 *
 * ---
 *
 * # 봉투 자체는 `packages/schema`가 소유한다 (D1)
 *
 * 이 파일이 하는 일은 **API 타입에서 봉투 타입으로 옮기는 것** 하나다. 봉투의 모양·버전·
 * 파일 이름 규칙은 전부 `@wirebound/schema`의 `page-json/envelope.ts`에 있다 —
 * P9의 `wireb pull`이 같은 봉투를 쓰므로(§12) 그 규칙이 웹에 있으면 두 벌이 된다.
 *
 * ---
 *
 * # 페이지 하나다 (D3)
 *
 * §11.2의 제목이 *"페이지 JSON"*이고 봉투에 `page` 하나가 있다. 여러 페이지는
 * 스냅샷(§4.5)과 HTML 번들(§11.3)의 일이다.
 *
 * ---
 *
 * # 서버가 준 것만 담는다 — **화면의 문서를 섞지 않는다**
 *
 * 스토어의 문서(낙관적 편집이 얹힌 것)와 서버의 코멘트를 섞을 수도 있었다. **안 한다:**
 * 코멘트의 `nodeId`는 **서버의 문서**에 있는 노드를 가리키므로, 화면 쪽 문서에서 그 노드가
 * 방금 지워졌으면 **파일이 만들어지는 순간 끊긴 참조를 담는다.** 한 시점의 서버 상태만
 * 담으면 그 조합이 실재했던 것이 된다.
 *
 * **프리셋 저장(P7-2)이 반대로 고른 것과 어긋나지 않는다.** 그쪽은 요청 **본문**에 노드를
 * 실어 보내므로 *"사용자가 보고 있는 것"*을 담아야 했고(서버가 읽으면 화면과 갈린다),
 * 여기는 **읽기 둘을 같은 순간에** 해서 파일을 만든다 — 담을 것을 고르는 문제가 아니라
 * 두 읽기의 시점을 맞추는 문제다.
 */
import { pageJsonFileName, pageJsonText, toPageJson, type PageJson } from '@wirebound/schema'
import type { Comment, PageDetail } from '../api/types'

export interface PageExport {
  /** 내려받을 파일 이름. */
  fileName: string
  /** 파일의 글자. */
  text: string
  /** 봉투 자체. 케이스가 키를 하나씩 보게 하려고 함께 낸다 — 글자를 다시 파싱하지 않는다. */
  file: PageJson
}

/**
 * 페이지 하나를 파일로 옮긴다.
 *
 * **코멘트에서 나가는 것은 `nodeId`·`body` 둘뿐이다.** 작성자·시각은 봉투에 없다 —
 * `comments.author_id`가 `users`를 참조하므로 **받는 쪽에서 쓸 수 없는 값**이고
 * (가져오기는 작성자를 *"가져온 사람"*으로 둔다), 없는 것을 실으면 받는 쪽이 그것으로
 * 무엇을 할지 규격이 필요해진다. `marker`도 없다 — 번호는 `schema` 안의 노드가 든다(D6).
 *
 * **`schema`는 서버가 준 것 그대로다.** `GET .../pages/:pageId`가 이미 최신 버전으로
 * 올려 주므로(§13.1) 파일에는 **올라간 버전**이 실린다.
 */
export function pageExport(page: PageDetail, comments: readonly Comment[]): PageExport {
  const file = toPageJson({
    page: { title: page.title, description: page.description },
    document: page.schema,
    comments: comments.map((comment) => ({ nodeId: comment.nodeId, body: comment.body })),
  })

  return { fileName: pageJsonFileName(page.title), text: pageJsonText(file), file }
}
