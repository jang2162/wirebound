/**
 * **승격을 지키는 자.**
 *
 * 순수한 것 둘이 `apps/api`가 아니라 순수 패키지에 산다 — 설계서 「상호작용」의 「모델」이
 * 정한 타겟 조립(`packages/schema/src/page-target.ts`)과 스냅샷 payload 규격
 * (`packages/themes/src/snapshot/payload.ts`).
 *
 * **이 자가 없으면 그 자리를 지키는 장치가 없다.** 누가 `apps/api/src/services/`에
 * `pageTarget`을 다시 짜고 `export-bundle.ts`가 그것을 부르게 해도 **아무것도 안 죽는다.**
 *
 * | 왜 아무도 못 잡나 | 근거 |
 * |---|---|
 * | `apps/api`에 중복을 보는 census가 없다 | `source-census.ts`는 *"`applyEdit`을 부르는 자리"* 같은 **호출자 수**를 세는 도구다 |
 * | `packages/schema/test/boundary.test.ts` | *"`schema`가 남을 import하지 않는다"*만 본다 — **남이 베끼는 것**은 안 본다 |
 * | `packages/themes/test/public-api.test.ts` | `themes`의 공개 표면을 못박지만 `apps/api`를 안 본다 |
 * | `export-bundle.test.ts` | **베낀 코드는 같은 답을 낸다** — 행동으로는 구분되지 않는다 |
 *
 * **그래서 소스를 센다.** 두 벌은 *"틀린 답"*이 아니라 *"같은 답을 내는 두 자리"*이고,
 * 그것을 잡는 유일한 방법이 소스를 보는 것이다(`packages/cli/test/io-boundary.test.ts`가
 * 같은 이유로 존재한다).
 *
 * **훑는 도구를 새로 만들지 않는다** — `source-census.ts`의 `sourceFiles`·`stripComments`를
 * 쓴다. 훑는 방식이 두 벌이면 한쪽만 넓어진다(그 파일 머리말).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT, sourceFiles, stripComments } from './source-census'

/** 주석을 걷은 `apps/api/src`의 소스 전부. 파일 이름과 함께 든다. */
function strippedSources(): [string, string][] {
  return sourceFiles().map((relative) => [relative, stripComments(readFileSync(join(SRC_ROOT, relative), 'utf8'))])
}

/**
 * 설계서 「모델」(상호작용)의 접두. **`packages/schema`의 `PAGE_TARGET_PREFIX`가 유일한 자리다.**
 *
 * 이 리터럴이 상수 하나와 인라인 여럿으로 흩어지면 한 자리만 고쳐져 조용히 갈라진다.
 * 여기 다시 나타나면 그 상태다.
 */
const PAGE_TARGET_LITERAL = /['"`]page:/

/**
 * payload 규격을 **선언**하는 자리.
 *
 * **이름 뒤에 오는 글자로 선언과 import를 가른다.** 선언은 `= ` · `{` · `:` · `extends`가
 * 따라오고 import 절의 항목은 `,`나 ` }`가 따라온다 — 그것을 안 보면
 * `import { type SnapshotPayload } from '@wirebound/themes'`가 걸린다 — 그러면 올린 것을
 * **쓰는** 정상 코드(`services/restore.ts`·`services/snapshot-capture.ts`)가 잡힌다.
 *
 * **이름을 열거하는 것이 판정이다.** `apps/api`에는 그 자신의 스냅샷 개념이 따로 있고
 * (`SnapshotSummary`·`SnapshotDetail`·`SnapshotsTable`·`SnapshotParams`·`SnapshotBody`)
 * 그것들은 payload 규격이 아니다 — DB 행과 HTTP 본문이다. `Snapshot\w*`로 넓히면 그
 * 다섯이 걸려 술어가 승격과 무관한 것을 막는다.
 */
const PAYLOAD_DECLARATION = /\b(?:interface|type|const)\s+Snapshot(?:Payload|MenuNode|Page|Layout|Comment)\w*\s*(?:[={:<]|extends\b)/

describe('승격이 두 벌로 갈리지 않는다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다**.
    const files = strippedSources()
    expect(files.length).toBeGreaterThan(20)
    expect(files.map(([relative]) => relative)).toContain('services/export-bundle.ts')
    // 주석을 실제로 걷었는가. 안 걷으면 아래 둘이 머리말의 언급에 걸려 늘 빨갛다.
    expect(files.find(([relative]) => relative === 'services/export-bundle.ts')?.[1]).not.toContain('*')
  })

  /**
   * **`apps/api`는 그 문자열을 몰라도 된다.** 타겟을 만드는 것도 벗기는 것도
   * `@wirebound/schema`가 한다 — `export-bundle.ts`는 `targetedPages`가 낸 값을 받을 뿐이다.
   */
  it('`page:` 접두를 다시 적은 자리가 없다', () => {
    const found = strippedSources()
      .filter(([, source]) => PAGE_TARGET_LITERAL.test(source))
      .map(([relative]) => relative)
    expect(found).toEqual([])
  })

  it('payload 규격을 다시 선언한 자리가 없다', () => {
    const found = strippedSources()
      .filter(([, source]) => PAYLOAD_DECLARATION.test(source))
      .map(([relative]) => relative)
    expect(found).toEqual([])
  })

  /**
   * **반대편 — 술어가 실제로 가르는가.**
   *
   * 위 둘이 늘 `false`인 정규식이면 **아무것도 안 세고 통과한다.** 형태를 직접 먹여 본다.
   * `apps/api`에 그 자리를 되살리는 코드가 어떤 모양으로 오든 걸리게.
   */
  it('되살아난 형태를 잡는다 — 이 술어의 구분력', () => {
    for (const line of [
      "export const PAGE_TARGET_PREFIX = 'page:'",
      'const prefix = "page:"',
      'return `page:${path}`',
      "if (target.startsWith('page:')) return target.slice(5)",
    ]) {
      expect(line, line).toMatch(PAGE_TARGET_LITERAL)
    }
    for (const line of [
      'export interface SnapshotPayload {',
      'interface SnapshotPage {',
      'export type SnapshotComment = {',
      'const SnapshotPayloadSchema = z.strictObject({',
      'export const SnapshotPayloadSchema: z.ZodType<SnapshotPayload> = z.strictObject({',
      'interface SnapshotLayout extends 무엇 {',
    ]) {
      expect(line, line).toMatch(PAYLOAD_DECLARATION)
    }
  })

  /**
   * **그물이 넓어지면 안 되는 쪽.** 올린 것을 **쓰는** 코드는 잡지 않는다 — 잡으면
   * `apps/api`가 승격한 이름을 부를 수 없게 되어 술어가 승격을 거꾸로 막는다.
   */
  it('올린 것을 쓰는 코드는 안 잡는다 — 반대편', () => {
    for (const line of [
      "import type { SnapshotPayload } from '@wirebound/themes'",
      "import { SNAPSHOT_PAYLOAD_VERSION, type SnapshotPayload } from '@wirebound/themes'",
      // 여러 줄 import 절의 한 항목. **import 를 선언으로 오인하는 술어가 여기서 걸린다.**
      '  type SnapshotLayout,',
      '  type SnapshotPayload,',
      "import { targetedPages, type TargetedPage } from '@wirebound/schema'",
      'const payload: SnapshotPayload = await captureSnapshot(db, projectId)',
      'const ordered = targetedPages({ menu, pages })',
      // 타겟 문자열을 **값으로** 다루는 것은 자유다 — 접두를 적는 것만 막는다.
      'return bundle.duplicateTargets',
      // `apps/api` 자신의 스냅샷 개념. DB 행과 HTTP 본문이지 payload 규격이 아니다.
      'export interface SnapshotSummary {',
      'export interface SnapshotDetail extends SnapshotSummary {',
      'export interface SnapshotsTable {',
      'const SnapshotParams = z.object({ projectId: z.uuid() })',
      'const SnapshotBody = z.strictObject({',
    ]) {
      expect(line, line).not.toMatch(PAGE_TARGET_LITERAL)
      expect(line, line).not.toMatch(PAYLOAD_DECLARATION)
    }
  })
})
