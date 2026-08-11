/**
 * 테마 저작 화면(P4c-2 P1·P3). **라우트·권한·읽기 전용·저장·이슈 표시**를 본다.
 *
 * 왼쪽 탭의 내용(토큰 GUI·JSON 에디터)과 오른쪽 갤러리는 ②가 채운다 — 여기서 보는 것은
 * **자리와 배선**이고, 그 둘이 붙어도 이 파일의 단언은 그대로 유효해야 한다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { themeIssue, systemTheme, type Theme } from '@wirebound/themes'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, ThemeDetail } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const user: { id: string; email: string; name: string } = {
  id: 'u1',
  email: 'a@b.c',
  name: '홍길동',
}

function project(role: ProjectDetail['role']): ProjectDetail {
  return { id: 'p1', name: '프로젝트', slug: 'proj', description: null, role }
}

/** 프로젝트 소유의 파생 테마. **`base`가 함께 온다** — 서버가 상세 조회에만 싣는다. */
function derived(overrides: Partial<ThemeDetail> = {}): ThemeDetail {
  return {
    id: 't1',
    system: false,
    updatedAt: '2026-08-11T09:00:00.000Z',
    theme: {
      meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' },
    },
    base: systemTheme('admin') as Theme,
    ...overrides,
  }
}

/** 내장 테마. **`base`가 없다**(파생이 아니다). */
function system(): ThemeDetail {
  return {
    id: 't-admin',
    system: true,
    updatedAt: '2026-08-11T09:00:00.000Z',
    theme: systemTheme('admin') as Theme,
  }
}

const ROUTE = '/projects/p1/themes/t1'

function open(options: {
  role?: ProjectDetail['role']
  detail?: ThemeDetail
  route?: string
  updateTheme?: ApiClient['updateTheme']
  createTheme?: ApiClient['createTheme']
}): void {
  const detail = options.detail ?? derived()
  renderWithProviders(<App />, {
    route: options.route ?? ROUTE,
    client: fakeApi({
      me: async () => user,
      getProject: async () => project(options.role ?? 'owner'),
      getTheme: async () => detail,
      ...(options.updateTheme === undefined ? {} : { updateTheme: options.updateTheme }),
      ...(options.createTheme === undefined ? {} : { createTheme: options.createTheme }),
    }),
  })
}

describe('테마 저작 라우트', () => {
  it('주소로 들어오면 그 테마의 편집 화면이 열린다', async () => {
    open({})

    expect(await screen.findByRole('heading', { name: '브랜드' })).toBeTruthy()
    // **②가 채울 자리 둘이 이름으로 있다**(재라 #1 — 좌우 2분할).
    expect(screen.getByLabelText('테마 편집')).toBeTruthy()
    expect(screen.getByLabelText('테마 갤러리')).toBeTruthy()
  })

  it('로그인하지 않았으면 못 들어온다 — 문지기 아래의 라우트다', async () => {
    renderWithProviders(<App />, {
      route: ROUTE,
      client: fakeApi({ me: async () => Promise.reject(new ApiError(401, 'unauthenticated', '로그인이 필요합니다')) }),
    })

    await waitFor(() => {
      expect(currentPath()).toBe('/login')
    })
  })

  it('조회가 실패하면 셸 대신 오류이고 돌아갈 길이 있다', async () => {
    renderWithProviders(<App />, {
      route: ROUTE,
      client: fakeApi({
        me: async () => user,
        getProject: async () => project('owner'),
        getTheme: async () => Promise.reject(new ApiError(404, 'not-found', '테마를 찾을 수 없습니다')),
      }),
    })

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '테마를 찾을 수 없습니다')
    expect(screen.getByRole('link', { name: '설계서로 돌아가기' })).toBeTruthy()
  })
})

describe('권한 — 읽기는 열고 쓰기는 owner다', () => {
  it('owner가 아니면 읽기 전용이고 이유를 말한다', async () => {
    open({ role: 'viewer' })

    expect(await screen.findByText('이 프로젝트의 owner만 테마를 고칠 수 있습니다.')).toBeTruthy()
    // **못 들어오게 하지 않는다** — 무엇이 적용돼 있는지는 볼 수 있어야 한다.
    expect(screen.getByRole('heading', { name: '브랜드' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
  })

  it('editor도 못 고친다 — 테마는 페이지와 등급이 다르다(§10)', async () => {
    open({ role: 'editor' })

    expect(await screen.findByText('이 프로젝트의 owner만 테마를 고칠 수 있습니다.')).toBeTruthy()
  })

  it('owner에게는 그 문안이 없다', async () => {
    open({ role: 'owner' })

    await screen.findByRole('heading', { name: '브랜드' })
    expect(screen.queryByText('이 프로젝트의 owner만 테마를 고칠 수 있습니다.')).toBeNull()
  })
})

describe('D2 — 시스템 테마는 막다른 길이 아니다', () => {
  it('내장 테마는 읽기 전용이고 파생 만들기가 있다', async () => {
    open({ detail: system() })

    expect(await screen.findByText('내장 테마는 고칠 수 없습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' })).toBeTruthy()
  })

  it('파생 테마에는 그 버튼이 없다 — 파생의 파생은 없다(§6.9)', async () => {
    open({ detail: derived() })

    await screen.findByRole('heading', { name: '브랜드' })
    expect(screen.queryByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' })).toBeNull()
  })

  it('owner가 아니면 파생도 못 만든다 — POST가 owner 게이트다', async () => {
    open({ detail: system(), role: 'viewer' })

    expect(await screen.findByText('내장 테마는 고칠 수 없습니다.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' })).toBeNull()
  })

  it('파생은 meta 셋만 담아 보내고 만든 테마로 이동한다', async () => {
    const createTheme = vi.fn<ApiClient['createTheme']>(async () => derived({ id: 't-new' }))
    open({ detail: system(), createTheme })

    await screen.findByText('내장 테마는 고칠 수 없습니다.')
    fireEvent.change(screen.getByLabelText('새 테마 id'), { target: { value: 'brand' } })
    fireEvent.click(screen.getByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' }))

    await waitFor(() => {
      expect(createTheme).toHaveBeenCalledTimes(1)
    })
    // **덮어쓸 것만 적는 것이 §6.9의 뜻이다** — 시스템 테마 전문을 복사해 넣지 않는다.
    expect(createTheme.mock.calls[0]![1]).toEqual({
      theme: {
        meta: {
          id: 'brand',
          name: '관리자 파생',
          version: '1.0.0',
          // **`meta.id`(slug)를 쓴다 — 행 id가 아니다.**
          extends: 'system:admin',
        },
      },
    })
    await waitFor(() => {
      expect(currentPath()).toBe('/projects/p1/themes/t-new')
    })
  })

  it('id가 비어 있으면 못 누른다', async () => {
    open({ detail: system() })

    await screen.findByText('내장 테마는 고칠 수 없습니다.')
    expect(
      screen.getByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' }),
    ).toHaveProperty('disabled', true)
  })

  it('id가 충돌하면 서버의 문안을 그대로 보여 준다 — 규칙을 두 곳에 두지 않는다', async () => {
    open({
      detail: system(),
      createTheme: async () => Promise.reject(new ApiError(409, 'conflict', '이미 사용 중인 테마 id입니다')),
    })

    await screen.findByText('내장 테마는 고칠 수 없습니다.')
    fireEvent.change(screen.getByLabelText('새 테마 id'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: '이 테마를 바탕으로 새 테마 만들기' }))

    expect(await screen.findByText('이미 사용 중인 테마 id입니다')).toBeTruthy()
  })
})

describe('D3 — 초안은 저장 전까지 서버에 안 간다', () => {
  it('막 열었을 때는 저장할 것이 없다', async () => {
    open({})

    await screen.findByRole('heading', { name: '브랜드' })
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
    expect(screen.queryByText('저장 안 함')).toBeNull()
  })

  it('읽기 전용이면 저장 버튼이 꺼져 있다', async () => {
    open({ detail: system() })

    await screen.findByText('내장 테마는 고칠 수 없습니다.')
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
  })
})

describe('D4 — 이슈는 severity로 갈라서 보인다', () => {
  it('error가 있으면 저장이 막히고 이유가 화면에 있다', async () => {
    const broken = structuredClone(systemTheme('admin')) as Theme
    ;(broken.tokens as Record<string, Record<string, string>>)['semantic']!['primary'] =
      'palette.그런건없다'
    open({ detail: derived({ theme: broken, base: undefined }) })

    // **편집 중 검증은 클라이언트가 돈다**(D4) — 서버에 묻지 않았는데도 화면에 나온다.
    const issues = await screen.findByLabelText('편집 중 검증')
    expect(issues.textContent).toContain('tokens.semantic.primary')
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
    expect(screen.getByText('오류를 고쳐야 저장할 수 있습니다')).toBeTruthy()
  })

  it('경고만 있으면 저장이 막히지 않는다', async () => {
    const suspicious = structuredClone(systemTheme('admin')) as Theme
    suspicious.primitives = { ...suspicious.primitives, container: { maxWidth: 'spce.4' } }
    open({ detail: derived({ theme: suspicious, base: undefined }) })

    const issues = await screen.findByLabelText('편집 중 검증')
    expect(issues.textContent).toContain('알림')
    expect(issues.textContent).not.toContain('오류')
    expect(screen.queryByText('오류를 고쳐야 저장할 수 있습니다')).toBeNull()
  })

  it('이슈가 없으면 상자 자체가 없다', async () => {
    open({})

    await screen.findByRole('heading', { name: '브랜드' })
    expect(screen.queryByLabelText('편집 중 검증')).toBeNull()
  })

  it('편집 중 검증과 서버의 판정은 다른 상자다 — 갈리면 그것이 결함이다', async () => {
    open({})

    await screen.findByRole('heading', { name: '브랜드' })
    // 상자 이름이 갈라져 있어야 어느 채널의 말인지 알 수 있다(P4c-1 이월 §2의 두 채널).
    expect(screen.queryByLabelText('마지막 저장에 대한 서버의 판정')).toBeNull()
  })
})

describe('P3 — 저장과 두 채널', () => {
  /** 이름을 고쳐 초안을 더럽힌다. **오늘 화면에 있는 유일한 입력이다**(②가 나머지를 만든다). */
  function rename(value: string): void {
    fireEvent.change(screen.getByLabelText('테마 이름'), { target: { value } })
  }

  it('고치면 "저장 안 함"이 뜨고 저장 버튼이 켜진다', async () => {
    open({})
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')

    expect(screen.getByText('저장 안 함')).toBeTruthy()
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', false)
  })

  it('저장은 초안 전체를 PUT으로 보낸다 — 통째 교체다', async () => {
    const updateTheme = vi.fn<ApiClient['updateTheme']>(async () => derived())
    open({ updateTheme })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(updateTheme).toHaveBeenCalledTimes(1)
    })
    expect(updateTheme.mock.calls[0]![1]).toBe('t1')
    expect(updateTheme.mock.calls[0]![2]).toEqual({
      theme: { meta: { id: 'brand', name: '브랜드 2', version: '1.0.0', extends: 'system:admin' } },
    })
  })

  it('저장이 끝나면 "저장 안 함"이 사라진다', async () => {
    open({ updateTheme: async () => derived() })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.queryByText('저장 안 함')).toBeNull()
    })
  })

  it('warnings 키가 없어도 죽지 않는다 — 서버가 그렇게 낸다', async () => {
    // **P4c-1이 *"경고가 없으면 키 자체가 없다"*로 만들었다.** 그 응답이 여기 그대로 온다.
    open({ updateTheme: async () => derived() })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.queryByText('저장 안 함')).toBeNull()
    })
    expect(screen.queryByLabelText('마지막 저장에 대한 서버의 판정')).toBeNull()
  })

  it('warnings가 오면 서버의 판정으로 따로 그린다', async () => {
    const warning = themeIssue(
      'node-handle-overwrite',
      'components.Flex.base.display',
      '노드 손잡이를 덮습니다',
    )
    open({ updateTheme: async () => derived({ warnings: [warning] }) })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    const box = await screen.findByLabelText('마지막 저장에 대한 서버의 판정')
    expect(box.textContent).toContain('components.Flex.base.display')
    // **의도된 동작이라고 말한다** — 빨간 배지로 내면 소음이 된다(P4c-1 이월 §2).
    expect(box.textContent).toContain('의도된 동작입니다')
    // **오류가 아니다** — 저장은 됐다.
    expect(box.textContent).toContain('저장은 됩니다')
  })

  it('422면 서버가 준 이슈를 그대로 보여 준다', async () => {
    const error = themeIssue('unresolved-token', 'tokens.semantic.primary', '토큰을 풀 수 없습니다')
    open({
      updateTheme: async () =>
        Promise.reject(
          new ApiError(422, 'validation-failed', '테마 검증에 실패했습니다', [
            error as unknown as { path: string; message: string },
          ]),
        ),
    })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    const box = await screen.findByLabelText('서버가 거절한 이유')
    expect(box.textContent).toContain('tokens.semantic.primary')
    expect(box.textContent).toContain('저장할 수 없습니다')
    // **초안은 그대로다** — 사용자가 방금 적은 것을 지우지 않는다.
    expect(screen.getByLabelText('테마 이름')).toHaveProperty('value', '브랜드 2')
    expect(screen.getByText('저장 안 함')).toBeTruthy()
  })

  it('실패 통지를 닫을 수 있다', async () => {
    open({
      updateTheme: async () => Promise.reject(new ApiError(500, 'internal', '서버 오류')),
    })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('서버 오류')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))

    expect(screen.queryByText('서버 오류')).toBeNull()
  })

  it('세션이 끊기면 로그인으로 보낸다 — 저장 실패를 오류 문안으로 뭉개지 않는다', async () => {
    open({
      updateTheme: async () =>
        Promise.reject(new ApiError(401, 'unauthenticated', '로그인이 필요합니다')),
    })
    await screen.findByRole('heading', { name: '브랜드' })

    rename('브랜드 2')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(currentPath()).toBe('/login')
    })
  })

  it('읽기 전용이어도 지금 값은 보인다 — 못 고치는 것과 안 보이는 것은 다르다', async () => {
    open({ detail: system() })
    await screen.findByText('내장 테마는 고칠 수 없습니다.')

    const field = screen.getByLabelText('테마 이름')
    expect(field).toHaveProperty('disabled', true)
    // **값까지 단언한다.** `disabled`만 보면 잠겼을 때 빈 값을 그려도 초록이다
    // (재서 확인했다 — 그 변조가 0 사망이었고 이 줄을 더해 닫았다).
    expect(field).toHaveProperty('value', '관리자')
  })
})

// ────────────────────────────────────────────────────────────────────────────────
// 여기부터 P4c-3.
// ────────────────────────────────────────────────────────────────────────────────

/**
 * **저장 버튼이 파싱 실패를 안다**(D6 — 이월 §12.1-1). W2가 남긴 공백이고, 그것이 실제로
 * 열려 있었다는 것을 **고치기 전에 재현했다**(P4c-3 보고서 §3): 상자에 읽히는 값을 넣고
 * 이어서 읽히지 않는 글자를 친 뒤 저장을 누르니 버튼이 `disabled=false`였고 `updateTheme`이
 * **앞의 값**을 받았다.
 */
describe('P4c-3 — 읽지 못한 JSON이 저장을 막는다 (D6)', () => {
  /** 상자에 값을 넣는다. `<textarea>`의 값 교체 하나가 그 화면의 유일한 입력이다. */
  function typeJson(section: string, text: string): void {
    fireEvent.change(screen.getByRole('textbox', { name: section }), { target: { value: text } })
  }

  it('파싱 실패 중에는 저장이 막히고 어느 절인지 이름으로 말한다', async () => {
    const updateTheme = vi.fn<ApiClient['updateTheme']>(async () => derived())
    open({ updateTheme })
    await screen.findByRole('heading', { name: '브랜드' })

    // 1) 읽히는 값을 하나 넣는다 — 이것이 "마지막으로 읽힌 값"이 된다.
    typeJson('components', '{"Button":{"base":{"bg":"semantic.primary"}}}')
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', false)

    // 2) 그 뒤에 읽히지 않는 글자를 친다.
    typeJson('components', '{"Button":{"base":{"bg":')

    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
    expect(screen.getByText('읽지 못한 JSON이 있어 저장할 수 없습니다: components')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(updateTheme).toHaveBeenCalledTimes(0)
  })

  it('다시 읽히면 저장이 살아나고 그때 간 것은 새 값이다', async () => {
    const updateTheme = vi.fn<ApiClient['updateTheme']>(async () => derived())
    open({ updateTheme })
    await screen.findByRole('heading', { name: '브랜드' })

    typeJson('components', '{"Button":{"base":{"bg":"semantic.primary"}}}')
    typeJson('components', '{"Button":{"base":{"bg":')
    typeJson('components', '{"Card":{"base":{"bg":"semantic.surface"}}}')

    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(updateTheme).toHaveBeenCalledTimes(1)
    })
    expect((updateTheme.mock.calls[0]![2] as { theme: Theme }).theme.components).toEqual({
      Card: { base: { bg: 'semantic.surface' } },
    })
  })

  it('읽기 전용이면 그 문장을 안 그린다 — 못 누르는 이유가 이미 다르다', async () => {
    open({ detail: system() })
    await screen.findByText('내장 테마는 고칠 수 없습니다.')

    expect(screen.queryByText(/읽지 못한 JSON이 있어/)).toBeNull()
  })
})

/**
 * **두 이슈 상자를 눈으로 가른다**(D7 — 이월 §12.1-5). P4c-2 ③이 쟀다: `title`이
 * `aria-label`로만 나가 *"보조 기술은 가르고 눈은 못 가른다"*였다(두 상자의 **보이는 글자가
 * 글자까지 같았다**).
 */
describe('P4c-3 — 이슈 상자의 제목이 눈에 보인다 (D7)', () => {
  it('제목이 heading으로 나오고 접근성 이름도 그대로다', async () => {
    const warning = themeIssue(
      'node-handle-overwrite',
      'components.Tree.parts.node.paddingX',
      '들여쓰기를 덮습니다',
    )
    open({ updateTheme: async () => derived({ warnings: [warning] }) })
    await screen.findByRole('heading', { name: '브랜드' })

    fireEvent.change(screen.getByLabelText('테마 이름'), { target: { value: '브랜드 2' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    // **보이는 제목이다** — `aria-label`이었을 때는 `getByRole('heading')`으로 못 찾았다.
    expect(await screen.findByRole('heading', { name: '마지막 저장에 대한 서버의 판정' })).toBeTruthy()
    // 접근성 이름은 `aria-labelledby`로 그대로 남는다 — 기존 케이스들이 그것을 쓴다.
    expect(screen.getByLabelText('마지막 저장에 대한 서버의 판정')).toBeTruthy()
  })
})
