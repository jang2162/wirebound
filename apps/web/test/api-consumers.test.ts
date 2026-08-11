/**
 * **`ApiClient`의 어느 메서드를 어디서 부르는지 세는 것을 사람이 아니라 이 파일이 한다.**
 *
 * ## 왜 테스트인가 — 같은 부류가 네 번 낡았다
 *
 * `api/http-client.ts`의 shape 주석들은 *"이 응답을 읽는 자리가 지금 몇인가"*를 근거로 무엇을
 * 얼마나 깊게 검사할지 정한다(*"가설적인 경로에 가드를 달고 살아 있는 경로를 열어 두지
 * 않는다"* — P2b-4의 판정). **그 근거는 참인데, 그것을 주석에 수로 적은 것이 문제였다:**
 *
 * | 적어 둔 것 | 무엇이 낡게 했나 |
 * |---|---|
 * | `menuNode`의 *"CRUD 여섯 호출부 0건"* | P2b-4 웨이브 2·3이 호출부를 만들었다 |
 * | `pageDetail`의 *"`pageDetail.id`는 아직 주소가 되지 않는다"* | 같은 웨이브가 `navigate`를 만들었다 |
 * | `isProjectDetail`의 *"`createProject`… 아직 없다(호출부 0건)"* | **같은 브랜치의** P2b-5 웨이브 2가 만들었다 |
 * | `project-actions.ts`의 *"두 버튼을 그리는 화면은 아직 없다"* | 같은 브랜치의 Task 5·6이 만들었다 |
 *
 * **셋째·넷째가 요점이다 — 갱신 시점을 적어 둔 그 시점이 같은 브랜치 안에서 지나갔다.**
 * *"다음 단계에서 갱신하라"*는 형태로는 닫히지 않는다. 실행으로 재면 낡지 않는다.
 *
 * ## 자기 자신을 세지 않는 배치
 *
 * **소스를 세는 검사는 그 검사 자신이 세어지면 안 된다.** 두 겹으로 막는다:
 *
 * 1. **글롭이 `../src/**`이고 이 파일은 `test/`에 산다** — 세는 대상 밖이다.
 * 2. **`stripComments`로 주석을 걷는다** — `src` 안의 주석이 메서드 이름을 인용해도 세어지지
 *    않는다(`http-client.ts`의 표들이 실제로 인용한다).
 *
 * `role-access.test.ts`가 같은 배치이고, 그 파일에 이 함정을 두 번 겪은 기록이 있다.
 */
import { describe, expect, it } from 'vitest'
import { stripComments } from './store-access-guard'

const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * `ApiClient`가 약속하는 메서드. **손목록이다** — 유니온에서 만들 수 있으면 좋겠지만
 * 인터페이스의 키는 런타임에 없다. 대신 아래 `인터페이스의 메서드를 하나도 빠뜨리지 않는다`가
 * `api/client.ts`의 선언과 맞대 본다.
 */
const METHODS = [
  'login', 'logout', 'me',
  'listProjects', 'getProject', 'createProject', 'updateProject', 'deleteProject',
  'getTree',
  'createMenu', 'updateMenu', 'deleteMenu',
  'createPage', 'updatePage', 'deletePage', 'getPage',
  'patchOps', 'listMyRevisions',
  'getProjectTheme', 'listProjectThemes', 'setProjectTheme',
  'getTheme', 'createTheme', 'updateTheme',
] as const

/** 정의하는 쪽. 여기서 이름이 나오는 것은 호출이 아니다. */
const DEFINITION_FILES = ['../src/api/client.ts', '../src/api/http-client.ts']

/** 메서드 이름 → 그것을 **부르는** 파일들(정의 파일 제외, 주석 걷은 뒤). */
function consumers(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const method of METHODS) map.set(method, [])

  for (const [path, source] of Object.entries(SOURCES)) {
    if (DEFINITION_FILES.includes(path)) continue
    const code = stripComments(source)
    for (const method of METHODS) {
      // `api.createProject(` 처럼 **무언가에 붙여** 부르는 형태만 센다 — 이름만 스치는
      // import·타입 참조는 호출이 아니다.
      if (new RegExp(`\\.${method}\\s*\\(`).test(code)) {
        map.get(method)?.push(path)
      }
    }
  }
  return map
}

/**
 * **오늘 누가 무엇을 부르는가.** 이 표가 `http-client.ts`의 shape 주석들이 근거로 삼는 값이다 —
 * 그 주석들은 수를 들고 있지 않고 이 파일을 가리킨다.
 *
 * 값이 `[]`인 줄은 **부르는 자리가 없다**는 뜻이고, 그것이 shape를 얕게 두는 근거가 된다.
 * **비었다가 채워지면 이 케이스가 먼저 죽는다** — 그때 그 shape가 무엇을 읽게 됐는지 세어
 * 주석의 하중 표에 줄을 더하면 된다.
 */
const EXPECTED: Record<(typeof METHODS)[number], string[]> = {
  login: ['../src/routes/login.tsx'],
  // **부르는 자리가 없다.** 화면에 로그아웃이 없다(P2b가 만들지 않았다) — 세션을 끊는 길은
  // `api/failure.tsx`의 `signed-out` 경로뿐이고 그쪽은 서버가 401을 낼 때 걸린다.
  // 로그아웃 단추를 만들면 이 줄이 먼저 죽는다.
  logout: [],
  me: ['../src/session/session-context.tsx'],
  listProjects: ['../src/projects/use-project-commands.tsx'],
  // **소비자가 둘이고 읽는 것이 다르다.** 셸은 `name`·`id`를 그리려고 부르고, 테마 저작
  // 화면은 **`role`** 때문에 부른다(§10 — 쓰기가 owner 게이트라 읽기 전용인지 알아야 한다).
  getProject: ['../src/routes/editor.tsx', '../src/routes/theme-editor.tsx'],
  createProject: ['../src/projects/use-project-commands.tsx'],
  updateProject: ['../src/projects/use-project-commands.tsx'],
  deleteProject: ['../src/projects/use-project-commands.tsx'],
  getTree: ['../src/tree/use-tree-commands.tsx'],
  createMenu: ['../src/tree/use-tree-commands.tsx'],
  updateMenu: ['../src/tree/use-tree-commands.tsx'],
  deleteMenu: ['../src/tree/use-tree-commands.tsx'],
  createPage: ['../src/tree/use-tree-commands.tsx'],
  updatePage: ['../src/tree/use-tree-commands.tsx'],
  deletePage: ['../src/tree/use-tree-commands.tsx'],
  getPage: ['../src/routes/editor.tsx', '../src/edit/use-edit-commit.tsx'],
  patchOps: ['../src/edit/use-edit-commit.tsx'],
  listMyRevisions: ['../src/routes/editor.tsx'],
  // **소비자가 둘이고 서로 다른 것을 읽는다**(P4b-3 P2). 캔버스 쪽 훅은 `theme`을
  // 읽어 그리고, 고르개는 같은 응답의 `themeId`를 읽어 *"지금 무엇이 골라져 있는가"*를
  // 그린다 — 목록(`listProjectThemes`)만으로는 그것을 알 수 없다.
  getProjectTheme: ['../src/theme/use-project-theme.ts', '../src/theme/theme-picker.tsx'],
  listProjectThemes: ['../src/theme/theme-picker.tsx'],
  setProjectTheme: ['../src/theme/theme-picker.tsx'],
  // 테마 저작 셋(P4c-2). **셋 다 한 파일에서만 불린다** — ②의 셋(토큰 GUI·JSON
  // 에디터·갤러리)은 초안 스토어만 만지고 서버에는 닿지 않는다는 것이 D3의 뜻이고,
  // **이 줄이 그것을 실행으로 지킨다:** 어느 워커가 자기 화면에서 직접 저장하면 여기가 죽는다.
  getTheme: ['../src/routes/theme-editor.tsx'],
  createTheme: ['../src/routes/theme-editor.tsx'],
  updateTheme: ['../src/routes/theme-editor.tsx'],
}

describe('ApiClient의 소비자', () => {
  it('검사가 진짜 소스를 읽는다', () => {
    // 이것이 없으면 `SOURCES`가 비어도 아래가 초록이다(D7 검사에서 실제로 난 사고다).
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
    expect(Object.values(SOURCES).every((text) => text.length > 0)).toBe(true)
  })

  it('부르는 자리가 표와 같다', () => {
    const found = consumers()
    for (const method of METHODS) {
      expect([...(found.get(method) ?? [])].sort(), method).toEqual([...EXPECTED[method]].sort())
    }
  })

  it('인터페이스의 메서드를 하나도 빠뜨리지 않는다', () => {
    // **분모를 손으로 적지 않는다.** `api/client.ts`의 `ApiClient` 선언에서 메서드 이름을
    // 뽑아 위 목록과 맞댄다 — 메서드가 늘면 여기가 죽고, 그러면 그 응답의 소비자도 세어진다.
    const source = SOURCES['../src/api/client.ts'] ?? ''
    const body = stripComments(source)
    // 인터페이스의 닫는 중괄호까지만 자른다 — 더 가면 아래 `class ApiError`의 `constructor`가
    // 메서드로 세어진다(처음에 그렇게 적었다가 이 케이스가 잡았다).
    const start = body.indexOf('export interface ApiClient {')
    const declaration = body.slice(start, body.indexOf('\n}', start))
    const declared = [...declaration.matchAll(/^ {2}(\w+)\s*[(<]/gm)].map((m) => m[1])

    expect(declared.length).toBeGreaterThan(0)
    expect([...declared].sort()).toEqual([...METHODS].sort())
  })

  it('주석 안의 호출은 세지 않는다 — 심어서 확인한다', () => {
    // **이 케이스가 위 검사의 구분력이다.** `http-client.ts`의 표들이 `api.createPage(…)` 같은
    // 형태를 실제로 인용하고 있어, 주석을 걷지 않으면 그 인용이 호출로 세어진다.
    const planted = [
      '// `api.createProject(body)` 를 부르는 자리를 센다',
      '/** 표: `const page = await api.createPage(…)` 뒤 그 id를 주소로 쓴다 */',
    ].join('\n')

    expect(/\.createProject\s*\(/.test(planted)).toBe(true)
    expect(/\.createProject\s*\(/.test(stripComments(planted))).toBe(false)
    expect(/\.createPage\s*\(/.test(stripComments(planted))).toBe(false)
  })

  it('코드에 심은 호출은 잡는다 — 음성 대조', () => {
    // 반대편. 주석을 걷는 것이 **코드까지** 지우지는 않는지 본다.
    const planted = 'await api.deleteProject(id)\n// `api.deleteProject(…)` 를 설명하는 주석'

    expect(/\.deleteProject\s*\(/.test(stripComments(planted))).toBe(true)
  })
})
