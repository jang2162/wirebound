# P4a-1 테마 엔진 코어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테마 JSON을 받아 검증하고, `extends`를 병합하고, CSS 한 장으로 컴파일하는 `packages/themes`를 만든다.

**Architecture:** 두 단계다 — **해석(resolve)**: `extends` 병합 → 토큰 참조 풀기 → 화이트리스트 검증 → 모든 값이 리터럴인 `ResolvedTheme`. **방출(emit)**: `ResolvedTheme` → CSS 문자열. 화면도 서버도 없고 `schema` 외의 런타임 의존이 없다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · zod 4 · vitest 3 · tsdown

## Global Constraints

근거 문서는 셋이다. **순서대로 읽어라.**

- `docs/superpowers/specs/2026-08-03-wirebound-design.md` **§6 전체**(6.0~6.11)와 **§3.3**(패키지 의존표). **이 계획의 모든 규격이 거기서 온다.**
- `docs/superpowers/plans/2026-08-03-p0-carryforward.md`의 **"P4a (테마 엔진)" 절** — 렌더러가 남긴 결함 둘. **이 단계는 그것을 고치지 않지만 전제해서도 안 된다**(D9).
- `docs/superpowers/plans/2026-08-09-p2b5-carryforward.md`의 **"이 사이클에서 배운 것"** — 작업 규칙이 거기 있다.

제약:

- **`themes`는 `schema`만 의존한다**(§3.3). **`renderer`에 의존하지 않는다** — 그 근거는 D1에 있다.
- **`packages/renderer`·`apps/*`를 고치지 마라.** 이 단계는 새 패키지 하나만 만든다. 고쳐야 한다고 판단되면 **고치지 말고 `orca orchestration ask`로 물어라.**
- **새 런타임 의존을 들이지 않는다.** `zod`는 `schema`가 이미 쓴다. CSS 파서·전처리기를 들이지 마라 — **문자열을 만드는 것이지 파싱하는 것이 아니다.**
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`themes`의 tsconfig는 `lib: ["ES2022"]`다** — DOM을 빼라. 이 패키지는 Node와 브라우저 양쪽에서 도는 순수 계산이고, `document`를 참조하면 컴파일이 막아야 한다. (`schema`가 그 오버라이드를 안 해서 P0 이월에 사소한 항목으로 남아 있다 — 여기서는 처음부터 한다.)
- **`pnpm test`가 초록이어야 한다.** 이 계획을 쓴 시점은 **1541 tests / 84 files**다 — **기준선일 뿐 목표가 아니다.**
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지.
- **완결성을 주장하지 마라.** "전부"·"항상"·"유일"은 **측정한 뒤에만, 측정과 함께.**
- **수를 적으면 그 수가 틀린다.** 이 프로젝트에서 **여덟 번** 그랬다. **세려면 실행으로 세게 하고, 아니면 부류로 적어라.** (`test/api-consumers.test.ts`·`test/role-access.test.ts`가 그 형식의 선례다 — 세는 파일이 세는 대상 밖에 살아야 자기를 세지 않는다.)
- **"오늘 0건"·"아직 없다"·"다음에 갱신하라"를 쓰지 마라.** P2b-5에서 그 형태가 **같은 브랜치 안에서** 낡았다.
- **인과 문장은 X를 심어 Y를 관측한 뒤에 써라.** **고치면서 새로 적는 문장이 가장 위험하다.**
- **환경 단서를 빼지 마라**(*"jsdom에서만 쟀다"* 등).

## 이 단계가 만들지 않는 것

- **렌더러 계약 정리.** P0 이월의 #7(구조가 inline style을 방출한다)·#8(계약 밖 `data` 속성 셋)은 **P4a-2**다. **다만 이 단계의 컴파일러는 그 결함과 무관하게 옳은 CSS를 내야 한다**(D9).
- **캔버스에 CSS 주입.** P4a-2다.
- **테마·레이아웃 저장(DB·API·화면).** P4a-3이다.
- **시스템 테마 5종.** P4b다. 이 단계는 **테스트 픽스처 최소 테마**만 만든다(D8).
- **patterns 전개.** 규격·검증까지다(D7).
- **테마 저작 UI.** P4c다.
- **아이콘 세트·폰트 파일 번들.** `assets`는 **선언을 검증**할 뿐 리소스를 가져오지 않는다.

---

## 설계 결정 (계획 단계에서 확정)

**아래 "확정"의 근거가 실측이 아닌 자리는 그렇게 적었고, 그런 자리는 "계획이 재지 않은 것" 표로 보냈다.**

### D1. `themes`는 `renderer`가 아니라 `schema`를 본다

테마의 `components.List.structure = "cardGrid"`가 유효한지 검증하려면 **컴포넌트가 어떤 구조·조각·변형·상태를 갖는지** 알아야 한다.

**그 정보는 `schema`에 있다.** `ComponentDef`가 `structures`·`parts`·`variants`·`states`를 **선언한다**(`packages/schema/src/component/define.ts`, 소스로 확인했다). 렌더러의 레지스트리는 그 선언을 **구현**할 뿐이다.

**그래서 §3.3의 의존표(`themes` → `schema`)가 지켜진다.** 렌더러에 의존하면 의존 방향이 깨지고, `exporter`·`apps/web`이 둘 다 가져오는 구조가 된다.

> **다만 "선언과 구현이 어긋나면 어떻게 되는가"는 이 단계가 다루지 않는다.** 테마가 `cardGrid`를 골랐는데 렌더러가 그것을 등록하지 않았다면 **렌더 시점에 드러난다**(`requireStructure`가 던진다). 그 대조는 P4a-2 이후의 일이다. **이 사실을 컴파일러 주석에 적어라.**

### D2. 해석과 방출을 가른다

```
Theme(JSON) ──resolve──> ResolvedTheme ──emit──> CSS 문자열
                  ↑                        ↑
            extends 병합               셀렉터 생성
            토큰 참조 풀기
            화이트리스트 검증
```

**`ResolvedTheme`은 모든 값이 리터럴이다** — 토큰 참조가 남아 있지 않다.

가르는 이유 둘:

1. **검증 실패를 CSS 생성 전에 잡는다.** 잘못된 토큰 참조가 `var(--wb-없는것)`으로 조용히 새어 나가면 화면에서만 드러난다.
2. **저장할 것과 컴파일할 것이 다르다.** 설계 §4.5: *"스냅샷은 참조 중인 테마 내용을 함께 저장한다 … **상속 테마는 병합된 결과를 저장한다**."*

> **정정(구현 중 실측).** 이 항목은 처음에 *"`ResolvedTheme`이 그 자체로 산출물이다 — 그 '병합된 결과'가 이것이다"*라고 적었는데 **틀렸다.**
>
> - **`ResolvedTheme`은 직렬화되지 않는다.** 다섯 절(`tokens`·`primitives`·`breakpoints`·`components`·`patterns`)이 `Map`이라 `JSON.stringify`에서 전부 `{}`가 되고, 되읽은 것으로 컴파일하면 `TypeError`가 난다(재서 확인했다). `Map`을 쓴 것 자체는 옳다 — 순서를 계약으로 삼는 근거가 있고 객체 키의 정수형 갈래를 피한다. **틀린 것은 그것을 저장 대상이라고 적은 문장이다.**
> - **§4.5가 말한 "병합된 결과"는 `mergeTheme`이 내는 `Theme`이다.** 평범한 객체라 JSON 왕복이 바이트 동일이고, 되읽어 해석·컴파일하면 `base + patch` 경로와 **같은 CSS**가 나온다.
> - 다만 그 성질은 **병합 결과에서 `extends`를 뺀 뒤에** 성립한다. `extends`를 지닌 채 저장하면 그것은 여전히 참조이고 복원이 그때의 base를 다시 요구해 §4.5가 막으려던 일이 그대로 일어난다(그 상태에서 `bad-extends`가 나는 것을 쟀다).
>
> **역할을 다시 적으면:** `Theme`(병합 결과)은 **저장 대상**이고, `ResolvedTheme`은 **컴파일의 중간 산물**이다.

### D3. 토큰 해석은 단방향이다

| 층 | 참조할 수 있는 것 |
|---|---|
| `palette` | **아무것도** (원시값만) |
| `semantic` | `palette.*` 또는 리터럴 |
| `scale` | 리터럴 (**`space.unit`만 예외적으로 파생의 씨앗이다**) |
| `primitives`·`components`·`patterns` | `semantic.*` · `space.*` · `radius.*` · `shadow.*` · `typography.*` · `motion.*` 또는 리터럴 |

**순환 참조는 검증에서 막는다.** 단방향이므로 `semantic` 안에서만 순환이 가능하고(`a → b → a`), 그것을 잡아야 한다.

> **참조 문법과 규격 경로가 어긋난다.** 규격에서는 `scale.space.unit`인데 참조는 **`space.6`**이다(§6.3·§6.5 예시). `scale.` 접두어가 참조에 없다. **이것을 계획이 확정하지 않는다 — 아래 재라 #1이다.**

### D4. `space.unit`에서 배수를 파생한다

§6.3: *"`space.unit`만 정의하면 `space.1`~`space.24`가 배수로 파생되므로 간격 토큰을 나열할 필요가 없다."*

**단위 계산이 필요하다** — `unit: "4px"`이면 `space.6 = 24px`다. **`unit`이 `px`가 아닌 값일 때 무엇을 내는지는 재라(#2).**

### D5. 화이트리스트는 **이름과 값 둘 다** 본다

§6.8이 프로퍼티 목록을 주고, 값은 **토큰 참조 또는 리터럴만** 허용한다. *"`calc()`나 임의 함수는 받지 않는다."*

**§6.8의 목록을 손으로 세지 마라.** 그 절을 하나씩 대조해 표를 만들되, **개수를 주석에 적지 마라**(부류로 적어라).

**CSS 프로퍼티 이름 대응이 필요하다** — §6.8은 wirebound 어휘를 주지 CSS 프로퍼티를 주지 않는다. 갈리는 것들:

| 테마 어휘 | CSS |
|---|---|
| `bg` | `background` |
| `fg` | `color` |
| `radius` | `border-radius` |
| `direction` | `flex-direction` |
| `align` / `justify` | `align-items` / `justify-content` |
| `typography` | **단일 프로퍼티가 아니다** — 스케일 항목을 펼쳐 `font-size`·`line-height`·`font-weight`·`letter-spacing`을 낸다 |

**나머지는 네가 §6.8에서 대조해 채워라.** 대응이 자명하지 않은 것을 만나면 **추측하지 말고 `ask`로 물어라.**

### D6. 방출 형태는 §6.11의 예시가 계약이다

```css
:root { --wb-semantic-primary: #2563eb; --wb-space-6: 24px; }
[data-wb-component="List"][data-wb-structure="cardGrid"] { … }
[data-wb-component="List"] [data-wb-part="item"] { … }
[data-wb-component="List"][data-wb-state~="selected"] [data-wb-part="item"] { … }
@media (max-width: 768px) { … }
```

- **변수 이름은 `--wb-<층>-<경로>`**이고 경로의 `.`이 `-`가 된다.
- **`data-wb-state`는 `~=`로 본다** — 공백 구분 목록이다(§6.11).
- **`variants`는 `[data-wb-variant="…"]`**로 낸다(§6.11 표).
- **`responsive`의 브레이크포인트는 `primitives.breakpoints`에서 온다.** §6.11 예시가 `md: 768`에 `max-width: 768px`를 냈다 — **그 방향(max/min)이 계약인지는 재라(#3).**

### D7. patterns는 규격·검증까지다

`slots`의 슬롯 타입과 `schema` 조각을 검증한다. **전개(페이지에 꽂아 노드 id를 새로 발급)는 만들지 않는다.**

**`schema` 조각은 노드 트리이되 `slot` 필드가 붙을 수 있다**(§6.6: *"`slot` 필드는 패턴 템플릿에만 존재한다"*). 그래서 `validatePage`를 그대로 쓸 수 없다 — **그 차이를 어떻게 다룰지는 재라(#4).**

**패턴 이름은 `<범주>.<변형>`이고 범주가 고정 목록이다**(§6.6에 열둘이 나열돼 있다 — 세지 말고 그 절에서 옮겨라).

### D8. 시스템 테마가 없으므로 픽스처를 만든다

P4b가 시스템 테마 5종을 만든다. 이 단계는 **테스트가 쓸 최소 테마**를 `test/fixtures/`에 둔다.

**픽스처를 `src/`에 두지 마라** — 시스템 테마로 오인되고, P4b가 그것을 지우거나 덮어야 한다.

### D9. 이 단계는 렌더러의 결함을 전제하지 않는다

P0 이월 #7: 구조가 inline style을 방출해 **테마 CSS가 캐스케이드에서 진다.**

**컴파일러는 그것과 무관하게 옳은 CSS를 낸다.** `!important`를 붙이지 마라 — 그것은 결함을 코드에 새기는 것이고, P4a-2가 inline을 걷어내면 되돌려야 한다.

> **"컴파일된 CSS가 실제로 먹히는가"는 이 단계가 잴 수 없다.** jsdom은 캐스케이드를 계산하지 않고 이 패키지는 DOM을 모른다. **그 사실을 적어라 — "재지 못했다"가 거짓 인과보다 낫다.** P4a-2가 잰다.

---

## 계획이 재지 않은 것 — 구현자가 재야 한다

**추측으로 채우지 마라.** P2b-4에서 이 표에 남긴 일곱 중 여섯이, P2b-5에서는 셋 다 실측으로 정해졌다. **반대로 계획이 확정해 적은 산문은 여섯 번 반증됐다.**

| # | 무엇 | 왜 중요한가 | 어느 태스크 |
|---|---|---|---|
| 1 | **토큰 참조 문법.** 규격은 `scale.space.unit`인데 참조는 `space.6`이다. `scale.` 접두어를 붙이는가 마는가. `palette.blue.500`은 붙는데 `space.6`은 안 붙는 이유가 있는가 | 해석기 전체가 여기 달렸다. §6.3·6.4·6.5 예시를 **전부 모아 대조하고** 일관된 규칙을 세워라. **예시끼리 어긋나면 그것을 보고하라** | Task 2 |
| 2 | **`space.unit`이 `px`가 아닐 때.** `"0.25rem"`·`"4"`·`"1em"`을 각각 넣어 무엇이 나와야 하는가 | 파생이 문자열 연산인지 수치 연산인지가 갈린다 | Task 2 |
| 3 | **`responsive`의 브레이크포인트 방향.** §6.11 예시가 `md: 768`에 `max-width: 768px`를 냈다. mobile-first(`min-width`)가 아니라 desktop-first인가. **경계값이 `768`인가 `767`인가** | 두 브레이크포인트가 겹치거나 벌어진다 | Task 8 |
| 4 | **패턴 `schema` 조각의 검증.** `slot` 필드가 붙은 노드를 `validatePage`가 어떻게 다루는가(통과·이슈·던짐). 그리고 패턴 조각은 루트가 `Page`가 아니다 | `validatePage`를 재사용할지 별도 검증을 쓸지가 갈린다 | Task 5 |
| 5 | **`null`로 상속 키를 지우는 것을 zod가 어떻게 받는가.** §6.9: *"`null`을 명시하면 상속된 키를 삭제한다."* 규격의 필드 타입이 `null`을 허용하지 않으면 **병합 입력이 규격을 통과하지 못한다** | 파생 테마의 스키마가 원본과 달라야 하는지가 갈린다 | Task 6 |
| 6 | **`states`가 여럿 켜졌을 때 순서.** §6.5의 `states`는 객체다 — JS 객체 키 순서가 CSS 규칙 순서가 되고 그것이 곧 우선순위다 | 같은 프로퍼티를 두 상태가 건드리면 결과가 갈린다 | Task 8 |
| 7 | **`variants`와 `states`가 같은 `parts`를 건드릴 때** 어느 쪽이 이기는가. §6.5는 순서를 말하지 않는다 | 위와 같은 부류 | Task 8 |

**1·5는 설계 문서의 미명세다.** 예시를 모아 대조하고, **그래도 갈리면 `ask`로 물어라** — 추측해서 코드에 새기지 마라.

**3·6·7은 이 단계가 정하면 계약이 된다.** 정한 근거를 주석에 적어라.

---

## 파일 구조

**Create:**

| 파일 | 책임 |
|---|---|
| `packages/themes/package.json`·`tsconfig.json`·`tsdown.config.ts` | 패키지 뼈대. `renderer`의 것을 본뜨되 **`lib`에서 DOM을 뺀다** |
| `packages/themes/src/index.ts` | 공개 표면 |
| `packages/themes/src/spec/*.ts` | 테마 규격 zod (meta·tokens·primitives·components·patterns·assets) |
| `packages/themes/src/resolve/tokens.ts` | 토큰 참조 해석·`space` 파생·순환 검출 |
| `packages/themes/src/resolve/style.ts` | 스타일 프로퍼티 화이트리스트 + 값 검증 + CSS 이름 대응 |
| `packages/themes/src/resolve/merge.ts` | `extends` 병합 |
| `packages/themes/src/resolve/index.ts` | `resolveTheme` — 위 셋을 엮어 `ResolvedTheme`을 낸다 |
| `packages/themes/src/emit/*.ts` | `ResolvedTheme` → CSS |
| `packages/themes/test/fixtures/*.ts` | 최소 테마·파생 테마 |

**Modify:** `vitest.config.ts`(alias 한 줄) · `tsconfig.json`(references) · 루트 `package.json`이 워크스페이스를 글롭으로 잡는지 **확인만** 하라.

---

## Task 1: 패키지 뼈대와 `meta`·`assets` 규격

**Files:**
- Create: `packages/themes/{package.json,tsconfig.json,tsdown.config.ts}` · `src/index.ts` · `src/spec/meta.ts` · `src/spec/assets.ts`
- Modify: `vitest.config.ts` · 루트 `tsconfig.json`
- Test: `packages/themes/test/spec-meta.test.ts`

**Interfaces (Produces):**

```ts
export const MetaSchema: z.ZodType<ThemeMeta>
export interface ThemeMeta {
  id: string
  name: string
  description?: string
  /** `system:<id>` 하나만. 상속 깊이는 1단계다(§6.9). */
  extends?: string
  version: string
  preview?: string
}
export const AssetsSchema: z.ZodType<ThemeAssets>
```

**케이스:**

1. 최소 `meta`(id·name·version)가 통과한다
2. **`extends`가 `system:` 접두어를 요구하는가** — §6.9는 *"파생의 파생은 만들지 않는다"*이고 §6.10은 시스템 테마만 상속 대상으로 적었다. **재서 정하고 근거를 적어라**
3. 선언되지 않은 키가 400이다(`z.strictObject` — `schema`·`api`의 관례)
4. `assets.icons`가 **내장 세트 목록** 안의 값이어야 한다(§6.7: *"내장 아이콘 세트 중 선택"*). **목록을 손으로 적어야 하면 그 사실을 적어라**
5. `assets.placeholder.style`이 `skeleton|blueprint|photo|solid` 넷 중 하나다

- [ ] **Step 1: 뼈대를 만든다**

`packages/renderer/{package.json,tsconfig.json,tsdown.config.ts}`를 읽고 본뜨되:
- `dependencies`는 `@wirebound/schema`와 `zod`만(react 없음)
- `tsconfig.json`의 `lib`을 **`["ES2022"]`**로(DOM 제거), `jsx` 제거
- `references`는 `../schema`만

`vitest.config.ts`의 `shared.resolve.alias`에 `'@wirebound/themes'` 한 줄을 더한다. **`include` 글롭은 이미 `packages/*/test/**`라 건드릴 필요가 없다 — 확인하라.**

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
import { describe, expect, it } from 'vitest'
import { MetaSchema } from '../src/spec/meta'

describe('MetaSchema', () => {
  it('id·name·version이 최소 계약이다', () => {
    expect(MetaSchema.safeParse({ id: 'a', name: '가', version: '1.0.0' }).success).toBe(true)
  })

  it('선언되지 않은 키는 그 자체로 실패다', () => {
    // schema·api의 관례다(z.strictObject). 오타가 조용히 무시되면 테마 작성자가
    // 왜 안 먹는지 알 수 없다.
    expect(MetaSchema.safeParse({ id: 'a', name: '가', version: '1.0.0', theme: 'x' }).success).toBe(false)
  })
})
```

- [ ] **Step 3: 실패를 확인한다.** Expected: FAIL — 모듈 없음
- [ ] **Step 4: 구현하고 케이스 1~5를 채운다**
- [ ] **Step 5: `pnpm build`·`pnpm typecheck`가 새 패키지를 포함해 도는지 확인한다**

**`lib`에서 DOM을 뺀 것이 실제로 막는지 재라** — `src/`에 `document`를 참조하는 줄을 심어 `tsc`가 에러를 내는지 보고 복구하라.

- [ ] **Step 6: 구분력 실증** — `strictObject`를 `object`로 바꿔 케이스 3이 죽는지 재라
- [ ] **Step 7: 커밋**

---

## Task 2: `tokens` 규격과 해석

**Files:** Create `src/spec/tokens.ts` · `src/resolve/tokens.ts` · Test `packages/themes/test/tokens.test.ts`

**Interfaces (Produces):**

```ts
export const TokensSchema: z.ZodType<ThemeTokens>
/** 참조가 하나도 남지 않은 평평한 표. 키는 `semantic.primary`·`space.6` 같은 참조 경로다. */
export type TokenTable = ReadonlyMap<string, string>
export function resolveTokens(tokens: ThemeTokens): { table: TokenTable; issues: ThemeIssue[] }
```

**`issues`로 내고 던지지 않는 것이 계약이다** — `schema`의 `validatePage`와 같은 형식이고, 테마 저작 UI(P4c)가 여러 오류를 한 번에 보여야 한다.

- [ ] **Step 1: 재라 #1 — 토큰 참조 문법을 확정하라**

§6.3·6.4·6.5의 **모든 예시**를 모아 표로 적어라(`"palette.blue.600"`·`"space.6"`·`"radius.lg"`·`"semantic.primary"`·`"shadow.sm"`·`"h3"`…). **`scale.` 접두어가 붙는 예시가 하나라도 있는가.** 규칙을 세우고 **예시끼리 어긋나면 그 사실을 보고하라.**

`typography: "h3"`(§6.5의 `parts.title`)가 특히 다르다 — 접두어가 아예 없다. **그것이 `typography.h3`의 줄임인지 별도 문법인지 정하고 근거를 적어라.**

- [ ] **Step 2: 재라 #2 — `space.unit`이 `px`가 아닐 때**

`"4px"`·`"0.25rem"`·`"4"`·`"1em"`을 각각 넣어 `space.6`이 무엇이 되어야 하는지 정하라. **정한 근거를 적어라** — 수치×배수인지 `calc()`인지(§6.8이 `calc()`를 금지하므로 그쪽은 막혀 있다).

- [ ] **Step 3: 케이스를 쓴다**

1. `palette`의 값이 리터럴이 아니면 이슈다(참조할 대상이 없다)
2. `semantic`이 `palette.*`를 풀어 리터럴이 된다
3. `semantic`의 리터럴(`"#ffffff"`)이 그대로 남는다
4. **없는 `palette` 키를 가리키면 이슈이고 `var(--wb-없는것)`이 나오지 않는다**
5. **`semantic` 안의 순환(`a → b → a`)이 이슈다** — 스택이 터지지 않는다
6. **자기 자신을 가리키는 것(`a → a`)도 이슈다**
7. `space.unit`에서 `space.1`~`space.24`가 파생된다(**개수를 손으로 적지 말고 경계 둘을 재라** — `space.24`가 있고 `space.25`가 없다)
8. `radius`·`shadow`·`motion`이 그대로 표에 실린다
9. **`typography`는 값이 객체다** — 표에 어떻게 실리는지 Step 1의 결정대로
10. **`palette`가 비어도 `semantic`이 리터럴만 쓰면 성립한다**

- [ ] **Step 4: 실패를 확인하고 구현한다**
- [ ] **Step 5: 구분력 실증** — 순환 검출을 지워 케이스 5·6이 죽는지, `space` 파생 상한을 지워 7이 죽는지 재라
- [ ] **Step 6: 커밋**

---

## Task 3: 스타일 프로퍼티 화이트리스트

**Files:** Create `src/resolve/style.ts` · Test `packages/themes/test/style.test.ts`

**Interfaces (Produces):**

```ts
/** 테마 어휘 → CSS 프로퍼티. `typography`처럼 여럿으로 펼쳐지는 것이 있다. */
export function styleDeclarations(
  prop: string,
  value: unknown,
  tokens: TokenTable,
): { css: Array<[string, string]>; issues: ThemeIssue[] }
```

- [ ] **Step 1: §6.8의 목록을 표로 옮긴다**

**그 절을 하나씩 대조하라. 개수를 세지 마라.** D5의 갈리는 것 여섯은 계획이 줬고, **나머지는 네가 채워라.** 자명하지 않은 것을 만나면 **추측하지 말고 `ask`로 물어라.**

**표가 §6.8을 덮는지 기계가 보게 하라** — 손으로 적은 목록은 절이 늘 때 어긋난다(P2b-4의 `listComponents` 대조가 선례다). **§6.8을 파싱할 수 없으면 그 사실을 적고 대신 무엇이 지키는지 적어라.**

- [ ] **Step 2: 케이스를 쓴다**

1. 화이트리스트 밖의 이름은 이슈다(`"content"`·`"cursor"`·`"backdropFilter"`)
2. `bg` → `background`, `fg` → `color`, `radius` → `border-radius`
3. **`typography: "h3"`이 넷으로 펼쳐진다**(`font-size`·`line-height`·`font-weight`·`letter-spacing`). **`letterSpacing`이 없는 스케일 항목이면 그 선언을 내지 않는다**(§6.3의 `body`가 그렇다)
4. 토큰 참조가 **`var(--wb-…)`**로 나간다
5. **리터럴이 그대로 나간다**(`"#ffffff"`·`"1px"`·`"16/9"`)
6. **`calc()`·`url()`·임의 함수는 이슈다**(§6.8)
7. **없는 토큰을 가리키면 이슈다**
8. 숫자 값(`opacity: 0.5`·`zIndex: 10`)이 통과한다
9. **`bgGradient`·`bgImage`가 어떤 값을 받는가** — `url()`이 금지인데 `bgImage`가 있다. **재서 정하고 근거를 적어라. 갈리면 `ask`로 물어라**

- [ ] **Step 3: 실패를 확인하고 구현한다**
- [ ] **Step 4: 구분력 실증** — 화이트리스트를 통과시키도록 바꿔 케이스 1이, 함수 검사를 지워 6이 죽는지 재라
- [ ] **Step 5: 커밋**

---

## Task 4: `primitives`·`components` 규격과 카탈로그 대조

**Files:** Create `src/spec/primitives.ts` · `src/spec/components.ts` · Test `packages/themes/test/spec-components.test.ts`

**이 태스크가 D1을 실현한다.** `getComponent(type)`으로 `ComponentDef`를 꺼내 대조한다.

**케이스:**

1. 카탈로그에 없는 컴포넌트 이름은 이슈다
2. **`structure`가 그 컴포넌트의 `structures`에 없으면 이슈다**
3. **`parts`의 키가 그 컴포넌트의 `parts`에 없으면 이슈다**
4. **`variants`의 키가 `variants`에 없으면 이슈다**
5. **`states`의 키가 `states`에 없으면 이슈다**
6. **`structure`를 생략하면 `structures[0]`이 기본이다**(`ComponentDef`의 주석: *"첫 번째가 기본 구조"*)
7. **분모를 손으로 적지 마라** — `listComponents()`를 훑어 **카탈로그의 모든 컴포넌트가 테마 규격을 통과하는 최소 항목을 만들 수 있는지** 확인하라. 카탈로그가 늘면 여기서 죽어야 한다
8. `base`·`parts`의 값이 Task 3의 화이트리스트를 지난다
9. `primitives.breakpoints`가 **숫자**다(§6.4). 이름은 자유인가 `sm|md|lg|xl` 고정인가 — **재서 정하고 근거를 적어라**
10. `primitives.container.gutter`가 토큰 참조를 받는다(`"space.6"`)

- [ ] **Step 1~4: TDD로 구현한다.** `catalog-setup`이 필요하면 `schema`의 설치 함수를 쓰되 **멱등하다는 것을 확인하라**(P2b-1이 그것을 쟀다)
- [ ] **Step 5: 구분력 실증** — 대조 넷(2·3·4·5)을 각각 지워 해당 케이스가 죽는지 재라
- [ ] **Step 6: 커밋**

---

## Task 5: `patterns` 규격과 검증

**Files:** Create `src/spec/patterns.ts` · Test `packages/themes/test/spec-patterns.test.ts`

**전개는 만들지 않는다**(D7).

- [ ] **Step 1: 재라 #4 — 패턴 `schema` 조각을 무엇으로 검증하는가**

`slot` 필드가 붙은 노드를 `validatePage`에 넣어 **무엇이 나오는지 재라**(통과·이슈·던짐). 패턴 조각의 루트가 `Page`가 아니라는 것도 함께 본다. **결과에 따라 `validatePage` 재사용과 별도 검증 중 하나를 고르고 근거를 적어라.**

- [ ] **Step 2: 케이스를 쓴다**

1. 패턴 이름이 `<범주>.<변형>`이어야 한다
2. **범주가 §6.6의 고정 목록 안이어야 한다** — 그 목록을 §6.6에서 옮기되 **개수를 적지 마라**
3. `slots`의 값이 슬롯 타입(§6.6 예시가 `text`·`action`·`media`를 쓴다. **§16이 그 목록을 "구현 중 결정"으로 열어 뒀다 — 그 사실을 적어라**)
4. **`schema` 안의 `slot`이 `slots`에 선언된 이름이어야 한다**
5. **`slots`에 선언됐는데 `schema`에 없는 슬롯이 있으면 이슈다**
6. `schema`의 노드 타입이 카탈로그에 있어야 한다

- [ ] **Step 3~4: 구현하고 통과시킨다**
- [ ] **Step 5: 구분력 실증** — 4·5의 양방향 대조를 각각 지워 재라
- [ ] **Step 6: 커밋**

---

## Task 6: `extends` 병합

**Files:** Create `src/resolve/merge.ts` · Test `packages/themes/test/merge.test.ts`

**Interfaces (Produces):**

```ts
export function mergeTheme(base: Theme, derived: Theme): Theme
```

- [ ] **Step 1: 재라 #5 — `null` 삭제를 규격이 받는가**

파생 테마에 `"semantic": { "danger": null }`을 넣어 **규격 파싱이 통과하는지 재라.** 통과하지 않으면 **파생 테마용 규격이 따로 필요하다** — 그 결론을 근거와 함께 적어라.

- [ ] **Step 2: 케이스를 쓴다** (§6.9의 규칙 넷)

1. **객체는 깊은 병합**이다 — 파생이 `semantic.primary`만 덮으면 나머지 `semantic`이 남는다
2. **배열은 교체**다 — 부분 병합하지 않는다(`assets.fonts`가 배열이다)
3. **`null`은 삭제**다 — 상속된 키가 사라진다
4. **상속 깊이는 1단계다** — `extends`를 가진 테마를 다시 상속하면 이슈다
5. **원본을 변형하지 않는다** — `base`를 두 번 병합해도 같은 결과다
6. **`null` 삭제와 깊은 병합이 겹칠 때** — `{ a: { b: null, c: 1 } }`
7. **파생에만 있는 키가 더해진다**
8. `meta`는 병합하지 않는다(파생의 `meta`가 그대로다). **정말 그런가 — §6.2·6.9를 대조해 정하고 근거를 적어라**

- [ ] **Step 3~4: 구현하고 통과시킨다**

**`structuredClone`을 쓸지 정하라** — P0 이월이 `apply.ts`의 참조 삽입을 사소한 항목으로 남겼다. 여기서는 처음부터 정하고 근거를 적어라.

- [ ] **Step 5: 구분력 실증** — 배열 교체를 병합으로, `null` 삭제를 대입으로 각각 바꿔 재라
- [ ] **Step 6: 커밋**

---

## Task 7: `resolveTheme` — 해석 전체를 엮는다

**Files:** Create `src/resolve/index.ts` · Test `packages/themes/test/resolve.test.ts` · `test/fixtures/*.ts`

**Interfaces (Produces):**

```ts
export interface ResolvedTheme { /* 모든 값이 리터럴 */ }
export function resolveTheme(
  theme: Theme,
  base?: Theme,
): { theme: ResolvedTheme | null; issues: ThemeIssue[] }
```

**케이스:**

1. **픽스처 최소 테마가 이슈 0으로 해석된다**
2. **파생 픽스처가 base와 병합돼 해석된다**
3. **이슈가 하나라도 있으면 `theme`이 `null`이다** — 반쯤 해석된 것을 내보내지 않는다
4. **여러 이슈를 한 번에 낸다**(첫 이슈에서 멈추지 않는다) — P4c의 저작 UI가 그것을 쓴다
5. **이슈에 경로가 실린다**(`tokens.semantic.primary` 같은) — 어디가 틀렸는지 없이는 고칠 수 없다
6. **`extends`가 있는데 `base`를 안 주면 이슈다**

- [ ] **Step 1~4: 구현하고 통과시킨다.** 픽스처는 **`test/fixtures/`**에 둔다(D8)
- [ ] **Step 5: 구분력 실증** — 3(부분 결과 방출)·4(첫 이슈에서 중단)를 각각 심어 재라
- [ ] **Step 6: 커밋**

---

## Task 8: CSS 방출

**Files:** Create `src/emit/*.ts` · Test `packages/themes/test/emit.test.ts`

**Interfaces (Produces):**

```ts
export function compileTheme(resolved: ResolvedTheme): string
```

- [ ] **Step 1: 재라 #3·#6·#7을 정한다**

- **#3** 브레이크포인트 방향과 경계값. §6.11 예시(`md: 768` → `max-width: 768px`)를 근거로 삼되 **겹침·틈이 생기는지 두 브레이크포인트로 재서 확인하라.**
- **#6** `states`가 여럿 켜졌을 때 순서. **객체 키 순서가 규칙 순서가 되는지 재고, 그것이 계약이라면 그렇게 적어라.**
- **#7** `variants`와 `states`가 같은 `parts`를 건드릴 때. **정하고 근거를 적어라.**

**셋 다 이 단계가 정하면 계약이 된다.**

- [ ] **Step 2: 케이스를 쓴다**

1. **`:root`에 토큰이 `--wb-<층>-<경로>`로 나온다**(`.`이 `-`가 된다)
2. `[data-wb-component="List"][data-wb-structure="cardGrid"]`가 `base`를 낸다
3. `[data-wb-component="List"] [data-wb-part="item"]`이 `parts`를 낸다
4. **`[data-wb-state~="selected"]`가 `~=`다** — 공백 구분 목록이므로 `=`면 상태 둘일 때 안 맞는다
5. `[data-wb-variant="featured"]`가 `variants`를 낸다
6. `@media`가 `responsive`를 낸다
7. **`primitives`가 `:root` 변수로 나온다**(`--wb-container-max` 등 — §6.11 예시)
8. **값이 토큰 참조면 `var(--wb-…)`이고 리터럴이면 그대로다**
9. **테마에 없는 층은 규칙을 내지 않는다**(빈 `@media`·빈 셀렉터가 없다)
10. **같은 입력이 같은 출력을 낸다**(결정적이다 — 내보낸 번들과 웹의 CSS가 같아야 한다, §6.11)
11. **문자열이 유효한 CSS인가** — **파서를 들이지 마라.** 중괄호 균형·세미콜론 같은 얕은 성질만 보고, **그것이 얕다는 사실을 적어라**

- [ ] **Step 3~4: 구현하고 통과시킨다**
- [ ] **Step 5: 구분력 실증** — `~=`를 `=`로, 변수 이름 규칙을 바꿔, 결정성을 깨뜨려(키 순서 무작위) 각각 재라
- [ ] **Step 6: 커밋**

---

## Task 9: 공개 표면과 마지막 훑기

**Files:** `src/index.ts` · Test `packages/themes/test/public-api.test.ts`

**케이스:**

1. **공개 표면이 계약이다** — `resolveTheme`·`compileTheme`·규격 스키마·타입. **내부 구현(`resolve/tokens`의 헬퍼 등)이 새어 나가지 않는지 보라**
2. **`themes`가 `renderer`를 import하지 않는다**(D1) — 소스를 훑어 확인하고 **그 검사를 테스트로 두어라**(주석으로 두면 낡는다)
3. **`themes`가 DOM을 참조하지 않는다** — Task 1의 `lib` 설정과 짝이다
4. `pnpm build`가 `dist`를 내고 `pnpm typecheck`가 통과한다

- [ ] **Step 1: 케이스를 쓰고 통과시킨다**

**2·3의 검사는 `test/`에 두어 세는 대상 밖에 살게 하라** — P2b-5에서 소스를 세는 주석이 자기를 세는 사고가 두 번 났고, 배치로 닫혔다.

- [ ] **Step 2: 마지막 훑기**

```bash
rg -n "재지 못|jsdom|아직|0건" packages/themes
```

**"재지 못했다"가 적힌 자리가 정말 못 잰 것인지 확인하라.** 그리고 **"오늘 0건"류가 새로 들어가지 않았는지** 보라.

- [ ] **Step 3: 커밋**

---

## 실행 시 유의

**웨이브는 둘이다.** Task 1~5는 규격·검증(서로 약하게 물린다), Task 6~9는 병합·해석·방출이다.

**이 단계가 끝나도 화면은 그대로다.** 정상이다 — 컴파일된 CSS를 쓰는 곳이 P4a-2다.

**설계 문서가 미명세인 자리가 여럿이다**(재라 #1·#5, Task 3 케이스 9, Task 4 케이스 9). **추측해서 코드에 새기지 말고 `ask`로 물어라.** P2b-5에서 구현자가 계획서의 거짓을 그렇게 두 번 잡았다.

**0 사망 변이는 진단까지 하라.** *"케이스를 더하자"*도 *"잉여니 걷어내자"*도 항상 답은 아니다 — P2b-4에서 0 사망이던 가드가 다음 웨이브에 2 사망이 됐고, P2b-5에서는 **"닫는 케이스를 못 만든다"가 두 번 반증**됐다(**판정을 주입하는 케이스**가 그 해법이었다).

## Self-Review

**Spec 대조.** §6.1의 여섯 절(meta·tokens·primitives·components·patterns·assets)이 Task 1·2·4·5에 전부 있다. §6.8 화이트리스트는 Task 3, §6.9 병합은 Task 6, §6.11 컴파일은 Task 8이다. §6.10(테마 관리)·§6.6의 전개는 "이 단계가 만들지 않는 것"에 근거와 함께 적었다.

**타입 일관성.** `ThemeIssue`가 Task 2에서 처음 나와 3·4·5·7이 같은 이름으로 쓴다 — **Task 2가 그 타입을 정의한다.** `TokenTable`(Task 2)을 Task 3·8이 쓴다. `ResolvedTheme`(Task 7)을 Task 8이 받는다. `Theme`(규격 전체)은 Task 1·2·4·5가 조각을 만들고 **Task 7이 합친다.**

**산문과 케이스 대조**(반복 결함에 대한 대응). 확정해 적은 근거 D1~D9를 케이스와 맞대 본 결과:

- **D1**은 Task 4 케이스 1~6과 **Task 9 케이스 2**가 지킨다.
- **D2**는 Task 7 케이스 3(이슈가 있으면 `theme`이 `null`)이 지킨다.
- **D3**은 Task 2 케이스 1·2·5·6이 지킨다.
- **D4**는 Task 2 케이스 7이 지킨다.
- **D5**는 Task 3 케이스 1·6이 지킨다.
- **D6**은 Task 8 케이스 1·4·5가 지킨다.
- **D7**은 Task 5 전체이고, "전개를 만들지 않는다"는 **음성 주장이라 케이스가 지킬 수 없다** — 그 사실을 여기 적는다.
- **D8**은 Task 7 케이스 1·2가 픽스처를 쓰는 것으로, 배치(`test/fixtures/`)는 **케이스가 지키지 않는다.**
- **D9**는 **케이스가 지킬 수 없다** — "컴파일된 CSS가 실제로 먹히는가"를 이 패키지가 잴 수 없다는 것이 D9의 내용이다. P4a-2가 잰다.

**지키는 케이스가 없는 확정 산문이 셋이다(D7의 음성 주장 · D8의 배치 · D9).** 셋 다 **왜 지킬 수 없는지**를 함께 적었다. 그 밖에 케이스 없는 확정 산문이 발견되면 그것이 다음 사이클의 사례가 된다.
