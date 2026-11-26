# @wirebound/cli

`wireb` — wirebound 설계서를 **구현 리포 쪽에서** 읽고 내보내는 CLI 다. 스냅샷 받기(`pull`) · 정적 HTML · PPTX 내보내기(`export`) · 결함 검사(`lint`) · 페이지 한 장 읽기(`page get`) · 공통코드(`codes`).

## 설치

```bash
npm install -g @wirebound/cli     # 또는 프로젝트에: npm install -D @wirebound/cli
```

Node 22.18 이상.

## 쓰기

```bash
wireb init --server https://wirebound.example.com --project <프로젝트 id>
wireb login --email me@example.com
wireb pull -o design.json
```

명령 · 종료 코드 · 자격이 저장되는 자리는 저장소 README 의 [「`wireb` — CLI 를 부르는 길」](https://github.com/jang2162/wirebound#5-wireb--cli-를-부르는-길) 절이 소유한다.

- 저장소: https://github.com/jang2162/wirebound
- 라이선스: MIT
