/**
 * 文档台账 · Host 半边。
 *
 * 一个工作区里的文档怎么组织，按优先级取两层：
 *   1. `<工作区>/.doc-ledger.json` —— 该工作区的 agent 写下的分类清单（最贴合业务）；
 *   2. 通用归纳 —— 按一级目录归纳文档类文件，保证任何工作区开箱有内容。
 *
 * 通过三条本地路由把树、打开、定位交给 Web UI，同时注册 agent 工具复用同一套方法。
 *
 * 只读用户文档：唯一会写的东西是工作区根目录下的 `.doc-ledger.json`（agent 分类清单），
 * 而且只在 agent 显式调用 `doc_ledger action=plan` 时写。
 */
import { spawn } from 'node:child_process'
import { readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const name = 'doc-ledger'
export const inject = ['webServer']

/** 与 client.js 共用的路由约定（浏览器用去掉前导斜杠的相对形式）。 */
const TREE_ROUTE = '/doc-ledger/tree'
const OPEN_ROUTE = '/doc-ledger/open'
const REVEAL_ROUTE = '/doc-ledger/reveal'

/** agent 分类清单的文件名，放在工作区根目录下。 */
const MANIFEST_NAME = '.doc-ledger.json'

/** 同一根目录的扫描结果在这个窗口内复用，避免连点刷新时重复扫描。 */
const SCAN_TTL_MS = 1500
/** 请求体上限：只接受极小的 JSON。 */
const MAX_BODY_BYTES = 16 * 1024
const TOOL_NAME = 'doc_ledger'

// ---------------------------------------------------------------- HTTP 工具

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function fail(res, status, message) {
  sendJson(res, status, { ok: false, message })
}

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      req.resume()
      throw requestError(413, '请求体过大')
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks, size).toString('utf8')
  if (text.trim() === '') return {}
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw requestError(400, '请求体不是合法 JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw requestError(400, '请求体必须是 JSON 对象')
  }
  return body
}

// ---------------------------------------------------------------- 文件系统

async function readDirSafe(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function fileInfo(abs) {
  try {
    const info = await stat(abs)
    return info.isFile() ? info : undefined
  } catch {
    return undefined
  }
}

function toRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/')
}

/**
 * 文件节点：`rel` 是工作区内相对路径（工具与文档契约用），`abs` 是宿主绝对路径
 * （页面调用 `remote.session.openWorkspacePath` 需要它）。
 */
function fileNode(root, file) {
  return { name: file.name, rel: toRel(root, file.abs), abs: file.abs, type: 'file', size: file.size, mtime: file.mtime }
}

function countFiles(node) {
  if (node.type === 'file') return 1
  let total = 0
  for (const child of node.children ?? []) total += countFiles(child)
  return total
}

// ---------------------------------------------------------------- 采集范围

/** 文档类扩展名：脚本、依赖、运行时、中间产物一律不进来。 */
const DOC_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.rtf',
  '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.csv', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
])

/** 目录/文件名层面直接跳过的垃圾：隐藏项、Office 锁文件、已知的中间目录。 */
const IGNORED_NAMES = new Set([
  'node_modules', '__pycache__', '_tools', '_archive', '_work', '_scratch', '_tmp', 'tmp', 'dist', 'build',
  '.next', '.cache', '.git', '.venv', '.obsidian', '.idea', '.vscode',
])

function isIgnored(name) {
  const lower = name.toLowerCase()
  return name.startsWith('.') || name.startsWith('~$') || IGNORED_NAMES.has(lower) || lower.startsWith('_preview')
}

/** 索引类文件不算产出（和台账的约定一致）。 */
function isIndexFile(name) {
  const lower = name.toLowerCase()
  return lower === 'readme.md' || lower === 'index.md'
}

/** 通用归纳的深度与数量上限：宁可少列，不要卡住页面。 */
const GENERIC_MAX_DEPTH = 3
const GENERIC_MAX_FILES = 400
/** agent 分类清单可以覆盖更深、更多的文件。 */
const MANIFEST_MAX_DEPTH = 6
const MANIFEST_MAX_FILES = 800

/**
 * 把根目录下的文档类文件全部走一遍（唯一的一处遍历实现）。
 * @returns `{ abs, name, size, mtime, rel }[]`，按 `rel` 排序
 */
async function collectDocuments(root, maxDepth = GENERIC_MAX_DEPTH, maxFiles = GENERIC_MAX_FILES) {
  const out = []
  let budget = maxFiles
  const walk = async (dir, depth) => {
    if (budget <= 0) return
    for (const entry of await readDirSafe(dir)) {
      if (budget <= 0) return
      if (entry.isDirectory()) {
        if (depth + 1 <= maxDepth && !isIgnored(entry.name)) await walk(path.join(dir, entry.name), depth + 1)
        continue
      }
      if (!entry.isFile() || isIgnored(entry.name) || isIndexFile(entry.name)) continue
      if (!DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      const abs = path.join(dir, entry.name)
      const info = await fileInfo(abs)
      if (info === undefined) continue
      budget -= 1
      out.push({ abs, name: entry.name, size: info.size, mtime: Math.floor(info.mtimeMs / 1000), rel: toRel(root, abs) })
    }
  }
  await walk(root, 0)
  out.sort((left, right) => left.rel.localeCompare(right.rel, 'zh'))
  return out
}

/** 通用归纳：按一级目录分组，子目录再分一层。 */
async function buildGeneric(root) {
  const docs = await collectDocuments(root)

  const groupOf = (prefix) => {
    const direct = []
    const bySubdir = new Map()
    const head = prefix === '' ? '' : `${prefix}/`
    for (const doc of docs) {
      if (!doc.rel.startsWith(head)) continue
      const rest = doc.rel.slice(head.length)
      const slash = rest.indexOf('/')
      if (slash < 0) {
        direct.push(doc)
        continue
      }
      const sub = rest.slice(0, slash)
      if (prefix !== '' && `${prefix}/${sub}`.split('/').length > GENERIC_MAX_DEPTH) continue
      const bucket = bySubdir.get(sub)
      if (bucket === undefined) bySubdir.set(sub, [doc])
      else bucket.push(doc)
    }
    return { direct, bySubdir }
  }

  const groups = []
  const top = groupOf('')
  if (top.direct.length > 0) {
    groups.push({
      name: '根目录',
      kind: 'group',
      desc: `${top.direct.length} 个文件`,
      type: 'dir',
      children: top.direct.map((doc) => fileNode(root, doc)),
    })
  }
  for (const dirName of [...top.bySubdir.keys()].sort((left, right) => left.localeCompare(right, 'zh'))) {
    const node = { name: dirName, kind: 'group', desc: '', type: 'dir', children: [] }
    const walkGroup = (prefix, parent) => {
      const { direct, bySubdir } = groupOf(prefix)
      parent.children.push(...direct.map((doc) => fileNode(root, doc)))
      for (const sub of [...bySubdir.keys()].sort((left, right) => left.localeCompare(right, 'zh'))) {
        const child = { name: sub, kind: 'group', desc: '', type: 'dir', children: [] }
        walkGroup(`${prefix}/${sub}`, child)
        child.desc = `${countFiles(child)} 个文件`
        parent.children.push(child)
      }
    }
    walkGroup(dirName, node)
    node.desc = `${countFiles(node)} 个文件`
    if (node.children.length > 0) groups.push(node)
  }

  if (groups.length === 0) return undefined
  return {
    name: '文档产出',
    desc: '通用归纳：按目录分组，只收文档类文件',
    kind: 'section',
    children: groups,
  }
}

// ---------------------------------------------------------------- agent 分类清单

/** 极简 glob：`*` 不跨目录、`**` 跨目录、`?` 单字符；大小写不敏感。 */
function globToRegExp(glob) {
  let out = ''
  for (let index = 0; index < glob.length; index += 1) {
    const ch = glob[index]
    if (ch === '*') {
      if (glob[index + 1] === '*') {
        index += 1
        if (glob[index + 1] === '/') {
          index += 1
          out += '(?:[^/]+/)*'
        } else out += '.*'
      } else out += '[^/]*'
      continue
    }
    if (ch === '?') {
      out += '[^/]'
      continue
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

function compileGlobs(list) {
  if (!Array.isArray(list)) return []
  return list.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => globToRegExp(item.trim().replace(/\\/g, '/')))
}

async function readManifest(root) {
  let text
  try {
    text = await readFile(path.join(root, MANIFEST_NAME), 'utf8')
  } catch {
    return undefined
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  return parsed
}

/** 用 agent 的分类清单建树；清单里一条都没命中就返回 undefined，交给通用归纳。 */
async function buildFromManifest(root, manifest) {
  const docs = await collectDocuments(root, MANIFEST_MAX_DEPTH, MANIFEST_MAX_FILES)
  if (docs.length === 0) return undefined
  const exclude = compileGlobs(manifest.exclude)
  const usable = docs.filter((doc) => !exclude.some((rule) => rule.test(doc.rel)))
  const used = new Set()
  const sections = []
  for (const raw of Array.isArray(manifest.sections) ? manifest.sections : []) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 60) : ''
    const rules = compileGlobs(raw?.match)
    if (name === '' || rules.length === 0) continue
    const children = []
    for (const doc of usable) {
      if (used.has(doc.rel)) continue
      if (!rules.some((rule) => rule.test(doc.rel))) continue
      used.add(doc.rel)
      children.push(fileNode(root, doc))
    }
    if (children.length === 0) continue
    sections.push({
      name,
      kind: 'section',
      desc: typeof raw?.desc === 'string' ? raw.desc.slice(0, 80) : '',
      children,
    })
  }
  if (sections.length === 0) return undefined
  let unmatched = 0
  if (manifest.includeUnmatched !== false) {
    const rest = usable.filter((doc) => !used.has(doc.rel) && doc.rel !== MANIFEST_NAME)
    unmatched = rest.length
    if (rest.length > 0) {
      sections.push({
        name: '未分类',
        kind: 'section',
        desc: '不在 agent 清单里的文档（清单更新后会归位）',
        children: rest.map((doc) => fileNode(root, doc)),
      })
    }
  }
  return { sections, unmatched }
}

/** 校验并写入分类清单；返回 `{ path, manifest }` 供调用方回显。 */
async function writeManifest(root, sections, extra = {}) {
  if (!Array.isArray(sections)) throw requestError(400, 'sections 必须是数组')
  if (sections.length > 40) throw requestError(400, 'sections 最多 40 个')
  let globs = 0
  const clean = []
  for (const raw of sections) {
    if (typeof raw !== 'object' || raw === null) throw requestError(400, 'sections 的元素必须是对象')
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
    if (name === '') throw requestError(400, '每个分类都要有非空 name')
    const match = Array.isArray(raw.match) ? raw.match.filter((item) => typeof item === 'string' && item.trim() !== '') : []
    if (match.length === 0) throw requestError(400, `分类「${name}」缺少 match（相对路径 glob）`)
    globs += match.length
    if (globs > 160) throw requestError(400, 'match 规则总数最多 160 条')
    clean.push({
      name,
      ...(typeof raw.desc === 'string' && raw.desc.trim() !== '' ? { desc: raw.desc.trim().slice(0, 80) } : {}),
      match: match.map((item) => item.trim().replace(/\\/g, '/')),
    })
  }
  const exclude = Array.isArray(extra.exclude)
    ? extra.exclude.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim().replace(/\\/g, '/'))
    : []
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    includeUnmatched: extra.includeUnmatched !== false,
    ...(exclude.length > 0 ? { exclude } : {}),
    sections: clean,
  }
  const file = path.join(root, MANIFEST_NAME)
  const temporary = `${file}.tmp`
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rename(temporary, file)
  return { path: file, manifest }
}

/**
 * 建树，优先级：agent 分类清单 → 通用归纳。
 * @returns `{ root, total, sections, mode, scannedAt }`；
 *   `mode` 为 `agent`（按清单）/ `generic`（通用归纳）/ `empty`。
 */
async function buildTree(root, options = {}) {
  const scannedAt = Math.floor(Date.now() / 1000)
  const manifest = await readManifest(root)
  if (manifest !== undefined) {
    const built = await buildFromManifest(root, manifest)
    if (built !== undefined) {
      let total = 0
      for (const section of built.sections) total += countFiles(section)
      return {
        root,
        total,
        sections: built.sections,
        mode: 'agent',
        scannedAt,
        manifestAt: manifest.generatedAt,
        unmatched: built.unmatched,
      }
    }
  }
  if (options.generic === false) {
    return { root, total: 0, sections: [], mode: 'empty', scannedAt }
  }
  const generic = await buildGeneric(root)
  if (generic === undefined) {
    return { root, total: 0, sections: [], mode: 'empty', scannedAt }
  }
  return { root, total: countFiles(generic), sections: [generic], mode: 'generic', scannedAt }
}

// ---------------------------------------------------------------- 路径与根目录

async function resolveDirectory(candidate) {
  let real
  try {
    real = await realpath(candidate)
  } catch {
    throw requestError(400, `目录不存在：${candidate}`)
  }
  let info
  try {
    info = await stat(real)
  } catch {
    throw requestError(400, `目录不可读：${candidate}`)
  }
  if (!info.isDirectory()) throw requestError(400, `不是目录：${candidate}`)
  return real
}

/** 目标必须解析在根目录之内（`rel` 越界、或经由符号链接越界，一律拒绝）。 */
function assertInside(root, abs) {
  const rel = path.relative(root, abs)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw requestError(403, '路径越界：目标不在工作区内')
  }
}

async function resolveLedgerFile(root, rel) {
  if (typeof rel !== 'string' || rel.trim() === '') throw requestError(400, '缺少文件路径')
  const abs = path.resolve(root, rel)
  assertInside(root, abs)
  let real
  try {
    real = await realpath(abs)
  } catch {
    throw requestError(404, `文件不存在：${rel}`)
  }
  assertInside(root, real)
  const info = await fileInfo(real)
  if (info === undefined) throw requestError(400, `不是可打开的文件：${rel}`)
  return real
}

// ---------------------------------------------------------------- 调用系统程序

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** PowerShell 走 -EncodedCommand，彻底绕开命令行引号转义。 */
function powerShell(script) {
  return [
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
  ]
}

function launcherFor(kind, abs) {
  if (process.platform === 'win32') {
    const script = kind === 'reveal'
      ? `$p = ${psQuote(abs)}; explorer.exe "/select,$p"`
      : `Start-Process -LiteralPath ${psQuote(abs)}`
    return powerShell(script)
  }
  if (process.platform === 'darwin') {
    return kind === 'reveal' ? ['open', ['-R', abs]] : ['open', [abs]]
  }
  return kind === 'reveal' ? ['xdg-open', [path.dirname(abs)]] : ['xdg-open', [abs]]
}

/**
 * 启动一个脱离本进程的短命令：早期失败（ENOENT / 非零退出）算失败，
 * 窗口内仍在运行也算成功（系统打开器可能比我们的等待更久）。
 */
function launch(kind, abs) {
  const [command, args] = launcherFor(kind, abs)
  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error === undefined) resolve()
      else reject(error)
    }
    let child
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    } catch (error) {
      finish(error)
      return
    }
    timer = setTimeout(() => {
      child.unref()
      finish()
    }, 4000)
    child.on('error', (error) => finish(error))
    child.on('exit', (code, signalName) => {
      if (code === 0) finish()
      else finish(new Error(`${command} 退出异常：code=${String(code)} signal=${String(signalName)}`))
    })
  })
}

// ---------------------------------------------------------------- 扫描缓存

const scanCache = new Map()

/**
 * 取一个根目录的树；`fresh` 为真时跳过缓存（页面切换工作区、点刷新都走这条路）。
 */
async function treeFor(root, options = {}, fresh = false) {
  if (fresh) scanCache.delete(root)
  const cached = scanCache.get(root)
  if (cached !== undefined && Date.now() - cached.at < SCAN_TTL_MS) return cached.value
  const value = await buildTree(root, options)
  scanCache.set(root, { at: Date.now(), value })
  return value
}

/**
 * 扫描一个工作区目录，返回树结构（`{ root, total, sections, mode, scannedAt }`）。
 * 路由与 agent 工具都走同一套采集；也可单独调用做自检。
 */
export async function scanLedger(root) {
  return buildTree(await resolveDirectory(String(root ?? '')))
}

// ---------------------------------------------------------------- agent 工具

/** 分类方式的说明，工具和页面共用同一套词。 */
function modeLabel(mode) {
  if (mode === 'agent') return '按 agent 分类清单'
  if (mode === 'generic') return '通用归纳'
  return '空'
}

function treeText(tree) {
  const lines = [`根目录：${tree.root}`, `分类方式：${modeLabel(tree.mode)}`, `合计：${tree.total} 个文件`]
  const push = (depth, text) => {
    if (lines.length < 600) lines.push(`${'  '.repeat(depth)}${text}`)
  }
  const walk = (node, depth) => {
    if (node.type === 'file') {
      push(depth, `- ${node.name}  [${node.rel}]`)
      return
    }
    push(depth, `▾ ${node.name}${node.desc ? `（${node.desc}）` : ''} · ${countFiles(node)} 个文件`)
    for (const child of node.children ?? []) walk(child, depth + 1)
  }
  for (const section of tree.sections) {
    push(0, '')
    walk(section, 0)
  }
  if (tree.sections.length === 0) lines.push('（这个工作区里没有识别到文档类文件）')
  return lines.join('\n')
}

/** 按关键词剪枝：命中的目录保留整棵子树（与页面搜索同一语义）。 */
function pruneNodes(nodes, needle, force) {
  const out = []
  for (const node of nodes) {
    const hit = force || `${node.name ?? ''} ${node.desc ?? ''}`.toLowerCase().includes(needle)
    if (node.type === 'file') {
      if (hit) out.push(node)
      continue
    }
    const children = pruneNodes(node.children ?? [], needle, hit)
    if (hit || children.length > 0) out.push({ ...node, children: hit ? node.children : children })
  }
  return out
}

function toolDefinition(resolveRoot, scanOptions = {}, resolveAgentRoot = async () => undefined) {
  return {
    name: TOOL_NAME,
    description:
      '文档台账：浏览工作区里的文档，并用系统默认程序打开或定位单个文件。'
      + '分类优先级：工作区里的 `.doc-ledger.json`（agent 分类清单）→ 按目录通用归纳。'
      + '当用户要求"给这个工作区做分类/哪些文件该看"时：先自己列出候选文件（tree 或 glob），'
      + '再用 action=plan 写入分类清单；之后页面就按你的分类展示，清单外的文档归入「未分类」。'
      + '写清单只改台账文件本身，不动任何用户文档。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['tree', 'open', 'reveal', 'plan'],
          description: 'tree=列出文档台账；open=用系统默认程序打开；reveal=在文件管理器中定位；plan=写入/删除本工作区的分类清单',
        },
        path: { type: 'string', description: 'open / reveal 必填：工作区内的相对路径（rel 字段）' },
        query: { type: 'string', description: 'tree 可选：按文件名或分类名过滤' },
        root: { type: 'string', description: '可选：工作区根目录的绝对路径，省略时用当前会话所在的工作区' },
        sections: {
          type: 'array',
          description: 'plan 必填：分类清单。每项 { name, desc?, match: string[] }，match 是相对根目录的 glob（* 不跨目录，** 跨目录，可写 `_review/*.md` 或 `**/*.docx`）。传空数组则删除清单、恢复自动分类。',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '分类名，如「技术方案」「审核意见」' },
              desc: { type: 'string', description: '可选：一句话说明' },
              match: { type: 'array', items: { type: 'string' }, description: '相对根目录的 glob 列表' },
            },
            required: ['name', 'match'],
            additionalProperties: false,
          },
        },
        exclude: { type: 'array', items: { type: 'string' }, description: 'plan 可选：这些 glob 命中的文件一律不展示' },
        includeUnmatched: { type: 'boolean', description: 'plan 可选：清单之外的文档是否归入「未分类」，默认 true（建议保持 true）' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      render(_args, value) {
        return [{ type: 'text', text: String(value?.text ?? '') }]
      },
    },
    async execute(args, exec) {
      const action = args?.action
      // 工具调用优先落到"当前会话所在的工作区"，这样该工作区的 agent 写清单不会写错地方。
      const agentRoot = args?.root === undefined ? await resolveAgentRoot(exec) : undefined
      const root = await resolveRoot(args?.root ?? agentRoot)
      if (action === 'tree') {
        const tree = await treeFor(root, scanOptions)
        const query = typeof args?.query === 'string' ? args.query.trim() : ''
        if (query === '') return { text: treeText(tree) }
        const sections = pruneNodes(tree.sections, query.toLowerCase(), false)
        const pruned = { ...tree, sections, total: sections.reduce((sum, section) => sum + countFiles(section), 0) }
        return { text: `匹配「${query}」：\n${treeText(pruned)}` }
      }
      if (action === 'plan') {
        const sections = args?.sections
        if (Array.isArray(sections) && sections.length === 0) {
          try {
            await unlink(path.join(root, MANIFEST_NAME))
          } catch {}
          scanCache.delete(root)
          const tree = await treeFor(root, scanOptions)
          return { text: `已删除分类清单，恢复自动分类（当前：${modeLabel(tree.mode)}，共 ${tree.total} 个文件）` }
        }
        const written = await writeManifest(root, sections, {
          exclude: args?.exclude,
          includeUnmatched: args?.includeUnmatched,
        })
        scanCache.delete(root)
        const tree = await treeFor(root, scanOptions)
        const lines = [
          `已写入分类清单：${written.path}`,
          `现在按清单展示 ${tree.total} 个文件：`,
          ...tree.sections.map((section) => `- ${section.name}：${countFiles(section)} 个`),
        ]
        return { text: lines.join('\n') }
      }
      if (action === 'open' || action === 'reveal') {
        const abs = await resolveLedgerFile(root, args?.path)
        await launch(action, abs)
        return { text: action === 'open' ? `已用系统默认程序打开：${args.path}` : `已在文件管理器中定位：${args.path}` }
      }
      throw new Error(`未知 action：${String(action)}（可用 tree / open / reveal / plan）`)
    },
  }
}

// ---------------------------------------------------------------- 插件入口

export function apply(ctx, config) {
  const configuredRoot = typeof config?.root === 'string' && config.root.trim() !== '' ? config.root : undefined
  /** `generic: false` 可关掉通用归纳，只认 agent 分类清单。 */
  const scanOptions = { generic: config?.generic !== false }

  /** 候选根目录：本机工作区（按显示顺序）→ 会话默认目录 → 进程目录。 */
  const candidateRoots = () => {
    const candidates = []
    const registry = ctx.get('workspaceRegistry')
    if (registry !== undefined && typeof registry.list === 'function') {
      try {
        for (const workspace of registry.list()) {
          if (typeof workspace?.path === 'string' && workspace.path !== '') candidates.push(workspace.path)
        }
      } catch {}
    }
    const workingDirectory = ctx.get('workingDirectory')
    if (typeof workingDirectory?.defaultDirectory === 'string' && workingDirectory.defaultDirectory !== '') {
      candidates.push(workingDirectory.defaultDirectory)
    }
    candidates.push(process.cwd())
    return candidates
  }

  /** 自动探测：优先挑已经写了分类清单的工作区，其次第一个可用目录。 */
  const detectRoot = async () => {
    let firstExisting
    for (const candidate of candidateRoots()) {
      let resolved
      try {
        resolved = await resolveDirectory(candidate)
      } catch {
        continue
      }
      if (firstExisting === undefined) firstExisting = resolved
      try {
        await stat(path.join(resolved, MANIFEST_NAME))
        return resolved
      } catch {}
    }
    return firstExisting ?? resolveDirectory(process.cwd())
  }

  /** 已注册的工作区，供页面上的工作区下拉使用。 */
  const workspaceChoices = async () => {
    const registry = ctx.get('workspaceRegistry')
    if (registry === undefined || typeof registry.list !== 'function') return []
    let rows
    try {
      rows = registry.list()
    } catch {
      return []
    }
    const out = []
    for (const row of rows ?? []) {
      const dir = typeof row?.path === 'string' ? row.path : ''
      if (dir === '') continue
      out.push({ title: typeof row?.title === 'string' && row.title !== '' ? row.title : dir, path: dir })
    }
    return out
  }

  /** 根目录解析顺序：请求显式指定 → 插件配置 → 自动探测。 */
  const resolveRoot = async (requested) => {
    if (typeof requested === 'string' && requested.trim() !== '') return resolveDirectory(requested)
    if (configuredRoot !== undefined) {
      try {
        return await resolveDirectory(configuredRoot)
      } catch {}
    }
    return detectRoot()
  }

  /** 与组合里的 connection 服务共用同一道信任闸门（Host/Origin 校验 + 浏览器登录凭据）。 */
  const rejected = (req, res) => {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') return false
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  const handle = (body) => async (req, res) => {
    if (rejected(req, res)) return
    try {
      await body(req, res)
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 500
      fail(res, status, error instanceof Error ? error.message : String(error))
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: TREE_ROUTE,
        handler: handle(async (req, res) => {
          if (req.method !== 'GET') return sendMethodNotAllowed(res, 'GET')
          const query = new URL(String(req.url), 'http://localhost').searchParams
          const root = await resolveRoot(query.get('root'))
          const tree = await treeFor(root, scanOptions, query.get('fresh') === '1')
          sendJson(res, 200, { ok: true, ...tree, workspaces: await workspaceChoices() })
        }),
      }),
    `doc-ledger: GET ${TREE_ROUTE}`,
  )

  for (const [kind, route] of [['open', OPEN_ROUTE], ['reveal', REVEAL_ROUTE]]) {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'exact',
          path: route,
          handler: handle(async (req, res) => {
            if (req.method !== 'POST') return sendMethodNotAllowed(res, 'POST')
            const body = await readJsonBody(req)
            const root = await resolveRoot(body.root)
            const abs = await resolveLedgerFile(root, body.path)
            await launch(kind, abs)
            sendJson(res, 200, { ok: true, path: abs })
          }),
        }),
      `doc-ledger: POST ${route}`,
    )
  }

  /** 当前会话（调用工具的那个 agent）所在的工作目录；解析不到就返回 undefined。 */
  const resolveAgentRoot = async (exec) => {
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory === undefined || typeof workingDirectory.ensure !== 'function') return undefined
    if (exec === undefined || exec.agent === undefined) return undefined
    try {
      const dir = await workingDirectory.ensure(exec.agent, exec.signal)
      return typeof dir === 'string' && dir !== '' ? dir : undefined
    } catch {
      return undefined
    }
  }

  const tools = ctx.get('tools')
  if (tools !== undefined && typeof tools.register === 'function') {
    ctx.effect(() => tools.register(toolDefinition(resolveRoot, scanOptions, resolveAgentRoot)), 'doc-ledger: agent tool')
  }
}
