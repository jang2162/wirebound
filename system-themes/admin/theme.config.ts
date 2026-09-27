import { defineManifest } from '@wirebound/theme-sdk'
import { MANIFEST } from './src/manifest'

// `wb-theme build` 가 읽는 선언. 값은 `src/manifest.ts` 가 갖는다 — 웹이 쓰는 `ADMIN_V0`(`src/index.ts`)와 한 벌이다.
export default defineManifest(MANIFEST)
