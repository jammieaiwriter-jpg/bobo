# Bobo Question Bank

This package is isolated from the live bot. It provides the only supported
write interface for question definitions and append-only learning events.

HTML sources must contain structured question JSON:

```html
<script id="question-bank" type="application/json">
[{"id":"MATH-001","version":"v1","subject":"math","prompt":"...","answer":"..."}]
</script>
```

Import and backup:

```sh
python3 -m question_bank.cli --db data/bobo.db import-html paper.html
python3 -m question_bank.cli --db data/bobo.db backup
```

Backups use SQLite `VACUUM INTO` and are verified with `PRAGMA integrity_check`.
The `questions` table can be rebuilt from committed HTML sources. The `events`
table and private `chat_id` values cannot, so backup files must remain private.
The repository `.gitignore` excludes the default `data/` and `backups/`
directories to prevent those private files from being committed accidentally.
