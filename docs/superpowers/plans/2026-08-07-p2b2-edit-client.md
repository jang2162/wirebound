# P2b-2 편집 파이프라인 (클라이언트) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 속성 패널에서 값을 바꾸면 화면에 즉시 반영되고, 서버에 revision으로 기록되며, 되돌릴 수 있게 한다.

**Architecture:** P2b-1이 만든 읽기 전용 셸 위에 **편집 파이프라인**을 얹는다. 편집은 `ops`를 만들어 스토어의 문서에 **낙관적으로 적용**한 뒤 `PATCH .../ops`로 보낸다. 서버 요청은 **직렬화**한다(in-flight 하나 — README가 요구한다). 어떤 실패든 **페이지를 재조회해 서버 상태로 수렴**하고, undo는 서버가 준 `inverse`를 그대로 되보낸다. 편집 상태는 P2b-1이 만든 순수 TS 스토어(`EditorStore`)에 산다 — React 없이 단위 테스트할 수 있어야 한다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · React 19 · Vite 6 · react-router 7 · vitest 3 + React Testing Library + jsdom · `@wirebound/schema`(`applyOps`·`invertOps`·`PatchOp`) · `@wirebound/renderer`

## Global Constraints

근거 문서는 셋이다. **서버 동작이 궁금하면 코드가 아니라 `apps/api/README.md`의 엔드포인트 표를 먼저 본다** — README 스스로 그것이 P2b의 계약이라고 선언한다.

- `docs/superpowers/specs/2026-08-03-wirebound-design.md` (§7 편집·실시간·이력, §9 화면 구조)
- `apps/api/README.md` ("편집 파이프라인 (`PATCH .../ops`)" 절)
- `docs/superpowers/plans/2026-08-06-p2b1-carryforward.md` (P2b-1이 남긴 계약과 이월)

제약:

- **의존 방향은 한 방향이다:** `schema` ← `renderer` ← `apps/web`. `apps/web`이 `apps/api`를 import하지 않는다.
- **`apps/web`에 `zod`를 들이지 않는다.** 봉투 검사는 얕은 형태 검사다(P2b-1의 `SHAPES` 관례).
- **사용자 대면 메시지와 주석은 전부 한국어.** 주변 코드의 주석 밀도·어투(무엇이 아니라 왜)를 따른다.
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `moduleResolution: bundler`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`pnpm test`가 초록이어야 한다.** 현재 **989 tests / 59 files**.
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지.
- **완결성을 주장하지 마라.** "전부"·"항상"·"유일"은 측정한 뒤에만 쓰고, 쓸 때는 그 측정을 함께 적어라. 모르면 "재지 못했다"고 적어라. (이월 문서 "반복된 결함" 절 — 그 규칙이 P2b-1 마무리에서 두 번 더 깨졌다.)

## 이 단계가 만들지 않는 것

의도적으로 뺀 것들이다. 리뷰어가 "왜 없냐"고 묻지 않도록 여기 적어 둔다.

- **노드 추가·삭제·이동.** 구조 트리의 편집은 **P2b-3**이다. 이 단계는 **속성 값 편집만** 한다 — 파이프라인이 서고 나면 구조 편집은 "`ops`를 만드는 방법"만 다른 같은 경로다.
- **드래그 정렬.** 메뉴·페이지 트리와 구조 트리의 드래그(설계 §9)는 P2b-3이다.
- **메뉴·페이지·프로젝트 생성/수정 화면.** 서버에 엔드포인트가 있지만 이 단계는 페이지 **스키마**만 바꾼다.
- **WebSocket·실시간 동기화·소프트 잠금.** 설계 §7.1의 WS 전송과 §7.2의 잠금은 **P3**다. 이 단계는 REST(`PATCH .../ops`)만 쓴다. 그래서 **다른 사람의 편집이 실시간으로 들어오지 않는다** — 409를 받았을 때 재조회로만 알게 된다.
- **`baseSeq` 불일치의 리베이스.** 설계 §13이 "P3에서 다시 본다"로 표시해 뒀다. 이 단계는 재조회로 수렴한다.
- **코멘트·번호 마커·상호작용 탭.** P5다. 우측 패널은 이 단계에서도 탭이 하나(속성)뿐이다.
- **테마.** P4a다. `visibleWhen.structure`의 비교 대상이 `defaultStructure(def)`인 것도 그대로 둔다(이월 문서 P4a 인계 3번).

## 설계 결정 (계획 단계에서 확정)

구현자가 다시 고민하지 않도록 근거와 함께 못 박는다.

**D1. 세션은 앱 전역 상태 하나다.** 지금은 `RequireAuth`와 `RedirectWhenAuthenticated`가 각자 `useSession()`을 불러 **각자 `me()`를 요청한다.** 그것이 이월 문서 §1이 기록한 리다이렉트 순환의 엔진이다 — 왕복할 때마다 새로 물으므로 `me`가 성공하는 한 영원히 튕긴다(실측: `me` 749→4122회/800ms, `list` 30,481회, 정착하지 않음).

`SessionProvider`가 `me()`를 **한 번** 부르고 그 결과를 컨텍스트에 둔다. `unauthenticated`를 받은 자리는 `invalidate()`로 그 상태를 `anonymous`로 바꾼다. `/login`은 그 상태만 보고 다시 묻지 않는다. **왕복이 상태를 바꾸지 못하므로 순환이 성립하지 않는다.**

**P2b-2가 이것을 먼저 하는 이유:** 편집 요청마다 같은 판정이 돌아 이 순환이 무장된다(이월 문서 §1이 그렇게 적었다).

**D2. 문서·`headSeq`·`openPageId`를 함께 내주는 관문을 넓힌다.** P2b-1의 `useOpenDocument(pageId)`는 `PageDocument | null`만 낸다. 편집은 `baseSeq`(= `headSeq`)가 필요한데, 스토어를 직접 읽으면 **가드 테스트(`test/store-access-guard.ts`)가 막는다** — 그리고 그 가드의 메시지가 지목하는 합법 경로가 정확히 여기다("`src/store/use-editor-store.tsx`에 같은 대조를 하는 관문을 더해라").

`useOpenPage(pageId)`가 `{ document, headSeq } | null`을 낸다. `useOpenDocument`는 그것 위의 얇은 껍질로 남긴다 — 세 화면(캔버스·구조 트리·속성 패널)이 이미 쓰고 있고 문서만 필요하다.

**반환 객체는 매번 새로 만들면 안 된다**(`use-editor-store.tsx` 머리말: selector가 새 객체를 만들면 `useSyncExternalStore`가 렌더를 반복한다). `useMemo`로 두 값에 묶는다.

**D3. 편집 상태는 `EditorStore`에 산다. React를 모른다.** P2b-1의 D1이 그렇게 정했고 스토어 머리말이 "P2b-2가 이 스토어에 낙관적 적용·롤백·리베이스·pending 큐·undo/redo 스택을 얹는다"고 적어 두었다. `apps/web/test/store/editor-store.test.ts`가 DOM 없는 환경에서 그것을 강제한다.

**D4. 실패는 재조회로 수렴한다.** 409(baseSeq 불일치)·422(카탈로그 위반)·네트워크 실패 — **어떤 실패든** 페이지를 다시 받아 문서·`headSeq`를 서버 상태로 맞추고, 보내지 못한 pending을 버리고, 사용자에게 알린다.

**왜 항목별 롤백이 아닌가.** 설계 §7.1이 *"`inverse`는 서버가 적용 직전 상태를 보고 생성한다. 클라이언트가 계산해 보내지 않는다 — 클라이언트 상태가 낙관적으로 앞서 있을 수 있기 때문이다"*라고 못박았다. 클라이언트가 로컬 `inverse`로 되돌리면 같은 이유로 틀릴 수 있다. 롤백 경로가 하나뿐이면 **어떤 실패에서도 클라이언트가 서버와 어긋나지 않는다**, 그리고 P3의 리베이스가 들어올 자리가 비어 있다.

**대가:** 안 보낸 pending을 잃는다. D5의 커밋 단위 때문에 pending이 쌓이는 창이 좁아 실질 손실이 작다.

**D5. 텍스트 입력은 blur/Enter에 한 번 커밋한다.** 타이핑 중에는 컴포넌트의 로컬 state만 바뀌고 편집이 나가지 않는다. `switch`·`select`는 조작 즉시 커밋한다(중간 상태가 없다).

**근거 셋:** (1) undo 한 단계가 사람의 의도("이 필드를 이 값으로 바꿨다")와 일치한다. (2) 요청 수가 최소다. (3) **디바운스 타이머가 없어 테스트가 결정적이다** — 이월 문서가 `editor-shell.test.tsx`의 3/20 간헐 실패를 기록하고 있고, 페이크 타이머 없이 타이머를 쓰면 같은 성질이 다시 생긴다.

**값이 안 바뀌었으면 커밋하지 않는다.** blur마다 revision이 나면 이력이 무의미해진다.

**D6. 요청은 직렬화한다. in-flight는 항상 하나다.** README가 요구한다 — *"앞 요청의 `seq`를 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다."* pending은 배열이고 `[0]`이 전송 중인 것이다. ack가 오면 shift하고 다음을 보낸다.

**D7. 낙관적 적용이 로컬에서 실패하면 요청을 보내지 않는다.** `applyOps`가 던지면(경로가 없는 등) 그것은 클라이언트가 만든 잘못된 `ops`다. 서버에 보내 봐야 409/422를 받으므로 재조회 비용만 든다. 그 자리에서 멈추고 알린다.

**D8. 편집 실패 통지는 셸 상단의 한 자리에 모은다.** 조회 실패는 각 화면이 자기 자리에 그리지만(P2b-1), 편집 실패는 **어느 화면에서 시작됐든 같은 결과**(재조회·pending 손실)이므로 자리를 나눌 이유가 없다. `role="alert"` 하나.

**D9. undo/redo 스택은 revision id와 `inverse`를 함께 든다.** 설계 §7.3이 *"클라이언트가 자기 revision id 스택을 보유한다"*고 했고, README가 *"응답의 `inverse`를 그대로 다시 `ops`로 보내면 그 편집이 취소된다"*고 했다. 둘 다 필요하다 — id는 새로고침 복원(D10)에서 중복을 거르는 데 쓰고, `inverse`는 전송에 쓴다.

**undo도 새 revision을 만든다.** 그 응답의 `inverse`가 redo용이다. 서버에 undo 개념은 없다.

**D10. 새로고침하면 `GET .../revisions?mine=true`로 undo 스택을 복원한다.** 설계 §7.3이 "최근 revision 50개"라고 했고 README의 기본 `limit`이 50이다. **응답은 `seq` 내림차순**이므로 그대로 스택 순서(최신이 top)다.

**복원한 항목은 redo를 갖지 않는다.** redo 스택은 세션 안에서 undo를 눌러야 생긴다.

**D11. `PATCH .../ops`의 응답 봉투도 얕게 검사한다.** P2b-1이 만든 `SHAPES` 표에 항목을 더한다 — `request`의 `shape`가 필수 인자라 **빠뜨리면 컴파일 에러다**(TS2554, P2b-1에서 실증).

**`inverse`의 내용은 검사하지 않는다.** 그것은 서버가 만든 `PatchOp[]`이고, 그 안쪽까지 보는 것은 `schema`의 일이다(D8 경계와 같은 이유).

## 파일 구조

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `apps/web/src/session/session-context.tsx` | 앱 전역 세션 상태(D1). `SessionProvider`·`useSessionState`·`useInvalidateSession` |
| `apps/web/src/store/edit-queue.ts` | 편집 큐의 순수 로직(D6) — 다음에 보낼 것 고르기, ack 반영, 실패 시 비우기 |
| `apps/web/src/edit/use-edit-commit.tsx` | 화면이 편집을 내는 통로. ops를 만들어 스토어에 넘기고 전송을 밟는다 |
| `apps/web/src/edit/ops.ts` | prop 하나를 바꾸는 `PatchOp` 만들기(경로 조립) |
| `apps/web/src/panels/controls/` | 컨트롤 위젯 넷(`text-control.tsx`·`switch-control.tsx`·`select-control.tsx`·`list-control.tsx`) |
| `apps/web/src/shell/edit-alert.tsx` | 편집 실패 통지 한 자리(D8) |

**고치는 것**

| 파일 | 무엇 |
|---|---|
| `apps/web/src/store/editor-store.ts` | `pending`·`undoStack`·`redoStack`·`editStatus` 추가, 낙관적 적용 액션 |
| `apps/web/src/store/use-editor-store.tsx` | `useOpenPage` 추가(D2) |
| `apps/web/src/api/client.ts` | `patchOps`·`listMyRevisions` 추가, `PatchResult`·`RevisionSummary` 타입 |
| `apps/web/src/api/http-client.ts` | 두 메서드 구현 + `SHAPES` 항목 |
| `apps/web/src/api/types.ts` | `PatchResult`·`RevisionSummary` |
| `apps/web/src/routes/require-auth.tsx` | `useSession`을 컨텍스트에서 읽게(D1) |
| `apps/web/src/api/failure.tsx` | `unauthenticated`를 받으면 세션 무효화 |
| `apps/web/src/panels/property-panel.tsx` | 읽기 전용 값 → 컨트롤 위젯 |
| `apps/web/src/routes/editor.tsx` | `EditAlert` 배치, 페이지 로드 시 undo 스택 복원 |

## 실행 시 유의 — 모든 디스패치에 붙일 것

- **가드 테스트가 스토어 직접 읽기를 막는다.** `apps/web/test/store-access-guard.ts`가 `document`·`headSeq`·`openPageId`를 selector나 `getState()` 안에서 읽는 것을 잡는다. **Task 2가 합법 경로를 넓히기 전에는 그 필드들을 화면에서 읽을 수 없다.** 걸리면 가드를 무력화하지 말고 Task 2의 관문을 쓴다.
- **가드는 오탐을 낸다.** 페이지 필드와 같은 이름이 스토어가 아닌 것에 붙은 인라인 selector도 걸린다(`(s) => s.pending.some((p) => p.headSeq < base)`). 걸렸는데 스토어 필드가 아니면 **그 사실을 그 자리에 적고 넘어가라** — 가드 머리말이 그렇게 안내한다.
- **`useEditorStore` selector에 `(s) => s`를 쓰지 마라.** 테스트 전용 형태다.
- **`onNodeError`는 렌더 도중에 불린다 — 그 안에서 `setState` 금지.**
- **커밋 창을 재려면 `MutationObserver`를 써라.** `test/editor-harness.tsx`의 `CommitProbe`는 `useLocation` 기반이라 **주소가 그대로인 커밋을 못 본다**(P2b-1 리뷰 실측).
- **간헐 실패를 의심하면 반복 실행으로 재라.** `pnpm vitest run --project web` 8회가 P2b-1의 관례였다.

---

### Task 1: 세션을 앱 전역 상태 하나로 (§1 리다이렉트 순환)

**Files:**
- Create: `apps/web/src/session/session-context.tsx`
- Modify: `apps/web/src/routes/require-auth.tsx`, `apps/web/src/app.tsx`, `apps/web/src/api/failure.tsx`
- Test: `apps/web/test/session/session-context.test.tsx`, `apps/web/test/routes/require-auth.test.tsx`(기존)

**Interfaces:**
- Consumes: `ApiClient.me()`, `toFailure`
- Produces:

```tsx
export type SessionState =
  | { status: 'pending' }
  | { status: 'authenticated' }
  | { status: 'anonymous' }
  | { status: 'failed'; message: string }

export function SessionProvider(props: { children: ReactNode }): ReactElement
/** 지금 세션 상태. Provider 밖에서 부르면 던진다. */
export function useSessionState(): SessionState
/** 세션이 끊긴 것을 알았을 때 부른다. 이미 `anonymous`면 아무 일도 하지 않는다. */
export function useInvalidateSession(): () => void
```

- [ ] **Step 1: 순환을 재는 테스트를 먼저 쓴다**

`apps/web/test/session/session-context.test.tsx`.

**이 테스트의 핵심은 요청 수를 세는 것이다.** 이월 문서가 순환을 `me` 4122회/800ms로 실측했으므로, 고친 뒤에는 **호출 수가 유한하게 정착**해야 한다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `me는 앱이 뜨는 동안 한 번만 불린다` | `RequireAuth`와 `RedirectWhenAuthenticated`가 둘 다 마운트돼도 `me` 호출 1회 |
| 2 | `me가 성공하는데 조회가 unauthenticated면 로그인 화면에서 멈춘다` | **순환 재현 케이스.** `me`는 늘 성공하고 `listProjects`는 `unauthenticated`를 던지는 가짜로 `<App />`을 렌더 → 800ms 상당을 돌린 뒤 `me` 호출 수가 **한 자릿수**이고 `/login`에 머문다 |
| 3 | `무효화하면 로그인 화면이 뜬다` | `invalidate()` 호출 → `anonymous` |
| 4 | `무효화한 뒤에는 me를 다시 묻지 않는다` | 무효화 후 `me` 호출 수가 늘지 않는다 |
| 5 | `로그인에 성공하면 다시 authenticated가 된다` | 재무효화 이후의 복귀 경로 |
| 6 | `Provider 밖에서 useSessionState를 부르면 던진다` | 기본값 `null`의 의도(P2b-1 관례) |

**케이스 2가 이 태스크의 전부다.** 나머지가 전부 통과해도 2가 실패하면 순환이 살아 있다.

케이스 2의 하네스 요지:

```tsx
let meCalls = 0
const api = fakeApi({
  me: async () => {
    meCalls += 1
    return USER
  },
  listProjects: async () => {
    throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
  },
})

renderWithProviders(<App />, { api, route: '/' })
// 커밋이 정착할 때까지 흘린다. waitFor는 RTL의 asyncWrapper를 지나므로
// test/setup.ts가 얹은 act 한 칸을 함께 받는다.
await waitFor(() => expect(screen.getByLabelText('이메일')).toBeTruthy())
const settled = meCalls
await waitFor(() => expect(meCalls).toBe(settled))
expect(meCalls).toBeLessThan(10)
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/test/session/session-context.test.tsx --project web`
Expected: 파일이 없어 실패. 케이스 2를 기존 구조에 옮겨 심으면 `meCalls`가 정착하지 않는다 — **그것이 순환의 실측이다. 수치를 보고에 적어라.**

- [ ] **Step 3: `SessionProvider`를 만든다**

`apps/web/src/session/session-context.tsx`:

```tsx
/**
 * 앱 전역에 하나뿐인 세션 상태.
 *
 * **왜 컨텍스트인가.** 앞 판은 `RequireAuth`와 `RedirectWhenAuthenticated`가 각자
 * `useSession()`을 불러 **각자 `me()`를 요청했다.** 그래서 `/`와 `/login`을 오갈 때마다
 * 판정이 새로 났고, `me`가 성공하는데 다른 요청이 `unauthenticated`를 내는 상태에서는
 * 두 화면이 서로를 무한히 튕겼다(P2b-1 이월 §1 — 실측 `me` 4122회/800ms, 정착하지 않음).
 *
 * 상태가 하나면 왕복이 그것을 바꾸지 못하므로 순환이 성립하지 않는다.
 *
 * **`me()`는 마운트에 한 번뿐이다.** 자동 재시도가 없는 것은 앞 판과 같다 — 재시도가
 * 있으면 서버가 계속 실패하는 동안 요청이 쌓인다.
 */
```

상태 넷은 앞 판의 `SessionState`를 그대로 옮긴다. `invalidate`는 `anonymous`로 보내되 **이미 `anonymous`면 상태를 교체하지 않는다**(참조가 바뀌면 구독자가 헛일을 한다 — 스토어의 `#apply`와 같은 이유).

- [ ] **Step 4: `require-auth.tsx`를 컨텍스트 사용으로 바꾼다**

`useSession()`(로컬 훅)을 지우고 `useSessionState()`를 쓴다. **두 컴포넌트의 갈림(`failed`를 어떻게 다루나)은 그대로 둔다** — 그 주석이 왜 갈리는지 적고 있고 그 판단은 여전히 옳다.

- [ ] **Step 5: `failure.tsx`가 세션을 무효화하게 한다**

`toFailure`는 순수 함수로 두고(테스트가 쉽다), `SignedOut`이 렌더될 때 무효화한다:

```tsx
export function SignedOut(): ReactElement {
  const invalidate = useInvalidateSession()
  // 렌더 중이 아니라 커밋 뒤에 부른다 — 렌더 도중의 setState는 다른 컴포넌트를 갱신할 수 없다.
  useEffect(invalidate, [invalidate])
  return <Navigate to="/login" replace />
}
```

- [ ] **Step 6: `app.tsx`에 Provider를 얹는다**

`ApiProvider` 안쪽, 라우터 바깥이다 — 라우트가 바뀌어도 상태가 살아야 한다.

- [ ] **Step 7: 전체 테스트를 돌린다**

Run: `pnpm vitest run --project web`
Expected: 새 케이스 6개 통과, 기존 `require-auth.test.tsx`도 통과(가짜 api를 쓰는 형태가 바뀌었으면 함께 고친다).

- [ ] **Step 8: 구분력을 실증한다**

`SessionProvider`의 상태 공유를 되돌려(각 컴포넌트가 다시 `me()`를 부르게) 케이스 2가 죽는지 본다. **죽지 않으면 덮지 말고 그대로 보고하라.** 확인 뒤 복구하고 `git status` clean을 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add apps/web/src/session/session-context.tsx apps/web/src/routes/require-auth.tsx apps/web/src/api/failure.tsx apps/web/src/app.tsx apps/web/test/session/session-context.test.tsx
git commit -m "fix(web): 세션을 앱 전역 상태 하나로 두어 리다이렉트 순환을 닫는다"
```

---

### Task 2: `useOpenPage` — 편집이 지날 합법 경로를 넓힌다

**Files:**
- Modify: `apps/web/src/store/use-editor-store.tsx`
- Test: `apps/web/test/store/use-editor-store.test.tsx`(기존), `apps/web/test/store-access.test.ts`(기존 — 가드가 이 변경을 어떻게 보는지)

**Interfaces:**
- Consumes: `EditorStore`의 `document`·`headSeq`·`openPageId`
- Produces:

```tsx
/** 지금 주소가 가리키는 페이지의 문서와 그 revision. 다른 페이지의 것이면 `null`. */
export function useOpenPage(pageId: string | undefined): { document: PageDocument; headSeq: number } | null
/** 문서만 필요할 때. `useOpenPage`의 껍질이다. */
export function useOpenDocument(pageId: string | undefined): PageDocument | null
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

`apps/web/test/store/use-editor-store.test.tsx`에 더한다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `열린 페이지의 문서와 headSeq를 함께 낸다` | `loadPage('pg-1', doc, 7)` → `{ document: doc, headSeq: 7 }` |
| 2 | `다른 페이지의 것이면 null이다` | `loadPage('pg-2', …)` 뒤 `useOpenPage('pg-1')` → `null` |
| 3 | `문서가 없으면 null이다` | `clearPage()` 뒤 |
| 4 | `같은 상태에서 반환 참조가 유지된다` | **이것이 핵심이다.** 관계없는 액션(`setZoom`)으로 리렌더를 일으켜도 반환 객체가 `Object.is`로 같다 |
| 5 | `문서가 바뀌면 새 객체를 낸다` | 4의 양성 대조 — 참조를 얼려 버리는 구현을 잡는다 |
| 6 | `useOpenDocument는 같은 대조를 한다` | 기존 케이스가 계속 통과하는지 |

**케이스 4가 없으면 `useSyncExternalStore`가 렌더를 반복하는 구현이 통과한다**(그 함정은 `use-editor-store.tsx` 머리말이 적고 있다).

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/test/store/use-editor-store.test.tsx --project web`
Expected: `useOpenPage`가 없어 실패.

- [ ] **Step 3: 구현한다**

```tsx
export function useOpenPage(pageId: string | undefined): OpenPage | null {
  const store = useEditorStoreInstance()
  const document = useEditorStore(store, (s) => s.document)
  const headSeq = useEditorStore(store, (s) => s.headSeq)
  const openPageId = useEditorStore(store, (s) => s.openPageId)

  const open = openPageId !== null && openPageId === pageId && document !== null
  // 세 값을 한 객체로 묶는 자리라 매 렌더 새 객체가 된다. useSyncExternalStore의 스냅샷이
  // 아니라 훅의 반환값이므로 렌더가 반복되지는 않지만, 이것을 의존 배열에 넣는 쪽
  // (Task 5의 전송 이펙트)이 매 렌더 다시 돌게 된다.
  return useMemo(() => (open ? { document, headSeq } : null), [open, document, headSeq])
}
```

`useOpenDocument`는 `useOpenPage(pageId)?.document ?? null`로 줄인다. **머리말의 "왜 한 곳인가" 주석은 남긴다** — 그 이유가 이 태스크로 더 강해졌다(이제 `headSeq`도 같은 대조를 받는다).

- [ ] **Step 4: 가드가 이 변경을 어떻게 보는지 확인한다**

Run: `pnpm vitest run apps/web/test/store-access.test.ts --project web`
Expected: 통과. `use-editor-store.tsx`는 가드의 **제외 대상**이므로 여기서 세 필드를 읽는 것이 정당하다. **가드의 위반 메시지가 지목하는 자리가 바로 이곳임을 주석에 적어라.**

- [ ] **Step 5: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web
git add apps/web/src/store/use-editor-store.tsx apps/web/test/store/use-editor-store.test.tsx
git commit -m "feat(web): 문서와 headSeq를 함께 내주는 관문을 둔다"
```

---

### Task 3: `ApiClient.patchOps` — 편집 요청 통로

**Files:**
- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/http-client.ts`, `apps/web/src/api/types.ts`
- Test: `apps/web/test/api/http-client.test.ts`(기존), `apps/web/test/api/response-shape.test.tsx`(기존)

**Interfaces:**
- Produces:

```ts
// types.ts
export interface PatchResult {
  seq: number
  revisionId: string
  /** 이 편집을 되돌리는 ops. **서버가 만든다** — 클라이언트가 계산하지 않는다(설계 §7.1). */
  inverse: PatchOp[]
  schemaVersion: number
  clientOpId?: string
}

// client.ts
patchOps(
  projectId: string,
  pageId: string,
  body: { baseSeq: number; ops: PatchOp[]; clientOpId?: string },
): Promise<PatchResult>
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `ops를 PATCH로 보낸다` | 경로 `/api/projects/p-1/pages/pg-1/ops`, 메서드 PATCH, 본문에 `baseSeq`·`ops` |
| 2 | `응답의 seq와 inverse를 그대로 낸다` | 봉투를 벗기지 않는다 — 서버 응답이 곧 `PatchResult`다 |
| 3 | `baseSeq 불일치는 conflict 코드로 온다` | 409 → `ApiError`의 `code === 'conflict'` |
| 4 | `카탈로그 위반은 validation-failed와 issues를 싣는다` | 422 → `issues`가 배열이고 비어 있지 않다 |
| 5 | `봉투가 계약을 어기면 ApiError다` | `{ seq: 'x' }` → `internal`. **`response-shape.test.tsx`에 넣어라** — 그 파일이 봉투 검사의 자리다 |

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/test/api --project web`

- [ ] **Step 3: `SHAPES`에 항목을 더하고 구현한다**

`http-client.ts`의 `SHAPES`에 `patchResult`를 더한다 — `seq`가 수, `revisionId`가 문자열, `inverse`가 배열인지까지. **`inverse` 안쪽은 보지 않는다**(D11).

`request`의 `shape`가 필수 인자이므로 **빠뜨리면 컴파일이 막는다**. 그 사실을 이 태스크에서 다시 실증할 필요는 없다(P2b-1이 TS2554로 확인했다).

- [ ] **Step 4: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/api/client.ts apps/web/src/api/http-client.ts apps/web/src/api/types.ts apps/web/test/api/
git commit -m "feat(web): 편집 요청을 보내는 patchOps를 둔다"
```

---

### Task 4: 스토어의 편집 상태와 낙관적 적용

**Files:**
- Create: `apps/web/src/store/edit-queue.ts`, `apps/web/src/edit/ops.ts`
- Modify: `apps/web/src/store/editor-store.ts`
- Test: `apps/web/test/store/edit-queue.test.ts`, `apps/web/test/store/editor-store.test.ts`(기존), `apps/web/test/edit/ops.test.ts`

**Interfaces:**
- Consumes: `@wirebound/schema`의 `applyOps`·`PatchOp`·`PatchError`
- Produces:

```ts
// editor-store.ts에 추가되는 상태
export interface PendingEdit {
  /** 이 편집을 만든 쪽이 붙인 id. 서버 응답의 clientOpId와 맞춰 ack를 가른다. */
  clientOpId: string
  ops: PatchOp[]
  /** 이 편집을 만들 때의 headSeq. [0]만 전송되므로 실제 baseSeq는 전송 시점에 다시 읽는다. */
  baseSeq: number
}

export type EditStatus = 'idle' | 'sending' | 'recovering'

// EditorStore의 새 액션
/** 낙관적으로 적용하고 큐에 넣는다. 적용에 실패하면 `false`를 내고 큐를 건드리지 않는다(D7). */
readonly applyEdit: (clientOpId: string, ops: PatchOp[]) => boolean
/** 성공한 편집 하나를 큐에서 지우고 headSeq를 올린다. undo 스택에 push한다. */
readonly ackEdit: (clientOpId: string, result: { seq: number; revisionId: string; inverse: PatchOp[] }) => void
/** 실패. 큐를 비우고 상태를 바꾼다. 문서 복원은 재조회가 한다(D4). */
readonly failEdits: () => PendingEdit[]
readonly setEditStatus: (status: EditStatus) => void

// edit/ops.ts
/** 노드의 prop 하나를 바꾸는 op. 문서에서 노드 경로를 찾아 조립한다. */
export function propOps(document: PageDocument, nodeId: string, prop: string, value: unknown): PatchOp[] | null
```

- [ ] **Step 1: `ops.ts`의 테스트를 먼저 쓴다**

`propOps`는 순수 함수다 — 문서와 노드 id, prop 이름, 값을 받아 `PatchOp[]`를 만든다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `루트 자식의 prop을 바꾸는 경로를 만든다` | `/root/children/0/props/title` |
| 2 | `깊이 중첩된 노드의 경로를 만든다` | 손자 노드 |
| 3 | `props가 없던 노드에는 props 객체째로 add한다` | op 하나 — `add /root/children/0/props` 값 `{ title: '…' }` |
| 4 | `없는 노드면 null이다` | 요청을 보내지 않는 신호 |
| 5 | `만든 ops를 applyOps에 넣으면 그 값이 들어간다` | **왕복 대조** — 경로를 손으로 적은 단언만 있으면 오프바이원을 못 잡는다 |

**케이스 5가 이 파일의 핵심이다.** `findNodePath`(schema가 이미 낸다)를 쓰면 경로 조립이 짧아진다.

**케이스 3의 모양은 소스를 읽어 확정했다.** `packages/schema/src/patch/apply.ts`의 `resolveSlot`은 경로의 마지막 토큰만 남기고 나머지를 따라 내려가는데, `props`가 없는 노드에서 `/…/props/title`을 주면 `parent`가 `undefined`가 되어 **`경로를 찾을 수 없습니다`로 던진다.** 그러므로 `props`가 없을 때는 **`props` 객체를 통째로 `add`한다**(op 둘로 나누지 않는다 — 하나면 되고 서버가 만들 `inverse`도 단순해진다). 이미 `props`가 있으면 통째 `add`는 남의 prop을 지우므로 `replace /…/props/<prop>`를 쓴다. **두 갈래를 케이스로 각각 고정하라.**

- [ ] **Step 2: 실패를 확인하고 `ops.ts`를 구현한다**

Run: `pnpm vitest run apps/web/test/edit/ops.test.ts --project web`

- [ ] **Step 3: `edit-queue.ts`의 테스트를 쓴다**

큐 로직만 순수 함수로 뽑는다 — 스토어에 넣기 전에 단독으로 재기 위해서다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `보낼 것이 없으면 null이다` | 빈 큐 |
| 2 | `첫 항목을 보낸다` | `[0]`이 in-flight |
| 3 | `ack하면 첫 항목이 빠진다` | |
| 4 | `모르는 clientOpId의 ack는 무시한다` | 늦게 도착한 응답이 큐를 흔들지 않는다 |
| 5 | `실패하면 큐가 비고 버려진 항목이 반환된다` | 통지에 쓸 수 있게(D8) |

- [ ] **Step 4: 스토어에 액션을 더한다**

`applyEdit`이 하는 일:

```ts
readonly applyEdit = (clientOpId: string, ops: PatchOp[]): boolean => {
  const { document, headSeq } = this.#state
  if (document === null) return false
  let next: PageDocument
  try {
    // applyOps는 던진다(경로 없음 등). 그것은 클라이언트가 만든 잘못된 ops이므로
    // 서버에 보내지 않는다(D7) — 보내 봐야 409/422를 받고 재조회 비용만 든다.
    next = applyOps(document, ops) as PageDocument
  } catch {
    return false
  }
  this.#apply({
    document: next,
    pending: [...this.#state.pending, { clientOpId, ops, baseSeq: headSeq }],
  })
  return true
}
```

**`pending`을 새 배열로 만드는 것이 계약이다** — `#apply`가 참조 비교를 하므로 제자리에서 `push`하면 알림이 안 간다.

- [ ] **Step 5: 스토어 테스트를 더한다**

`apps/web/test/store/editor-store.test.ts`(DOM 없는 환경)에:

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `편집을 적용하면 문서가 바뀌고 큐에 쌓인다` | |
| 2 | `적용할 수 없는 ops는 큐를 건드리지 않는다` | D7 — 없는 경로 |
| 3 | `문서가 없으면 편집이 적용되지 않는다` | |
| 4 | `ack하면 headSeq가 오르고 undo 스택이 쌓인다` | |
| 5 | `실패하면 큐가 비고 상태가 recovering이 된다` | |
| 6 | `pending은 새 배열로 교체된다` | 구독자가 알림을 받는지 — `subscribe`로 센다 |
| 7 | `clearPage는 편집 상태도 비운다` | 페이지를 떠나면 남의 페이지 편집이 남지 않는다 |

**케이스 7을 빠뜨리면** 페이지를 옮긴 뒤 앞 페이지의 pending이 새 페이지로 전송된다.

- [ ] **Step 6: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/store/editor-store.ts apps/web/src/store/edit-queue.ts apps/web/src/edit/ops.ts apps/web/test/store/ apps/web/test/edit/
git commit -m "feat(web): 낙관적 적용과 편집 큐를 스토어에 둔다"
```

---

### Task 5: 직렬 전송과 ack

**Files:**
- Create: `apps/web/src/edit/use-edit-commit.tsx`
- Test: `apps/web/test/edit/use-edit-commit.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `useOpenPage`, Task 3의 `patchOps`, Task 4의 스토어 액션
- Produces:

```tsx
/** 화면이 편집을 내는 통로. 노드의 prop 하나를 바꾼다. */
export function useEditCommit(props: { projectId: string; pageId: string }): {
  commitProp: (nodeId: string, prop: string, value: unknown) => void
  status: EditStatus
}
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

**`<App />`을 라우트째 렌더한다**(`editor-harness.tsx`의 관례) — 훅만 떼어 내면 조회가 실패한 화면 위에서도 단언이 통과한다(P2b-1에서 실제로 난 사고).

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `편집하면 화면이 먼저 바뀐다` | 응답을 지연시킨 가짜 → 요청이 끝나기 전에 캔버스 값이 바뀌어 있다. **낙관적 적용의 실측이다** |
| 2 | `baseSeq는 지금 headSeq다` | 첫 요청 본문의 `baseSeq === 7`(하네스의 `HEAD_SEQ`) |
| 3 | `ack를 받으면 다음 baseSeq가 응답의 seq다` | 두 번째 요청의 `baseSeq === 8` |
| 4 | `in-flight 중의 편집은 기다린다` | 응답 전에 두 번째 편집 → **요청이 하나만 나가 있다**(D6) |
| 5 | `앞 요청이 끝나면 다음이 나간다` | 4의 짝 — 순서대로 둘 다 나간다 |
| 6 | `적용할 수 없는 편집은 요청을 만들지 않는다` | D7 — 없는 노드 |
| 7 | `페이지를 옮기면 앞 페이지의 편집이 새 페이지로 가지 않는다` | 경로에 앞 pageId가 없다 |

**케이스 4가 D6의 전부다.** 없으면 병렬 전송 구현이 1~3을 통과하고 서버에서 409를 받는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/test/edit/use-edit-commit.test.tsx --project web`

- [ ] **Step 3: 훅을 구현한다**

전송은 이펙트가 아니라 **명시적 펌프**로 한다:

```tsx
// 전송을 useEffect로 걸면 pending이 바뀔 때마다 이펙트가 다시 돌아 "지금 보내는 중인가"를
// ref로 따로 지켜야 한다. 큐에서 다음을 꺼내 보내는 일을 함수 하나에 두고, 편집이 들어올
// 때와 ack를 받았을 때 그 함수를 부른다 — 조건이 코드에 보인다.
```

**`clientOpId` 생성기는 주입한다.** `EditorStore`는 순수 TS이고 전역 의존을 갖지 않는 것이 계약이다(`editor-store.ts` 머리말 — "React·DOM·`fetch`를 import하지 않는다"). `crypto.randomUUID`가 jsdom 환경에 있는지 **재지 않았다.** 스토어 생성자에 `nextOpId: () => string`을 선택 인자로 받고 기본값만 `crypto.randomUUID`를 쓰면, 테스트가 결정적인 id를 주입할 수 있고 환경 의존이 한 줄에 갇힌다.

- [ ] **Step 4: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/use-edit-commit.tsx apps/web/test/edit/use-edit-commit.test.tsx
git commit -m "feat(web): 편집을 직렬로 보내고 ack로 baseSeq를 잇는다"
```

---

### Task 6: 실패는 재조회로 수렴한다

**Files:**
- Create: `apps/web/src/shell/edit-alert.tsx`
- Modify: `apps/web/src/edit/use-edit-commit.tsx`, `apps/web/src/routes/editor.tsx`
- Test: `apps/web/test/edit/edit-recovery.test.tsx`

**Interfaces:**
- Produces: `<EditAlert />` — 스토어의 `editStatus`와 마지막 실패 문안을 읽어 `role="alert"` 하나를 그린다

- [ ] **Step 1: 테스트를 먼저 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `409를 받으면 페이지를 다시 받는다` | `getPage` 호출 수가 는다 |
| 2 | `재조회 뒤 문서와 headSeq가 서버 것이다` | 낙관적으로 바꾼 값이 서버 값으로 되돌아간다 |
| 3 | `422를 받아도 같은 경로로 수렴한다` | D4 — 실패 종류가 갈리지 않는다 |
| 4 | `네트워크 실패도 같다` | `ApiError`가 아닌 값이 던져져도 |
| 5 | `보내지 못한 편집을 잃었다고 알린다` | `role="alert"` 하나, 문안에 잃은 편집이 있었음이 드러난다 |
| 6 | `성공하면 알림이 없다` | **양성 대조** — 늘 알리는 구현을 잡는다 |
| 7 | `세션이 끊긴 실패는 로그인으로 보낸다` | `unauthenticated`는 재조회가 아니라 Task 1의 경로다 |
| 8 | `재조회 중에도 셸이 살아 있다` | 흰 화면이 되지 않는다 |

**케이스 3·4가 D4의 요지다** — "실패 종류마다 다르게 복구"하는 구현을 막는다.
**케이스 7을 빠뜨리면** 세션이 끊긴 상태에서 재조회를 무한히 시도한다.

- [ ] **Step 2: 실패를 확인하고 구현한다**

실패 처리의 순서가 중요하다:

```
catch (caught) {
  1. toFailure로 'signed-out'인지 먼저 본다 → 그러면 세션 무효화(Task 1)로 끝. 재조회하지 않는다.
  2. 아니면 failEdits()로 큐를 비우고 status를 'recovering'으로.
  3. getPage로 다시 받아 loadPage(). 그것마저 실패하면 status를 'idle'로 두고 조회 실패 문안을 낸다.
  4. 버린 편집이 있었으면 알린다.
}
```

- [ ] **Step 3: 구분력을 실증한다**

`catch`의 재조회 호출을 지우고 케이스 1·2가 죽는지, `signed-out` 분기를 지우고 케이스 7이 죽는지 본다. **죽지 않으면 그대로 보고하라.** 복구 후 `git status` clean 확인.

- [ ] **Step 4: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/use-edit-commit.tsx apps/web/src/shell/edit-alert.tsx apps/web/src/routes/editor.tsx apps/web/test/edit/edit-recovery.test.tsx
git commit -m "feat(web): 편집 실패를 재조회 한 경로로 수렴시킨다"
```

---

### Task 7: 속성 패널 — 텍스트·수 입력 (blur/Enter 커밋)

**Files:**
- Create: `apps/web/src/panels/controls/text-control.tsx`
- Modify: `apps/web/src/panels/property-panel.tsx`
- Test: `apps/web/test/panels/property-panel.test.tsx`(기존 — **`이 단계에서는 입력이 없다` 케이스를 교체한다**)

**Interfaces:**
- Produces:

```tsx
/** `text`·`textarea`·`number` 세 control을 그린다. 값은 blur/Enter에 한 번 나간다(D5). */
export function TextControl(props: {
  field: EditorField
  value: unknown
  onCommit: (value: string | number) => void
}): ReactElement
```

- [ ] **Step 1: 경계 케이스를 교체한다**

이월 문서가 못박은 것: *"속성 패널은 읽기 전용이고, 케이스 `이 단계에서는 입력이 없다`가 그 경계를 고정한다. **그 테스트를 바꾸는 것이 '편집이 생겼다'는 신호다.**"*

그 케이스를 지우고 **반대 방향의 케이스**로 바꾼다 — `카탈로그의 control마다 대응하는 위젯이 있다`. 지금 카탈로그의 control 일곱 중 이 태스크가 셋을 덮으므로, **덮지 못한 넷은 이 케이스가 아직 보지 않는다는 것을 이름과 주석에 적어라.**

- [ ] **Step 2: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `text 필드에 값을 넣고 blur하면 편집이 나간다` | `patchOps` 호출 1회, ops의 값이 입력한 것 |
| 2 | `Enter로도 나간다` | |
| 3 | `타이핑만으로는 나가지 않는다` | **D5의 핵심.** 글자마다 요청하는 구현을 잡는다 |
| 4 | `값이 그대로면 blur해도 나가지 않는다` | 빈 revision 방지 |
| 5 | `number 필드는 수로 나간다` | `'3'`이 아니라 `3` |
| 6 | `수가 아닌 입력은 나가지 않는다` | `'abc'` → 요청 없음 |
| 7 | `textarea는 여러 줄을 담는다` | |
| 8 | `편집한 값이 캔버스에 반영된다` | 낙관적 적용이 화면까지 닿는지 — 패널만 보면 통과하는 구현을 잡는다 |
| 9 | `다른 노드를 고르면 입력이 그 노드 값으로 바뀐다` | 로컬 state가 남지 않는다 |

**케이스 3과 9가 이 태스크의 함정이다.** 9는 `key`를 노드 id로 주면 닫힌다.

- [ ] **Step 3: 실패를 확인하고 구현한다**

`TextControl`은 로컬 state를 들고 `onBlur`·`onKeyDown(Enter)`에 `onCommit`을 부른다. **값이 원래 값과 같으면 부르지 않는다**(케이스 4).

`property-panel.tsx`의 `<dd>` 자리를 control 별로 가른다. **`formatValue`는 남긴다** — 아직 위젯이 없는 control(Task 8·9 전)과 카탈로그 밖 값을 그리는 데 쓴다.

- [ ] **Step 4: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/controls/text-control.tsx apps/web/src/panels/property-panel.tsx apps/web/test/panels/property-panel.test.tsx
git commit -m "feat(web): 속성 패널의 텍스트·수 입력을 blur/Enter에 커밋한다"
```

---

### Task 8: 속성 패널 — 스위치·선택 (즉시 커밋)

**Files:**
- Create: `apps/web/src/panels/controls/switch-control.tsx`, `apps/web/src/panels/controls/select-control.tsx`
- Modify: `apps/web/src/panels/property-panel.tsx`
- Test: `apps/web/test/panels/property-panel.test.tsx`(기존)

**Interfaces:**
- Produces: `SwitchControl`·`SelectControl` — 둘 다 `onCommit`을 **조작 즉시** 부른다(중간 상태가 없다, D5)

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `스위치를 누르면 즉시 편집이 나간다` | blur를 기다리지 않는다 |
| 2 | `스위치는 불리언으로 나간다` | `'on'`이 아니라 `true` |
| 3 | `값이 없던 prop을 켜면 true가 들어간다` | `props`가 없는 노드 — P2b-1이 `?.`에 하중을 건 그 자리 |
| 4 | `select는 고른 값을 즉시 낸다` | |
| 5 | `select의 선택지는 카탈로그의 options다` | `Field.control`의 `options` |
| 6 | `options가 없는 select는 그리지 않는다` | 카탈로그 실수를 화면이 흡수하지 않는다 |
| 7 | `연속으로 두 번 누르면 두 편집이 순서대로 나간다` | D6가 스위치에도 적용된다 |

- [ ] **Step 2: 구현하고 전체 테스트**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/controls/ apps/web/src/panels/property-panel.tsx apps/web/test/panels/property-panel.test.tsx
git commit -m "feat(web): 스위치·선택 컨트롤을 즉시 커밋한다"
```

---

### Task 9: 속성 패널 — 목록 컨트롤

**Files:**
- Create: `apps/web/src/panels/controls/list-control.tsx`
- Modify: `apps/web/src/panels/property-panel.tsx`
- Test: `apps/web/test/panels/list-control.test.tsx`

**Interfaces:**
- Produces:

```tsx
/** `stringList`(문자열 배열)와 `pairList`(키-값 배열)를 그린다. 항목 추가·삭제·수정. */
export function ListControl(props: {
  field: EditorField
  value: unknown
  onCommit: (value: string[] | { key: string; value: string }[]) => void
}): ReactElement
```

- [ ] **Step 1: 테스트를 쓴다**

카탈로그에서 `stringList`는 `List.columns`·`Tree.items`, `pairList`는 `KeyValue.pairs`다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `항목을 추가하면 배열 끝에 붙는다` | |
| 2 | `항목을 지우면 그 자리가 빠진다` | |
| 3 | `항목을 고치면 blur에 나간다` | 텍스트와 같은 규칙(D5) |
| 4 | `pairList는 키와 값을 함께 낸다` | `{ key, value }` 모양 |
| 5 | `배열이 아닌 값이면 빈 목록으로 시작한다` | 검증 안 된 문서(D4의 재조회 전 창) |
| 6 | `빈 배열도 그린다` | 추가 버튼이 있어야 한다 |
| 7 | `편집한 목록이 캔버스에 반영된다` | |

**케이스 5가 이 파일의 방어선이다** — 속성 패널은 오류 경계 밖이라 여기서 던지면 셸 전체가 지워진다(`property-panel.tsx`의 `stringify` 주석이 같은 이유를 적고 있다).

- [ ] **Step 2: 구현하고 전체 테스트**

**목록 편집은 항목마다가 아니라 배열 통째로 `replace`한다** — JSON Patch의 배열 인덱스 조작은 동시 편집에서 어긋나기 쉽고, P3의 리베이스가 그것을 다뤄야 한다. 지금은 배열 하나를 통째로 바꾸는 것이 단순하고 안전하다. **그 판단을 주석에 적어라.**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/controls/list-control.tsx apps/web/src/panels/property-panel.tsx apps/web/test/panels/list-control.test.tsx
git commit -m "feat(web): 목록 속성을 배열 통째로 편집한다"
```

---

### Task 10: undo / redo

**Files:**
- Modify: `apps/web/src/store/editor-store.ts`, `apps/web/src/edit/use-edit-commit.tsx`, `apps/web/src/routes/editor.tsx`
- Test: `apps/web/test/edit/undo-redo.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface RevisionRef {
  revisionId: string
  /** 이 revision을 되돌리는 ops. 서버가 준 그대로다(설계 §7.1). */
  inverse: PatchOp[]
}

// useEditCommit이 함께 낸다
undo: () => void
redo: () => void
canUndo: boolean
canRedo: boolean
```

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `undo하면 앞 값으로 돌아간다` | 캔버스에서 확인 |
| 2 | `undo도 서버에 새 편집으로 나간다` | `patchOps` 호출 — 서버에 undo 개념이 없다(README) |
| 3 | `undo가 보내는 ops는 서버가 준 inverse 그대로다` | **클라이언트가 계산하지 않는다**(설계 §7.1) |
| 4 | `redo하면 다시 적용된다` | |
| 5 | `undo 뒤 새 편집을 하면 redo가 사라진다` | 표준 undo 의미론 |
| 6 | `되돌릴 것이 없으면 undo가 비활성이다` | |
| 7 | `적용할 수 없는 inverse는 스택에서 빼고 안내한다` | 설계 §7.3 — **에러가 아니라 정상 흐름이다.** 다음 항목으로 넘어간다 |
| 8 | `페이지를 옮기면 스택이 비워진다` | 남의 페이지 revision을 되돌리지 않는다 |
| 9 | `편집이 실패하면 스택이 오염되지 않는다` | Task 6의 재조회 뒤 |

**케이스 3이 §7.1의 계약이다.** 로컬에서 `invertOps`를 부르는 구현을 잡는다.
**케이스 7이 §7.3의 계약이다.** 그 경로가 없으면 다른 사람이 지운 노드를 undo할 때 갇힌다.

- [ ] **Step 2: 구현한다**

`undo`는 스택 top의 `inverse`를 **낙관적으로 적용해 보고**(D7과 같은 판정) 되면 보낸다. 실패하면 그 항목을 버리고 다음 항목으로 넘어간다(§7.3).

ack가 왔을 때 **undo가 만든 revision은 undo 스택이 아니라 redo 스택으로** 간다. 그 구분을 `PendingEdit`에 실어 두면 ack 시점에 알 수 있다.

- [ ] **Step 3: 구분력을 실증하고 커밋**

케이스 3의 구분력을 재라 — `inverse` 대신 로컬 `invertOps` 결과를 보내게 바꾸면 케이스 3이 죽어야 한다.

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/store/editor-store.ts apps/web/src/edit/use-edit-commit.tsx apps/web/src/routes/editor.tsx apps/web/test/edit/undo-redo.test.tsx
git commit -m "feat(web): 서버가 준 inverse로 undo/redo를 돌린다"
```

---

### Task 11: 새로고침 뒤 undo 스택 복원

**Files:**
- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/http-client.ts`, `apps/web/src/api/types.ts`, `apps/web/src/routes/editor.tsx`
- Test: `apps/web/test/edit/undo-restore.test.tsx`, `apps/web/test/api/response-shape.test.tsx`(기존)

**Interfaces:**
- Produces:

```ts
export interface RevisionSummary {
  id: string
  seq: number
  actorType: 'user' | 'mcp' | 'cli'
  actorId: string | null
  actorLabel: string | null
  ops: PatchOp[]
  inverse: PatchOp[]
  createdAt: string
}

listMyRevisions(projectId: string, pageId: string): Promise<RevisionSummary[]>
```

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `페이지를 열면 내 revision을 받아 스택을 채운다` | `?mine=true` |
| 2 | `응답 순서가 곧 스택 순서다` | seq 내림차순 = 최신이 top(D10) |
| 3 | `복원한 항목을 undo할 수 있다` | 실제로 되돌아간다 |
| 4 | `복원 직후에는 redo가 비어 있다` | D10 |
| 5 | `revision 조회가 실패해도 페이지는 열린다` | **undo 없이도 볼 수 있어야 한다.** 조회 실패가 셸을 막지 않는다 |
| 6 | `봉투가 계약을 어기면 ApiError다` | `response-shape.test.tsx`에 넣는다 |
| 7 | `페이지를 옮기면 새 페이지의 스택을 받는다` | |

**케이스 5가 이 태스크의 방어선이다** — undo 복원은 부가 기능이므로 그것 때문에 페이지가 안 열리면 안 된다.

- [ ] **Step 2: 구현한다**

`limit`은 붙이지 않는다 — 기본값 50이 설계 §7.3의 "최근 50개"와 같다. **선언하지 않은 쿼리 키는 400이므로**(README) `mine` 외에 아무것도 붙이지 마라.

- [ ] **Step 3: 전체 테스트와 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck && pnpm test
git add apps/web/src/api/ apps/web/src/routes/editor.tsx apps/web/test/edit/undo-restore.test.tsx apps/web/test/api/response-shape.test.tsx
git commit -m "feat(web): 새로고침 뒤 내 revision으로 undo 스택을 복원한다"
```

---

## 자체 리뷰

계획을 쓴 뒤 근거 문서와 맞춰 본 결과다.

**설계 §7 커버리지**

| §7의 요구 | 어디서 |
|---|---|
| 로컬 낙관적 적용 | Task 4·5 (케이스 "편집하면 화면이 먼저 바뀐다") |
| `baseSeq`를 실어 보낸다 | Task 5 (케이스 2·3) |
| `inverse`는 서버가 만든다 | Task 3(타입)·Task 10(케이스 3) |
| 개인 undo/redo 스택 | Task 10 |
| 적용 불가는 에러가 아니라 정상 흐름 | Task 10 케이스 7 |
| 새로고침 시 스택 재구성 | Task 11 |
| WS 전송·ack·브로드캐스트 | **P3** — 이 단계가 만들지 않는 것에 적었다 |
| 소프트 잠금 | **P3** — 같음 |

**이월 문서 커버리지**

| 이월 항목 | 어디서 |
|---|---|
| §1 리다이렉트 순환 | Task 1 |
| §2 가드가 지목하는 합법 경로 | Task 2 |
| §3 `headSeq`가 `baseSeq`다 | Task 2·5 |
| §3 속성 패널의 경계 케이스 교체 | Task 7 Step 1 |
| `unknownMessage` 폴백이 사실상 죽었다 | Task 6이 편집 실패 문안을 새로 만들므로 그때 확인 — **`toFailure`의 그 인자를 새로 쓰는 자리가 생기면 그 사실을 주석에서 갱신하라** |
| `CommitProbe`가 주소 그대로인 커밋을 못 본다 | "실행 시 유의"에 적었다 |

**남은 위험 — 계획이 답을 정하지 않은 것**

- **Task 7의 케이스 9(`다른 노드를 고르면 입력이 그 노드 값으로 바뀐다`)를 `key`로 닫을지 이펙트로 닫을지** 정하지 않았다. `key`가 단순하지만, 입력 중에 노드가 바뀌면 **커밋되지 않은 타이핑이 조용히 사라진다** — 그 경로가 실제로 나는지(구조 트리 클릭이 입력 포커스를 뺏는가) 재보고 고르라. `key`를 골랐으면 그 손실이 설계된 것임을 주석에 적어라.
- **`props`를 통째로 `add`한 편집의 `inverse`가 무엇인지 재지 않았다.** 서버가 만들지만(§7.1), undo가 그것으로 원래 상태에 정확히 돌아가는지는 Task 10 케이스 1이 `props` 없는 노드에 대해서도 도는지로 확인하라. **돌지 않으면 그것이 Task 10에 케이스를 하나 더할 신호다.**

**분모를 적지 않은 것**

이 계획은 태스크 수와 케이스 수를 세었지만 **완료 후의 테스트 총수를 예측하지 않았다.** 케이스는 구현 중에 늘고, 그 수를 계획에 못박으면 다음 사람이 그것을 목표로 삼는다.
