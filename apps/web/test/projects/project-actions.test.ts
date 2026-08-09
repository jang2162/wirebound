/**
 * 프로젝트 역할 판정(P2b-5 Task 2). **화면을 지나지 않는다** — 순수 함수라 값만으로 판정한다.
 *
 * **이 파일이 지키는 것은 "열리는 역할이 하나뿐"이라는 사실이다.** 서버는 `PATCH`·`DELETE`를
 * owner에게만 허용하고 나머지 멤버에게 403을 낸다(아래 `EXPECTED` 주석의 실측). 판정이
 * 그것보다 넓으면 사용자는 눌러 봐야 403인 버튼을 보게 된다.
 */
import { describe, expect, it } from 'vitest'
import { projectAbilities } from '../../src/projects/project-actions'
import type { ProjectAbilities } from '../../src/projects/project-actions'
import type { ProjectRole } from '../../src/api/types'

/**
 * 역할별 기대값. **`Record<ProjectRole, …>`인 것이 요점이다** — 손목록이면 유니온에 역할이
 * 늘어도 여기가 조용히 낡는다. 레코드로 두면 키를 빠뜨리는 순간 **`pnpm typecheck`가** 죽는다.
 *
 * **`pnpm test`(vitest)는 타입을 보지 않으므로 그쪽에서는 죽지 않는다** — 런타임에서 죽는
 * 자리는 아래 케이스 6의 "열리는 역할은 하나다"이고, 그것은 이 표에 `true`를 적을 때 걸린다.
 * 즉 두 도구가 서로 다른 이탈을 잡는다: 표를 안 고치면 typecheck가, 고치면서 열면 vitest가.
 *
 * **값의 근거는 실측이다**(api 하네스, `apps/api/test/`에 임시 파일을 두고 재고 지웠다):
 *
 * ```
 * editor  PATCH → 403 {"code":"forbidden","message":"이 작업을 수행할 권한이 없습니다"}
 * editor  DELETE→ 403 (코드·문장 같음)
 * viewer  PATCH → 403 (코드·문장 같음)
 * viewer  DELETE→ 403 (코드·문장 같음)
 * 비멤버   PATCH → 404 {"code":"not-found","message":"프로젝트를 찾을 수 없습니다"}
 * 비멤버   DELETE→ 404 (코드·문장 같음)
 * ```
 */
const EXPECTED: Record<ProjectRole, ProjectAbilities> = {
  owner: { rename: true, remove: true },
  editor: { rename: false, remove: false },
  viewer: { rename: false, remove: false },
}

const NOTHING: ProjectAbilities = { rename: false, remove: false }

describe('projectAbilities', () => {
  it('역할을 모르면 아무것도 못 한다', () => {
    // 목록을 아직 못 받았거나, 그 항목이 사라진 뒤에 실제로 생기는 상태다.
    expect(projectAbilities(undefined)).toEqual(NOTHING)
  })

  it('viewer는 아무것도 못 한다', () => {
    expect(projectAbilities('viewer')).toEqual(NOTHING)
  })

  it('editor도 이름을 바꾸거나 지우지 못한다', () => {
    // **editor는 메뉴·페이지를 만들고 지울 수 있다**(P2b-4). 그런데도 프로젝트 자체는
    // 못 건드린다 — 이 둘을 한 판정으로 묶지 않는 근거다.
    expect(projectAbilities('editor')).toEqual(NOTHING)
  })

  it('owner만 이름을 바꾸고 지울 수 있다', () => {
    expect(projectAbilities('owner')).toEqual({ rename: true, remove: true })
  })

  it('계약에 없는 역할 문자열은 아무것도 열지 않는다', () => {
    // **이 값은 서버에서 온다.** 타입이 `ProjectRole`이라고 해서 런타임 값이 그 셋 중
    // 하나라는 보증은 없다 — `SHAPES.projectDetail`은 `role`을 보지 않는다(`id`·`name`만
    // 본다). 서버가 역할을 더하면 그 문자열이 그대로 여기까지 온다.
    //
    // **모르는 값에서 닫히는 쪽으로 떨어져야 한다.** 열리는 쪽으로 떨어지면 그 사용자는
    // 눌러 봐야 403인 버튼을 본다(위 실측).
    const unknown = ['admin', 'Owner', 'OWNER', 'owner ', '', 'guest', 'editor,owner']

    for (const role of unknown) {
      expect(projectAbilities(role as ProjectRole), role).toEqual(NOTHING)
    }
  })

  it('ProjectRole 유니온의 모든 값이 대조표에 있고, 열리는 역할은 하나다', () => {
    // **분모를 손으로 적지 않는다** — `EXPECTED`가 `Record<ProjectRole, …>`이므로 이 순회의
    // 범위가 곧 유니온이다(`panels/type-picker.test.tsx`가 `listComponents()`로 분모를
    // 계산하는 것과 같은 근거).
    for (const [role, abilities] of Object.entries(EXPECTED)) {
      expect(projectAbilities(role as ProjectRole), role).toEqual(abilities)
    }

    // **수를 못박는 자리다.** 역할이 늘면서 그 역할에 `true`를 적으면 여기서 죽는다 —
    // 위 순회는 표와 구현을 맞대기만 하므로 둘을 함께 열면 통과해 버린다.
    // 1이라는 값의 근거는 위 실측이다(owner 아닌 멤버 둘이 전부 403).
    const opened = Object.values(EXPECTED).filter((a) => a.rename || a.remove)
    expect(opened).toHaveLength(1)
    expect(EXPECTED.owner).toEqual({ rename: true, remove: true })
  })
})
