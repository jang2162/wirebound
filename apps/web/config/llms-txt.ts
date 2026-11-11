/**
 * 배포한 앱이 `/llms.txt` 로 내주는 글을 짓는다 — 바깥 에이전트가 wirebound 를 쓰는 법을 읽는 자리(llmstxt.org 의 꼴: H1 · 인용 요약 ·
 * 절). 짓는 것은 케이스다: `test/llms-txt.test.ts` 가 이 함수의 글을 `public/llms.txt` 와 대조하고 `-u` 로 다시 쓴다. vite 는 그 파일을
 * 정적 파일로 낼 뿐 이 모듈을 부르지 않는다 — 이 모듈은 Node 에서 `@wirebound/mcp`(MCP 서버 전체)를 싣는다.
 *
 * ---
 *
 * # 목록은 정의에서 뽑는다
 *
 * 노드 필드 · 상호작용 · 카탈로그(타입 · 그룹 · prop 의 꼴과 기본값) · MCP 도구(이름 · 인자) · 문서 판 · 상한은 `@wirebound/schema` 와
 * `@wirebound/mcp` 의 값에서 읽는다. 손으로 쓴 것은 머리글 · 붙이는 법 · 영어 한 줄 설명뿐이다. REST 표는 `@wirebound/mcp` 의
 * `LLMS_REST_ROUTES` 다(그 자리 머리말에 왜 거기 사는지가 있다).
 *
 * **영어 설명 표는 정의와 키가 같아야 한다 — 다르면 `renderLlmsTxt` 가 던진다.** 카탈로그 · 도구의 사람이 읽을 글(`description`)은
 * 한국어라 영어 글에 그대로 못 싣는다. 설명 표를 따로 두면 컴포넌트를 더할 때 그 줄이 빠지는데, 던지지 않고 건너뛰면 그 컴포넌트가
 * 설명 없이 조용히 나간다. 던지면 산출물을 대조하는 케이스가 그 자리에서 죽는다.
 *
 * # 인스턴스의 것을 싣지 않는다
 *
 * 모두에게 같은 정적 글이다(웹 번들의 `public/` 에 든다 — 인증 없이 나간다). 서버 주소 · 프로젝트 · 사용자 · 테마 목록 · 비밀값을
 * 싣지 않는다. 주소는 «이 파일을 낸 origin» 으로 말한다.
 */
import {
  BODY_ZONE,
  CATALOG_DEFS,
  COMPONENT_GROUPS,
  CURRENT_DOCUMENT_VERSION,
  DEFAULT_VIEW_STATE,
  InteractionSchema,
  MAX_OPS_PER_EDIT,
  NODE_ALIAS_MAX,
  NODE_ID_PATTERN,
  PAGE_TARGET_PREFIX,
  PageEnvelopeSchema,
  placementsOf,
  VIEW_STATE_DEPTH_MAX,
  VIEW_STATE_DESCRIPTION_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  WEIGHT_MAX,
  TREE_DEPTH_MAX,
  TREE_ITEMS_MAX,
  WEIGHT_MIN,
  WbNodeSchema,
  type ComponentDef,
  type ComponentGroup,
} from '@wirebound/schema'
import { LLMS_REST_ROUTES, TOOLS, type ToolInputSchema } from '@wirebound/mcp'

type ToolArgSchema = ToolInputSchema['properties'][string]

/** 그룹 제목. `Record<ComponentGroup, …>` 라 그룹을 더하면 여기를 채우기 전에는 컴파일되지 않는다. */
const GROUP_TITLES: Record<ComponentGroup, string> = {
  structure: 'Structure — containers that arrange other nodes',
  data: 'Data — show records',
  input: 'Input — forms and fields',
  action: 'Action — things a user presses',
  document: 'Document — text, media and filler',
}

/** 컴포넌트 타입 → 영어 한 줄. 키가 `CATALOG_DEFS` 의 타입과 같아야 한다(머리말 «영어 설명 표»). */
const COMPONENT_SUMMARIES: Record<string, string> = {
  Page: 'Root of one design page (a screen); everything on the page sits inside it. Only valid as the document root.',
  Popup:
    'Root of a popup page — a box with a title bar (`title`, a close button), a body and a `footer` of buttons; `size` small 480px · medium 720px · large 960px. Only valid as the document root.',
  Slot: 'Where a layout inserts the page content. Layout documents only.',
  Section: 'A large band of the screen with its own background and spacing.',
  Flex: 'Lays children out in one row or one column.',
  Grid: 'Lays children out on a fixed number of columns. A layout tool — the data table is `DataGrid`.',
  Card: 'A box that groups a title and its content.',
  Tabs: 'Splits content into tabs and shows one at a time. Each tab is a `TabPanel` child.',
  TabPanel: 'One tab of a `Tabs`: its `label` is the tab head, its children are the tab content. Only valid in the body of a `Tabs`.',
  DataGrid:
    'A data table: its body is the columns (`GridColumn`, `GridColumnGroup`), the `rows` zone the rows (`GridRow`), the footer a `Pagination`. Rows repeat the column cell templates; every line after the first is a render copy (`data-wb-copy-of` instead of `data-wb-id` — select the original node). `select` adds a check or radio column, `fixedColumns` keeps that many left columns in place while the table scrolls sideways.',
  GridColumnGroup:
    'A merged header cell over its child columns; nesting depth is the header depth. Only valid in a `DataGrid` body or another `GridColumnGroup`.',
  GridColumn:
    'One column: `label` is the header cell, the children are the cell template drawn on every row without own cells. `numbering` draws data-row numbers instead of the template. Only valid in a `DataGrid` body or a `GridColumnGroup`.',
  GridRow:
    'One row drawn `repeat` times. Without children it draws the column templates; with `GridCell` children it draws only those — cells cover columns from the left, missing columns stay empty. `kind` total or gap (a full-width ellipsis band), `tone` selected, dimmed or shaded. Only valid in the `rows` zone of a `DataGrid`.',
  GridCell:
    'A hand-drawn cell of a `GridRow`: `span` columns wide, `rowSpan` lines tall; its children are the content. Only valid in a `GridRow`.',
  Pagination:
    'A pagination bar: page-size select, page numbers around the current page, range text ("from - to (총 N 항목 중)"). All numbers come from `total`, `pageSize` and `page` — not from the grid rows above it.',
  Tree: 'Hierarchical items that expand and collapse.',
  KeyValue: 'Label/value pairs, as on a detail screen.',
  SearchForm: 'Search conditions that filter a list.',
  EntryForm: 'A create/edit form; its body stacks form tables, headings and grids above one button row (new: one `FormTable`).',
  FormTable:
    'A label|value table: `columns` pairs per row, each child spans `weight` pairs (≥ `columns` = whole row); empty pairs at row ends are drawn. Zones: right of the title, a left cell over all rows (photo), the cells.',
  Field: 'A labelled value cell; its children are the input pieces lined up in the value cell (new: one `Input`).',
  Input: 'A one-line input box; `kind` is text, number or password, `size` short, medium or long.',
  TextArea: 'A multi-line input box; fills the value cell.',
  Select: 'A drop-down that picks one option; `placeholder` shows while nothing is selected.',
  DateInput: 'A date input box.',
  TimeInput: 'A time input box.',
  CheckboxGroup: 'Checkboxes that pick any number of options; one option is a single checkbox.',
  RadioGroup: 'Options that pick at most one; themes may draw it as a segmented control.',
  Chip: 'A small tag showing a chosen value, optionally with a remove mark.',
  Affix: 'Short text between pieces (`~`, "from", `%`) or a coloured note; `tone` sets the colour.',
  FileAttach:
    'A file attachment box drawn as a sample: buttons (`actions` zone), a file list table (`files` — sample rows of name and size; nothing is uploaded), a hint line while the list is empty, and a limit line built from `maxFiles` (0 = no count) and `maxSize` (empty = no size). In a `Field` value cell it takes the field label as its name.',
  Button: 'A button that triggers an action.',
  Link: 'A text link to another screen.',
  Text: 'Headings and body text; `role` sets the size.',
  Media: 'A slot for an image, video, illustration or chart.',
  Divider: 'A line that separates content.',
  Placeholder:
    'Draws what the catalog lacks (a chip, a badge, a banner) or reserves an undesigned area. The only component whose props carry drawing values (size, colors, border, text, padding, image); empty values follow the theme. Children (body zone) replace the label. `image` is the id (sha256) of an image uploaded to this project (`POST /api/projects/:projectId/assets`) — an id the project does not hold draws as a missing image.',
}

/** 노드 필드 → 영어 한 줄. 키가 `WbNodeSchema` 의 키와 같아야 한다. */
const NODE_FIELDS: Record<string, string> = {
  id: `Unique within the document. Pattern \`${NODE_ID_PATTERN.source.replace(/^\^|\$$/g, '')}\`.`,
  type: 'A component type from the catalog below.',
  alias: `Optional human name for the node, 1–${NODE_ALIAS_MAX} characters, no surrounding spaces or line breaks. Need not be unique.`,
  props: "The component's props (see the catalog). Omitted props take their defaults.",
  variant: "A theme variant name. The theme decides which values exist; the document doesn't validate it.",
  weight: `Integer ${WEIGHT_MIN}–${WEIGHT_MAX}: share of the parent — free width in a \`Flex\`, columns spanned in a \`Grid\`, pairs spanned in a \`FormTable\` or a \`SearchForm\` with \`columns\`. Ignored elsewhere.`,
  visibility: `\`{ mode: "only" | "except", states: [...] }\` — show the node only in (or hide it in) those view states and their descendants. \`"${DEFAULT_VIEW_STATE}"\` is the base screen. Omitted: visible in every state.`,
  marker: 'Comment number (positive integer). The server assigns it when the first comment lands on the node; do not invent one.',
  interactions: 'What happens on user events (see Interactions).',
  code: "`{ group, item?, selected? }` — bind the node to the project's common code table by group key and code value. Choice widgets (`Select`, `CheckboxGroup`, `RadioGroup`) take `group` and pick values in `selected`; text components take `group` + `item` and show that item's name. Keep the bound text in props too — it is the fallback when the reference breaks.",
  children: 'Child nodes in the body zone. Only components that declare a `body` zone take them.',
  zones:
    'Named child zones: `{ <zone name>: [nodes] }`. Only the zones a component declares (see the catalog); a missing key is an empty zone. Patch paths: `…/zones/<zone name>/<index>` (add a first node with `…/zones/<zone name>` and value `[node]`, or `…/zones` with `{ <zone name>: [node] }` when the node has no `zones`).',
}

/** 페이지 문서 필드 → 영어 한 줄. 키가 `PageEnvelopeSchema` 의 키와 같아야 한다. */
const PAGE_FIELDS: Record<string, string> = {
  version: `Document format version. The server stores and returns version ${CURRENT_DOCUMENT_VERSION}.`,
  root: 'The root node — a `Page` (a screen) or a `Popup` (a popup page). A page’s kind is its root type.',
  viewStates: `Optional named screen states (\`{ id, name, parent?, description? }\`), at most ${VIEW_STATES_MAX}, names 1–${VIEW_STATE_NAME_MAX} characters, nesting at most ${VIEW_STATE_DEPTH_MAX} deep, \`description\` free text up to ${VIEW_STATE_DESCRIPTION_MAX} characters (omit it rather than send a blank one). Nodes refer to them from \`visibility\`.`,
}

/** 상호작용 액션 → 영어 한 줄. 키가 `InteractionSchema` 의 액션 `type` 과 같아야 한다. */
const ACTIONS: Record<string, string> = {
  setProp: '`{ target: <node id>, prop, value }` — set a prop of another node.',
  setVisible: '`{ target: <node id>, value: boolean }` — show or hide a node.',
  switchTab: '`{ target: <TabPanel node id> }` — open that tab of its parent `Tabs`.',
  navigate: `\`{ target: "${PAGE_TARGET_PREFIX}<menu path>" }\` — go to another page.`,
  openModal: `\`{ target: "${PAGE_TARGET_PREFIX}<menu path>" }\` — open that popup page over the current screen (a backdrop and a centered box). Point it at a page whose root is \`Popup\`.`,
  closeModal: '`{}` — no target; close the top-most open popup.',
}

interface ToolText {
  summary: string
  args: Record<string, string>
}

/** 도구 → 영어 설명과 인자 설명. 도구 이름 · 인자 이름이 `TOOLS` 와 같아야 한다. */
const TOOL_TEXT: Record<string, ToolText> = {
  list_pages: {
    summary: 'Menu tree and page list of the bound project. Each page `path` is the argument of the other tools.',
    args: {},
  },
  get_page: {
    summary:
      'One page: document, node outline (`nodes[].id`, `nodes[].path`), comments, interaction sentences and `headSeq`. Unknown or ambiguous paths return candidates instead.',
    args: { path: 'Page path from `list_pages`, e.g. `Admin/Members/List`. A `page:` prefix is accepted.' },
  },
  patch_page: {
    summary:
      'Edit the page document with JSON Patch, through the same pipeline as human edits. Rejected with reason `stale` (409: re-read with `get_page`, rebuild the ops), `locked` (423: a person is editing that area — wait) or `rejected`. Never retries.',
    args: {
      path: 'Page path.',
      baseSeq: 'The `headSeq` from `get_page` (or from the previous successful edit).',
      ops: `RFC 6902 ops (add, remove, replace, move, test — not copy), at most ${MAX_OPS_PER_EDIT}. Paths under \`/root\` (use \`nodes[].path\`), \`/viewStates\` or \`/version\`.`,
    },
  },
  add_comment: {
    summary:
      'Comment on one node — how an implementer reports back to the design. Numbering a node changes the document and raises `headSeq`.',
    args: {
      path: 'Page path.',
      nodeId: 'Node id from `get_page` `nodes[].id`.',
      body: 'Comment text. Reference a page, a comment number or a common code with a token: `[label](wb:page/<pageId>)`, `[label](wb:comment/<pageId>/<nodeId>)`, `[label](wb:code/<GROUP>)` or `[label](wb:code/<GROUP>/<percent-encoded value>)`. Readers resolve tokens to the current name and number; `get_page` `comments[].resolved` shows the target in parentheses.',
    },
  },
  validate: {
    summary: 'Run the lint rules. Findings are a normal result, not an error. Naming rules come from `.wirebound.json`.',
    args: { path: 'Optional page path; without it the whole project is checked.' },
  },
  list_codes: {
    summary:
      'The project common code table (groups → items: group key, code value, name, active) and how many nodes use each group and item. Bound nodes in `get_page` carry `nodes[].code` with the resolved names.',
    args: {},
  },
  code_usage: {
    summary: 'Nodes in pages, layouts and modules that point at a common code group (or one item). Count before deleting.',
    args: { group: 'Group key from `list_codes`, e.g. `ORDER_STATUS`.', item: 'Optional code value; only nodes pointing at that item.' },
  },
  edit_codes: {
    summary:
      'Change the common code table: add, rename, reorder, (de)activate and delete groups and items. Ops are sent in order and stop at the first rejection; the table has no history, so `applied` says how many already landed. Group keys and code values cannot change after creation; nodes pointing at a deleted entry keep a broken reference.',
    args: {
      ops: 'Table edits: `{ op: "add-group" | "update-group" | "delete-group" | "add-item" | "update-item" | "delete-item", group, item?, name?, sortOrder?, active? }` — the tool description lists which fields each op takes.',
    },
  },
}

export function renderLlmsTxt(): string {
  const out: string[] = []
  const line = (text = '') => out.push(text)

  line('# wirebound')
  line()
  line(
    '> wirebound is a web screen-design tool. People draw page designs — a menu tree of pages, each page a tree of catalog components — in a browser editor; coding agents read the designs, comment on them and edit them through an MCP server. The `wireb` CLI only reads them (`wireb --help`). This file is the same for every wirebound server and carries no data from this one.',
  )
  line()
  line('All server paths below are relative to the origin that served this file.')
  line()

  line('## Connect an agent')
  line()
  line(
    'The agent runs `wireb-mcp`, a stdio MCP server, inside the implementation repository. Project, server and token are not tool arguments: the repository file `.wirebound.json` names the server and project, and the token lives outside the repository.',
  )
  line()
  line(
    '1. Get the tools: build the wirebound source repository (`pnpm install && pnpm build`). The CLI is `node packages/cli/dist/bin.js` and the MCP server is `node packages/mcp/dist/bin.js`; `pnpm link --global` inside `packages/cli` and `packages/mcp` puts `wireb` and `wireb-mcp` on PATH.',
  )
  line(
    '2. Find the project id: it is in the editor URL, `/projects/<project id>`. You need a user account on this server that is a member of the project (viewer or above).',
  )
  line(
    '3. In the implementation repository: `wireb init --server <this origin> --project <project id>` writes `.wirebound.json` (commit it; it holds no secret).',
  )
  line(
    '4. `wireb login --email <you>` asks for the password, issues an API token for that one project and stores it in `~/.wirebound/credentials.json` (mode 600). `WIREB_TOKEN` overrides it. A person revokes tokens in the account settings ("API 토큰" section) or by removing the member from the project.',
  )
  line(
    '5. Register the server with the host from the repository directory, e.g. `claude mcp add wirebound -- wireb-mcp`, or `{ "mcpServers": { "wirebound": { "command": "wireb-mcp", "args": [] } } }` in `.mcp.json`.',
  )
  line()
  line(
    'Typical flow: `list_pages` → `get_page` → implement → `add_comment` where the code and the design disagree → `validate`. Edit the design with `patch_page` only when a person asks for it.',
  )
  line()

  line('## MCP tools')
  line()
  renderTools(line)

  line('## Page document')
  line()
  line('A page is a JSON document. Edits are JSON Patch against it; `nodes[].path` from `get_page` is the JSON Pointer of each node.')
  line()
  renderFields(line, schemaOf(PageEnvelopeSchema), PAGE_FIELDS, 'page document')
  line()
  line('### Node')
  line()
  renderFields(line, schemaOf(WbNodeSchema), NODE_FIELDS, 'node')
  line()
  line('Nodes carry no styles. Appearance comes from the project theme.')
  line()
  line('### Interactions')
  line()
  renderInteractions(line)

  line('## Component catalog')
  line()
  line(
    'Every node `type` is one of these. Props are validated against the listed shapes; unknown props are rejected. Child nodes live in zones: the `body` zone is the node\'s `children`, every other zone is `zones.<name>`. A component with no zones holds no child nodes. Some zones accept only certain types, and some types stand only in one zone. "Create with" lists the nodes the editor puts in a new node — the server does not add them, so add them yourself when you create one. State props are booleans that switch a visual state of the component.',
  )
  line()
  renderCatalog(line)

  line('## REST API (summary)')
  line()
  line(
    '- Auth: `Authorization: Bearer <token>` (the token from `wireb login`). A token works only on routes under `/api/projects/:projectId/` of its own project — another project answers 404. It cannot open the WebSocket or manage tokens. Permission is the member role at request time: viewer < editor < owner.',
  )
  line('- Bodies are JSON with camelCase keys. Errors: `{ "error": { "code", "message", "issues"? } }`.')
  line(
    `- Edits are optimistic: send the \`headSeq\` you read as \`baseSeq\`. A stale \`baseSeq\` is 409 — re-read and rebuild, never resend the same ops on a new \`baseSeq\`. At most ${MAX_OPS_PER_EDIT} ops per edit.`,
  )
  line()
  for (const route of LLMS_REST_ROUTES) line(`- \`${route.method} ${route.path}\` (${route.min}) — ${route.summary}`)
  line()
  return `${out.join('\n')}\n`
}

type Line = (text?: string) => void

function renderTools(line: Line): void {
  assertSameKeys(
    'MCP tools',
    TOOLS.map((tool) => tool.name),
    Object.keys(TOOL_TEXT),
  )
  for (const tool of TOOLS) {
    const text = TOOL_TEXT[tool.name]!
    const argNames = Object.keys(tool.inputSchema.properties)
    assertSameKeys(`${tool.name} arguments`, argNames, Object.keys(text.args))
    line(`### ${tool.name}`)
    line()
    line(text.summary)
    line()
    if (argNames.length === 0) line('Arguments: none.')
    for (const name of argNames) {
      const required = tool.inputSchema.required?.includes(name) ? 'required' : 'optional'
      line(`- \`${name}\` (${toolArgType(tool.inputSchema.properties[name]!)}, ${required}) — ${text.args[name]}`)
    }
    line()
  }
}

function toolArgType(arg: ToolArgSchema): string {
  switch (arg.type) {
    case 'string':
      return 'string'
    case 'integer':
      return `integer ≥ ${arg.minimum}`
    case 'array':
      return 'array of objects'
  }
}

function renderFields(line: Line, schema: JsonSchema, texts: Record<string, string>, what: string): void {
  const properties = schema.properties ?? {}
  assertSameKeys(`${what} fields`, Object.keys(properties), Object.keys(texts))
  for (const [name, prop] of Object.entries(properties)) {
    const required = schema.required?.includes(name) ? 'required' : 'optional'
    line(`- \`${name}\` (${fieldType(prop)}, ${required}) — ${texts[name]}`)
  }
}

/** 노드 · 문서 필드의 꼴. 자세한 모양은 설명 줄이 말하므로 겉 꼴만 낸다. */
function fieldType(prop: JsonSchema): string {
  if (prop.$ref !== undefined) return 'node'
  if (prop.type === 'array') return prop.items?.$ref !== undefined ? 'node[]' : 'array'
  return prop.type ?? 'value'
}

function renderInteractions(line: Line): void {
  const interaction = schemaOf(InteractionSchema)
  const triggers = interaction.properties?.on?.enum ?? []
  const actionTypes = (interaction.properties?.actions?.items?.oneOf ?? []).map((action) => String(action.properties?.type?.const))
  assertSameKeys('interaction actions', actionTypes, Object.keys(ACTIONS))
  line(
    `\`interactions\` is a list of \`{ on, actions }\`. \`on\` is one of ${triggers.map((t) => `\`${String(t)}\``).join(', ')}; \`actions\` run in order. Action \`type\`s:`,
  )
  line()
  for (const type of actionTypes) line(`- \`${type}\` ${ACTIONS[type]}`)
  line()
  line(`A \`${PAGE_TARGET_PREFIX}\` target names a page by its menu path, the same \`path\` the MCP tools take.`)
  line()
}

function renderCatalog(line: Line): void {
  assertSameKeys(
    'catalog',
    CATALOG_DEFS.map((def) => def.type),
    Object.keys(COMPONENT_SUMMARIES),
  )
  for (const group of COMPONENT_GROUPS) {
    line(`### ${GROUP_TITLES[group]}`)
    line()
    for (const def of CATALOG_DEFS.filter((d) => d.group === group)) renderComponent(line, def)
  }
}

/** 구역 하나의 글 — 이름 · 화면 이름 · 받는 타입 · 기본 내용(상호작용까지). */
function zoneText(zone: ComponentDef['zones'][number]): string {
  const where = zone.name === BODY_ZONE ? '`body` (children)' : `\`${zone.name}\` (zones.${zone.name})`
  const accepts = zone.accepts === undefined ? '' : `, accepts only ${zone.accepts.map((type) => `\`${type}\``).join(', ')}`
  const seeds = (zone.initial ?? []).map(
    (seed) =>
      `\`${seed.type}\`${seed.props === undefined ? '' : ` ${JSON.stringify(seed.props)}`}${seed.variant === undefined ? '' : ` variant ${JSON.stringify(seed.variant)}`}${seed.interactions === undefined ? '' : ` interactions ${JSON.stringify(seed.interactions)}`}`,
  )
  return `${where} "${zone.label}"${accepts}${seeds.length === 0 ? '' : `, create with ${seeds.join(' + ')}`}`
}

function renderComponent(line: Line, def: ComponentDef): void {
  line(`#### ${def.type}`)
  line()
  line(`${COMPONENT_SUMMARIES[def.type]} Editor label: ${def.label}.`)
  line()
  line(def.zones.length === 0 ? 'Zones: none.' : `Zones: ${def.zones.map(zoneText).join('; ')}.`)
  // 프리셋은 웹 팔레트의 장치다 — 템플릿을 그대로 싣는다(손 글로 옮겨 적으면 정의와 갈린다).
  for (const preset of def.presets ?? []) {
    line(
      `Editor preset \`${preset.key}\` "${preset.label}" (a palette card, not a type — write the same shape with \`patch_page\`, every node with its own id): ${JSON.stringify(preset.node)}.`,
    )
  }
  const places = placementsOf(def)
  if (places.length > 0) line(`Stands only in ${places.map((place) => `the \`${place.zone}\` zone of a \`${place.type}\``).join(' or ')}.`)
  const props = schemaOf(def.props, 'input')
  const entries = Object.entries(props.properties ?? {})
  if (entries.length === 0) {
    line()
    line('No props.')
  } else {
    line()
    for (const [name, prop] of entries) {
      const notes: string[] = []
      if (def.states.includes(name)) notes.push('state')
      if (def.variantFrom === name) notes.push('selects the theme variant')
      // «하나만 고른다» 는 `refine` 이라 JSON Schema 로 못 옮긴다 — 편집 칸의 고르는 수(`select`)에서 읽는다.
      if (def.editor.some((field) => field.prop === name && field.select === 'one')) notes.push('at most one option selected')
      // 트리 항목은 제 꼴을 되부르는 꼴이라 JSON Schema 가 `$ref` 로 내고, 수 · 깊이 한도는 `superRefine` 이라 못 옮긴다 — 편집 칸의 종류에서 읽는다.
      const tree = def.editor.some((field) => field.prop === name && field.control === 'treeItems')
      if (tree)
        notes.push(
          `at most ${TREE_ITEMS_MAX} items in all, ${TREE_DEPTH_MAX} levels deep; children of an item without \`open: true\` are not drawn`,
        )
      const note = notes.length > 0 ? ` — ${notes.join('; ')}` : ''
      const type = tree ? '{ label: string, open?: boolean, children?: (same item)[] }[]' : propType(prop)
      line(`- \`${name}\`: ${type}${propDefault(name, prop, props)}${note}`)
    }
  }
  line()
}

function propType(prop: JsonSchema): string {
  if (prop.anyOf !== undefined) return prop.anyOf.map(propType).join(' | ')
  if (prop.const !== undefined) return JSON.stringify(prop.const)
  if (prop.type === 'string' && prop.pattern !== undefined) return `string matching \`${prop.pattern}\``
  if (prop.enum !== undefined) return prop.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (prop.type === 'integer' || prop.type === 'number') return `${prop.type}${range(prop)}`
  if (prop.type === 'string') return `string${length(prop)}`
  if (prop.type === 'array') {
    const items = prop.items
    if (items?.type === 'object' && items.properties !== undefined) {
      const fields = Object.entries(items.properties).map(
        ([key, value]) => `${key}${items.required?.includes(key) === true ? '' : '?'}: ${propType(value)}`,
      )
      return `{ ${fields.join(', ')} }[]${count(prop)}`
    }
    return `${items === undefined ? 'value' : propType(items)}[]${count(prop)}`
  }
  return prop.type ?? 'value'
}

/** 배열의 길이 한도 — 없으면 빈 글. */
function count(prop: JsonSchema): string {
  const { minItems: min, maxItems: max } = prop
  if (min !== undefined && max !== undefined) return ` (${min}–${max} items)`
  if (min !== undefined) return ` (≥ ${min} items)`
  if (max !== undefined) return ` (≤ ${max} items)`
  return ''
}

/** 글의 길이 한도 — 넘는 글은 422 다(편집 칸도 같은 한도로 막는다). 없으면 빈 글. */
function length(prop: JsonSchema): string {
  const { minLength: min, maxLength: max } = prop
  if (min !== undefined && max !== undefined) return ` (${min}–${max} chars)`
  if (min !== undefined) return ` (≥ ${min} chars)`
  if (max !== undefined) return ` (≤ ${max} chars)`
  return ''
}

function range(prop: JsonSchema): string {
  const min = prop.minimum
  const max = prop.maximum !== undefined && prop.maximum < Number.MAX_SAFE_INTEGER ? prop.maximum : undefined
  if (min !== undefined && max !== undefined) return ` ${min}–${max}`
  if (min !== undefined) return ` ≥ ${min}`
  if (max !== undefined) return ` ≤ ${max}`
  return ''
}

function propDefault(name: string, prop: JsonSchema, owner: JsonSchema): string {
  if (prop.default !== undefined) return `, default ${JSON.stringify(prop.default)}`
  return owner.required?.includes(name) ? ', required' : ', optional (no default)'
}

/** `toJSONSchema` 가 내는 것 가운데 이 글이 읽는 만큼. */
interface JsonSchema {
  type?: string
  $ref?: string
  enum?: unknown[]
  const?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  pattern?: string
}

/**
 * zod 정의를 JSON Schema 로 읽는다. 카탈로그 props 는 `input` 쪽이어야 기본값이 붙은 prop 이 «optional» 로 읽힌다(`output` 이면
 * 기본값 때문에 전부 required 다). 노드 · 문서의 `refine`(별칭 · 상태 이름의 글자 규칙)은 JSON Schema 로 못 옮겨 `unrepresentable`
 * 을 `any` 로 둔다 — 그 규칙은 설명 줄이 말한다.
 */
function schemaOf(schema: unknown, io: 'input' | 'output' = 'output'): JsonSchema {
  return (schema as ZodToJsonSchema).toJSONSchema({ io, unrepresentable: 'any' }) as JsonSchema
}

/** zod 4 의 인스턴스 메서드 — 이 앱은 zod 를 직접 의존하지 않아 `z.toJSONSchema` 를 부를 수 없다(정의는 `@wirebound/schema` 가 낸 값이다). */
interface ZodToJsonSchema {
  toJSONSchema(params: { io: 'input' | 'output'; unrepresentable: 'any' }): unknown
}

function assertSameKeys(what: string, defined: readonly string[], described: readonly string[]): void {
  const missing = defined.filter((key) => !described.includes(key))
  const extra = described.filter((key) => !defined.includes(key))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `llms.txt: ${what} 의 영어 설명이 정의와 다르다 — 설명 없음: [${missing.join(', ')}] · 정의에 없음: [${extra.join(', ')}] (apps/web/config/llms-txt.ts)`,
    )
  }
}
