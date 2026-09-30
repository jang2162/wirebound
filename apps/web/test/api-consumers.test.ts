/**
 * **`ApiClient`의 어느 메서드를 어디서 부르는지 세는 것을 사람이 아니라 이 파일이 한다.**
 *
 * ## 왜 테스트인가 — 주석에 적은 수는 호출부가 생기는 순간 낡는다
 *
 * `api/http-client.ts`의 shape 주석들은 *"이 응답을 읽는 자리가 지금 몇인가"*를 근거로 무엇을
 * 얼마나 깊게 검사할지 정한다(*"가설적인 경로에 가드를 달고 살아 있는 경로를 열어 두지
 * 않는다"*). **그 근거는 참인데, 그것을 주석에 수로 적으면 조용히 거짓이 된다** —
 * *"호출부 0건"* · *"아직 주소가 되지 않는다"* · *"그리는 화면은 아직 없다"* 꼴의 문장은
 * 호출부를 만드는 커밋이 그 주석을 열지 않으므로 그대로 남는다. 갱신 시점을 적어 둬도
 * 그 시점이 **같은 브랜치 안에서** 지나간다 — *"다음 단계에서 갱신하라"*는 형태로는 닫히지
 * 않는다. 실행으로 재면 낡지 않는다.
 *
 * ## 자기 자신을 세지 않는 배치
 *
 * **소스를 세는 검사는 그 검사 자신이 세어지면 안 된다.** 두 겹으로 막는다:
 *
 * 1. **글롭이 `../src/**`이고 이 파일은 `test/`에 산다** — 세는 대상 밖이다.
 * 2. **`stripComments`로 주석을 걷는다** — `src` 안의 주석이 메서드 이름을 인용해도 세어지지
 *    않는다(`http-client.ts`의 표들이 실제로 인용한다).
 *
 * `role-access.test.ts`가 같은 배치이고, 그 파일 머리말이 이 함정의 고장 방식(세는 문장이
 * 자기 자신을 센다)을 적는다.
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
  'listMyTokens', 'revokeMyToken', 'revokeAllMyTokens', 'changePassword',
  'listMembers', 'addMember', 'updateMemberRole', 'removeMember',
  'getTree',
  'createMenu', 'updateMenu', 'deleteMenu',
  'createPage', 'updatePage', 'deletePage', 'getPage', 'importPage',
  'patchOps', 'listMyRevisions', 'listRevisionsBefore',
  'listComments', 'createComment', 'updateComment', 'deleteComment', 'renumberComments',
  'listSnapshots', 'createSnapshot', 'restoreSnapshot',
  'listPresets', 'createPreset',
  'getExportPreview', 'downloadExport',
  'getProjectTheme', 'putProjectTheme', 'getThemeImpact',
  'listThemePackages', 'getThemeManifest', 'uploadThemePackage', 'setThemePackageHidden', 'downloadThemeTemplate',
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
      if (new RegExp(`\\.\\s*${method}\\s*\\(`).test(code)) {
        map.get(method)?.push(path)
      }
    }
  }
  return map
}

/**
 * **지금 누가 무엇을 부르는가.** 이 표가 `http-client.ts`의 shape 주석들이 근거로 삼는 값이다 —
 * 그 주석들은 수를 들고 있지 않고 이 파일을 가리킨다.
 *
 * 값이 `[]`인 줄은 **부르는 자리가 없다**는 뜻이고, 그것이 shape를 얕게 두는 근거가 된다.
 * **비었다가 채워지면 이 케이스가 먼저 죽는다** — 그때 그 shape가 무엇을 읽게 됐는지 세어
 * 주석의 하중 표에 줄을 더하면 된다.
 */
const EXPECTED: Record<(typeof METHODS)[number], string[]> = {
  login: ['../src/routes/login.tsx'],
  // 로그아웃 흐름 `useLogout` 이 그 자리다(`session/session-menu.tsx`) — 에디터 · 셸 밖 화면 머리의 `…` 가 함께 쓴다.
  //
  // **부르는 자리가 하나인 것이 요점이다.** 세션을 끊는 길이 둘이 되면 한쪽만
  // `invalidate()`를 부르는 판이 생기고, 그러면 쿠키는 지워졌는데 화면은 로그인한 줄
  // 아는 상태가 남는다 — 그 상태의 모양은 `session/session-context.tsx` 머리말의 순환이다.
  logout: ['../src/session/session-menu.tsx'],
  me: ['../src/session/session-context.tsx'],
  listProjects: ['../src/projects/use-project-commands.tsx'],
  // 계정 설정의 API 토큰 절 하나다. 목록은 줄의 글자와 폐기 주소(`id`)를 읽는다(`SHAPES.myTokens`).
  listMyTokens: ['../src/account/tokens-section.tsx'],
  revokeMyToken: ['../src/account/tokens-section.tsx'],
  revokeAllMyTokens: ['../src/account/tokens-section.tsx'],
  // 계정 설정의 비밀번호 절 하나다. 204 라 읽는 본문이 없다(`SHAPES.noBody`).
  changePassword: ['../src/account/password-section.tsx'],
  // 설정 페이지의 «멤버» 절 하나다. 줄의 글자 · 역할 고르개의 값 · 주소(`userId`)를 읽는다(`SHAPES.members` · `SHAPES.member`) —
  // 초대 · 역할 바꾸기의 응답은 읽지 않는다(성공하면 목록을 다시 받는다).
  listMembers: ['../src/settings/members-section.tsx'],
  addMember: ['../src/settings/members-section.tsx'],
  updateMemberRole: ['../src/settings/members-section.tsx'],
  removeMember: ['../src/settings/members-section.tsx'],
  // **소비자가 셋이고 읽는 것이 다르다.** 셸은 `name`·`id`·`themeRev`(테마 따라잡기)를 그리려고 부르고, 스냅샷 화면은 **`role`**
  // 때문에 부른다 — 「권한 모델」이 생성을 editor에게 열었으므로 폼을 열지 말지 알아야 한다(목록은 viewer도 본다). 설정 페이지는
  // 이름 · 슬러그 · 설명(«일반» 의 지금 값)과 `role`(칸을 열지)을 읽는다.
  getProject: ['../src/routes/editor.tsx', '../src/shell/snapshots-panel.tsx', '../src/routes/settings.tsx'],
  createProject: ['../src/projects/use-project-commands.tsx'],
  // 설정 페이지의 «일반» 절 하나다 — 목록 줄의 인라인 수정은 없다(`routes/project-list.tsx` 머리말).
  updateProject: ['../src/settings/general-section.tsx'],
  // 설정 페이지의 «위험 구역» 하나다 — 목록 줄의 삭제는 없다(`routes/project-list.tsx` 머리말).
  deleteProject: ['../src/settings/danger-section.tsx'],
  getTree: ['../src/tree/use-tree-commands.tsx'],
  createMenu: ['../src/tree/use-tree-commands.tsx'],
  updateMenu: ['../src/tree/use-tree-commands.tsx'],
  deleteMenu: ['../src/tree/use-tree-commands.tsx'],
  createPage: ['../src/tree/use-tree-commands.tsx'],
  // **부르는 자리가 둘이다.** 트리 훅은 제목·소속 메뉴·순서를 고치고, 설명 탭은
  // `description` 하나를 고친다 — **본문의 키가 겹치지 않아** 두 자리가 서로의 값을
  // 덮지 않는다(`declaredOnly`가 준 키만 싣는다). 겹치기 시작하면 이 줄이 먼저 눈에 띈다.
  updatePage: ['../src/panels/page-description.tsx', '../src/tree/use-tree-commands.tsx'],
  deletePage: ['../src/tree/use-tree-commands.tsx'],
  // 페이지 가져오기. **트리 훅 하나에서만 불린다** — 가져오기는 트리를 바꾸는
  // 조작이므로 `createPage`와 같은 잠금·재조회·이동을 지나야 하고, 그 셋이 그 훅에
  // 있다. **화면(`panels/page-json-panel.tsx`)이 직접 부르기 시작하면 여기가 죽는다** —
  // 그때는 그 셋이 두 벌이 된 것이다.
  importPage: ['../src/tree/use-tree-commands.tsx'],
  // **셋이고 서로 다른 것을 읽는다.** 셸(`routes/editor.tsx`)은 `schema`·`headSeq`를
  // 스토어에 싣고, 편집 훅은 실패 뒤 재조회로 같은 둘을 다시 받고, **뷰 모드의 페이지
  // 설명 탭은 `title`·`description`을 읽는다**. 셋째가 자기 조회를 갖는 근거는
  // `panels/page-description.tsx`의 머리말에 있다 — 요지는 앞 둘이 그 두 키를 버린다는 것이다.
  // **넷째는 페이지 JSON 내보내기다.** `title`·`description`·`schema`를 읽는다 —
  // 파일의 `page` 절과 `schema` 절이 그 셋이다. **스토어의 문서를 쓰지 않는 근거**는
  // `edit/page-export.ts`의 머리말에 있다: 코멘트와 문서를 **같은 순간의 서버 상태**에서
  // 읽어야 파일이 끊긴 참조를 담지 않는다.
  getPage: [
    '../src/routes/editor.tsx',
    '../src/edit/use-edit-commit.tsx',
    '../src/panels/page-description.tsx',
    '../src/panels/page-json-panel.tsx',
  ],
  patchOps: ['../src/edit/use-edit-commit.tsx'],
  listMyRevisions: ['../src/routes/editor.tsx'],
  listRevisionsBefore: ['../src/edit/use-edit-commit.tsx'],
  // 코멘트 다섯. **쓰기 넷은 한 파일에서만 불린다** — 코멘트 탭이 표(본문)와
  // 문서(번호)를 잇는 유일한 자리라는 것이 규칙이고, **이 줄들이 그것을 실행으로 지킨다:**
  // 캔버스나 구조 트리가 직접 코멘트를 부르기 시작하면 여기가 죽는다.
  //
  // **캔버스가 `listComments`를 부르지 않는 것이 요점이다.** 마커는 코멘트 목록이 아니라
  // **문서의 `marker`**에서 나온다 — 그래야 내보낸 HTML 번들(설계서 「HTML 정적 번들」)도
  // 같은 것을 그린다.
  //
  // **`listComments`의 둘째·셋째 소비자는 그 규칙을 어기지 않는다.** 규칙이 막는 것은
  // *"번호와 본문을 잇는 자리가 둘이 되는 것"*이다. 프리셋 고르개는 적용 전에 *"코멘트 몇
  // 개가 고아가 되는가"*를 **세기만 한다** — 노드를 찾지도, `marker`를 읽지도, 코멘트를
  // 만들거나 지우지도 않는다. 페이지 JSON 내보내기는 파일의 `comments` 절을 채우려고
  // 부르고 `nodeId`·`body`만 실어 낸다 — 번호를 읽지도 잇지도 않는다(번호는 `schema` 안의
  // 노드가 나른다 — 설계서 「페이지 JSON」). 넷째 소비자가 생기면 이 줄이 먼저 죽는다 —
  // 그때 그것이 번호와 본문을 잇는지 본다.
  listComments: [
    '../src/panels/comment-panel.tsx',
    '../src/panels/preset-picker.tsx',
    '../src/panels/page-json-panel.tsx',
  ],
  createComment: ['../src/panels/comment-panel.tsx'],
  updateComment: ['../src/panels/comment-panel.tsx'],
  deleteComment: ['../src/panels/comment-panel.tsx'],
  renumberComments: ['../src/panels/comment-panel.tsx'],
  // 스냅샷 셋(목록·생성·복원). **셋 다 한 파일에서만 불린다** — 스냅샷 화면은 한 자리라는
  // 규칙이고, **이 줄들이 그것을 실행으로 지킨다:** 셸이나 다른 화면이 직접 스냅샷을 부르기
  // 시작하면 여기가 죽는다. 그 한 자리는 셸 머리의 팝오버다(`src/shell/snapshots-panel.tsx`
  // 머리말이 라우트가 아니라 팝오버인 근거를 적는다) — 셸은 팝오버를 그리기만 하고 스냅샷
  // API를 직접 부르지 않는다.
  //
  // **`getSnapshot`(상세)이 목록에 아예 없는 것이 요점이다.** 서버에는 그 엔드포인트가
  // 있지만 `ApiClient`에 두지 않는다 — payload를 읽는 것은 **서버**이고(복원 라우트가 스냅샷
  // id만 받는다), 화면은 그 결과 요약만 본다. 부르는 자리가 없는 메서드를 두면 그 응답의
  // shape가 무엇을 지키는지 아무도 확인하지 않은 채 남는다.
  listSnapshots: ['../src/shell/snapshots-panel.tsx'],
  createSnapshot: ['../src/shell/snapshots-panel.tsx'],
  restoreSnapshot: ['../src/shell/snapshots-panel.tsx'],
  // 프리셋 둘. **둘 다 고르개 하나에서만 불린다** — 고를 목록과 저장이 한 자리에
  // 있는 것이 그 화면의 꼴이고, **이 줄이 그것을 실행으로 지킨다:** 툴바나 셸이 직접 프리셋을
  // 부르기 시작하면 여기가 죽는다.
  //
  // **`deletePreset`이 목록에 아예 없는 것이 요점이다.** 서버에는 그 라우트가 있지만
  // (*"프리셋은 지울 수 있다"*는 규칙이라 이름에 유일 제약이 없다) 화면에 지우는 자리가
  // 없다 — 부르는 자리가 없는 메서드를 두면 그 응답의 shape가 무엇을 지키는지 아무도
  // 확인하지 않은 채 남는다(`getSnapshot`이 같은 자리에서 같은 판단).
  listPresets: ['../src/panels/preset-picker.tsx'],
  createPreset: ['../src/panels/preset-picker.tsx'],
  // 내보내기. 둘 다 같은 한 화면이 부른다 — 미리보기가 무엇이 실릴지 말하고
  // 그 다음에 앵커가 zip을 받는다.
  getExportPreview: ['../src/shell/export-panel.tsx'],
  downloadExport: ['../src/shell/export-panel.tsx'],
  // 테마 여덟. 부르는 화면이 서면 여기에 적는다(`api/http-client.ts`의 shape 주석이 이 표를 근거로 삼는다).
  // 에디터 셸의 프로젝트 테마가 바인딩 · manifest · 토큰을 읽는다 — 캔버스 · 속성 패널 · 패턴 고르개는 그 값을 받는다.
  // 설정 페이지의 «테마» 절이 지금 바인딩을 읽는다(고르개 · 토큰 편집기가 그 값에서 시작한다).
  getProjectTheme: ['../src/theme/project-theme.tsx', '../src/settings/theme-section.tsx'],
  // 둘이 저장한다 — 고르개는 판을 바꾸며(잇는 토큰과 함께), 토큰 편집기는 같은 판으로 토큰만. 둘 다 절이 쥔 `rev` 로 보낸다.
  putProjectTheme: ['../src/settings/theme-chooser.tsx', '../src/settings/token-editor.tsx'],
  // 고르개의 목록 · 확인 창(바꾸면 무엇이 달라지나 · 잇는 토큰을 셀 새 manifest).
  getThemeImpact: ['../src/settings/theme-chooser.tsx'],
  // 고르개의 목록(숨긴 판은 관리자에게만 «숨김» 으로) · 관리자 화면의 판 목록.
  listThemePackages: ['../src/settings/theme-chooser.tsx', '../src/routes/admin-themes.tsx'],
  getThemeManifest: ['../src/settings/theme-chooser.tsx'],
  // 관리자 셋 — 관리자 화면 하나에서만 불린다(`routes/admin-themes.tsx`).
  uploadThemePackage: ['../src/routes/admin-themes.tsx'],
  setThemePackageHidden: ['../src/routes/admin-themes.tsx'],
  downloadThemeTemplate: ['../src/routes/admin-themes.tsx'],
}

describe('ApiClient의 소비자', () => {
  it('검사가 진짜 소스를 읽는다', () => {
    // 글롭 경로가 어긋나면 `SOURCES`가 빈다. 그때 아래 케이스들은 *"표와 다르다"*로만
    // 죽고(표의 `[]`인 줄은 오히려 통과한다) 원인을 말하지 못한다 — 이 케이스가 그것을 이름으로 말한다.
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
    // 메서드로 세어진다.
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

    expect(/\.\s*createProject\s*\(/.test(planted)).toBe(true)
    expect(/\.\s*createProject\s*\(/.test(stripComments(planted))).toBe(false)
    expect(/\.\s*createPage\s*\(/.test(stripComments(planted))).toBe(false)
  })

  it('코드에 심은 호출은 잡는다 — 음성 대조', () => {
    // 반대편. 주석을 걷는 것이 **코드까지** 지우지는 않는지 본다.
    const planted = 'await api.deleteProject(id)\n// `api.deleteProject(…)` 를 설명하는 주석'

    expect(/\.\s*deleteProject\s*\(/.test(stripComments(planted))).toBe(true)
  })
})
