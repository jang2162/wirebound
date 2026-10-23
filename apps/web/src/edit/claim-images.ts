/**
 * **노드를 다른 몫(프로젝트 · 개인)으로 옮길 때 그림을 함께 가져온다**(설계 spec `2026-10-24-compose-input-design.md` «10. 그림과 다른 기능의 경계»).
 * 그림은 해시를 안다고 읽을 수 없어(소유 행이 가른다) 붙이기(다른 프로젝트) · 모듈 넣기(개인 → 프로젝트)는 편집 **전에** 서버의 가져오기(`claim`)를
 * 부르고, 못 가져온 그림은 노드에서 비운 뒤 말한다. 가져오기가 아예 실패하면(끊김 · 거절) 든 그림 전부를 못 가져온 것으로 센다 — 깨진 그림을 문서에
 * 남기지 않는다.
 */
import { clearImages, imageIdsIn, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../api/client'
import type { AssetClaimResult, AssetSource } from '../api/types'

export interface ClaimedNodes {
  nodes: WbNode[]
  /** 노드에 비운 그림이 있으면 말할 한 줄 — 없으면 `null`. */
  notice: string | null
}

/** 못 가져온 그림의 문장 — 까닭은 가장 무거운 하나(권한 → 한도 → 끊김)를 쓴다. */
export function clearedImagesNotice(count: number, reason: 'not-readable' | 'quota' | 'failed'): string {
  const why =
    reason === 'not-readable'
      ? '출처에 들어갈 수 없습니다'
      : reason === 'quota'
        ? '이 프로젝트의 그림 공간이 찼습니다'
        : '그림을 가져오지 못했습니다 — 연결을 확인하세요'
  return `그림 ${count}개를 가져오지 못해 비웠습니다 — ${why}`
}

/**
 * `nodes` 가 든 그림을 `from` 에서 `projectId` 로 가져오고, 못 가져온 그림을 비운 노드를 준다. 그림이 없으면 부르지 않고 그대로 준다.
 */
export async function claimNodeImages(
  api: Pick<ApiClient, 'claimAssets'>,
  projectId: string,
  nodes: readonly WbNode[],
  from: AssetSource,
): Promise<ClaimedNodes> {
  const ids = imageIdsIn(nodes)
  if (ids.length === 0) return { nodes: [...nodes], notice: null }
  let result: AssetClaimResult
  try {
    result = await api.claimAssets(projectId, ids, from)
  } catch {
    return blank(nodes, { claimed: [], failed: ids.map((id) => ({ id, reason: 'not-readable' as const })) }, 'failed')
  }
  return blank(nodes, result, result.failed.some((one) => one.reason === 'not-readable') ? 'not-readable' : 'quota')
}

function blank(nodes: readonly WbNode[], result: AssetClaimResult, reason: 'not-readable' | 'quota' | 'failed'): ClaimedNodes {
  if (result.failed.length === 0) return { nodes: [...nodes], notice: null }
  const cleared = clearImages(nodes, new Set(result.failed.map((one) => one.id)))
  return { nodes: cleared.nodes, notice: cleared.cleared === 0 ? null : clearedImagesNotice(result.failed.length, reason) }
}

/**
 * **개인 몫으로 옮길 때**(개인 모듈 저장 · 프로젝트 → 개인 복사) — 그림을 하나라도 못 가져오면 저장하지 않는다(그림 없이 남기면 다른 프로젝트에서 넣을
 * 때 깨진다 — 설계 «10»). 다 가져왔거나 그림이 없으면 `null`, 아니면 저장하지 않은 까닭 한 줄.
 */
export async function claimNodeImagesToMe(
  api: Pick<ApiClient, 'claimMyAssets'>,
  fromProjectId: string,
  nodes: readonly WbNode[],
): Promise<string | null> {
  const ids = imageIdsIn(nodes)
  if (ids.length === 0) return null
  let result: AssetClaimResult
  try {
    result = await api.claimMyAssets(ids, fromProjectId)
  } catch {
    return `그림 ${ids.length}개를 개인 몫으로 가져오지 못해 저장하지 않았습니다 — 연결을 확인하세요`
  }
  if (result.failed.length === 0) return null
  const why = result.failed.some((one) => one.reason === 'not-readable') ? '이 프로젝트에서 읽을 수 없습니다' : '개인 그림 공간이 찼습니다'
  return `그림 ${result.failed.length}개를 개인 몫으로 가져오지 못해 저장하지 않았습니다 — ${why}`
}
