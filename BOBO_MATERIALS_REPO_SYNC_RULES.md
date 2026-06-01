# Bobo Materials Repo Sync Rules

這份文件是 `jammieaiwriter-jpg/bobo` 的本地同步與發布規格。

Emma 和 Bobo 異地使用，所有正式教材類 HTML 都要推到 GitHub，並以 GitHub Pages 連結作為交付入口；本機 `file://` 只用於製作與驗證。

## 固定同步 Repo

- 本地 repo 資料夾：
  `/Users/emma/bobo-automation/repos/bobo`
- 唯一 HTML 發布來源：
  `/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo`
- 目標 GitHub repo：
  `jammieaiwriter-jpg/bobo`
- GitHub Pages 入口：
  `https://jammieaiwriter-jpg.github.io/bobo/source_materials/desktop-bobo/`

## 自動同步流程

- 自動同步腳本：
  `/Users/emma/bobo-automation/scripts/sync_bobo_repo.py`
- 手動補跑腳本：
  `/Users/emma/bobo-automation/scripts/run_bobo_sync.sh`
- LaunchAgent：
  `/Users/emma/Library/LaunchAgents/com.bobo.repo-sync.plist`
- WatchPaths：
  `/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo`
  `/Users/emma/Documents/Codex/2026-05-23/ai-loading`
  `/Users/emma/Documents/Codex/考前任務包系統`

## 教材發布規則

- 所有給 Bobo 打開的正式 HTML 都以 repo 內的 `source_materials/desktop-bobo/` 為準。
- 穩定入口直接維護在 repo：
  - 自然：`/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo/index_science.html`
  - 數學：`/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo/index_math_graduation.html`
- `/Users/emma/Documents/Codex` 內的 `latest.html` 和 `05_html_tasks/*.html` 只作為補收新成品來源。
- 若 Documents/Codex 與 repo 有同名檔，repo 版本優先；自動流程不覆蓋 repo 版。
- 推送前腳本會檢查公開檔案不含 GitHub token、OpenAI key、Telegram token 或其他 secret-like 字串。
- 腳本預設會 commit 並 push 到 `origin/main`；git 子程序會移除壞掉的 `GITHUB_TOKEN` 環境變數，改用 `gh auth login` 的有效憑證。

## 日常發布流程

1. 完成數學、自然、社會 HTML 並用瀏覽器或 Playwright 驗證。
2. 把正式 HTML 直接放到 `/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo/`。
3. LaunchAgent 會自動 commit、push 到 GitHub；也會從 Documents/Codex 補收 repo 尚未有的新成品。
4. 若需要手動補跑：

```bash
/Users/emma/bobo-automation/scripts/run_bobo_sync.sh
```

## 目前狀態

- 固定 repo 已建立並同步：`/Users/emma/bobo-automation/repos/bobo`。
- 唯一 HTML 發布來源已收斂到 repo 版 `source_materials/desktop-bobo/`。
- workspace 舊版 `/Users/emma/bobo-automation/source_materials/desktop-bobo` 不再作為來源。
- 自動同步 LaunchAgent 已安裝且可成功執行：`com.bobo.repo-sync`。
