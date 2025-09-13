import sqlite3
from pathlib import Path
from typing import Optional


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  updated_at TEXT,
  artifact_path TEXT,
  artifact_status TEXT DEFAULT 'pending',
  convmeta_status TEXT DEFAULT 'pending',
  attendees_status TEXT DEFAULT 'pending',
  local_match_status TEXT DEFAULT 'pending',
  last_error TEXT,
  retries INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  platform TEXT,
  media_type TEXT,
  started_recording_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  email_address TEXT,
  first_name TEXT,
  last_name TEXT,
  account_id INTEGER,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_people_email ON people(email_address);
CREATE INDEX IF NOT EXISTS idx_people_account ON people(account_id);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT,
  domain TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  guid TEXT,
  name TEXT,
  email_address TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_guid ON users(guid);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT
);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def set_kv(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (key, value))
    conn.commit()


def get_kv(conn: sqlite3.Connection, key: str) -> Optional[str]:
    cur = conn.execute("SELECT v FROM kv WHERE k=?", (key,))
    row = cur.fetchone()
    return row[0] if row else None

