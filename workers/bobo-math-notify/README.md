# Bobo Math Notify Worker

This Worker keeps Telegram secrets out of public GitHub Pages HTML.

Deploy:

```bash
wrangler deploy
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

After deployment, copy the Worker URL into `NOTIFY_ENDPOINT` in:

```text
04_question_bank/generate_multirun_bank.py
```

Then regenerate:

```bash
python3 04_question_bank/generate_multirun_bank.py
```

The HTML may be public because it contains only the Worker endpoint, not the Telegram bot token.
