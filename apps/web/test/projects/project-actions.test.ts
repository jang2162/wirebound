/**
 * 프로젝트 역할 판정. **화면을 지나지 않는다** — 순수 함수라 값만으로 판정한다.
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
 * **심어서 잰다. 죽는 케이스는 심는 역할의 *이름*에 달려 있다:**
 *
 * | 심은 것 | typecheck | vitest |
 * |---|---|---|
 * | 유니온에 역할 추가, 이 표는 그대로 | `TS2741: Property … is missing` | 전부 통과 |
 * | 위 + 이 표에 `true`, 구현은 그대로 | 0 errors | 케이스 6 |
 * | 위 + **구현도 그 역할을 연다**, 이름이 `maintainer` | 0 errors | **케이스 6 하나** |
 * | 위 + **구현도 그 역할을 연다**, 이름이 `admin` | 0 errors | **케이스 5·6 둘** |
 *
 * **마지막 줄이 하나 더 죽는 것은 케이스 5의 `unknown` 목록 첫 항목이 `'admin'`이기
 * 때문이다** — 그 문자열이 진짜 역할이 되는 순간 "계약에 없다"가 거짓이 된다. **결함이
 * 아니라 그 케이스가 제 일을 한 것이다.** 다만 *"런타임에서 죽는 자리는 케이스 6"*은
 * **심는 이름이 아래 목록에 없을 때의 이야기다** — 그 조건을 빼면 수가 어긋난다.
 *
 * **값의 근거는 실측이다**(api 하네스로 잰다 — `apps/api/test/`에 임시 파일을 두고 재고 지운다):
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
  owner: {
    rename: true,
    remove: true,
    chooseTheme: true,
    editTheme: true,
    createSnapshot: true,
    restoreSnapshot: true,
    editDesign: true,
  },
  // **editor는 스냅샷을 만들 수 있다.** 설계서 「권한 모델」이 스냅샷 **생성**을 editor에게
  // 열었기 때문이다 — 스냅샷은 아무것도 바꾸지 않는다.
  //
  // **`createSnapshot`과 `restoreSnapshot`이 갈리는 유일한 칸이 여기다.** 그 둘을 한 필드로
  // 묶으면 editor가 복원까지 하거나 editor가 생성까지 잃는다.
  editor: {
    rename: false,
    remove: false,
    chooseTheme: false,
    editTheme: false,
    createSnapshot: true,
    restoreSnapshot: false,
    // 설계서 본문 전부(메뉴 · 페이지 · 노드 · 코멘트 · 잠금). 서버의 `projectGuard('editor')`와
    // 같은 선이다 — 제목 · 설명만으로 좁히면 서버가 허락하는 편집을 화면이 막는다.
    editDesign: true,
  },
  viewer: {
    rename: false,
    remove: false,
    chooseTheme: false,
    editTheme: false,
    createSnapshot: false,
    restoreSnapshot: false,
    editDesign: false,
  },
}

const NOTHING: ProjectAbilities = {
  rename: false,
  remove: false,
  chooseTheme: false,
  editTheme: false,
  createSnapshot: false,
  restoreSnapshot: false,
  editDesign: false,
}

describe('projectAbilities', () => {
  it('역할을 모르면 아무것도 못 한다', () => {
    // 목록을 아직 못 받았거나, 그 항목이 사라진 뒤에 실제로 생기는 상태다.
    expect(projectAbilities(undefined)).toEqual(NOTHING)
  })

  it('viewer는 아무것도 못 한다', () => {
    expect(projectAbilities('viewer')).toEqual(NOTHING)
  })

  it('editor는 스냅샷과 설계서 본문을 고칠 수 있다 — 프로젝트 이름을 바꾸거나 지우지는 못한다', () => {
    // **editor는 메뉴·페이지를 만들고 지울 수 있다.** 그런데도 프로젝트 자체는
    // 못 건드린다 — 이 둘을 한 판정으로 묶지 않는 근거다.
    //
    // *"owner가 아니면 아무것도 못 한다"*(`toEqual(NOTHING)`)로 묶으면 거짓이다 —
    // 설계서 「권한 모델」이 스냅샷 생성과 설계서 본문 편집을 editor에게 연다.
    expect(projectAbilities('editor')).toEqual({ ...NOTHING, createSnapshot: true, editDesign: true })
  })

  it('owner만 이름을 바꾸고 지울 수 있다', () => {
    expect(projectAbilities('owner')).toEqual({
      rename: true,
      remove: true,
      chooseTheme: true,
      editTheme: true,
      createSnapshot: true,
      restoreSnapshot: true,
      editDesign: true,
    })
  })

  it('계약에 없는 역할 문자열은 아무것도 열지 않는다', () => {
    // **이 값은 서버에서 온다.** 타입이 `ProjectRole`이라고 해서 런타임 값이 그 셋 중
    // 하나라는 보증은 없다 — `SHAPES.projectDetail`은 `role`을 보지 않는다(`id`·`name`만
    // 본다). 서버가 역할을 더하면 그 문자열이 그대로 여기까지 온다.
    //
    // **모르는 값에서 닫히는 쪽으로 떨어져야 한다.** 열리는 쪽으로 떨어지면 그 사용자는
    // 눌러 봐야 403인 버튼을 본다(위 실측).
    //
    // **이 목록의 문자열이 진짜 역할이 되면 이 케이스가 죽는다 — 그것이 옳다.** `'admin'`을
    // 유니온에 더하고 구현까지 열면 여기가 케이스 6과 함께 죽는 것을 쟀다(위 표). 그때
    // 고칠 것은 이 목록이지 판정이 아니다.
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
    expect(EXPECTED.owner).toEqual({
      rename: true,
      remove: true,
      chooseTheme: true,
      editTheme: true,
      createSnapshot: true,
      restoreSnapshot: true,
      editDesign: true,
    })

    // **스냅샷 생성은 둘이 열린다**(owner·editor — 설계서 「권한 모델」). 위 `opened`가
    // `rename || remove`를 보므로 그 수에 잡히지 않는다 — 등급이 다른 조작이 늘면 그 조작의
    // 수를 따로 못박는다. 이 값이 3이 되면(viewer까지 열리면) 「권한 모델」이 바뀐 것이다.
    expect(Object.values(EXPECTED).filter((a) => a.createSnapshot)).toHaveLength(2)

    // **복원은 하나만 열린다**(owner — 「권한 모델」: *"editor: … 스냅샷 생성 (복원 불가)"*). 위
    // `createSnapshot`의 2와 여기 1이 **다른 것이 이 표에서 유일하게 갈리는 칸**이다 —
    // 두 수가 같아지면 editor가 복원을 얻거나 잃은 것이고, 그때 「권한 모델」을 다시 읽어야 한다.
    expect(Object.values(EXPECTED).filter((a) => a.restoreSnapshot)).toHaveLength(1)

    // **설계서 본문은 둘이 연다**(owner · editor). viewer 에게 열리면 「권한 모델」의 *"조회 전용"* 이 바뀐 것이다.
    expect(Object.values(EXPECTED).filter((a) => a.editDesign)).toHaveLength(2)
  })
})
