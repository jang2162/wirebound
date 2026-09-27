# wirebound 테마 스타터

wirebound 설계서의 테마를 짜는 프로젝트다. 컴포넌트마다 뷰(tsx)와 CSS 를 고치고, 빌드한 `.wbtheme` 파일을 wirebound 관리자
화면에서 올린다. 작성 규칙은 `SKILL.md` 에 있다(코딩 에이전트에게도 그 파일을 읽힌다).

## 설치

Node 22 이상이 필요하다. `vendor/` 의 SDK · 도구 묶음을 함께 설치한다.

```bash
npm install
```

## 짜기

```bash
npm run dev
```

찍힌 주소를 브라우저로 연다. 모든 컴포넌트가 variant 마다 표본으로 늘어서고, 뷰 · CSS 를 고치면 바로 반영된다. 왼쪽 패널에서
토큰 값을 바꿔 보고, 머리의 고르개로 뷰포트 폭을 바꾼다.

- `theme.config.ts` — 테마 이름 · 판 · 토큰 · variant
- `src/views/*.tsx` — 컴포넌트 뷰(SDK 기본 뷰에서 시작한다)
- `src/theme.css` — 테마 CSS
- `assets/` — 이미지 · 글꼴

## 빌드

```bash
npm run build
```

`dist/<id>-<version>.wbtheme` 가 생긴다. manifest 에 문제가 있으면 이유를 줄마다 찍고 파일을 만들지 않는다. 같은 판은 다시
올릴 수 없으니 고칠 때마다 `theme.config.ts` 의 `version` 을 올린다.
