/**
 * **스킬 문서를 케이스가 읽어 실제와 대조한다** (설계서 「스킬」).
 *
 * ---
 *
 * # 어디에 두는가 — 판정과 근거
 *
 * 설계서는 *"에이전트에게 다음 흐름을 가르친다"*까지만 적었다. 후보 둘을 재고 **파일**을
 * 골랐다(`packages/mcp/skill/SKILL.md`).
 *
 * | 후보 | 대가 |
 * |---|---|
 * | **파일** | 호스트가 그것을 읽는다는 **보증이 없다** — 사람이 설치해야 한다 |
 * | MCP가 여섯째 도구로 내준다 | **설계서 「MCP 도구」의 표를 깬다.** 표가 다섯으로 닫혔고 `tools.test.ts`가 설계 문서에서 그 다섯을 읽는다 — 여섯째를 만들려면 설계서를 먼저 고쳐야 한다 |
 * | MCP의 `prompts`·`resources` 능력으로 내준다 | 설계서에 그 줄이 없다. **새 프로토콜 면을 여는 판정**이고, 무엇보다 얻는 것이 없다 — 아래 근거 ①이 그대로 걸린다 |
 *
 * **근거 ① — 가르치는 시점이 도구 호출 *전*이다.** 「스킬」의 1단계가 *"`list_pages`로
 * 대상 페이지를 찾는다"*인데, **그것을 부르기로 정하는 것**이 스킬이다. 도구 결과로 오는
 * 것은 이미 부른 뒤이므로 첫 걸음을 가르칠 수 없다.
 *
 * **근거 ② — 호스트마다 스킬을 싣는 방식이 다르다**(지침 파일 · 시스템 프롬프트 · 스킬
 * 디렉터리). 파일이 그 전부와 맞는 가장 낮은 공통분모다.
 *
 * **근거 ③ — 케이스가 읽을 수 있다.** 그것이 이 파일이다.
 *
 * # 무엇을 재나 — *"문장이 값과 어긋나면 에이전트가 없는 인자를 부른다"*
 *
 * 스킬은 산문이지만 **그 안의 이름은 계약이다.** 도구 이름과 인자 이름을 문서에서 뽑아
 * `TOOLS`와 맞댄다 — `tools.test.ts`가 설계 문서를 읽어 같은 것을 하는 것과 같은 자세다.
 * 손으로 옮긴 인용은 도구가 바뀌어도 **조용하다.**
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { TOOLS, findTool } from '../src/tools'

const SKILL_PATH = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url))
const skill = readFileSync(SKILL_PATH, 'utf8')

/** 스킬의 도구 표에서 `| \`이름\` | \`인자\` · … | 설명 |` 줄을 읽는다. */
function skillTools(): { name: string; args: string[] }[] {
  const section = skill.slice(skill.indexOf('## 도구 다섯'), skill.indexOf('## 흐름'))
  const found: { name: string; args: string[] }[] = []
  for (const line of section.split('\n')) {
    const match = /^\|\s*`([a-z_]+)`\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(line.trim())
    if (match === null) continue
    const args = [...match[2]!.matchAll(/`([A-Za-z]+)`/g)].map((one) => one[1]!)
    found.push({ name: match[1]!, args })
  }
  return found
}

/** 스킬 전문에서 백틱으로 감싼 이름 전부. **인자 이름이 실재하는지 재는 분모다.** */
function backticked(): string[] {
  return [...new Set([...skill.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)].map((one) => one[1]!))].sort()
}

describe('스킬의 도구 표가 실제 도구와 같다', () => {
  const listed = skillTools()

  it('스킬에서 도구 줄을 실제로 읽는다 — 파서가 어긋나면 아래가 조용히 통과한다', () => {
    expect(listed.length).toBe(5)
    expect(listed.map((one) => one.name)).toContain('patch_page')
  })

  it('이름이 하나도 안 빠지고 남지도 않는다 — 분모가 `TOOLS`다', () => {
    expect(listed.map((one) => one.name).sort()).toEqual(TOOLS.map((one) => one.name).sort())
  })

  it('각 도구의 인자가 실제 스키마와 같다 — 없는 인자를 가르치지 않는다', () => {
    for (const one of listed) {
      const spec = findTool(one.name)!
      expect(one.args.sort(), one.name).toEqual(Object.keys(spec.inputSchema.properties).sort())
    }
  })

  /**
   * **인자를 안 받는 도구에 인자가 적히면 죽는다.** 위 케이스가 이미 덮지만, `list_pages`가
   * 그 유일한 자리라 표에서 *"(없음)"*을 잘못 쓰면 파서가 조용히 빈 배열을 낸다 — 반대편을
   * 함께 든다.
   */
  it('`list_pages` 는 인자가 없다고 적혀 있다', () => {
    expect(listed.find((one) => one.name === 'list_pages')!.args).toEqual([])
    expect(skill).toContain('| `list_pages` | (없음) |')
  })

  /**
   * **문서 전체에서** 도구 인자처럼 보이는 이름이 실재하는지 본다. 표는 맞는데 산문이
   * 없는 인자를 가르치는 판이 여기서 걸린다 — 그것이 실제 사고의 모양이다.
   */
  it('산문에도 없는 인자 이름이 없다', () => {
    const real = new Set(TOOLS.flatMap((tool) => Object.keys(tool.inputSchema.properties)))
    /** 인자가 아닌데 백틱을 두르는 이름들. **이유 없이 늘리면 위가 아무것도 안 막는다.** */
    const notArgs = new Set([
      // 도구 이름
      ...TOOLS.map((tool) => tool.name),
      // 응답 필드 · 값 · 바깥 이름
      'headSeq',
      'capturedAt',
      'found',
      'reason',
      'ambiguous',
      'duplicatePaths',
      'documentChanged',
      'marker',
      'failing',
      'notes',
      'outsideErrors',
      'droppedProjectIssues',
      'warnings',
      'pagePath',
      'isError',
      'stale',
      'locked',
      'rejected',
      'error',
      'true',
      'false',
      'mcp',
      'lint',
      'nodes',
      'id',
      'wireb',
      'init',
      'login',
      'skill',
      'SKILL',
      'wirebound',
      // 화면 상태의 꼴 — 노드 타입 · 문서 필드 · 연산 이름 · 등급 · 응답 필드
      'StateSwitch',
      'StateCase',
      'viewStates',
      'default',
      'children',
      'test',
      'add',
      'move',
      'remove',
      'warning',
      'info',
      'infos',
    ])
    const 후보 = backticked().filter((name) => !notArgs.has(name) && !name.includes('.'))
    // 분모가 0이면 아래가 공허하다 — 실제 인자 이름이 산문에 나온다.
    expect(후보.length).toBeGreaterThan(0)
    expect(후보.filter((name) => !real.has(name))).toEqual([])
  })
})

/**
 * **「스킬」의 흐름 다섯을 설계 문서에서 읽어 대조한다.**
 *
 * 스킬이 그 흐름을 가르치는 것이 「스킬」의 요구다. 손으로 옮기면 설계서가 바뀌어도 조용하다.
 */
describe('스킬이 설계서 「스킬」의 흐름을 그대로 가르친다', () => {
  function specFlow(): string[] {
    const section = designDoc.slice(designDoc.indexOf('### 12.5 스킬'), designDoc.indexOf('## 13. 에러 처리'))
    return section
      .split('\n')
      .map((line) => /^\d\.\s+(.+)$/.exec(line.trim())?.[1])
      .filter((line): line is string => line !== undefined)
  }

  const flow = specFlow()

  it('설계 문서에서 흐름 다섯을 실제로 읽는다', () => {
    expect(flow).toHaveLength(5)
    expect(flow[2]).toContain('구현한다')
  })

  it('다섯 줄이 글자 그대로 스킬에 있다', () => {
    for (const [index, step] of flow.entries()) {
      expect(skill, `${index + 1}단계`).toContain(step)
    }
  })

  /**
   * **3단계는 도구가 아니다.**
   *
   * 흐름 다섯 중 도구를 부르는 것은 **넷**(`list_pages`·`get_page`·`add_comment`·
   * `validate`)이고 3단계(*"구현한다"*)는 에이전트가 리포에서 하는 일이다 — 아래 *"흐름의 네
   * 도구가 전부 실재한다"*가 센다. `patch_page`는 「스킬」의 흐름에 **없다** — 「MCP 도구」의
   * 표에만 있다.
   *
   * **스킬이 그 사실을 말해야 한다.** 안 말하면 에이전트가 3단계에서 도구를 찾는다.
   */
  it('3단계가 도구가 아니라는 것을 말한다', () => {
    expect(skill).toContain('3단계는 도구가 아니다')
  })

  it('흐름의 네 도구가 전부 실재한다 — 세어 보고 적은 값이다', () => {
    const inFlow = TOOLS.map((tool) => tool.name).filter((name) => flow.some((step) => step.includes(name)))
    expect(inFlow.sort()).toEqual(['add_comment', 'get_page', 'list_pages', 'validate'])
    // **`patch_page`는 흐름에 없다.** 「MCP 도구」의 표에만 있고, 스킬이 그 사실을 적는다.
    expect(flow.some((step) => step.includes('patch_page'))).toBe(false)
    expect(skill).toContain('`patch_page`는 이 흐름에 없다')
  })
})

/**
 * **응답을 읽는 법 셋을 스킬이 가르친다** — 에이전트가 응답을 잘못 읽기 쉬운 세 자리다:
 * 경로를 그대로 넘기는 것 · `failing` 하나로 판정하지 않는 것 · `isError`에 재시도하지 않는 것.
 */
describe('응답을 읽는 법 셋을 가르친다', () => {
  it('①  `list_pages` 의 `path` 가 다른 도구의 인자라는 것', () => {
    expect(skill).toContain('`path`가 다른 도구의 인자다')
    expect(skill).toContain('그대로')
  })

  it('②  `validate` 의 `failing` 만 읽으면 안 된다는 것', () => {
    expect(skill).toContain('`failing`만 읽지 마라')
    for (const field of ['notes', 'outsideErrors', 'droppedProjectIssues']) {
      expect(skill, field).toContain(`\`${field}\``)
    }
  })

  it('③  `isError` 는 재시도할 것이 아니라 사람이 고칠 것이라는 것', () => {
    expect(skill).toContain('재시도할 것이 아니라 사람이 고칠 것')
    for (const code of [2, 3, 4]) expect(skill, `코드 ${code}`).toContain(`| ${code} |`)
    expect(skill).toContain('[wireb 코드 N]')
  })
})

/**
 * **쓰기의 규칙**을 스킬이 가르친다.
 *
 * 이 셋 중 하나라도 빠지면 에이전트가 잘못 행동한다: `baseSeq`를 지어내거나, 423에
 * 재시도 루프를 돌거나, 자기 코멘트가 만든 409를 남의 편집으로 읽는다.
 */
describe('쓰기의 규칙 셋을 가르친다', () => {
  it('`baseSeq` 가 `get_page` 의 `headSeq` 라는 것', () => {
    expect(skill).toContain('`baseSeq`는 **`get_page`가 낸 `headSeq`**다')
    expect(skill).toContain('지어내지 마라')
  })

  it('409 와 423 이 **다른 일**을 시킨다는 것', () => {
    expect(skill).toContain('`stale`(409)')
    expect(skill).toContain('`locked`(423)')
    expect(skill).toContain('재조회해도 안 풀린다')
    expect(skill).toContain('재시도 루프를 돌리지 마라')
  })

  it('도구가 재시도하지 않는다는 것', () => {
    expect(skill).toContain('도구는 재시도하지 않는다')
  })

  it('코멘트가 문서를 바꾼다는 것', () => {
    expect(skill).toContain('코멘트가 문서를 바꾼다')
    expect(skill).toContain('`documentChanged`')
  })

  it('자기 편집이 `mcp` 로 남는다는 것', () => {
    expect(skill).toContain('이력에 `mcp`로 남는다')
  })

  /**
   * **이 서버는 도구 호출을 동시에 처리한다**(SDK의 `Server`가 요청마다 독립으로 답한다) —
   * 프레임을 한 번에 다 써 넣으면 응답이 보낸 순서와 다르게 온다. 그래서 겹쳐 보낸 쓰기 둘
   * 중 하나가 409를 받는다.
   *
   * **서버에서 직렬화하지 않는다 — 판정이다.** 큐에 넣으면 뒤엣것이 **에이전트가 읽은 적
   * 없는 문서** 위에 적용되고, 그것이 도구가 재시도하지 않는 까닭(`handlers.ts`의 *"재시도하지
   * 않는다"*)이 막으려는 바로 그 상태다. 대신 스킬이 말한다.
   *
   * 편집을 겹쳐 보내면 **in-flight 가 늘 하나라는 전제에 매인 자리가 조용히 틀린다.**
   */
  it('쓰기를 겹쳐 보내지 말라는 것', () => {
    expect(skill).toContain('쓰기를 겹쳐 보내지 마라')
    expect(skill).toContain('도구 호출을 동시에 처리한다')
  })
})

describe('스킬이 배포에 실린다', () => {
  it('`package.json` 의 `files` 가 `skill` 을 담는다 — dist 만 담으면 안 나간다', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { files: string[] }
    expect(manifest.files).toContain('skill')
  })
})
