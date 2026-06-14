# Changes

- 依審查修正：Telegram 通知 Worker 的 OPTIONS preflight 統一先回 204，並補上未允許來源的回歸測試。
- 依審查修正：AI 批改 Worker 的 OPTIONS preflight 統一先回 204，並補上未允許來源的回歸測試。
- 依審查修正：嚴格驗證 Telegram 訊息文字型別、改用 `link_preview_options`，並補齊 Telegram HTTP 錯誤與 AI Worker 驗證路徑測試。
- 2026-06-13 通盤稽核：兩個 Worker 拒絕非物件 JSON，並將 AI／Telegram 上游網路例外轉為穩定 502；題庫匯入明確拒絕多個同名題庫 script，補上回歸測試。
- 依審查修正：補上來源封鎖測試、OpenAI 僅解析第一個 output_text，並調整圖片大小上限使獨立檢查可觸發。
- 依審查修正：Gemini 回應只解析第一個 part、移除 OpenAI 無效快捷路徑，並統一 OPTIONS 回傳 204。
- 2026-06-13 通盤稽核：AI 批改 Worker 先判斷上游狀態再解析 JSON，避免 HTML 錯誤頁造成 Worker 例外與 CORS 錯誤假象；補上 Gemini/OpenAI 回歸測試。
- 2026-06-13 通盤稽核：Telegram Worker 補上解析後請求大小兜底，避免缺少或偽造 `Content-Length` 時繞過限制；新增回歸測試。
- 依審查修正：統一 OpenAI 批改函式縮排，並等待 AI 批改 Promise 以利外層錯誤處理。
- 依審查修正：統一 OpenAI 圖片格式驗證、補上解析後請求大小限制，並將文字欄位過長改回 400。
- 2026-06-13 通盤稽核：限制 AI 批改與 Telegram Worker 的允許來源、請求大小與錯誤資訊，降低 API 額度濫用及上游資訊外洩風險。
- 2026-06-13 通盤稽核：題庫 HTML 匯入改為整批驗證後才寫入，拒絕空欄位、非物件與重複題號；補上事件欄位驗證與測試。
- 2026-06-13 通盤稽核：新增 `.gitignore`，排除 Python 快取、私密 SQLite 資料與備份。
- 依審查修正：將腳本未隨 repo 搬移的提示改為附在各腳本項目內，避免清單語意斷裂。
- 依審查修正：在「自動同步流程」就地註明腳本未隨 repo 搬移，並合併重複的變更紀錄。
