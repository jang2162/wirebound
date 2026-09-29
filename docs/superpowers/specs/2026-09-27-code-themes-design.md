# 코드 테마 — 설계

테마를 «JSON 규격(토큰 + 렌더러 구조 선택 + 스타일 화이트리스트)»에서 **«headless SDK 위에 tsx · CSS 로 짜서 빌드한 패키지»** 로 바꾼다. 업로드한 패키지는 불변이고, 사이트에서는 테마가 선언한 토큰 값만 고친다.

이 문서는 발행된 시점 기록(spec)이다. 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 「명시적으로 제외한 것」 · 「컴포넌트 정의 구조」 · 「테마 시스템」 · 「설계서 화면 구조」 · 「HTML 정적 번들」 절은 이 설계의 구현이 병합될 때(아래 「진행 단계」의 A6) 이 문서에 맞춰 고친다.

---

## 목적과 범위

**목적 두 가지**

1. **표현력.** 렌더러가 가진 구조 구현체와 스타일 화이트리스트 밖의 마크업 · CSS · 인터랙션을 테마가 쓸 수 있어야 한다.
2. **작성 방식.** 테마를 JSON 이 아니라 익숙한 코드(tsx · CSS)와 도구(빌드 · 로컬 미리보기 · 버전 관리)로 만든다.

**확정한 결정**

| 축 | 결정 |
|---|---|
| 신뢰 경계 | 업로드는 **인스턴스 관리자만** 한다. 올라온 코드는 신뢰 코드로 같은 origin 에서 돈다 |
| 기존 JSON 테마 | **전부 대체한다.** 시스템 테마 5종은 새 SDK 로 다시 써서 기본 설치한다. 운영 데이터가 없어 이전 경로를 두지 않는다 |
| 스키마 계약 | **카탈로그 · props 는 `schema` 가 고정한다.** 테마는 뷰만 만들고, 컴포넌트마다 `variant` 를 선언한다 |
| 작성 도구 | SDK + 스타터 템플릿 + 로컬 갤러리(dev) + build + 에이전트용 스킬. 배포는 관리자 화면의 템플릿 zip(npm 공개 뒤에는 npm) |
| 토큰 | 테마가 manifest 에 **자유롭게 선언**한다. 사이트의 편집 GUI 는 선언에서 자동 생성한다 |
| 버전 | 프로젝트는 `테마 id@버전` 에 **고정**하고 owner 가 올린다 |
| 적재 방식 | 호스트가 React · SDK 를 공유 런타임으로 주고, 렌더러가 «테마 뷰 → SDK 기본 뷰» 를 고른다 |
| 캔버스 | **same-origin iframe** 안에서 그린다(보안 격리가 아니라 문서 분리) |
| 테마 단위 | **프로젝트당 하나.** 레이아웃은 테마를 고르지 않는다 |

**이 설계가 다루지 않는 것**

- 테마 코드의 보안 격리(샌드박스). 신뢰 경계를 «관리자만 업로드»로 세웠다.
- 테마가 props · 컴포넌트 종류를 더하는 것. 카탈로그를 닫아 둬야 검증 · LLM 편집 · lint · 테마 교체가 성립한다.
- 사이트 안의 코드 에디터 · 서버 쪽 빌드.
- CLI 로 테마 업로드(`wb-theme publish`). 지금 API 토큰은 프로젝트 범위라 인스턴스 동작에 맞지 않는다 — 관리자 토큰과 함께 따로 설계한다.
- 한 프로젝트 안에 토큰 값 여러 벌(브랜드 A/B).

---

## 패키지와 번들 계약

### 패키지

| 패키지 | 책임 | 의존 |
|---|---|---|
| `schema` | 카탈로그 정의에서 `structures` · `parts` · `variants` 를 걷는다. `props` · `states` · `editor` · `children` 만 남는다. `editor` 의 `visibleWhen: { structure }` 는 걷고, variant 에 따른 감춤은 manifest 의 `hideProps` 가 맡는다 | zod |
| `theme-sdk` (신규) | `defineTheme` · `view` · 컴포넌트별 뷰 props 타입(`ViewProps<'List'>`) · `<Root>` · `<Focus>` · `useToken` · SDK 기본 뷰 세트 | `schema`, react(peer) |
| `renderer` | 트리 순회, `Slot` 주입, 상호작용 런타임, 뷰 선택(테마 뷰 → 기본 뷰), 포커스 · 마커 좌표 계산 | `schema`, `theme-sdk` |
| `themes` | manifest zod 규격, 토큰 선언 · 값 검증(타입 · 참조 순환), 토큰 → CSS 변수 컴파일, `.wbtheme` 읽기 · 검증 | `schema` |
| `theme-kit` (신규) | 작성자 도구. `wb-theme dev`(로컬 갤러리) · `wb-theme build` · 스타터 템플릿 | `theme-sdk`, `themes`, `renderer` |
| `system-themes/*` (신규) | 시스템 테마 5종의 소스. 저장소 빌드가 `.wbtheme` 로 만든다 | `theme-kit` |

`theme-sdk` · `renderer` 는 브라우저에서만 테마 코드를 싣는다. **api 의 Node 프로세스는 테마 코드를 싣지 않는다**(「내보내기와 PPTX」).

### 뷰 계약

테마는 컴포넌트마다 뷰 하나를 낸다. 뷰가 받는 것:

| 필드 | 뜻 |
|---|---|
| `props` | 기본값이 채워진, 카탈로그 타입이 붙은 props |
| `states` | props 에서 파생된 상태 집합(카탈로그의 `states` 선언) |
| `variant` | 노드의 variant. 테마에 없는 값이면 그 컴포넌트의 `defaultVariant` |
| `children` | 이미 렌더된 자식 |
| `slot` | `Slot` 이 받는 주입 내용 |
| `on` | 상호작용 런타임 핸들러(규칙이 있을 때만) |

뷰는 `<Root>` 로 감싸야 한다. `<Root>` 가 `data-wb-id` · `data-wb-component` · `data-wb-variant` · `data-wb-state` 와 상호작용 핸들러를 루트 요소에 붙인다 — 테마가 빠뜨릴 수 없게 SDK 가 강제한다. `<Root>` 없이 반환하면 개발 모드에서 던지고, 운영 모드에서는 렌더러가 그 노드를 기본 뷰로 대신 그리고 콘솔에 경고한다.

```tsx
import { view, Root, Focus, useToken } from '@wirebound/theme-sdk'

export const List = view<'List'>(({ props, variant, children }) => {
  const density = useToken('density')
  return (
    <Root marker={{ placement: 'top-end', offset: [4, -8] }}>
      <header>…</header>
      <Focus>
        {variant === 'cards' ? <div className="cards">…</div> : <table>…</table>}
      </Focus>
    </Root>
  )
})

export default defineTheme({ views: { List, /* … */ } })
```

- **`<Focus>`** — 선택 외곽선이 감쌀 요소. 없으면 `<Root>` 전체다. 한 뷰에 `<Focus>` 가 둘 이상이면 개발 모드에서 던진다.
- **`<Root marker>`** — 코멘트 번호 마커의 자리. `placement` 는 `top-start | top-end | bottom-start | bottom-end | start | end`, 기본 `top-start`. `offset` 은 `[x, y]` CSS px, 기본 `[0, 0]`. 기준 상자는 `<Focus>` 가 있으면 그것, 없으면 루트다. variant 마다 다르게 주려면 코드에서 가른다.
- 포커스 · 마커 좌표는 `renderer` 의 함수 하나가 DOM 에서 계산한다. 에디터 오버레이 · HTML 뷰어 · PPTX 가 모두 그 함수를 쓴다.

### `.wbtheme` 파일

zip 하나.

```
manifest.json      서버가 코드를 실행하지 않고 읽는 선언(「manifest」)
theme.js           일반 스크립트(IIFE). __wirebound_runtime__.register(defineTheme(…)) 를 부른다
theme.css          선택
assets/**          글꼴 · 이미지(허용 확장자만)
```

**`theme.js` 는 ES 모듈이 아니라 일반 스크립트다.** 내보낸 HTML 번들은 `file://` 로 열리는데 Chrome 은 `file://` 의 ES 모듈을 CORS 로 막는다. 캔버스 iframe · 내보낸 HTML · PPTX 워커가 모두 `<script>` 로 싣는다.

**공유 런타임.** 테마는 `react` · `react/jsx-runtime` · `@wirebound/theme-sdk` 를 번들에 넣지 않는다. `wb-theme build` 가 이 import 를 `globalThis.__wirebound_runtime__` 에서 읽게 바꿔 쓴다. 호스트는 `theme.js` 보다 먼저 이 전역을 채운다. SDK 의 major 판은 manifest 의 `sdk` 범위로 맞추고, 업로드 때 호스트의 SDK 판과 대조한다.

`assets/**` 는 `theme.css` 에서 상대 경로로 가리킨다. 호스트는 패키지 파일을 한 디렉터리처럼 내주므로(api 의 파일 경로 · 번들의 `assets/theme/`) 상대 경로가 세 곳에서 같게 풀린다.

### 캔버스 iframe

에디터 가운데의 캔버스(목업 영역)만 same-origin iframe 으로 감싼다. 헤더 · 트리 · 우측 패널은 에디터 문서에 그대로 있다.

- **문서 분리가 목적이다.** 테마 CSS(`button { … }` · `*` · `:root`)가 에디터 UI 를 칠하지 않는다. iframe 폭을 뷰포트 프리셋 값으로 두면 테마의 `@media` · `vw` · `matchMedia` 가 프리셋 폭으로 판정된다 — 내보낸 HTML · PPTX 와 같은 결과다.
- **보안 격리가 아니다.** same-origin 이라 에디터가 iframe 의 DOM 을 직접 읽고 이벤트를 받는다. 캔버스 클릭 선택 · 외곽선 · 번호 마커 · 드래그 드롭이 DOM 으로 돈다.
- 줌은 iframe 을 CSS `transform: scale()` 로 줄인다. iframe 의 레이아웃 폭은 프리셋 값 그대로다.
- 토큰 CSS 변수는 iframe 문서의 `:root` 에 주입한다.
- **머리의 시트는 셋이고 차례가 곧 겹침이다** — `base`(SDK 기본 뷰 CSS · `<style>`) → `theme`(그 판의 `theme.css` · `<link>`) → `tokens`
  (토큰 CSS 변수 · `<style>`). `theme.css` 는 `<link>` 여야 한다 — 그 안의 자산 경로(`./assets/…`)가 파일 URL 을 기준으로 풀린다. 토큰은
  테마 시트 **뒤**다 — 테마 CSS 가 `:root` 에 토큰의 기본값을 적으므로 앞에 두면 저장한 토큰이 안 먹는다. 번들이 실패하면 `theme` 을 뺀다.
  페이지를 옮겨 iframe 이 새로 서도 같은 차례로 다시 선다. 설정 페이지의 갤러리 미리보기도 같은 셋이다.
- **`theme.css` 는 문서를 그린 뒤에 얹히므로 실릴 때까지 캔버스 문서의 전이를 멈춘다** — 멈추지 않으면 테마의 `transition` 이 기본값에서
  테마 값으로 가는 길을 그려 노드가 수백 ms 동안 미끄러지고, 그 사이에 잰 외곽선 · 마커가 옛 자리에 남는다. 시트가 실리면(실패도) 한
  번에 테마 자리로 서고 다시 잰다. 판을 바꿔 링크 주소가 바뀔 때도 같다.
- **번들은 캔버스 iframe 이 아니라 에디터가 세션마다 하나 두는 숨은 적재 iframe(스크립트 realm)에 싣는다.** 캔버스 iframe 은 페이지를
  옮길 때마다 새로 서므로 거기 실으면 번들을 매번 다시 실행한다. 정의(뷰 함수)는 공유 런타임이 준 호스트의 React · SDK 로 지어져 어느
  iframe 에 portal 로 그려도 같고, 번들의 최상위 코드는 적재 realm 에서만 돌아 에디터 문서를 안 건드린다. 대가로 뷰가 `window` 를 읽으면
  적재 realm 의 창이다 — 캔버스의 창은 `useWindow()` 로 받는다. 같은 `id@버전` 은 한 번만 싣고(성공만 캐시한다), 10 초 안에 등록이 없으면
  실패다 — 그때 캔버스는 기본 뷰로 그리고 셸 머리에 알린다(「실시간」).
- **등록은 그 스크립트가 도는 동안의 것만 받는다** — 런타임이 `register` 마다 `document.currentScript` 를 적고, 호스트는 그 스크립트의
  `load` 에서 그 스크립트의 등록만 받는다. 스크립트가 끝난 뒤 미룬 등록은 버리고 경고한다 — 다음 번들이 그것을 제 정의로 받지 않게.
- **정의의 manifest 는 서버 것이다** — 뷰는 번들에서, 선언(variant · 토큰 · 패턴)은 서버 manifest 한 벌에서 온다. 업로드는 `theme.js` 를
  실행하지 않아 번들 안 manifest 를 못 견주므로 싣는 쪽이 서버 manifest 로 바꿔 끼운다. 번들이 다른 `id` · 판을 등록했으면 실패다.

Shadow DOM 은 CSS 는 가르지만 `@media` 가 창 폭으로 판정되는 문제를 못 푼다. 셀렉터 접두어 · `@container` 변환은 작성자가 쓴 CSS 를 도구가 고쳐 쓰는 것이라 `:root` · `html` · `vh` · `matchMedia` 에서 샌다. 그래서 iframe 이다.

---

## manifest

작성자는 템플릿의 `theme.config.ts` 에 선언하고, `wb-theme build` 가 `manifest.json` 으로 뽑는다.

```jsonc
{
  "id": "acme-portal",
  "name": "ACME 포털",
  "description": "…",
  "version": "1.3.0",
  "sdk": "^1.0.0",
  "preview": "assets/preview.png",

  "tokens": {
    "groups": [{ "id": "color", "label": "색" }, { "id": "type", "label": "글꼴" }],
    "items": {
      "color.primary":      { "type": "color",  "label": "주색", "group": "color", "default": "#2563eb" },
      "color.primaryHover": { "type": "color",  "label": "주색(호버)", "group": "color", "default": "{color.primary}" },
      "font.body":          { "type": "font",   "label": "본문 글꼴", "group": "type", "default": "Pretendard, sans-serif" },
      "radius.card":        { "type": "length", "label": "카드 모서리", "default": "12px" },
      "density":            { "type": "select", "label": "밀도", "options": ["compact", "comfortable"], "default": "comfortable" }
    }
  },

  "components": {
    "List": {
      "variants": [
        { "id": "table", "label": "테이블" },
        { "id": "cards", "label": "카드 그리드", "hideProps": ["columns"] }
      ],
      "defaultVariant": "table"
    }
  },

  "patterns": {
    "hero.split": { "name": "히어로 — 좌우 분할", "slots": { "…": "…" }, "schema": { "…": "…" } }
  }
}
```

| 필드 | 규칙 |
|---|---|
| `id` | `[a-z0-9-]+`. 인스턴스 안에서 유일하고 버전 계보의 키다. 시스템 테마는 `system-` 으로 시작하고, 관리자 업로드는 이 접두어를 쓸 수 없다 |
| `version` | semver. 같은 `id@version` 재업로드는 거부한다 |
| `sdk` | semver 범위. 호스트 SDK 판이 범위 밖이면 거부한다 |
| `preview` | 선택. 패키지 안의 이미지 경로 |
| `tokens.items` | 키는 `[a-zA-Z0-9.-]+`. 타입은 `color` · `length` · `number` · `font` · `shadow` · `select` 여섯. 기본값은 그 타입의 리터럴이거나 같은 타입 토큰의 참조(`{키}`). 참조 순환 · 없는 키 · 타입이 다른 참조는 거부한다 |
| `components` | 키는 카탈로그의 컴포넌트 이름. `variants` 는 하나 이상, `defaultVariant` 는 그 안의 id. `hideProps` 는 그 컴포넌트의 props 이름 |
| `patterns` | 이름은 `<범주>.<변형>`, 범주는 고정 목록(`header` · `nav` · `hero` · `features` · `content` · `cta` · `pricing` · `testimonial` · `footer` · `auth` · `empty` · `error`). `schema` 는 `schema` 패키지 검증을 통과해야 한다. 전개 규칙(삽입 때 id 새로 발급, `slot` 은 템플릿에만)은 지금과 같다 |

**토큰이 화면에 닿는 길**

- 모든 토큰은 CSS 변수 `--wb-<키의 . 을 - 로>` 로 iframe `:root` 에 주입된다(`color.primary` → `--wb-color-primary`). 참조는 `var(--wb-…)` 로 컴파일한다.
- 마크업을 바꾸는 토큰(대개 `select` · `number`)은 코드에서 `useToken('density')` 로 읽는다. 토큰이 바뀌면 그 토큰을 읽은 뷰가 다시 그려진다.

**variant 가 테마에 없을 때** — 노드의 `variant` 는 스키마에서 자유 문자열이다. 지금 테마에 없는 값이면 렌더러는 `defaultVariant` 로 그리고, lint 가 «현재 테마에 없는 variant» 로 경고한다. 페이지 데이터는 바꾸지 않는다. 테마를 되돌리면 원래 모습으로 돌아온다.

---

## 업로드 · 버전 · 인스턴스 관리자

### 인스턴스 관리자

- `users.is_instance_admin boolean not null default false`.
- 주는 길은 서버에 손이 닿는 사람뿐이다 — `migrate` 시딩의 `SEED_USER_ADMIN=1`, 그리고 새 명령 `pnpm --filter @wirebound/api admin grant <email>` · `admin revoke <email>`. **API 에는 관리자를 만들거나 바꾸는 라우트가 없다.**
- 관리자가 하는 일은 테마 업로드 · 버전 숨김과 되살림 · 템플릿 내려받기다. 프로젝트 역할(owner/editor/viewer)과 별개이며 프로젝트 권한을 넓히지 않는다.

### 저장

```sql
theme_packages(theme_id text, version text, name text, description text,
               sdk_range text, manifest json, files bytea, size int, sha256 text,
               uploaded_by uuid NULL, uploaded_at timestamptz, hidden_at timestamptz NULL)
  PK (theme_id, version)
  uploaded_by NULL = 시스템 테마
```

- 행은 한 번 쓰면 `hidden_at` 말고는 바뀌지 않는다. **지우는 라우트는 없다** — 스냅샷이 `id@버전` 을 참조하므로 지우면 «그때 그 화면» 이 깨진다.
- 파일은 zip 원본 그대로 `bytea` 에 둔다. 단일 서버 배포라 `pg_dump` 하나에 설계서와 테마가 함께 담기게 한다. 패키지 상한 10 MB(압축), 풀었을 때 상한 50 MB, 항목 수 상한 500.
- `themes` 테이블 · `layouts.theme_id` 는 걷는다.

### 업로드 검증

`POST /api/admin/theme-packages`(관리자 세션만). **본문은 `.wbtheme` zip 바이트 그대로다**(`Content-Type: application/zip` 또는 `application/octet-stream`) — multipart 를 쓰지 않는다. 서버에 새 런타임 의존이 안 들고, 화면은 `fetch(url, { body: file })` 로 보낸다. 다른 형식은 415, 10 MB 를 넘으면 413 이다. 코드는 실행하지 않는다. 실패는 항목별 사유 목록(`issues[].code`)과 함께 422 로 답한다.

1. zip 크기 · 풀린 크기 · 항목 수 상한.
2. 항목 경로 — 절대 경로 · `..` · 심볼릭 링크 거부. 허용 목록: `manifest.json` · `theme.js` · `theme.css` · `assets/**`(`png` · `jpg` · `jpeg` · `gif` · `webp` · `svg` · `woff` · `woff2` · `ttf` · `otf`).
3. `manifest.json` 이 manifest zod 규격을 통과한다(「manifest」의 표) — 코드 `manifest`, 원래 코드는 `manifestCode`.
4. 호스트 SDK 판이 `sdk` 범위 안이다 — 밖이면 `sdk-incompatible`.
5. `id` 가 `system-` 으로 시작하지 않는다 — 시작하면 `reserved-id`.
6. 같은 `id@version` 이 있으면 409.

### 버전과 숨김

- 한 `theme_id` 의 «최신» 은 숨기지 않은 버전 가운데 semver 가 가장 큰 것이다.
- 숨긴 버전은 새로 고를 수 없다. 이미 고정한 프로젝트 · 스냅샷은 그대로 쓴다.
- `PATCH /api/admin/theme-packages/:id/:version` `{ hidden: boolean }`.

### 읽기 경로

| 경로 | 누가 | 답 |
|---|---|---|
| `GET /api/theme-packages` | 로그인한 사용자 | 테마별 버전 목록(숨긴 것은 관리자에게만) · manifest 요약 |
| `GET /api/theme-packages/:id/:version/manifest` | 로그인한 사용자 | manifest 전문 |
| `GET /api/theme-packages/:id/:version/files/*` | 로그인한 사용자 | 패키지 안의 파일. `Cache-Control: private, max-age=31536000, immutable` |
| `GET /api/admin/theme-template.zip` | 관리자 | 스타터 템플릿 + SDK · theme-kit tarball 동봉 |

숨긴 버전도 `manifest` · `files` 는 내준다 — 고정한 프로젝트가 그려져야 한다.

### 시스템 테마

저장소 빌드가 `system-themes/*` 를 `.wbtheme` 로 만든다. api 가 기동할 때 그 파일들 가운데 **DB 에 없는 `id@version` 만** 넣는다(`uploaded_by NULL`). 있는 버전은 건드리지 않는다. 같은 `id@version` 인데 `sha256` 이 다르면 기동을 멈추고 그 사실을 말한다 — 올린 버전의 내용이 바뀐 것이다.

### 관리자 화면

`/admin/themes`. 테마 · 버전 목록, 업로드(검증 사유를 항목별로), 숨김 · 되살림, 템플릿 내려받기. 프로젝트 목록 화면 머리에 관리자에게만 링크가 보인다.

---

## 프로젝트 쪽: 선택 · 토큰 · 스냅샷

### 데이터

```sql
projects
  + theme_id text null
  + theme_version text null                    -- 둘이 함께 null 이거나 함께 값이다
  + theme_tokens json not null default '{}'   -- 기본값과 다른 값만
  + theme_rev int not null default 0
  FK (theme_id, theme_version) → theme_packages
```

새 프로젝트는 `system-admin` 의 최신 버전으로 시작한다. **바인딩 칸은 null 을 받는다** — 마이그레이션은 `.wbtheme` 를 못 보므로 이미 있던
프로젝트는 null 로 선다. null 은 «아직 고정 안 됨» 이고 api 기동의 시스템 테마 시딩(「시스템 테마」)이 그 자리에서 `system-admin` 의 최신판으로
채운다. 시딩 전에 만든 프로젝트도 다음 기동이 채운다.

### 권한

테마 바꾸기 · 버전 올리기 · 토큰 고치기는 **owner** 다. editor · viewer 는 읽기만 한다.

### 테마 바꾸기와 버전 올리기

`PUT /api/projects/:projectId/theme` `{ themeId, version, tokens, rev }`. 저장된 `theme_rev` 와 `rev` 가 다르면 409 와 현재 값을 돌려준다. 대상이 숨긴 버전이면 지금 고정한 그 `id@version` 일 때만 받고(토큰만 고치는 저장) 다른 판으로 바꾸는 것은 422 `hidden-version` 이다.

화면(프로젝트 설정 페이지의 «테마» 절)은 보내기 전에 확인 창으로 둘을 알린다.

- **토큰 이전** — 키가 같고 타입이 같으면 값을 잇는다. 새 테마에 없는 키는 버린다. 새 키는 기본값이다. 이어지는 · 버려지는 · 기본값으로 서는 수를 보인다.
- **없는 variant** — 새 테마의 `components` 에 없는 variant 를 쓰는 노드 수를 페이지별로 보인다. 계산은 `GET /api/projects/:projectId/theme/impact?themeId=&version=` 이 한다(서버가 페이지 스키마와 manifest 를 견준다).

### 토큰 편집

- manifest 선언에서 자동 생성한 폼. 그룹별로 나누고 타입마다 컨트롤을 쓴다(`color` 컬러 피커 · `length` 값 + 단위 · `font` 글꼴 목록 + 자유 입력 · `select` 선택 · `number` 숫자 · `shadow` 문자열).
- 옆에 **테마 갤러리 iframe** — 모든 컴포넌트 · variant 를 SDK 가 주는 샘플 노드로 늘어놓은 화면. 폼을 고치면 CSS 변수와 `useToken` 값만 바꿔 즉시 반영한다. 저장 전에는 서버 · 다른 사람에게 가지 않는다.
- 초안은 화면 상태다. 칸마다 `tokensCss` 의 이슈(서버와 같은 함수)로 사유를 곧바로 보이고, 사유가 있는 키는 미리보기에서 기본값으로
  선다. 사유가 하나라도 있으면 저장이 꺼진다.
- «저장» 은 `PUT …/theme` 을 같은 `themeId@version` 으로 보낸다 — 본문은 기본값과 같은 값을 뺀 초안이다. 409 면 서버의 지금 값과 초안을
  **다른 칸만** 나란히 보이고 고르게 한다: «서버 값으로»(초안 · `rev` 를 서버 것으로) · «내 값으로 덮기»(서버 `rev` 로 다시 보낸다). 그
  사이 남이 판을 바꿨으면 덮기가 판을 되돌리므로 서버 값으로만 간다. 422 의 `tokens.<키>` 사유는 그 칸에 선다.
- 항목별 · 전체 «기본값으로».
- 초안은 바인딩이 바뀌어도 남는다 — 옆 고르개의 저장 · 409 다시 읽기가 바꿔도 저장 안 한 칸은 새 서버 값 위에 얹고, 판이 바뀌었으면
  `migrateTokens` 로 옮긴다. 옮기지 못한 칸은 그 수를 편집기 머리에 한 줄로 말한다. 토큰 편집기 제 저장 · «서버 값으로» 뒤에는 초안이 곧
  서버 값이다.
- 서버는 대상 manifest 로 값을 검증하고(`tokensCss` 의 이슈면 422) 기본값과 같은 값을 뺀 뒤 저장한다. 값 하나는 200 글자, 뺀 뒤의 토큰 JSON 전체는 16 KB 가 상한이다 — 넘으면 422 `token-too-long` · `token-too-large`. 토큰은 `theme-changed` 프레임에 통째로 실리므로 상한이 방송의 크기도 묶는다.

### 실시간

테마 · 토큰이 저장되면 프로젝트 룸에 `theme-changed { themeId, version, tokens, rev }` 를 방송한다. 열린 캔버스는 번들이 바뀌었으면 iframe 을 다시 싣고, 토큰만 바뀌었으면 CSS 변수 · `useToken` 값만 바꾼다. 방송을 놓친 탭은 페이지를 다시 읽을 때 프로젝트의 `theme_rev` 로 따라잡는다. 번들을 못 읽으면 캔버스는 SDK 기본 뷰로 그리고 셸 머리에 한 줄로 알리며 다시 읽을 단추를 둔다.

### 스냅샷

payload 에 테마 내용 대신 `{ themeId, version, tokens }` 를 얼린다. 패키지는 지우지 않으므로 참조로 충분하다. 복원은 이 셋도 되돌린다(숨긴 버전이어도 된다). 복원도 `theme_rev` 를 올리고 `theme-changed` 를 방송한다.

### 레이아웃

스키마 트리라는 성질은 그대로이고 `themeRef` 만 걷는다.

### CLI · MCP

`wireb pull` · `wireb lint` 는 프로젝트의 `themeId@version` 과 manifest 를 읽는다. lint 규칙 «현재 테마에 없는 variant» 를 더한다. 테마 JSON 을 읽던 자리는 걷는다.

---

## 내보내기와 PPTX

**테마 코드는 브라우저에서만 돈다** — 캔버스 iframe · 내보낸 HTML · PPTX 용 Chromium. api 의 Node 프로세스는 테마 코드를 싣지 않는다. `window` · `document` 를 만지는 테마 하나가 서버 렌더를 깨거나 전역 부작용을 서버 프로세스에 남기지 않게 하려는 것이다.

### HTML 번들 — 브라우저 렌더

```
<root>/
  index.html                 첫 페이지의 사본
  pages/<이름>.html           셸(트리 네비 · 설명 · 코멘트 · 상호작용 목록) + 빈 목업 자리 + 페이지 JSON + 스크립트
  assets/
    shell.css                뷰어 셸의 CSS
    views.css                SDK 기본 뷰 CSS(`defaultViewsCss()`)
    runtime.js               내보내기 런타임 — react · react-dom · 카탈로그 · renderer · theme-sdk 런타임 (일반 스크립트)
    theme/theme.js           업로드된 패키지의 파일 그대로
    theme/theme.css          (패키지에 있으면)
    theme/assets/**          패키지 자산 그대로
    tokens.css               서버 manifest + 프로젝트 토큰 값 → CSS 변수(`tokensCss`)
```

- 페이지 머리의 시트 차례는 `shell.css` → `views.css` → `theme/theme.css` → `tokens.css` 다 — 문서 시트의 차례가 캔버스 iframe 과 같다(기본 뷰 → 테마 → 토큰). 패키지에 `theme.css` 가 없으면 그 link 를 싣지 않는다.
- 몸 끝의 스크립트 차례: 페이지 JSON(`<script type="application/json" id="wb-export-page">` — 문서 · 제목 · 대상 · 서버 manifest · 토큰 · `themeRef` · 대상 → 상대 경로 표 · 마커) → `runtime.js` → `theme/theme.js`(`id="wb-export-theme"`) → 인라인 `__wirebound_export__.boot()`. 전부 일반 스크립트이고 `defer` 가 없다 — 차례대로 돈다.
- 런타임이 테마 번들의 등록을 받아 서버 manifest 를 끼우고(`adoptManifest` — 캔버스와 같은 함수) 목업을 `renderDocument` 로 그린다. 상호작용은 캔버스 미리보기와 같은 renderer 런타임이고, 코멘트 마커는 renderer 의 `markerPoint` 로 놓는다.
- 번들이 등록하지 않았거나 다른 판을 등록했거나 테마 뷰가 던지면 기본 뷰로 그리고 상태 줄에 까닭을 적으며 `<html data-wb-failed="<까닭>">` 를 세운다 — 등록을 못 쓴 판은 테마 시트도 걷는다. 테마 바인딩이 없거나 패키지를 못 읽은 프로젝트는 `assets/theme/**` · `tokens.css` 없이 기본 뷰로 나가고 미리보기가 경고 한 줄을 낸다.
- 런타임은 첫 커밋 → 테마 시트의 적재(실패도) → `document.fonts.ready` → 한 프레임 뒤 `<html data-wb-ready>` 를 세운다.
- JS 가 꺼진 브라우저에서는 목업이 보이지 않는다(`<noscript>` 한 줄). 설계서 뷰어라 받아들인다.
- `file://` 로 열어도 돈다(모든 스크립트가 일반 스크립트 · 상대 경로 · 패키지 글꼴은 `theme.css` 기준 상대 경로).

### PPTX

Chromium 이 **HTML 번들의 페이지를 그대로** 연다 — 번들 파일을 메모리에서 가짜 origin(`https://export.wirebound.invalid`)으로 내주고(`route.fulfill` — 번들에 없는 경로는 404), 그 밖의 요청은 전부 끊는다. 페이지는 `#wb-screen` 으로 열어 셸을 숨기고 목업만 남긴다(화면 모드). 움직임 끄기는 문서가 서기 전에 건다(초기화 스크립트). 워커는 내보내기 런타임이 세우는 `<html data-wb-ready>` 를 **한 장의 한도 안에서** 기다린 뒤 지금의 한도(동시 브라우저 수 · 한 장의 넓이 · 장 수)로 잰다 — 테마 적재 · 글꼴 · 첫 렌더가 그 한도에 든다. `data-wb-failed` 가 선 장 · 한도 안에 준비되지 않은 장은 그리지 않고 까닭을 적는다. 번호 마커는 번들 런타임이 renderer 의 좌표 함수로 놓은 그대로 찍힌다.

---

## 진행 단계

차수마다 동작 가능한 상태로 끝낸다. plan 은 차수별로 쓴다.

| 차수 | 내용 | 끝나면 |
|---|---|---|
| **A1** | `theme-sdk`(뷰 계약 · `<Root>` · `<Focus>` · `useToken` · 기본 뷰), `renderer` 재배선, 캔버스 iframe. 카탈로그의 `structures` · `parts` · `variants` 와 렌더러의 구조 레지스트리 · structure-css, 웹의 테마 JSON 에디터 · 토큰 화면 · 테마 드롭다운을 함께 걷는다. 캔버스는 저장소 안의 테마 하나(`system-admin` 의 첫 판)를 직접 싣는다. 옛 JSON 테마의 저장(`themes` · `layouts.theme_id`) · 라우트 · 스냅샷의 테마도 걷는다 | 캔버스가 iframe 안에서 코드 테마로 그려진다 |
| **A2** | `.wbtheme` 형식 · `themes` 검증, `theme-kit`(dev · build), 스타터 템플릿 · 스킬 | 로컬에서 테마를 짜고 빌드한다 |
| **A3** | api — `theme_packages` · 관리자 · 업로드 · 파일 경로 · 프로젝트 바인딩 · impact · 스냅샷 · 방송 · 시스템 테마 시딩 | 올린 테마를 프로젝트가 고른다(REST) |
| **A4** | web — 관리자 화면, 프로젝트 설정 페이지의 테마 절 · 토큰 편집기. 캔버스가 저장소 테마 대신 프로젝트의 `id@버전` 을 싣는다 | 사이트에서 테마를 고르고 토큰을 고친다 |
| **A5** | HTML 번들 · PPTX | 내보내기가 코드 테마로 돈다 |
| **A6** | 시스템 테마 5종 완성, 정본 설계서 갱신 | 시스템 테마 다섯이 기본 설치된다 |

**A1 부터 A4 가 끝날 때까지는 테마를 고를 수 없다** — 모든 프로젝트가 저장소 테마 하나로 그려지고, 옛 JSON 테마로 짠 외형은 사라진다. 운영 데이터가 없어 받아들인다. A1 이 옛 테마 엔진을 한꺼번에 걷는 까닭은, 카탈로그에서 structure 를 걷는 순간 옛 엔진이 설 자리가 없어 두 체계를 함께 돌릴 수 없기 때문이다.

설정 페이지는 `/projects/:projectId/settings` 의 셸 밖 라우트다 — «일반»(이름 · 슬러그 · 설명 — 바뀐 키만 보낸다) 과 «테마»(고르기 · 확인 ·
토큰 편집 + 갤러리 미리보기) 두 절을 위아래로 둔다. 에디터 머리의 «설정» 과 프로젝트 목록 줄의 «설정» 이 여기로 온다(목록 줄에는 인라인
수정이 없다). owner 가 아니면 두 절이 읽기로만 선다.
