# @wirebound/theme-kit

`wb-theme` — wirebound 테마를 짜는 도구다. 카탈로그의 모든 컴포넌트를 variant 마다 늘어놓는 갤러리(`dev`) · 관리자 화면에 올릴 `.wbtheme` 빌드(`build`) · 뷰 계약 검사(`check`) · 폭마다 스크린숏(`shots`).

## 설치

테마 프로젝트의 개발 의존으로 둔다. 뷰 계약 `@wirebound/theme-sdk` 와 React 19 를 함께 둔다(peer).

```bash
npm install -D @wirebound/theme-kit
npm install @wirebound/theme-sdk react react-dom
```

Node 22.18 이상.

## 쓰기

```bash
npx wb-theme dev      # 찍힌 주소를 브라우저로 연다
npx wb-theme build    # dist/<id>-<version>.wbtheme
```

프로젝트의 꼴(`theme.config.ts` · `src/views/*.tsx` · `src/theme.css`)은 이 패키지의 `template/` 이 출발점이고, 작성 규칙은 `template/SKILL.md` 다. 테마 패키지 규격은 저장소의 설계 문서 [「테마 시스템」 절](https://github.com/jang2162/wirebound/blob/main/docs/superpowers/specs/2026-08-03-wirebound-design.md#6-테마-시스템) 이 소유한다.

- 저장소: https://github.com/jang2162/wirebound
- 라이선스: MIT
