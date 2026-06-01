# Bobo Materials Repo Sync Rules

這份文件是 `jammieaiwriter-jpg/bobo` 的本地同步與發布規格。

Emma 和 Bobo 異地使用，所有正式教材類 HTML 都要推到 GitHub，並以 GitHub Pages 連結作為交付入口；本機 `file://` 只用於製作與驗證。

## 固定同步 Repo

- 本地 repo 資料夾：
  `/Users/emma/bobo-automation/repos/bobo`
- 目標 GitHub repo：
  `jammieaiwriter-jpg/bobo`
- GitHub Pages 入口：
  `https://jammieaiwriter-jpg.github.io/bobo/source_materials/desktop-bobo/`

## 教材發布規則

- 所有給 Bobo 打開的正式 HTML 都放到 repo 的 `source_materials/desktop-bobo/`。
- 每個科目保留穩定入口，例如：
  - 自然：`source_materials/desktop-bobo/index_science.html`
  - 數學：`source_materials/desktop-bobo/index_math_graduation.html`
  - 具日期版本：`source_materials/desktop-bobo/bobo-*-YYYYMMDD.html`
- `latest.html` 或各科 `05_html_tasks/` 內完成驗證的 HTML，發布時要同步進這個 repo。
- 推送前先檢查公開 HTML 不含 Telegram token、OpenAI key、GitHub token 或其他私密設定。
- 推送後把 GitHub Pages URL 給 Emma，Emma 再傳給 Bobo。

## 日常發布流程

1. 在工作資料夾完成教材 HTML。
2. 用 Playwright 或瀏覽器驗證作答、批改、再練、版面與手機尺寸。
3. 複製到 `/Users/emma/bobo-automation/repos/bobo/source_materials/desktop-bobo/`。
4. 在 repo 內執行：

```bash
git status -sb
git diff --stat
rg -n "TG_BOT_TOKEN|OpenAI|GITHUB_TOKEN|ghp_|bot token" source_materials/desktop-bobo
git add source_materials/desktop-bobo/<changed-files>
git commit -m "Publish <subject> practice"
git push origin main
```

## 目前狀態

- 固定 repo 已建立於 `/Users/emma/bobo-automation/repos/bobo`。
- 自然科選擇題版已 commit 在本地 repo：
  `e5bae71 Publish science graduation choice practice`
- 目前尚未 push 成功，原因是 GitHub 認證 token 失效；重新登入 GitHub 後即可 push。
