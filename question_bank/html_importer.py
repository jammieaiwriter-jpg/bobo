import json
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from .database import QuestionBankDB


class _QuestionBankScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.capture = False
        self.parts: list[str] = []
        self.script_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script" and attributes.get("id") == "question-bank":
            self.script_count += 1
            self.capture = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self.capture:
            self.capture = False

    def handle_data(self, data: str) -> None:
        if self.capture:
            self.parts.append(data)


def import_questions_from_html(db: QuestionBankDB, html_path: str | Path) -> int:
    html_path = Path(html_path)
    parser = _QuestionBankScriptParser()
    parser.feed(html_path.read_text(encoding="utf-8"))
    if not parser.parts:
        raise ValueError(f"No question-bank JSON script found in {html_path}")
    if parser.script_count > 1:
        raise ValueError(f"Multiple question-bank JSON scripts found in {html_path}")
    questions: list[dict[str, Any]] = json.loads("".join(parser.parts))
    if not isinstance(questions, list):
        raise ValueError("Question bank JSON must be a list")

    seen_ids: set[str] = set()
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("Every question must be a JSON object")
        required = {"id", "version", "subject"}
        missing = required - question.keys()
        if missing:
            raise ValueError(f"Question missing required fields: {sorted(missing)}")
        for field in required:
            if not isinstance(question[field], str) or not question[field].strip():
                raise ValueError(f"Question field must be a non-empty string: {field}")
        if question["id"] in seen_ids:
            raise ValueError(f"Duplicate question id in import: {question['id']}")
        seen_ids.add(question["id"])

    for question in questions:
        metadata = {
            key: question.get(key)
            for key in ("chapter", "question_type", "difficulty")
        }
        db.upsert_question(
            question_id=question["id"],
            version=question["version"],
            subject=question["subject"],
            content=question,
            source_path=str(html_path),
            **metadata,
        )
    return len(questions)
