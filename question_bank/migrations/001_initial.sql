CREATE TABLE questions (
    question_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    subject TEXT NOT NULL,
    chapter TEXT,
    question_type TEXT,
    difficulty TEXT,
    content_json TEXT NOT NULL,
    source_path TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    question_version TEXT NOT NULL,
    submitted_answer TEXT NOT NULL,
    judgment TEXT NOT NULL,
    answered_at TEXT NOT NULL,
    is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
    hint_count INTEGER NOT NULL DEFAULT 0 CHECK (hint_count >= 0),
    chat_id TEXT,
    FOREIGN KEY (question_id) REFERENCES questions(question_id)
);

CREATE INDEX events_question_id_answered_at
ON events(question_id, answered_at);
