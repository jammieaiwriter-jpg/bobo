import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from question_bank import QuestionBankDB, import_questions_from_html


class QuestionBankDBTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.db_path = self.root / "bobo.db"
        self.db = QuestionBankDB(self.db_path)

    def tearDown(self):
        self.db.close()
        self.temp_dir.cleanup()

    def test_migrations_enable_wal_and_create_versioned_schema(self):
        self.assertEqual(self.db.schema_version, 1)
        self.assertEqual(self.db.journal_mode, "wal")
        self.assertEqual(
            self.db.table_columns("events"),
            [
                "id",
                "question_id",
                "question_version",
                "submitted_answer",
                "judgment",
                "answered_at",
                "is_correct",
                "hint_count",
                "chat_id",
            ],
        )

    def test_upsert_question_and_append_event(self):
        self.db.upsert_question(
            question_id="MATH-001",
            version="v1",
            subject="math",
            chapter="fractions",
            question_type="multiple_choice",
            difficulty="easy",
            content={"prompt": "1/2 + 1/2 = ?", "answer": "1"},
            source_path="papers/math.html",
        )
        event_id = self.db.append_event(
            question_id="MATH-001",
            question_version="v1",
            submitted_answer="1",
            judgment="correct",
            answered_at="2026-06-13T10:00:00+08:00",
            is_correct=True,
            hint_count=0,
            chat_id="-123",
        )

        self.assertEqual(self.db.get_question("MATH-001")["subject"], "math")
        self.assertEqual(self.db.get_event(event_id)["submitted_answer"], "1")

    def test_event_rejects_unknown_question_version(self):
        with self.assertRaisesRegex(ValueError, "question"):
            self.db.append_event(
                question_id="missing",
                question_version="v1",
                submitted_answer="A",
                judgment="incorrect",
                answered_at="2026-06-13T10:00:00+08:00",
                is_correct=False,
                hint_count=1,
            )

    def test_import_questions_from_embedded_json(self):
        html_path = self.root / "paper.html"
        html_path.write_text(
            '<script id="question-bank" type="application/json">'
            + json.dumps(
                [
                    {
                        "id": "SCI-001",
                        "version": "v2",
                        "subject": "science",
                        "chapter": "weather",
                        "question_type": "multiple_choice",
                        "difficulty": "medium",
                        "prompt": "Which instrument measures temperature?",
                        "answer": "thermometer",
                    }
                ]
            )
            + "</script>",
            encoding="utf-8",
        )

        count = import_questions_from_html(self.db, html_path)

        self.assertEqual(count, 1)
        self.assertEqual(self.db.get_question("SCI-001")["version"], "v2")

    def test_import_validates_entire_bank_before_writing(self):
        html_path = self.root / "invalid-paper.html"
        html_path.write_text(
            '<script id="question-bank" type="application/json">'
            + json.dumps(
                [
                    {"id": "SCI-001", "version": "v1", "subject": "science"},
                    {"id": "SCI-002", "version": "", "subject": "science"},
                ]
            )
            + "</script>",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ValueError, "non-empty string"):
            import_questions_from_html(self.db, html_path)

        self.assertIsNone(self.db.get_question("SCI-001"))

    def test_import_rejects_duplicate_question_ids(self):
        html_path = self.root / "duplicate-paper.html"
        html_path.write_text(
            '<script id="question-bank" type="application/json">'
            + json.dumps(
                [
                    {"id": "SCI-001", "version": "v1", "subject": "science"},
                    {"id": "SCI-001", "version": "v2", "subject": "science"},
                ]
            )
            + "</script>",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ValueError, "Duplicate question id"):
            import_questions_from_html(self.db, html_path)

    def test_import_rejects_multiple_question_bank_scripts(self):
        html_path = self.root / "multiple-banks.html"
        html_path.write_text(
            '<script id="question-bank" type="application/json">[]</script>'
            '<script id="question-bank" type="application/json">[]</script>',
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ValueError, "Multiple question-bank"):
            import_questions_from_html(self.db, html_path)

    def test_event_rejects_negative_hint_count(self):
        with self.assertRaisesRegex(ValueError, "non-negative"):
            self.db.append_event(
                question_id="missing",
                question_version="v1",
                submitted_answer="A",
                judgment="incorrect",
                answered_at="2026-06-13T10:00:00+08:00",
                is_correct=False,
                hint_count=-1,
            )

    def test_backup_is_consistent_and_restorable(self):
        self.db.upsert_question(
            question_id="MATH-001",
            version="v1",
            subject="math",
            content={"prompt": "test"},
        )
        backup_path = self.root / "backups" / "bobo-backup.db"

        self.db.backup(backup_path)

        restored = sqlite3.connect(backup_path)
        try:
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(restored.execute("SELECT COUNT(*) FROM questions").fetchone()[0], 1)
        finally:
            restored.close()


if __name__ == "__main__":
    unittest.main()
