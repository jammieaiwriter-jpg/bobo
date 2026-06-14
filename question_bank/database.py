import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class QuestionBankDB:
    """Single write interface for question definitions and learning events."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA foreign_keys = ON")
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._apply_migrations()

    def close(self) -> None:
        self._connection.close()

    def __enter__(self) -> "QuestionBankDB":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @property
    def schema_version(self) -> int:
        return int(self._connection.execute("PRAGMA user_version").fetchone()[0])

    @property
    def journal_mode(self) -> str:
        return str(self._connection.execute("PRAGMA journal_mode").fetchone()[0])

    def table_columns(self, table: str) -> list[str]:
        allowed = {"questions", "events"}
        if table not in allowed:
            raise ValueError(f"Unknown table: {table}")
        return [row["name"] for row in self._connection.execute(f"PRAGMA table_info({table})")]

    def upsert_question(
        self,
        *,
        question_id: str,
        version: str,
        subject: str,
        content: dict[str, Any],
        chapter: str | None = None,
        question_type: str | None = None,
        difficulty: str | None = None,
        source_path: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection:
            self._connection.execute(
                """
                INSERT INTO questions (
                    question_id, version, subject, chapter, question_type,
                    difficulty, content_json, source_path, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(question_id) DO UPDATE SET
                    version=excluded.version,
                    subject=excluded.subject,
                    chapter=excluded.chapter,
                    question_type=excluded.question_type,
                    difficulty=excluded.difficulty,
                    content_json=excluded.content_json,
                    source_path=excluded.source_path,
                    updated_at=excluded.updated_at
                """,
                (
                    question_id,
                    version,
                    subject,
                    chapter,
                    question_type,
                    difficulty,
                    json.dumps(content, ensure_ascii=False, sort_keys=True),
                    source_path,
                    now,
                ),
            )

    def append_event(
        self,
        *,
        question_id: str,
        question_version: str,
        submitted_answer: str,
        judgment: str,
        answered_at: str,
        is_correct: bool,
        hint_count: int,
        chat_id: str | None = None,
    ) -> int:
        if not answered_at.strip():
            raise ValueError("answered_at must be a non-empty string")
        if hint_count < 0:
            raise ValueError("hint_count must be non-negative")
        question = self.get_question(question_id)
        if question is None or question["version"] != question_version:
            raise ValueError("Event must reference an existing question and matching version")
        with self._connection:
            cursor = self._connection.execute(
                """
                INSERT INTO events (
                    question_id, question_version, submitted_answer, judgment,
                    answered_at, is_correct, hint_count, chat_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    question_id,
                    question_version,
                    submitted_answer,
                    judgment,
                    answered_at,
                    int(is_correct),
                    hint_count,
                    chat_id,
                ),
            )
        return int(cursor.lastrowid)

    def get_question(self, question_id: str) -> dict[str, Any] | None:
        row = self._connection.execute(
            "SELECT * FROM questions WHERE question_id = ?", (question_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_event(self, event_id: int) -> dict[str, Any] | None:
        row = self._connection.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        return dict(row) if row else None

    def backup(self, destination: str | Path) -> Path:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise FileExistsError(f"Backup already exists: {destination}")
        escaped = str(destination.resolve()).replace("'", "''")
        self._connection.execute(f"VACUUM INTO '{escaped}'")
        check = sqlite3.connect(destination)
        try:
            result = check.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            check.close()
        if result != "ok":
            destination.unlink(missing_ok=True)
            raise RuntimeError(f"Backup integrity check failed: {result}")
        return destination

    def _apply_migrations(self) -> None:
        migrations = Path(__file__).with_name("migrations")
        for migration in sorted(migrations.glob("*.sql")):
            version = int(migration.name.split("_", 1)[0])
            if version <= self.schema_version:
                continue
            sql = migration.read_text(encoding="utf-8")
            with self._connection:
                self._connection.executescript(sql)
                self._connection.execute(f"PRAGMA user_version = {version}")
