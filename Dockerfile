# syntax=docker/dockerfile:1
#
# **단일 서버 · docker compose 배포의 이미지 둘** — `deploy/docker-compose.yml` 이 짓는다. 절차 · 잰 값 · 판정은 최상위
# README 「배포하려면」 절이 갖는다. 여기는 이미지마다 무엇을 왜 넣었는지만 적는다.
#
#   api  — api 프로세스(마이그레이션 · 시딩 · 비밀번호 재설정도 같은 이미지로 돈다 · 로그인 막힘 풀기는 api 가 든 그 컨테이너에서 친다) · 화면 그리기용 chromium · 한글 글꼴
#   web  — 앞단(Caddy) · 에디터 정적 번들
#
# 판(Node · Debian · Caddy)을 고정한다 — 떠 있는 태그는 다시 지을 때 다른 판을 받아 잰 값이 조용히 낡는다.
# Node 판은 tmpfs 케이스(`apps/api/build-test/log-destination-full-disk.test.ts`)가 쓰는 `node:24-slim` 이 가리키는 것과 같다.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG CADDY_IMAGE=caddy:2.11.4

# ---------------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# `packageManager` 의 pnpm 판을 corepack 이 받는다.
RUN corepack enable
COPY . .
# devDependencies 까지 설치한다 — api 는 tsx 로 돈다(아래 `api` 의 CMD). 내보내기 워커 스레드도 tsx 로더로 `.ts` 를 싣는다
# (`apps/api/src/services/export-worker.ts` 의 `tsxEsmLoader`) — 빌드된 JS 로 돌리는 길이 없다.
RUN pnpm install --frozen-lockfile
# `pnpm build` 가 시스템 테마 산출물(`system-themes/*/dist/*.wbtheme`)을 낸다 — api 가 기동 때 그것을 DB 에 넣고, 없으면 뜨지 않는다
# (`apps/api/src/services/system-themes.ts`). `build:template` 은 관리자가 내려받는 스타터 템플릿 zip 이다(`packages/theme-kit/dist/`).
# 둘 다 `/app` 을 통째로 옮기는 아래 `api` 단계에 실린다.
RUN pnpm build && pnpm build:template && pnpm --filter @wirebound/web build

# ---------------------------------------------------------------------------------------------------------------------
FROM ${CADDY_IMAGE} AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

# ---------------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS api
# - chromium: 배포판 브라우저. playwright 캐시(`cli.js install --with-deps --only-shell`)를 고르지 않은 까닭은 README
#   「배포하려면」 절 — 보안 갱신이 apt 로 오고, 의존 라이브러리를 패키지 관리자가 맞춘다.
# - fonts-noto-cjk: 한글 글리프. 없으면 화면을 한 장도 안 그린다(`apps/api/src/services/screen-render.ts` 의 `NO_KOREAN_FONT`).
#   배포판 chromium 은 한글 글꼴을 안 끌고 온다.
# - tini: PID 1. node 는 chromium 이 남긴 자식을 안 거둔다 — node 가 PID 1 이면 그림 한 번마다 좀비가 쌓인다. tini 는 받은
#   신호를 node 에 넘기므로 `docker stop` 의 SIGTERM 이 서버의 정상 종료(`apps/api/src/shutdown.ts`)에 닿는다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-cjk tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/api
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    SCREEN_CHROMIUM_PATH=/usr/bin/chromium
# 루트가 아닌 사용자 — node 이미지의 `node`(uid 1000). 앱은 디스크에 안 쓴다(로그는 표준출력 · 브라우저 프로필은 /tmp).
USER node
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
# pnpm 을 거치지 않는다 — pnpm 이 PID 1 의 자식이면 SIGTERM 이 서버에 안 닿는다(README 「api 가 필요로 하는 것」).
# tsx CLI 가 아니라 `node --import tsx` 라 부모 감시(`shutdown.ts` 의 `launchedByTsxCli`)는 안 돈다 — 부모가 tini 라 볼 까닭도 없다.
CMD ["node", "--import", "tsx", "src/main.ts"]
