# npm 发布备忘

记录 `pi-pua-x` 发布到 npm 时踩过的坑，供后续版本参考。

## 前置条件

- npm 账号已开启 2FA（双因素认证）
- 本地已 `npm login`

## 发布步骤

```powershell
# 1. 更新版本号
# 手动改 package.json version，或 npm version <patch|minor|major>

# 2. 发布
npm publish
```

## 坑记录

### 坑1：无 2FA 的 token 被 npm 限制

```
npm error 403 Two-factor authentication or granular access token with bypass 2fa enabled is required
```

npm 从 2025 年底开始限制旧版 `--auth-type=legacy` 登录方式。解决：

在 https://www.npmjs.com/settings/{username}/tokens 生成 **Granular Access Token**：
- Packages → "Only select packages and scopes" → 输入包名
- Permissions → **Read and write**
- ☑️ **Bypass 2FA when publishing**（勾上）
- 生成后用 `npm config set //registry.npmjs.org/:_authToken=npm_xxxxx` 设置

> 2026 年 npm 逐步废弃 bypass-2fa token，如果勾不了，换下面的作用域包方案。

### 坑2：无作用域包 publish 被 2FA 拦截

即使带 `--otp=CODE`，有时也不认（OTP 30 秒过期）。解决：

改包名为 `@scope/pi-pua-x`（如 `@xnightsky/pi-pua-x`），作用域包走不同的认证路径。

### 坑3：作用域包默认 private，需要 --access public

```
npm error 402 Payment Required - You must sign up for private packages
```

作用域包 publish 默认走 private 通道，需要付费。解决：

在 `package.json` 加：
```json
"publishConfig": {
  "access": "public"
}
```

或 publish 时加 `--access public`。

### 坑4：作用域包安装需要完整名称

```
pi install npm:@xnightsky/pi-pua-x
```

不要漏 `@scope/` 前缀。

### 坑5：Git Bash 不可用

Windows 上如果没有安装 Git Bash，pi agent 的 bash 工具会完全不可用。解决：

- 安装 Git for Windows，或
- 用 PowerShell 手动执行 git 命令

## 完整发版命令

```powershell
# 提交 + tag
git add <files>
git commit -m "release: v0.X.Y"
git tag v0.X.Y
git push origin main
git push origin v0.X.Y

# 发布 npm
npm publish

# 安装到 pi
pi install npm:@xnightsky/pi-pua-x
```
