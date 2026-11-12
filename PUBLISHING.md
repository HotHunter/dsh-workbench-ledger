# 发布说明（维护者用）

仓库：<https://github.com/HotHunter/dsh-workbench-ledger>
npm：`dsh-workbench-ledger`

## 本机工具（便携版，无需管理员）

这台机器的 DSH 运行时没有自带 git / npm / gh，用的是解压即用的便携版：

| 工具 | 路径 |
|---|---|
| git 2.56.1（MinGit） | `C:\Users\44975\dsh-plugins\.tools\MinGit\cmd\git.exe` |
| gh 2.103.3 | `C:\Users\44975\dsh-plugins\.tools\gh\bin\gh.exe` |

> 这台机器到 github.com 的直连会被重置，**必须走系统代理**（`127.0.0.1:7890`）：
> `git -c http.proxy=http://127.0.0.1:7890 ...`，或先 `set HTTPS_PROXY=http://127.0.0.1:7890`。
> npm 官方源可达，但走代理更稳。

## 日常发布流程

```powershell
# 1) 改完代码，本地提交
git add .
git commit -m "feat: ..."

# 2) 推 GitHub（有 gh 登录态后可省掉 -c 参数）
git -c http.proxy=http://127.0.0.1:7890 push

# 3) 打 tag（可选）
git tag v1.0.1 ; git push --tags

# 4) 升版本号后发布 npm（npm 不允许覆盖已发布版本）
npm publish        # 或用 pnpm publish
```

## 首次发布的账号与凭据

- GitHub 账号：**HotHunter**
- 推送鉴权：用一张 `repo` 权限的 PAT（无需 `read:org`；那是 `gh auth login` 才要求的）。
  一次性用法：
  ```powershell
  $tok = (Get-Content .secrets\gh-token.txt -Raw).Trim()
  $b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("HotHunter:$tok"))
  git -c http.proxy=http://127.0.0.1:7890 -c "http.extraheader=AUTHORIZATION: basic $b64" push -u origin main
  ```
- npm 发布鉴权：用 **Automation** token（能绕过 2FA），写进 `%USERPROFILE%\.npmrc`：
  ```
  //registry.npmjs.org/:_authToken=npm_xxx
  ```
- 两种 token 都不要提交进仓库；本仓库 `.gitignore` 已排除 `*.tgz`、`*.zip`，放 token 的文件请自己另存并保管。

## 发布前校验

- [ ] `node --check index.js && node --check client.js`
- [ ] 包内容干净：`index.js` `client.js` `cordis.patch.yml` `locale/*.json` `icon.svg` `README.md` `LICENSE`（由 `files` 限定）
- [ ] `LICENSE` 版权人正确
- [ ] `package.json` 的 `repository` / `homepage` / `bugs` 指向真实仓库
- [ ] 版本号已递增
