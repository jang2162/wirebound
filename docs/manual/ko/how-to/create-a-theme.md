<!-- source: docs/manual/en/how-to/create-a-theme.md @ v0.1.0 -->
# 테마 만들기

`wb-theme` 키트로 자기 테마를 짓고 wirebound 서버에 올려, 프로젝트의 모든 화면이 그 모양을 따르게 하는 안내입니다.
프런트엔드 개발자가 대상입니다. Node.js 22.18 이상과, 테마를 올릴 인스턴스 관리자 계정이 필요합니다.

## 테마의 구조

테마는 `.wbtheme` 패키지입니다. 디자인 토큰(색 · 글자 · 간격), CSS 파일, 그리고 컴포넌트의 기본 마크업을 바꾸는 React 뷰(선택)가 듭니다.
서버에는 내장 테마 **기본테마** 가 하나 있습니다. 프로젝트마다 설정에서 테마와 판을 고릅니다.

## 1. 스타터 프로젝트를 받습니다

1. 인스턴스 관리자로 로그인하고 왼쪽 사이드바의 **테마** 를 여세요.
2. **스타터 템플릿 받기** 를 눌러 `wirebound-theme-starter.zip` 을 받고 압축을 푸세요.
3. 푼 폴더에서 의존을 설치하세요.

   ```bash
   npm install
   ```

스타터에 든 것:

| 경로 | 쓰임 |
| --- | --- |
| `theme.config.ts` | 테마 이름 · 판 · 토큰 · variant |
| `src/views/*.tsx` | 컴포넌트 뷰. SDK 기본 뷰에서 시작합니다 |
| `src/theme.css` | 테마 CSS |
| `assets/` | 이미지 · 글꼴 |
| `SKILL.md` | 작성 규칙. 코딩 에이전트에게도 이 파일을 주세요 |

## 2. 고치면서 미리 봅니다

```bash
npm run dev
```

찍힌 주소를 여세요. 모든 컴포넌트가 variant 마다 늘어서고, 뷰와 CSS 를 고치면 바로 반영됩니다.
왼쪽 패널에서 토큰 값을 바꿔 보고, 머리에서 뷰포트 폭을 바꾸세요.

## 3. 검사하고 빌드합니다

```bash
npx wb-theme check
npm run build
```

`wb-theme check` 는 뷰 계약을 검사합니다. 빌드는 `dist/<id>-<version>.wbtheme` 을 씁니다.
manifest 에 문제가 있으면 빌드가 이유를 줄마다 찍고 파일을 만들지 않습니다.

## 4. 올리고 씁니다

1. **테마** 를 다시 열고 **테마 패키지 올리기** 를 눌러 `.wbtheme` 파일을 고르세요.
2. 프로젝트의 **설정** › **테마** 에서 새 테마와 판을 고르세요.

같은 판은 두 번 올릴 수 없습니다. 테마를 고칠 때마다 `theme.config.ts` 의 `version` 을 올리세요.

## 스타터 없이 키트를 씁니다

키트는 npm 에도 있습니다. 기존 프로젝트에 더하세요:

```bash
npm install -D @wirebound/theme-kit
npm install @wirebound/theme-sdk react react-dom
```

`npx wb-theme --help` 가 명령 `dev` · `build` · `check` · `shots`(뷰포트 폭마다 스크린숏)를 보여 줍니다.
패키지 형식은 설계 문서 [「6. 테마 시스템」](../../../superpowers/specs/2026-08-03-wirebound-design.md#6-테마-시스템) 절에 있습니다.

## 다음 단계

- `wb-theme` 옵션은 [레퍼런스](../reference.md)
