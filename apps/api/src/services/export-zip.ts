/**
 * **번들 파일들을 압축 하나로 묶는다**(P8-4 T3 · D2).
 *
 * 여러 파일을 브라우저가 한 번에 받으려면 압축 하나가 필요하다. **서버가 만든다** —
 * `apps/web`에 새 런타임 의존을 더하지 않는다는 전역 제약 때문이고, 브라우저에서 압축하려면
 * 파일 목록을 JSON으로 먼저 받아야 해서 같은 글자가 두 번 오간다.
 *
 * ---
 *
 * # `fflate`를 고른 이유
 *
 * | 재고 본 것 | 값 |
 * |---|---|
 * | `fflate` | 런타임 의존 **0개** · MIT · 순수 JS(Node·브라우저 양쪽) · 스트리밍 API도 있다 |
 * | `yazl` | `buffer-crc32` 하나를 끌고 온다 · Node 전용 |
 * | `jszip` | 의존 넷(`lie`·`pako`·`setimmediate`·`readable-stream`) |
 *
 * **의존이 0인 것이 갈랐다.** 재라 #7이 *"zip 라이브러리를 하나 더해도 다른 것이 안
 * 깨진다"*를 안 재고 적었는데, 끌고 오는 것이 없으면 그 물음의 표면 자체가 작아진다.
 * 그리고 P9의 CLI가 같은 번들을 파일로 쓸 때 같은 것을 쓸 수 있다.
 *
 * **오늘은 스트리밍을 안 쓴다.** `exportBundle`이 이미 파일 전부를 메모리의 문자열로
 * 만들어 내므로(그 함수가 파일 시스템을 모른다) 여기서만 흘려보내 봐야 최고 사용량이
 * 안 줄어든다. 흘려보낼 자리가 생기는 것은 번들 자체가 조각으로 나오는 날이다.
 *
 * # 뿌리 폴더를 둔다
 *
 * §11.3의 트리도 `wirebound-export/`로 시작한다. 없으면 압축을 푼 자리에 파일이
 * 흩뿌려지고, **두 설계서를 같은 폴더에 풀면 서로를 덮어쓴다.** 그래서 폴더 이름에
 * 프로젝트 슬러그를 넣는다 — §11.3의 이름은 프로젝트가 하나뿐인 예시다.
 */
import { strToU8, zipSync } from 'fflate'

/** 뿌리 폴더와 zip 파일 이름의 공통 줄기. */
const STEM = 'wirebound-export'

/** 번들 안의 파일 하나. `@wirebound/exporter`의 `BundleFile`과 같은 모양이다. */
export interface ZipEntry {
  path: string
  content: string
}

/**
 * 압축 안의 뿌리 폴더 이름.
 *
 * **슬러그를 쓴다.** `projects.slug`는 유일하고(`projects_slug_key`) 소문자·숫자·하이픈
 * 뿐이라 어느 파일 시스템에서도 그대로 산다. 이름(`projects.name`)은 그 둘 다 아니다.
 */
export function bundleRootDirectory(projectSlug: string): string {
  return `${STEM}-${projectSlug}`
}

/**
 * 내려받을 때 붙일 파일 이름.
 *
 * **사람이 읽는 이름은 여기에만 둔다**(D7). 라우트 URL은 `.../export`이고 파일 이름을
 * 쓰지 않는다 — 파일 이름은 안정한 열쇠가 아니다(P8-2 이월 §3).
 */
export function bundleFileName(projectSlug: string): string {
  return `${bundleRootDirectory(projectSlug)}.zip`
}

/**
 * 파일들을 zip 하나로 묶는다. 모든 엔트리가 `rootDirectory` 밑에 들어간다.
 *
 * **`level: 6`이다.** zlib의 기본값이고, 번들처럼 되풀이가 많은 글자에서는 9로 올려도
 * 얻는 것이 없다 — P8-4 리뷰가 실제 번들과 되풀이가 큰 번들 둘에서 6과 9를 재 봤는데
 * **9가 오히려 1바이트 컸다**(시간은 두 규모 다 9가 조금 빨랐다. 값은 그 리뷰 문서에 있다).
 * **여기에 단언을 더 적지 않는다** — 재지 않은 규모까지 말하는 문장이 이 저장소에서
 * 반복해서 거짓이 되었다.
 *
 * **이름은 UTF-8이다.** `fflate`가 general purpose bit flag의 11번 비트를 세우는 것을
 * 재서 확인했고(`test/export-zip.test.ts`가 그 비트를 직접 잰다), 그것이 없으면 받는
 * 쪽이 CP437로 읽어 한글 파일 이름이 깨진다 — 그러면 `index.html`의 링크가 가리키는
 * 파일이 디스크에 없다.
 */
export function zipBundle(entries: readonly ZipEntry[], rootDirectory: string): Uint8Array {
  const tree: Record<string, Uint8Array> = {}
  for (const entry of entries) {
    tree[`${rootDirectory}/${entry.path}`] = strToU8(entry.content)
  }
  return zipSync(tree, { level: 6 })
}
