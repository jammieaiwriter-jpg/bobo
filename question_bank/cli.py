import argparse
from datetime import datetime
from pathlib import Path

from .database import QuestionBankDB
from .html_importer import import_questions_from_html


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the local Bobo question bank")
    parser.add_argument("--db", type=Path, default=Path("data/bobo.db"))
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import-html")
    importer.add_argument("html", type=Path, nargs="+")
    backup = commands.add_parser("backup")
    backup.add_argument("--output", type=Path)
    args = parser.parse_args()

    with QuestionBankDB(args.db) as db:
        if args.command == "import-html":
            total = sum(import_questions_from_html(db, path) for path in args.html)
            print(f"Imported {total} questions")
        else:
            output = args.output or Path("backups") / f"bobo-{datetime.now():%Y-%m-%d-%H%M%S}.db"
            print(db.backup(output))


if __name__ == "__main__":
    main()
