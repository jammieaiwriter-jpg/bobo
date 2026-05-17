# 數學 Math

用途：數學題庫、步驟拆解、應用題、錯誤步驟診斷。

目前資料：

- `QUESTION_BANK_數學.md`：原有數學題庫複本。
- `prototypes/index_math_apple_prototype.html`：Apple 風格數學原型參考。
- `prototypes/index_math_graduation.html`：Bobo 康軒六下畢業考練習，範圍為第 5 單元「怎樣解題」與第 6 單元「圓形圖」。
- `ai-grader-worker.js`：AI 照片批改後端範本。部署到 Cloudflare Worker 後，把 `GEMINI_API_KEY` 設成 secret，或改用 `OPENAI_API_KEY`，再把 Worker URL 填到網頁的「AI 批改網址」。API key 不可放在 GitHub Pages 前端。

數學科建議題型：

- 基礎計算
- 應用題
- 圖形題
- 單位換算
- 步驟判斷
- 同題型數字變化
- 算式照片批改：孩子要輸入最後答案並上傳紙本算式。AI 判斷答案與過程都合理才算精熟；只看提示或過程不足要保留待加強。
- 網頁版 Telegram 式練習：網頁負責派題、單元順序、錯題紀錄；互動以聊天泡泡呈現。Telegram bot 先作為媽媽通知與照片備份，不負責同時抽題，避免多個系統搶同一個練習狀態。

數學錯題加強建議：

- 先看解題步驟卡。
- 找出錯誤步驟。
- 出同題型不同數字。
- 答對多次才清除錯誤概念。
