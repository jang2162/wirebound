#!/usr/bin/env node
// `bin` 이 빌드 산출물(`dist/bin.js`)을 바로 가리키면, 빌드 전에 `pnpm install` 한 체크아웃에서 pnpm 이 `wb-theme` 심을 만들지
// 않는다(대상 파일이 없으면 건너뛴다) — 그 뒤 `pnpm build` 가 system-themes 를 빌드할 때 명령을 못 찾는다. 늘 있는 이 파일이 잇는다.
import '../dist/bin.js'
