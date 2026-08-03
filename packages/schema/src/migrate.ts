import type { PageDocument } from './node'

export const CURRENT_DOCUMENT_VERSION = 1

export interface Migration {
  from: number
  to: number
  migrate: (doc: PageDocument) => PageDocument
}

/**
 * 버전별 마이그레이션 체인.
 * 컴포넌트 props가 바뀌면 여기에 한 단계를 추가한다.
 */
export const MIGRATIONS: Migration[] = []

/** 문서를 목표 버전까지 올린다. 가져오기·스냅샷 복원·읽기가 모두 이 경로를 탄다. */
export function migrateDocument(
  doc: PageDocument,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_DOCUMENT_VERSION,
): PageDocument {
  let current = structuredClone(doc)

  if (current.version > target) {
    throw new Error(`지원하지 않는 문서 버전: ${current.version}`)
  }

  while (current.version < target) {
    const step = migrations.find((migration) => migration.from === current.version)
    if (!step) {
      throw new Error(`버전 ${current.version}에서 올릴 마이그레이션이 없습니다`)
    }
    current = { ...step.migrate(current), version: step.to }
  }

  return current
}
