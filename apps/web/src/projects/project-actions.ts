/**
 * 프로젝트에 무엇을 할 수 있는지 판정하는 곳. **앱의 역할 분기가 사는 자리다.**
 * 화면은 이 결과로 `수정`·`삭제` 버튼을 감추거나 비활성한다 — 눌러 봐야 실패할 버튼을
 * 활성으로 두지 않는다(`tree/tree-actions.ts`·`edit/structure-actions.ts`와 같은 정신).
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다.** 판정이 컴포넌트 안에 흩어지면 케이스가
 * 화면을 지나야만 재지고, 목록의 각 항목이 자기 조건을 갖게 된다.
 *
 * **판정이 한 자리여야 하는 이유는 셀 수 있는 것이다.** `ProjectDetail.role`을 읽는 자리가
 * 저마다 분기하면 어느 분기가 어느 규칙을 따르는지, 규칙이 바뀔 때 어디서 깨지는지 알 수 없게
 * 되므로, **역할을 읽는 곳은 전부 이 함수의 인자 자리로 모은다.**
 *
 * **그 수를 이 주석이 들고 있지 않다 — `test/role-access.test.ts`가 센다.** 소스를 훑어
 * **주석을 걷고** `.role`을 읽는 코드가 전부 이 함수의 호출부인지 확인한다.
 *
 * > **세는 문장을 주석에 두면 자기 자신을 센다.** `apps/web/src` 전체로 세라고 적으면 그
 * > 문장이 세어지고, *"한 파일로 좁혀라"*로 적으면 **좁힌 그 파일 안의 주석**이 세어진다.
 * > **범위를 좁히는 것으로는 안 닫힌다** — 세는 대상 안에 그 문장이 있는 한 같은 일이 난다.
 * > 실행으로 재면 낡지 않는다.
 *
 * **던지지 않는 것이 이 파일의 계약이다.** `tree/tree-actions.ts`와 같은 근거다 — 이 판정은
 * 목록을 그리는 중에 불리는데 **목록은 오류 경계 밖이다**(`apps/web/src`의 경계는 캔버스의
 * `CanvasBoundary` 하나다). 그래서 모르는 값에도 답을 낸다.
 *
 * **서버가 내는 것**(다시 재는 법: api 하네스로 역할마다 세션을 만들어
 * `PATCH`·`DELETE /projects/:id`를 보낸다):
 *
 * ```
 * editor 멤버  PATCH /projects/:id → 403 {"code":"forbidden","message":"이 작업을 수행할 권한이 없습니다"}
 * editor 멤버  DELETE               → 403 (코드·문장 같음)
 * viewer 멤버  PATCH                → 403 (코드·문장 같음)
 * viewer 멤버  DELETE               → 403 (코드·문장 같음)
 * 멤버가 아닌 사용자 PATCH·DELETE   → 404 {"code":"not-found","message":"프로젝트를 찾을 수 없습니다"}
 * 없는 프로젝트 id  PATCH           → 404 (코드·문장 같음 — 비멤버와 구분되지 않는다)
 * 로그인하지 않은 호출 PATCH        → 401 {"code":"unauthenticated","message":"로그인이 필요합니다"}
 * ```
 *
 * **설계서 「권한 모델」이 적은 것과 잰 것이 일치한다** — 멤버지만 역할이 모자라면 403,
 * 멤버가 아니면 404다. **비멤버와 "없는 프로젝트"가 같은 코드·문장인 것도 함께 쟀다**(「권한 모델」이
 * 존재를 숨기려는 목적 그대로다). 그러므로 이 판정이 막는 것은 **403이 될 요청 하나**이고,
 * 404 쪽은 애초에 목록에 그 프로젝트가 실려 오지 않으므로 판정이 닿는 자리가 아니다.
 */
import type { ProjectRole } from '../api/types'

/** 지금 이 프로젝트에 할 수 있는 조작. 화면은 이것으로 버튼을 감추거나 비활성한다. */
export interface ProjectAbilities {
  /** 이름·슬러그·설명 수정. 서버는 셋을 한 `PATCH`로 받는다(README). */
  rename: boolean
  remove: boolean
  /**
   * 지금 상태를 태그로 얼릴 수 있는가(`POST .../snapshots`).
   *
   * **이 필드가 이 표에서 처음으로 owner가 아닌 값을 갖는다.** 「권한 모델」이 스냅샷 **생성**을
   * editor에게 열기 때문이다 — 위 둘과 갈리는 이유는 **스냅샷이 아무것도 바꾸지 않기**
   * 때문이다. 이름을 바꾸는 것도 지우는 것도 아니고, 지금 상태를 적어 둘 뿐이다.
   *
   * **복원은 이것이 아니다** — `restoreSnapshot`이 따로 있다. 「권한 모델」이 그것만 owner로 둔다.
   */
  createSnapshot: boolean
  /**
   * 스냅샷으로 **되돌릴** 수 있는가(`POST .../snapshots/:snapshotId/restore`).
   *
   * **`createSnapshot`과 값이 갈리는 첫 자리다.** 위의 `rename`·`remove`처럼 *"오늘 값이
   * 같은데 필드를 따로 둔다"*가 아니라 **실제로 다르다**: editor는 만들 수 있고 되돌릴 수
   * 없다(「권한 모델」 — *"editor: … 스냅샷 생성 (복원 불가)"*). 갈리는 이유는 **복원이 프로젝트
   * 전체를 바꾸기** 때문이다 — 생성은 지금 상태를 적어 둘 뿐이다.
   *
   * **owner가 아니면 버튼이 아예 없다**(회색으로 만들어 두지 않는다).
   */
  restoreSnapshot: boolean
  /**
   * **설계서 본문을 고칠 수 있는가** — 메뉴 · 페이지(제목 · 설명 · 순서 · 가져오기) · 노드(구조 · 속성 · 상호작용 ·
   * 모듈) · 코멘트(달기 · 고치기 · 지우기 · 재번호), 그리고 노드 **잠금**(설계서 「소프트 잠금」 — 선택이 곧 잠금이다). 「권한 모델」의 editor 줄
   * *"메뉴·페이지·컴포넌트·코멘트·상호작용 편집"* 이 이것이고, viewer 줄 *"조회 전용 — 편집·코멘트 모두 불가"* 가 그 반대다.
   * 서버는 이 쓰기들을 전부 `projectGuard('editor')`로 받는다(WS 는 `MIN_ROLE_FOR_FRAME` — `patch` · `lock` · `unlock`).
   *
   * **이 칸 하나가 에디터의 쓰기 입구를 전부 가른다.** 셸(`routes/editor.tsx`)이 한 번 읽어 트리 ·
   * 툴바 · 우측 패널 · 되돌리기 · 잠금에 내린다 — 받는 쪽은 역할을 모른다. **이 칸을 안 보는 입구가 하나라도 있으면**
   * (메뉴 이름 · 순서 · 구조 편집 · 코멘트 …) viewer 에게 그 입구가 열려 있고 누르면 서버가 403 을 낸다. 페이지 메타(설명 ·
   * 제목)만 따로 칸을 두지 않는 것은 「권한 모델」이 그것과 나머지 편집을 가르지 않기 때문이다(제목도 «페이지 편집»이다) —
   * 둘로 두면 한쪽만 열린 역할이 생길 때 어느 입구가 어느 칸을 보는지를 사람이 외워야 한다.
   *
   * **조회는 이것으로 막지 않는다** — 뷰 모드 · 페이지 옮기기 · 코멘트 읽기 · 내보내기 · 스냅샷 목록은 viewer 에게 그대로다.
   * 무엇이 숨고 무엇이 꺼지는지는 셸의 `canEdit` 주석이 갖는다. 서버의 403 은 방어로 그대로 선다.
   */
  editDesign: boolean
  /**
   * **프로젝트의 테마 · 판 · 토큰을 바꿀 수 있는가**(`PUT .../theme` — spec `2026-09-27-code-themes-design.md` 「권한」 — owner). 설정 페이지의
   * «테마» 절이 고르개 · 토큰 편집기를 이것으로 연다 — 아니면 지금 값만 보인다. `rename` 과 같은 값이어도 필드를 따로 둔다 — 서버가
   * 둘을 다른 라우트로 받는다(`rename` · `remove` 를 가르는 것과 같은 판단).
   */
  chooseTheme: boolean
  /**
   * **멤버를 초대하고 역할을 바꾸고 뺄 수 있는가**(`POST · PATCH · DELETE .../members` — owner). 목록은 viewer 도 본다(`GET`). 설정 페이지의
   * «멤버» 절이 폼 · 고르개 · 제외를 이것으로 연다. `rename` 과 값이 같아도 따로 둔다 — 서버가 다른 라우트로 받는다.
   */
  manageMembers: boolean
}

/** 아무것도 못 하는 상태. 역할을 모르거나 계약 밖 값일 때의 답이다. */
const NOTHING: ProjectAbilities = {
  rename: false,
  remove: false,
  createSnapshot: false,
  restoreSnapshot: false,
  editDesign: false,
  chooseTheme: false,
  manageMembers: false,
}

/**
 * `owner`는 전부, `editor`는 **스냅샷 생성과 설계서 본문**, 그 밖은 아무것도 못 한다.
 *
 * **`role !== 'owner'`면 곧장 `NOTHING`으로 가는 모양으로 두지 않는다.** 그 모양은
 * *"owner가 아니면 아무것도 못 한다"*는 **관측을 함수 모양에 박아 두는 것**이라, editor에게
 * 열리는 칸이 생기는 첫 자리에서 깨진다 — 설계서 「권한 모델」은 스냅샷 **생성**을 editor에게
 * 연다(복원만 owner다).
 *
 * **역할별 표를 두지 않는다.** 명시적으로 아는 역할만 비교하고 나머지는 `NOTHING`이다 —
 * 표를 두면 서버가 역할을 더할 때 그 칸을 채우게 되고, 채우는 사람이 열어 두면 조용히
 * 열린다. 비교로 두면 **모르는 값은 자동으로 닫힌다.**
 *
 * `role`의 타입이 `ProjectRole`이라고 해서 런타임 값이 그 셋 중 하나라는 보증은 없다.
 * 그 값은 서버 응답에서 오고, `api/http-client.ts`의 `SHAPES.projectDetail`은 `role`을 보지
 * 않는다(`id`·`name`만 본다). `'admin'`·`'Owner'`·`''`가 그대로 여기까지 올 수 있고,
 * 전부 `NOTHING`이 된다(테스트의 `계약에 없는 역할 문자열은 아무것도 열지 않는다`).
 *
 * **`rename`과 `remove`가 같은 조건인데도 필드를 둘로 두는 이유:** 서버가 둘을 각각
 * `PATCH`·`DELETE`로 받는다. 지금 값이 같은 것은 **오늘의 관측**이지 하나로 합쳐도 된다는
 * 뜻이 아니다 — 합치면 한쪽만 열리는 역할이 생길 때 부르는 쪽을 전부 고쳐야 한다.
 *
 * **두 화면이 따로 본다** — 설정 페이지의 «일반» 절(`settings/general-section.tsx`)이 `abilities.rename` 으로 칸을 열고,
 * 목록 줄(`routes/project-list.tsx`의 `ProjectRow`)이 `abilities.remove` 로 삭제 단추를 그린다.
 *
 * **그 배선은 케이스가 지킨다.** 지금 서버에 한쪽만 열리는 역할이 없어 이 함수가 두 필드에
 * 늘 같은 값을 내는 것은 맞지만, **이 함수를 주입해 값을 갈라 놓으면 배선이 드러난다.**
 * `test/routes/project-abilities-wiring.test.tsx`가 `vi.mock`으로 그것을 한다 — 삭제 단추가 `remove` 대신 `rename`을 보거나
 * 설정의 칸이 `rename` 대신 `remove`를 보게 하면 그 파일의 케이스가 죽는다.
 *
 * > **"못 만든다"는 문장은 다음 사람이 시도하지 않게 만든다.** 못 만든 것은 그 방법으로
 * > 못 만든 것이고, 여기서는 **판정을 주입하는 방법**이 있다.
 *
 * > *"아직 없다"*류 문장은 **만들려는 바로 그것 때문에 낡는다** — 그런 문장을 쓸 때는
 * > 무엇이 그것을 갱신하게 만드는지를 함께 적는다.
 */
export function projectAbilities(role: ProjectRole | undefined): ProjectAbilities {
  if (role === 'owner') {
    return {
      rename: true,
      remove: true,
      createSnapshot: true,
      restoreSnapshot: true,
      editDesign: true,
      chooseTheme: true,
      manageMembers: true,
    }
  }
  // **editor가 여는 것은 스냅샷 생성과 설계서 본문이다**(「권한 모델」). `role !== 'owner'`면
  // 곧장 `NOTHING`으로 가는 모양은 *"owner가 아니면 아무것도 못 한다"*를 함수 모양에 박아
  // 두는 것이라 editor에게 열리는 칸이 생기는 첫 자리에서 깨진다.
  if (role === 'editor') return { ...NOTHING, createSnapshot: true, editDesign: true }
  return NOTHING
}
