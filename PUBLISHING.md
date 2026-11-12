# 发布说明（GitHub + npm）

> 本机现状：**没有 git、没有 npm、没有 gh**（只有 DSH 自带的 node 与 pnpm）。
> 所以先装 Git for Windows（同时带来 `git`），npm 随 Node 安装包提供，或用 `pnpm publish` 也行。

## 0. 先改一处占位

`package.json` 里的 `GITHUB_USER` 换成你的 GitHub 用户名（`repository` / `homepage` / `bugs` 三处）：

```powershell
# 在包目录里执行，把 YOUR_NAME 换成你的用户名
(Get-Content -Raw package.json) -replace 'GITHUB_USER', 'YOUR_NAME' | Set-Content -Encoding utf8 package.json
```

## A. 装 Git 之后（推荐）

```powershell
# 仓库根目录（本文件所在目录）
cd <你的克隆或本地目录>

git init
git add .
git commit -m "feat: dsh-workbench-ledger 1.0.0"
git branch -M main

# 在 GitHub 页面 New repository 建一个空的 dsh-workbench-ledger（不要勾 README/.gitignore）
git remote add origin https://github.com/YOUR_NAME/dsh-workbench-ledger.git
git push -u origin main
```

发布到 npm（首次会要求登录，登录态存进 `~/.npmrc`，不要在对话里贴 token）：

```powershell
npm login          # 浏览器 / OTP 登录
npm publish        # 本包名无 scope，默认就是 public；如提示需要权限再加 --access public
# 没有 npm 也可以用 pnpm：
pnpm publish
```

## B. 不装 git（网页上传）

1. GitHub → **New repository**，名字 `dsh-workbench-ledger`，**不要**勾选 README / .gitignore。
2. 解压 `dsh-workbench-ledger-source.zip`，把里面的文件（不是外层文件夹）拖进仓库页面 → **Commit changes**。
3. npm 仍然需要命令行：装 Node 后 `npm login` → `npm publish`。

## 校验清单（发布前）

- [ ] `dsh-workbench-ledger` 这个名字在 npm 上还可注册（查过：2026-11-12 未被占用）
- [ ] `GITHUB_USER` 已替换
- [ ] `LICENSE` 版权人是 HotHunter
- [ ] 包内容干净：`index.js` `client.js` `cordis.patch.yml` `locale/*.json` `icon.svg` `README.md` `LICENSE`
      （`files` 已经限定了这些；`*.tgz` 与 `.zip` 被 `.gitignore` 排除）
- [ ] `node --check index.js && node --check client.js` 通过

## 版本更新

```powershell
# 改 package.json 的 version（例如 1.0.1）
git add . ; git commit -m "chore: release 1.0.1" ; git push
npm publish
```

npm 不允许覆盖已发布版本，必须改版本号；GitHub 仓库可以打 tag：`git tag v1.0.1 && git push --tags`。
