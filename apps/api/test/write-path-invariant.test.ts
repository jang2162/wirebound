import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * D1("`pages.schema`를 바꾸는 모든 경로는 revision을 남긴다")을 규율이 아니라 구조로
 * 만드는 테스트다.
 *
 * `writePageSchemaAtSeq`는 `repos/pages.ts`가 export하는 평범한 공개 함수다. 그것을
 * `insertRevision` 없이 부르면 revision을 남기지 않고 문서만 갈아 끼울 수 있고, 그게
 * 정확히 D1이 금지하는 일이다. 지금 그 금지가 기대고 있는 것은 함수의 독스트링뿐이라
 * **두 번째 호출자가 생기는 순간을 잡아 주는 것이 아무것도 없다** — P3의 WebSocket
 * 핸들러가 그 유혹이 가장 큰 자리다(P2a 최종 리뷰 권고 1).
 *
 * eslint 설정이 이 저장소에 없으므로 `no-restricted-imports` 대신 소스를 읽어 단언한다.
 *
 * **이 테스트가 잡지 못하는 것.** import 문과 `.writePageSchemaAtSeq` 형태의 속성
 * 접근만 본다. 문자열로 이름을 조립해 부르거나(`repos['writePage' + ...]`), 다른
 * 모듈이 그 함수를 재-export해 이름을 바꿔 넘기는 경로는 통과한다. 그리고 이 단언은
 * "두 번째 쓰기 경로가 없다"가 아니라 "이 함수의 두 번째 import가 없다"만 고정한다 —
 * `pages.schema`에 직접 UPDATE를 쓰는 새 SQL이 `repos/`에 생기면 여기서는 안 걸린다.
 */

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url))

/** 정의가 있는 파일. 자기 자신을 import할 수는 없으므로 검사 대상에서 뺀다. */
const DEFINITION = 'repos/pages.ts'

/** D1이 허용하는 단 하나의 호출자. */
const ONLY_CALLER = 'services/edit-pipeline.ts'

function tsFilesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) return tsFilesUnder(join(dir, entry.name), rel)
    return entry.isFile() && entry.name.endsWith('.ts') ? [rel] : []
  })
}

/** 줄 시작의 `import ... from '...'` 문장만 뽑는다 — 주석 속 언급은 걸리지 않는다. */
const IMPORT_STATEMENT = /^import\s[\s\S]*?from\s+['"][^'"]+['"]/gm

function referencesWriteFunction(source: string): boolean {
  const imports = source.match(IMPORT_STATEMENT) ?? []
  if (imports.some((statement) => statement.includes('writePageSchemaAtSeq'))) return true
  // `import * as pages from '../repos/pages'` 뒤의 `pages.writePageSchemaAtSeq(...)`.
  return /\.\s*writePageSchemaAtSeq\b/.test(source)
}

describe('D1: pages.schema 쓰기 경로', () => {
  it('writePageSchemaAtSeq를 import하는 소스 파일은 편집 파이프라인 하나뿐이다', () => {
    const files = tsFilesUnder(SRC_DIR).filter((file) => file !== DEFINITION)

    // 대상 파일을 실제로 훑었는지 먼저 확인한다 — 경로가 어긋나 목록이 비면
    // 아래 단언은 `[] === []`로 조용히 통과한다.
    expect(files).toContain(ONLY_CALLER)

    const importers = files.filter((file) => referencesWriteFunction(readFileSync(join(SRC_DIR, file), 'utf8')))

    expect(importers).toEqual([ONLY_CALLER])
  })
})
