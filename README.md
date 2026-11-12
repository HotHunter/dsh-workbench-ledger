# 文档台账 · dsh-workbench-ledger

把工作区里的文档按"业务分类"组织成一页。点文件名用系统默认程序打开，右侧按钮在文件管理器里定位。

> DSH（DeepSeek Harness）插件：一个侧栏页脚按钮 + 一个 agent 工具（`doc_ledger`）+ 一个可由 agent 维护的
> 分类清单（`.doc-ledger.json`）。只读用户文档。

## 安装

三种方式都行（`plugin_manager` → `install_bundle`）：

| 来源 | `target` 填什么 |
|---|---|
| npm | `dsh-workbench-ledger@1.0.0` |
| 本地 tgz | `dsh-workbench-ledger-1.0.0.tgz` 的绝对路径 |
| 源码目录 | 本目录的绝对路径 |

装好后左侧栏最底部（DS Bot 按钮旁边）出现「文档台账」。

## 使用

| 操作 | 结果 |
|---|---|
| 点「文档台账」 | 打开台账页 |
| 顶部下拉 | 切换工作区，切过去立刻重扫 |
| 点文件名 | 用默认程序打开（Word / PowerPoint / 看图 …） |
| 行右侧「打开位置」 | 资源管理器定位并选中该文件（悬停才显示） |
| 搜索框 | 按文件名或分类名过滤，命中时自动展开 |
| 「更新分类（N）」 | 请该工作区最近会话的 agent 重写分类清单 |

## 分类从哪来

1. **工作区根目录有 `.doc-ledger.json`** → 按清单渲染（页面上标「Agent 分类」）。
2. **没有清单** → 按一级目录归纳文档类文件（标「通用归纳」）。

清单由该工作区的 agent 写。在工作区会话里说一句：

> 给这个工作区的文档做分类

agent 会先列候选文件，再调用 `doc_ledger action=plan` 写入。也可以手写：

```json
{
  "includeUnmatched": true,
  "exclude": ["_draft/**"],
  "sections": [
    { "name": "技术方案", "match": ["技术方案_*.docx", "技术方案骨架.md"] },
    { "name": "审核意见", "match": ["_review/*.md"] }
  ]
}
```

- `match` 是相对工作区的 glob：`*` 不跨目录、`**` 跨目录、`?` 单字符。
- 一个文件只归第一个命中的分类；没覆盖到的进「未分类」，**不会消失**。
- 删掉清单（或 `action=plan` 传空 `sections`）就回到通用归纳。

## 配置（`cordis.patch.yml`）

| 键 | 默认 | 作用 |
|---|---|---|
| `root` | 不设 | 默认工作区；不设则自动探测（优先有清单的工作区） |
| `generic` | `true` | 设 `false` 则只认分类清单，没有清单就显示空 |

页面上的「工作区」下拉选择记在浏览器本地，优先于配置。

## 边界

- **只读**：只写工作区根目录下的 `.doc-ledger.json` 这一个文件，不动任何用户文档。
- 只收文档类：`md txt rtf docx doc pptx ppt xlsx xls csv pdf png jpg jpeg gif webp svg`。
- 跳过：隐藏项、`~$` 锁文件、`_tools` `_work` `_archive` `_preview*` `node_modules` `dist` `build`，
  以及 `README.md` / `index.md`。
- 上限：通用归纳 400 个文件 / 3 层；按清单 800 个文件 / 6 层。

## 自检

```bash
node -e "import('./index.js').then(async m => console.log(JSON.stringify(await m.scanLedger('.'), null, 2)))"
```
