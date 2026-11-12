window.__ModuleLoader__.load({
  id: 'dsh-workbench-ledger',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /** 字典命名空间（面板名与所有界面文案都走它）。 */
    const NS = 'doc-ledger'
    /** 侧栏面板 id 与 main 面板 key 必须是同一个值。 */
    const PANEL_ID = 'doc-ledger'

    /** 与 Host 半边 `index.js` 的路由常量一一对应；浏览器用去掉前导斜杠的相对形式。 */
    const TREE_ROUTE = '/doc-ledger/tree'.slice(1)
    const OPEN_ROUTE = '/doc-ledger/open'.slice(1)
    const REVEAL_ROUTE = '/doc-ledger/reveal'.slice(1)
    /** 浏览器记住"上次选的根目录"；空值表示用插件配置的默认根目录。 */
    const STORAGE_KEY = 'dsh.doc-ledger.root'

    // ------------------------------------------------------------ 文案

    const zh = {
      'panel': '文档台账',
      'title': '文档台账',
      'searchPlaceholder': '搜索文件名或分类名',
      'searchLabel': '搜索文档',
      'refresh': '刷新',
      'expandAll': '全部展开',
      'collapseAll': '全部收起',
      'changeRoot': '更换目录',
      'resetRoot': '恢复默认目录',
      'workspace': '工作区',
      'rootAuto': '自动（写了清单的工作区）',
      'noLedger': '未识别到台账',
      'genericTag': '通用归纳',
      'genericHint': '这个工作区还没有分类清单，已按目录归纳文档类文件；可以让该工作区的 agent 做一份',
      'agentTag': 'Agent 分类',
      'agentHint': '这个工作区由它的 agent 写了分类清单（.doc-ledger.json）',
      'updateClass': '更新分类',
      'updateRequested': '已请该工作区的 agent 更新分类，完成后点「刷新」',
      'updateFailed': '无法触发更新',
      'noSession': '这个工作区还没有会话：先在左侧打开一个会话，再回来点更新',
      'promptUnavailable': '当前环境无法向会话发送指令',
      'close': '关闭',
      'reveal': '打开位置',
      'loading': '正在扫描文档…',
      'loadFailed': '无法读取台账',
      'retry': '重试',
      'emptyTitle': '这个工作区里没有识别到文档类文件',
      'emptyHint': '只收 md / txt / docx / pptx / xlsx / csv / pdf / 图片，并跳过 .git、_tools、_work 一类目录。换一个目录试试，或让该工作区的 agent 建一份分类清单。',
      'noMatch': '没有匹配的文件',
      'noMatchHint': '清空搜索框可以看到全部文档。',
      'openFailed': '打开失败，请重试',
      'revealFailed': '无法定位文件，请重试',
      'pickFailed': '无法选择目录',
      'pickUnavailable': '当前环境不支持目录选择',
      'filesUnit': '个文件',
      'footerHint': '点文件名直接打开，右侧按钮定位所在文件夹',
      'total': '共 {total} 个文件',
      'root': '根目录',
      'scanned': '扫描于 {time}',
      'readOnly': '只读',
    }

    const en = {
      'panel': 'Document Ledger',
      'title': 'Document Ledger',
      'searchPlaceholder': 'Search file or category name',
      'searchLabel': 'Search documents',
      'refresh': 'Refresh',
      'expandAll': 'Expand all',
      'collapseAll': 'Collapse all',
      'changeRoot': 'Change folder',
      'resetRoot': 'Use default folder',
      'workspace': 'Workspace',
      'rootAuto': 'Automatic (workspace with a classification)',
      'noLedger': 'no classification found',
      'genericTag': 'Auto-grouped',
      'genericHint': 'This workspace has no classification file yet; documents are grouped by folder. Its agent can write one',
      'agentTag': 'Agent-classified',
      'agentHint': 'This workspace\'s agent wrote the classification file (.doc-ledger.json)',
      'updateClass': 'Update',
      'updateRequested': 'Asked the workspace agent to update the classification; refresh when it is done',
      'updateFailed': 'Could not request an update',
      'noSession': 'This workspace has no session yet: open one first, then retry',
      'promptUnavailable': 'Sending instructions to a session is unavailable here',
      'close': 'Close',
      'reveal': 'Show in folder',
      'loading': 'Scanning documents…',
      'loadFailed': 'Could not read the ledger',
      'retry': 'Retry',
      'emptyTitle': 'No documents recognized in this workspace',
      'emptyHint': 'Only md / txt / docx / pptx / xlsx / csv / pdf and images are collected, skipping .git, _tools, _work and similar folders. Try another folder, or have the workspace agent write a classification file.',
      'noMatch': 'No matching files',
      'noMatchHint': 'Clear the search box to see every document.',
      'openFailed': 'Could not open the file. Try again.',
      'revealFailed': 'Could not show the file location. Try again.',
      'pickFailed': 'Could not pick a folder',
      'pickUnavailable': 'Folder picking is unavailable here',
      'filesUnit': 'files',
      'footerHint': 'Click a file name to open it; the button on the right shows its folder.',
      'total': '{total} files',
      'root': 'Root',
      'scanned': 'Scanned {time}',
      'readOnly': 'Read-only',
    }

    // ------------------------------------------------------------ 样式

    const css = `
.ol-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,"Microsoft YaHei","PingFang SC",system-ui,sans-serif);font-size:13.5px;line-height:1.45}
.ol-header{flex:none;display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:10px 16px;background:linear-gradient(120deg,#0b2a5b,#1e6fe0);color:#fff}
.ol-brand{display:flex;flex-direction:column;gap:2px;min-width:0;margin-right:auto}
.ol-title{display:flex;align-items:baseline;gap:8px;font-size:18px;font-weight:600;line-height:1.2;letter-spacing:.5px}
.ol-tag{font-size:10.5px;font-weight:400;opacity:.7;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:0 6px}
.ol-rootpath{font-size:11px;opacity:.75;max-width:48vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:ltr}
.ol-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ol-search{display:flex;align-items:center}
.ol-search input{width:210px;box-sizing:border-box;border:1px solid rgba(255,255,255,.32);background:rgba(255,255,255,.14);color:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;outline:none}
.ol-search input::placeholder{color:rgba(255,255,255,.72)}
.ol-search input:focus{border-color:rgba(255,255,255,.75);background:rgba(255,255,255,.2)}
.ol-btn{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.ol-btn:hover{background:rgba(255,255,255,.2)}
.ol-btn[disabled]{opacity:.5;cursor:default}
.ol-ws{max-width:190px;box-sizing:border-box;border:1px solid rgba(255,255,255,.32);background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:5px 8px;font:inherit;font-size:12px;outline:none;cursor:pointer}
.ol-ws:focus{border-color:rgba(255,255,255,.75)}
.ol-ws option{color:#0f1f38;background:#fff}
.ol-body{flex:1;min-height:0;overflow:auto;padding:14px 16px 6px;background-image:radial-gradient(900px 320px at 50% -20%,rgba(30,111,224,.10),transparent)}
.ol-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;box-shadow:0 1px 3px rgba(15,31,56,.06);overflow:hidden;margin-bottom:14px}
.ol-bar{height:4px}
.ol-blue{background:#1e6fe0}
.ol-orange{background:#e8760c}
.ol-cardhead{display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;user-select:none}
.ol-cardhead:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(30,111,224,.08))}
.ol-cardtitle{font-size:15px;font-weight:600}
.ol-carddesc{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.ol-cardcount{margin-left:auto;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ol-cardbody{padding:6px 10px 10px}
.ol-row{display:flex;align-items:center;gap:8px;min-height:28px;padding:2px 8px;border-radius:8px;cursor:pointer}
.ol-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(30,111,224,.08))}
.ol-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ol-caret{flex:none;width:12px;display:inline-flex;justify-content:center;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}
.ol-caret[data-open="true"]{transform:rotate(90deg)}
.ol-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ol-row:hover .ol-name{color:var(--dsw-alias-brand-primary)}
.ol-course .ol-name{font-weight:600}
.ol-group .ol-name{font-weight:500}
.ol-desc{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}
.ol-badge{margin-left:auto;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:1px 7px;font-variant-numeric:tabular-nums}
.ol-children{margin-left:12px;padding-left:12px;border-left:1px dashed var(--dsw-alias-border-l2)}
.ol-glyph{flex:none;width:22px;height:16px;border-radius:3px;color:#fff;font-size:8.5px;font-weight:700;letter-spacing:.2px;display:inline-flex;align-items:center;justify-content:center}
.ol-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ol-reveal{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11.5px;padding:2px 6px;border-radius:6px;cursor:pointer;opacity:0;transition:opacity .12s ease}
.ol-row:hover .ol-reveal,.ol-row:focus-within .ol-reveal{opacity:1}
.ol-reveal:hover{background:var(--dsw-alias-bg-layer-2)}
.ol-reveal[data-busy="true"]{opacity:1;cursor:default}
.ol-footer{flex:none;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:8px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.ol-footer b{color:var(--dsw-alias-label-primary);font-weight:600}
.ol-spacer{margin-left:auto}
.ol-state{display:flex;flex-direction:column;align-items:center;gap:10px;padding:44px 16px;color:var(--dsw-alias-label-secondary);text-align:center}
.ol-state-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ol-hint{max-width:560px;font-size:12px;line-height:1.75}
.ol-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary);word-break:break-all}
.ol-notice{position:absolute;left:50%;bottom:46px;transform:translateX(-50%);max-width:72%;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px;font-size:12px;box-shadow:0 6px 20px rgba(15,31,56,.18);z-index:3}
.ol-notice-detail{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.ol-body::-webkit-scrollbar{width:10px}
.ol-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:999px;border:3px solid transparent;background-clip:content-box}
.ol-foot{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:none;color:inherit;font:inherit;font-size:14px;line-height:20px;cursor:pointer;white-space:nowrap;transition:background-color .12s ease}
.ol-foot:hover{background:rgba(127,127,127,.14)}
.ol-foot:active{transform:scale(.96)}
.ol-foot-name{overflow:hidden;text-overflow:ellipsis}
`

    // ------------------------------------------------------------ 小工具

    const EXT_GLYPH = {
      pptx: ['PPT', '#d35230'],
      potx: ['PPT', '#d35230'],
      docx: ['DOC', '#2b579a'],
      doc: ['DOC', '#2b579a'],
      xlsx: ['XLS', '#217346'],
      xls: ['XLS', '#217346'],
      png: ['PNG', '#7a5af8'],
      jpg: ['JPG', '#7a5af8'],
      jpeg: ['JPG', '#7a5af8'],
      webp: ['WEB', '#7a5af8'],
      md: ['MD', '#5a6b85'],
      pdf: ['PDF', '#c4302b'],
    }

    function glyphOf(fileName) {
      const dot = fileName.lastIndexOf('.')
      const extension = dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
      return EXT_GLYPH[extension] ?? ['FILE', '#61708a']
    }

    /**
     * 取宿主的 `remote.session` 命名空间。只走不抛错的 `ctx.get`：`ctx.remote` 是 Cordis 的
     * 注入访问器，未声明 inject 时读属性会抛 `cannot get property "remote.session" without inject`。
     */
    function sessionRemote(ctx) {
      try {
        const direct = ctx.get('remote.session')
        if (direct !== undefined && direct !== null) return direct
      } catch {}
      try {
        const remote = ctx.get('remote')
        if (remote !== undefined && remote !== null) return remote.session
      } catch {}
      try {
        return ctx.remote?.session
      } catch {
        return undefined
      }
    }

    /** 台账相对路径 → Host 绝对路径（按根目录的分隔符换）。 */
    function resolveAbsolute(root, rel) {
      const base = typeof root === 'string' ? root.replace(/[\\/]+$/, '') : ''
      const tail = typeof rel === 'string' ? rel : ''
      if (base === '') return tail
      const separator = base.includes('\\') ? '\\' : '/'
      return `${base}${separator}${tail.split('/').join(separator)}`
    }

    /** 两个目录是否同一个（忽略大小写与末尾分隔符）。 */
    function samePath(left, right) {
      const normalize = (value) => (typeof value === 'string' ? value.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase() : '')
      return normalize(left) !== '' && normalize(left) === normalize(right)
    }

    function formatSize(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    function pad(value) {
      return String(value).padStart(2, '0')
    }

    function formatDate(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
      const date = new Date(seconds * 1000)
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function formatTime(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
      const date = new Date(seconds * 1000)
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function readStoredRoot() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) ?? ''
      } catch {
        return ''
      }
    }

    function writeStoredRoot(value) {
      try {
        if (value === '') window.localStorage.removeItem(STORAGE_KEY)
        else window.localStorage.setItem(STORAGE_KEY, value)
      } catch {}
    }

    /**
     * 把服务端树投影成渲染树：分配稳定 id、按搜索词剪枝。
     * 搜索词为空时保留全部节点（是否展开由 overrides 决定）；命中目录时保留整棵子树。
     */
    function project(nodes, query, prefix, force) {
      const out = []
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        const id = `${prefix}.${index}`
        const haystack = `${node.name ?? ''} ${node.desc ?? ''}`.toLowerCase()
        const hit = query === '' || force || haystack.includes(query)
        if (node.type === 'file') {
          if (hit) out.push({ node, id, children: [] })
          continue
        }
        const children = project(node.children ?? [], query, id, hit)
        if (hit || children.length > 0) out.push({ node, id, children })
      }
      return out
    }

    function countEntries(entry) {
      if (entry.node.type === 'file') return 1
      let total = 0
      for (const child of entry.children) total += countEntries(child)
      return total
    }

    /** 一次展开/收起全部目录：按 project() 的同一套 id 方案生成 overrides。 */
    function collectDirIds(nodes, prefix, value) {
      const next = {}
      const walk = (list, base) => {
        list.forEach((node, index) => {
          const id = `${base}.${index}`
          if (node.type !== 'dir') return
          next[id] = value
          walk(node.children ?? [], id)
        })
      }
      walk(nodes, prefix)
      return next
    }

    // ------------------------------------------------------------ 组件

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'doc-ledger: dictionaries')
      /** 面板与侧栏按钮共用一张表：按钮挂在面板之外，样式必须随插件生效而不是随面板挂载。 */
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const tagId = 'dsh-workbench-ledger/panel.css'
        if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return () => {}
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-workbench-ledger'
        tag.dataset.pluginCss = tagId
        tag.textContent = css
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'doc-ledger: styles')
      const t = ctx.locale.bind(NS)

      const Caret = (props) => h('span', {
        className: 'ol-caret',
        'data-open': props.open ? 'true' : 'false',
        'aria-hidden': 'true',
      }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none' },
        h('path', { d: 'M3 1.5 7 5l-4 3.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })))

      const FolderGlyph = () => h('svg', {
        width: 12,
        height: 12,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
        h('path', {
          d: 'M1.5 4.2c0-.6.5-1.1 1.1-1.1h2.6l1.2 1.4h6c.6 0 1.1.5 1.1 1.1v6.1c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M5 8.2h6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))

      function LedgerPanel(props) {
        const [root, setRoot] = useState(() => readStoredRoot())
        const [state, setState] = useState({ status: 'loading', message: '', data: null })
        const [query, setQuery] = useState('')
        const [overrides, setOverrides] = useState({})
        const [notice, setNotice] = useState(null)
        const [pending, setPending] = useState(null)
        const requestSeq = useRef(0)
        /** 下一次加载是否跳过宿主缓存：切换工作区、点刷新、选新目录时置位。 */
        const freshOnce = useRef(false)
        /** 会话列表来自槽位的标准 prop；没有就不提供"让 agent 更新"这一步。 */
        const useSessions = typeof props?.useSessions === 'function' ? props.useSessions : undefined
        const sessionState = useSessions === undefined ? null : useSessions((value) => value)

        const load = useCallback(async (target) => {
          const nextRoot = target === undefined ? root : target
          const fresh = freshOnce.current
          freshOnce.current = false
          const seq = requestSeq.current + 1
          requestSeq.current = seq
          setState((previous) => ({ ...previous, status: 'loading', message: '' }))
          try {
            const params = []
            if (nextRoot !== '') params.push(`root=${encodeURIComponent(nextRoot)}`)
            if (fresh) params.push('fresh=1')
            const url = params.length === 0 ? TREE_ROUTE : `${TREE_ROUTE}?${params.join('&')}`
            const response = await fetch(url, { headers: { accept: 'application/json' } })
            const payload = await response.json().catch(() => null)
            if (!response.ok || payload?.ok !== true) {
              throw new Error(payload?.message ?? `HTTP ${String(response.status)}`)
            }
            if (requestSeq.current !== seq) return
            setState({ status: 'ready', message: '', data: payload })
          } catch (error) {
            if (requestSeq.current !== seq) return
            setState({ status: 'error', message: String(error?.message ?? error), data: null })
          }
        }, [root])

        useEffect(() => {
          load()
        }, [load])

        useEffect(() => {
          if (notice === null) return undefined
          const timer = setTimeout(() => setNotice(null), 5000)
          return () => clearTimeout(timer)
        }, [notice])

        /**
         * 打开 / 定位一个文件。优先走宿主自己的 `remote.session.openWorkspacePath`
         * （与会话里「打开」「显示文件位置」同一个原生打开器），不可用时退回本插件的本地接口。
         * @param {'open' | 'reveal'} kind 用默认程序打开，或在文件管理器中选中
         * @param node 台账文件节点（`abs` 由 Host 提供）
         */
        const act = useCallback(async (kind, node) => {
          const rel = node.rel
          setPending(rel)
          try {
            const absolute = typeof node.abs === 'string' && node.abs !== '' ? node.abs : resolveAbsolute(state.data?.root ?? root, rel)
            const session = sessionRemote(ctx)
            let remoteError = null
            if (session !== undefined && typeof session.openWorkspacePath === 'function') {
              const request = kind === 'reveal' ? { path: absolute, action: 'reveal' } : { path: absolute }
              try {
                const result = await session.openWorkspacePath(request)
                if (result === undefined || result.ok !== true) {
                  const failure = result?.error
                  remoteError = failure === undefined ? 'openWorkspacePath 失败' : `${String(failure.code ?? '')} ${String(failure.message ?? '')}`.trim()
                } else {
                  return
                }
              } catch (error) {
                remoteError = String(error?.message ?? error)
              }
            }
            const response = await fetch(kind === 'open' ? OPEN_ROUTE : REVEAL_ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ root: state.data?.root ?? root, path: rel }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok || payload?.ok !== true) {
              const localError = payload?.message ?? `HTTP ${String(response.status)}`
              throw new Error(remoteError === null ? localError : `${remoteError}；本地接口：${localError}`)
            }
          } catch (error) {
            setNotice({
              text: t(kind === 'open' ? 'openFailed' : 'revealFailed'),
              detail: String(error?.message ?? error),
            })
          } finally {
            setPending(null)
          }
        }, [root, state.data, t])

        const chooseRoot = useCallback(async () => {
          const uiWorkspace = ctx.get('uiWorkspace')
          if (uiWorkspace === undefined || typeof uiWorkspace.pickDirectory !== 'function') {
            setNotice({ text: t('pickUnavailable') })
            return
          }
          try {
            const picked = await uiWorkspace.pickDirectory()
            if (typeof picked !== 'string' || picked === '') return
            writeStoredRoot(picked)
            freshOnce.current = true
            setRoot(picked)
            setOverrides({})
          } catch (error) {
            setNotice({ text: t('pickFailed'), detail: String(error?.message ?? error) })
          }
        }, [t])

        const resetRoot = useCallback(() => {
          writeStoredRoot('')
          freshOnce.current = true
          setRoot('')
          setOverrides({})
        }, [])

        /** 工作区下拉：`__default__` 回到自动探测，`__custom__` 打开目录选择器，其余直接当根目录。 */
        const changeWorkspace = useCallback((value) => {
          if (value === '__default__') {
            resetRoot()
            return
          }
          if (value === '__custom__') {
            chooseRoot()
            return
          }
          writeStoredRoot(value)
          // 切换工作区后按新目录重新扫一次，不复用宿主缓存。
          freshOnce.current = true
          setRoot(value)
          setOverrides({})
        }, [chooseRoot, resetRoot])

        /** 刷新：跳过缓存重新扫描。 */
        const refresh = useCallback(() => {
          freshOnce.current = true
          load()
        }, [load])

        /** 找这个工作区里最近活跃的会话，用来承接"更新分类"的指令。 */
        const pickSession = useCallback(() => {
          if (sessionState === null) return undefined
          const rows = Object.values(sessionState.byId ?? {})
          const targetRoot = state.data?.root ?? root
          const matched = rows
            .filter((row) => row !== null && row !== undefined && typeof row.cwd === 'string' && samePath(row.cwd, targetRoot))
            .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0]
          if (matched === undefined) return undefined
          const id = matched.id ?? matched.sessionId
          return typeof id === 'string' ? { id, row: matched } : undefined
        }, [sessionState, state.data, root])

        /** 让该工作区的 agent 重写分类清单（清单外的文档已经在「未分类」里等着归位）。 */
        const updateClassification = useCallback(async () => {
          const target = pickSession()
          if (target === undefined) {
            setNotice({ text: t('noSession') })
            return
          }
          const session = sessionRemote(ctx)
          if (session === undefined || typeof session.prompt !== 'function') {
            setNotice({ text: t('promptUnavailable') })
            return
          }
          const unmatched = state.data?.unmatched ?? 0
          const instruction = `【文档台账】本工作区的分类清单需要更新：当前有 ${unmatched} 个文档未归类。`
            + '请先用 doc_ledger action=tree 看现有分层与「未分类」清单，'
            + '再用 doc_ledger action=plan 重写根目录下的 .doc-ledger.json（沿用现有分类口径，只做必要调整），完成后回一句结论。'
          try {
            const result = await session.prompt({
              requestId: `doc-ledger-${Date.now()}`,
              sessionId: target.id,
              mode: 'queue',
              content: [{ type: 'text', text: instruction }],
            })
            if (result !== undefined && result.ok !== true) {
              const failure = result.error
              throw new Error(failure === undefined ? 'prompt 失败' : `${String(failure.code ?? '')} ${String(failure.message ?? '')}`.trim())
            }
            setNotice({ text: t('updateRequested') })
          } catch (error) {
            setNotice({ text: t('updateFailed'), detail: String(error?.message ?? error) })
          }
        }, [pickSession, state.data, t])

        const close = useCallback(() => {
          try {
            ctx.layout.selectPanel(null)
          } catch {}
        }, [])

        const trimmed = query.trim().toLowerCase()
        const entries = useMemo(
          () => (state.data === null ? [] : project(state.data.sections ?? [], trimmed, 's', false)),
          [state.data, trimmed],
        )

        const defaultOpen = (node) => node.kind === 'section' || node.kind === 'course'

        const isOpen = useCallback((entry) => {
          if (trimmed !== '') return true
          const decided = overrides[entry.id]
          if (decided !== undefined) return decided
          return defaultOpen(entry.node)
        }, [overrides, trimmed])

        const toggle = useCallback((entry) => {
          setOverrides((previous) => ({
            ...previous,
            [entry.id]: !(previous[entry.id] ?? defaultOpen(entry.node)),
          }))
        }, [])

        const expandAll = useCallback(() => {
          setOverrides(collectDirIds(state.data?.sections ?? [], 's', true))
        }, [state.data])

        const collapseAll = useCallback(() => {
          setOverrides(collectDirIds(state.data?.sections ?? [], 's', false))
        }, [state.data])

        const rowKeyDown = (handler) => (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handler()
          }
        }

        function renderFile(node, depth) {
          const glyph = glyphOf(node.name)
          const busy = pending === node.rel
          return h('div', {
            key: node.rel,
            className: 'ol-row ol-file',
            role: 'button',
            tabIndex: 0,
            title: node.rel,
            style: { paddingLeft: 8 + depth * 14 },
            onClick: () => act('open', node),
            onKeyDown: rowKeyDown(() => act('open', node)),
          },
            h('span', { className: 'ol-caret', 'aria-hidden': 'true' }),
            h('span', { className: 'ol-glyph', style: { background: glyph[1] } }, glyph[0]),
            h('span', { className: 'ol-name' }, node.name),
            h('span', { className: 'ol-meta' }, formatSize(node.size)),
            h('span', { className: 'ol-meta' }, formatDate(node.mtime)),
            h('button', {
              type: 'button',
              className: 'ol-reveal',
              'data-busy': busy ? 'true' : 'false',
              title: t('reveal'),
              'aria-label': t('reveal'),
              disabled: busy,
              onClick: (event) => {
                event.stopPropagation()
                act('reveal', node)
              },
            }, h(FolderGlyph, null), t('reveal')),
          )
        }

        function renderDir(entry, depth) {
          const node = entry.node
          const open = isOpen(entry)
          const kindClass = node.kind === 'course' ? 'ol-course' : 'ol-group'
          return h('div', { key: entry.id, className: 'ol-node' },
            h('div', {
              className: `ol-row ol-dir ${kindClass}`,
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              title: node.desc === undefined || node.desc === '' ? node.name : `${node.name} · ${node.desc}`,
              style: { paddingLeft: 8 + depth * 14 },
              onClick: () => toggle(entry),
              onKeyDown: rowKeyDown(() => toggle(entry)),
            },
              h(Caret, { open }),
              h('span', { className: 'ol-name' }, node.name),
              node.desc === undefined || node.desc === '' ? null : h('span', { className: 'ol-desc' }, node.desc),
              h('span', { className: 'ol-badge' }, countEntries(entry)),
            ),
            open
              ? h('div', { className: 'ol-children' }, entry.children.map((child) => renderEntry(child, depth + 1)))
              : null,
          )
        }

        /** 顶层区卡片：按区序号决定顶条颜色（蓝 / 橙）。 */
        function renderSection(entry, accentIndex) {
          const node = entry.node
          const open = isOpen(entry)
          return h('section', { key: entry.id, className: 'ol-card' },
            h('div', { className: `ol-bar ${accentIndex === 0 ? 'ol-blue' : 'ol-orange'}` }),
            h('div', {
              className: 'ol-cardhead',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              onClick: () => toggle(entry),
              onKeyDown: rowKeyDown(() => toggle(entry)),
            },
              h(Caret, { open }),
              h('span', { className: 'ol-cardtitle' }, node.name),
              node.desc === undefined || node.desc === '' ? null : h('span', { className: 'ol-carddesc' }, node.desc),
              h('span', { className: 'ol-cardcount' }, `${countEntries(entry)} ${t('filesUnit')}`),
            ),
            open
              ? h('div', { className: 'ol-cardbody' }, entry.children.map((child) => renderEntry(child, 0)))
              : null,
          )
        }

        function renderEntry(entry, depth) {
          if (entry.node.kind === 'section') return renderSection(entry, depth)
          if (entry.node.type === 'file') return renderFile(entry.node, depth)
          return renderDir(entry, depth)
        }

        const total = state.data?.total ?? 0
        const shown = entries.reduce((sum, entry) => sum + countEntries(entry), 0)
        const scannedAt = state.data?.scannedAt
        const activeRoot = state.data?.root ?? root
        const mutedButton = {
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'transparent',
          color: 'var(--dsw-alias-label-primary)',
        }

        let body
        if (state.status === 'loading' && state.data === null) {
          body = h('div', { className: 'ol-state' }, h('div', { className: 'ol-state-title' }, t('loading')))
        } else if (state.status === 'error') {
          body = h('div', { className: 'ol-state' },
            h('div', { className: 'ol-state-title' }, t('loadFailed')),
            h('div', { className: 'ol-hint ol-code' }, state.message),
            h('button', { type: 'button', className: 'ol-btn', style: mutedButton, onClick: () => load() }, t('retry')),
            root === '' ? null : h('button', { type: 'button', className: 'ol-btn', style: mutedButton, onClick: resetRoot }, t('resetRoot')),
          )
        } else if (total === 0) {
          body = h('div', { className: 'ol-state' },
            h('div', { className: 'ol-state-title' }, t('emptyTitle')),
            h('div', { className: 'ol-hint' }, t('emptyHint')),
            h('div', { className: 'ol-hint ol-code' }, activeRoot),
          )
        } else if (entries.length === 0) {
          body = h('div', { className: 'ol-state' },
            h('div', { className: 'ol-state-title' }, t('noMatch')),
            h('div', { className: 'ol-hint' }, t('noMatchHint')))
        } else {
          body = entries.map((entry, index) => renderEntry(entry, index))
        }

        const totalLabel = String(t('total')).split('{total}').join(String(trimmed === '' ? total : shown))

        const activeRootPath = state.data?.root ?? root
        const workspaces = Array.isArray(state.data?.workspaces) ? state.data.workspaces : []
        const matchedWorkspace = workspaces.find((row) => samePath(row.path, activeRootPath))
        const workspaceOptions = [
          { value: '__default__', label: t('rootAuto') },
          ...workspaces.map((row) => ({ value: row.path, label: row.title })),
          { value: '__custom__', label: matchedWorkspace === undefined ? (activeRootPath || t('changeRoot')) : t('changeRoot') },
        ]
        const genericMode = state.data?.mode === 'generic'
        const agentMode = state.data?.mode === 'agent'
        const unmatched = state.data?.unmatched ?? 0

        return h('div', { className: 'ol-root' },
          h('header', { className: 'ol-header' },
            h('div', { className: 'ol-brand' },
              h('div', { className: 'ol-title' }, t('title'),
                h('span', { className: 'ol-tag' }, t('readOnly')),
                agentMode ? h('span', { className: 'ol-tag', title: t('agentHint') }, t('agentTag')) : null,
                genericMode ? h('span', { className: 'ol-tag', title: t('genericHint') }, t('genericTag')) : null),
              h('div', { className: 'ol-rootpath', title: activeRoot || t('root') }, `${t('root')}：${activeRoot || '—'}`),
            ),
            h('div', { className: 'ol-tools' },
              h('div', { className: 'ol-search' },
                h('input', {
                  type: 'search',
                  value: query,
                  placeholder: t('searchPlaceholder'),
                  'aria-label': t('searchLabel'),
                  onChange: (event) => setQuery(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') setQuery('')
                  },
                })),
              h('select', {
                className: 'ol-ws',
                value: matchedWorkspace === undefined ? '__custom__' : matchedWorkspace.path,
                title: t('workspace'),
                'aria-label': t('workspace'),
                onChange: (event) => changeWorkspace(event.target.value),
              }, workspaceOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
              h('button', { type: 'button', className: 'ol-btn', disabled: state.status === 'loading', onClick: refresh }, t('refresh')),
              agentMode
                ? h('button', {
                  type: 'button',
                  className: 'ol-btn',
                  title: t('agentHint'),
                  onClick: updateClassification,
                }, unmatched > 0 ? `${t('updateClass')}（${unmatched}）` : t('updateClass'))
                : null,
              h('button', { type: 'button', className: 'ol-btn', onClick: expandAll }, t('expandAll')),
              h('button', { type: 'button', className: 'ol-btn', onClick: collapseAll }, t('collapseAll')),
              h('button', { type: 'button', className: 'ol-btn', onClick: close, title: t('close') }, t('close')),
            ),
          ),
          h('div', { className: 'ol-body' }, body),
          h('footer', { className: 'ol-footer' },
            h('span', null, t('footerHint')),
            h('span', { className: 'ol-spacer' }),
            h('span', null, `${totalLabel} · ${t('readOnly')}`),
            scannedAt === undefined || scannedAt === 0
              ? null
              : h('span', null, String(t('scanned')).split('{time}').join(formatTime(scannedAt))),
          ),
          notice === null ? null : h('div', { className: 'ol-notice', role: 'status' },
            h('div', null, notice.text),
            notice.detail === undefined ? null : h('div', { className: 'ol-notice-detail' }, notice.detail)),
        )
      }

      function LedgerIcon(props) {
        const size = typeof props?.size === 'number' ? props.size : 20
        const active = props?.active === true
        return h('svg', {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
          h('path', {
            d: 'M3 7.2c0-1 .8-1.8 1.8-1.8h3.1l1.9 2.1h9.4c1 0 1.8.8 1.8 1.8v8.9c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8z',
            stroke: 'currentColor',
            strokeWidth: active ? 2 : 1.7,
            strokeLinejoin: 'round',
          }),
          h('path', { d: 'M8 13.2h8M8 16.4h5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
      }

      /** 侧栏页脚按钮：与「DS Bot」同一排，图标 + 文字（宽栏时），点一下打开台账面板。 */
      function LedgerFooterButton(props) {
        const wide = props?.wide === true
        return h('button', {
          type: 'button',
          className: 'ol-foot',
          title: t('panel'),
          'aria-label': t('panel'),
          onClick: () => {
            try {
              ctx.layout.selectPanel(PANEL_ID)
            } catch {}
          },
        },
          h(LedgerIcon, { size: 20 }),
          wide ? h('span', { className: 'ol-foot-name' }, t('panel')) : null)
      }

      // 只注册面板本体和侧栏页脚按钮：不再占用「插件 / 自动化任务」下面那一行。
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, LedgerPanel))

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: PANEL_ID,
        order: -100,
        locale: NS,
        label: () => t('panel'),
      }, LedgerFooterButton))
    }

    return {
      // `remote.session` 是宿主原生打开器所在的命名空间；不声明 inject 时读 `ctx.remote`
      // 会抛 `cannot get property "remote.session" without inject`。
      inject: ['slots', 'locale', 'layout', 'remote', 'remote.session'],
      apply,
    }
  },
})
