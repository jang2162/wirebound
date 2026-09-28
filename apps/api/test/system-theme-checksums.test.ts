/**
 * **판마다 적어 둔 sha256 — 판을 안 올린 시스템 테마 변경을 배포 전에 잡는다**(`system-themes/checksums.json`).
 *
 * 기동 시딩(`src/services/system-themes.ts`)은 같은 `id@version` 인데 바이트가 다르면 멈춘다 — 이미 그 판을 넣은 DB(운영 · 개발)에서만.
 * 테스트 DB 는 실행마다 새로 올려 늘 «처음 넣는 판» 이라, 소스를 고치고 판을 안 올린 빌드가 테스트를 전부 지나 배포된 뒤에야 기동이
 * 멈춘다(A3 리뷰 5b″). 그 사이를 이 표가 막는다: `test/global-setup.ts` 가 이 실행에서 다시 빌드한 산출물을 표와 견준다.
 *
 * 빌드는 같은 입력이면 같은 바이트다(`packWbtheme` 이 항목 시각 · 차례를 고정한다 — `apps/api/README.md` 「시스템 테마 — 기동 때
 * 넣는다」). 번들러 등 빌드 의존이 바뀌어 출력이 달라져도 이 케이스가 같은 문장으로 죽는다 — 그때도 판을 올린다.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readWbtheme } from '@wirebound/themes'
import { describe, expect, it } from 'vitest'
import { testConfig } from './helpers'

const DIR = testConfig().systemThemesDir
const TABLE_FILE = join(DIR, 'checksums.json')

function artifacts(): string[] {
  return readdirSync(DIR)
    .sort()
    .map((theme) => join(DIR, theme, 'dist'))
    .filter((dist) => existsSync(dist))
    .flatMap((dist) => readdirSync(dist).sort().filter((file) => file.endsWith('.wbtheme')).map((file) => join(dist, file)))
}

describe('system-themes/checksums.json', () => {
  it('저장소가 내는 시스템 테마마다 표에 그 id@version 의 sha256 이 있고 같다', () => {
    const table = JSON.parse(readFileSync(TABLE_FILE, 'utf8')) as Record<string, string>
    const found = artifacts()
    // 카나리아 — 산출물이 없으면 견줄 것이 없어 늘 초록이다.
    expect(found.length).toBeGreaterThan(0)
    const problems: string[] = []
    for (const file of found) {
      const bytes = readFileSync(file)
      const { files } = readWbtheme(bytes)
      if (files === null) {
        problems.push(`${file} 가 검증을 못 지났다`)
        continue
      }
      const key = `${files.manifest.id}@${files.manifest.version}`
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const recorded = table[key]
      if (recorded === undefined) {
        problems.push(`${key} 의 줄이 없다 — 새 판이면 표에 "${key}": "${sha256}" 를 더한다`)
      } else if (recorded !== sha256) {
        problems.push(
          `${key} 의 바이트가 표와 다르다(표 ${recorded} · 빌드 ${sha256}) — 그 테마의 version 을 올리고 표에 새 줄을 더한다(이미 배포한 판의 줄은 고치지 않는다 — 그 판을 넣은 DB 의 기동이 멈춘다)`,
        )
      }
    }
    expect(problems).toEqual([])
  })

  it('표의 값은 sha256(소문자 16진 64 자)이고 키는 id@version 이다', () => {
    const table = JSON.parse(readFileSync(TABLE_FILE, 'utf8')) as Record<string, unknown>
    for (const [key, value] of Object.entries(table)) {
      expect(key).toMatch(/^system-[a-z0-9-]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
      expect(value).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})
