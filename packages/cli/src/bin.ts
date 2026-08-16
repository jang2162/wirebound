#!/usr/bin/env node
/**
 * `wireb`. **진짜 `io`를 만들어 넘기는 몇 줄이다**(D9) — 판단은 하나도 없다.
 *
 * `process.exit`가 여기 있는 것이 요점이다. 로직 안에서 부르면 케이스가 종료 코드를
 * 읽을 수 없고, 그것을 읽지 못하면 `exit.ts`의 표가 아무것도 지키지 못한다.
 *
 * **shebang과 실행 권한은 빌드가 다룬다**(재라 #5 — 쟀다): `tsdown`이 이 첫 줄을 산출물의
 * 첫 줄로 그대로 옮기고, 그것을 보고 `dist/bin.js`에 실행 권한을 준다(`bin` 필드가 없어도
 * 그렇게 한다 — 판단의 근거는 shebang이다). **확장자는 다르다** — 기본값이면 `.mjs`가
 * 나와 `bin` 필드와 어긋나므로 `tsdown.config.ts`가 `fixedExtension: false`로 끈다.
 * `build-test/dist-bin.test.ts`가 그 셋을 빌드 결과물로 잰다(D11).
 */
import { createNodeIo } from './node-io'
import { run } from './run'

process.exitCode = await run(process.argv.slice(2), createNodeIo())
