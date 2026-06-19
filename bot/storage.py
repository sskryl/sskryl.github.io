"""Постоянное хранилище профилей (SQLite по умолчанию, Turso/libSQL опционально).

Бэкенд выбирается по переменным окружения:
- если задан TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) — используется Turso (libSQL),
  что нужно для serverless (Vercel) и единой базы сайта и бота;
- иначе — локальный файл SQLite (CINEMA_DB или bot/userdata.db).

SQL-диалект одинаков (libSQL = SQLite), поэтому запросы не меняются.
Профиль хранит: данные пользователя, результат психотеста, любимые жанры,
веса модели вкуса и оценки фильмов (❤️/👎).
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

_DB_PATH = os.getenv("CINEMA_DB") or os.path.join(os.path.dirname(__file__), "userdata.db")
_TURSO_URL = os.getenv("TURSO_DATABASE_URL")
_TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

_lock = threading.Lock()
_conn = None

LIKE = 1
DISLIKE = -1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect():
    global _conn
    if _conn is None:
        if _TURSO_URL:
            import libsql_experimental as libsql  # ленивый импорт: нужен только для Turso

            _conn = libsql.connect(database=_TURSO_URL, auth_token=_TURSO_TOKEN)
        else:
            _conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    return _conn


def _rows(cur) -> List[dict]:
    """Универсально превращает курсор в список словарей (работает и для sqlite, и для libsql)."""
    cols = [d[0] for d in cur.description] if cur.description else []
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _one(cur) -> Optional[dict]:
    rows = _rows(cur)
    return rows[0] if rows else None


def init_db() -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id          INTEGER PRIMARY KEY,
                first_name       TEXT,
                username         TEXT,
                archetype        TEXT,
                quiz_scores      TEXT,
                preferred_genres TEXT,
                taste_weights    TEXT,
                created_at       TEXT,
                updated_at       TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ratings (
                user_id    INTEGER,
                movie_key  TEXT,
                source     TEXT,
                title      TEXT,
                year       TEXT,
                poster     TEXT,
                url        TEXT,
                genres     TEXT,
                value      INTEGER,
                created_at TEXT,
                PRIMARY KEY (user_id, movie_key)
            )
            """
        )
        # Миграция старых баз
        cols = [r["name"] for r in _rows(conn.execute("PRAGMA table_info(users)"))]
        if "preferred_genres" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN preferred_genres TEXT")
        if "taste_weights" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN taste_weights TEXT")
        conn.commit()


# --------------------------------------------------------------- users
def upsert_user(user_id: int, first_name: str = "", username: str = "") -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO users (user_id, first_name, username, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                first_name=excluded.first_name,
                username=excluded.username,
                updated_at=excluded.updated_at
            """,
            (user_id, first_name, username, _now(), _now()),
        )
        conn.commit()


def set_quiz_result(user_id: int, archetype_key: str, quiz_scores: Dict[int, int]) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE users SET archetype=?, quiz_scores=?, updated_at=? WHERE user_id=?",
            (archetype_key, json.dumps(quiz_scores), _now(), user_id),
        )
        conn.commit()


def set_preferred_genres(user_id: int, keys: List[str]) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE users SET preferred_genres=?, updated_at=? WHERE user_id=?",
            (json.dumps(keys), _now(), user_id),
        )
        conn.commit()


def get_preferred_genres(user_id: int) -> List[str]:
    with _lock:
        conn = _connect()
        row = _one(conn.execute("SELECT preferred_genres FROM users WHERE user_id=?", (user_id,)))
    if row and row["preferred_genres"]:
        return json.loads(row["preferred_genres"])
    return []


def set_taste(user_id: int, weights: Dict[str, float]) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "UPDATE users SET taste_weights=?, updated_at=? WHERE user_id=?",
            (json.dumps(weights), _now(), user_id),
        )
        conn.commit()


def get_taste(user_id: int) -> Dict[str, float]:
    with _lock:
        conn = _connect()
        row = _one(conn.execute("SELECT taste_weights FROM users WHERE user_id=?", (user_id,)))
    if row and row["taste_weights"]:
        return json.loads(row["taste_weights"])
    return {}


def get_user(user_id: int) -> Optional[dict]:
    with _lock:
        conn = _connect()
        row = _one(conn.execute("SELECT * FROM users WHERE user_id=?", (user_id,)))
    if not row:
        return None
    row["quiz_scores"] = (
        {int(k): v for k, v in json.loads(row["quiz_scores"]).items()}
        if row.get("quiz_scores")
        else {}
    )
    return row


# --------------------------------------------------------------- ratings
def _genres_to_csv(genres: List[int]) -> str:
    return ",".join(str(g) for g in (genres or []))


def _csv_to_genres(csv: str) -> List[int]:
    return [int(x) for x in csv.split(",") if x] if csv else []


def add_rating(user_id: int, movie: dict, value: int) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            """
            INSERT INTO ratings
                (user_id, movie_key, source, title, year, poster, url, genres, value, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, movie_key) DO UPDATE SET
                value=excluded.value, created_at=excluded.created_at
            """,
            (
                user_id,
                movie.get("key"),
                movie.get("source", ""),
                movie.get("title", ""),
                str(movie.get("year") or ""),
                movie.get("poster") or "",
                movie.get("url") or "",
                _genres_to_csv(movie.get("genres", [])),
                value,
                _now(),
            ),
        )
        conn.commit()


def get_rated_keys(user_id: int) -> Set[str]:
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute("SELECT movie_key FROM ratings WHERE user_id=?", (user_id,)))
    return {r["movie_key"] for r in rows}


def _rows_to_movies(rows) -> List[dict]:
    movies = []
    for r in rows:
        movies.append(
            {
                "key": r["movie_key"],
                "source": r["source"],
                "title": r["title"],
                "year": r["year"],
                "poster": r["poster"] or None,
                "url": r["url"] or None,
                "genres": _csv_to_genres(r["genres"]),
                "free": (r["source"] == "local"),
            }
        )
    return movies


def get_liked(user_id: int) -> List[dict]:
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute(
            "SELECT * FROM ratings WHERE user_id=? AND value>0 ORDER BY created_at DESC", (user_id,)
        ))
    return _rows_to_movies(rows)


def get_disliked(user_id: int) -> List[dict]:
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute(
            "SELECT * FROM ratings WHERE user_id=? AND value<0 ORDER BY created_at DESC", (user_id,)
        ))
    return _rows_to_movies(rows)


def get_ratings_map(user_id: int) -> Dict[str, int]:
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute("SELECT movie_key, value FROM ratings WHERE user_id=?", (user_id,)))
    return {r["movie_key"]: r["value"] for r in rows}


def get_profile(user_id: int) -> dict:
    return {
        "ratings": get_ratings_map(user_id),
        "taste_weights": get_taste(user_id),
        "preferred_genres": get_preferred_genres(user_id),
        "liked": get_liked(user_id),
    }


def get_genre_affinity(user_id: int) -> Dict[int, int]:
    affinity: Dict[int, int] = {}
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute("SELECT genres, value FROM ratings WHERE user_id=?", (user_id,)))
    for r in rows:
        weight = 2 if r["value"] > 0 else -1
        for g in _csv_to_genres(r["genres"]):
            affinity[g] = affinity.get(g, 0) + weight
    return affinity


def get_stats(user_id: int) -> Dict[str, int]:
    with _lock:
        conn = _connect()
        rows = _rows(conn.execute("SELECT value FROM ratings WHERE user_id=?", (user_id,)))
    liked = sum(1 for r in rows if r["value"] > 0)
    disliked = sum(1 for r in rows if r["value"] < 0)
    return {"liked": liked, "disliked": disliked, "total": len(rows)}


def reset_user(user_id: int) -> None:
    with _lock:
        conn = _connect()
        conn.execute("DELETE FROM ratings WHERE user_id=?", (user_id,))
        conn.execute(
            "UPDATE users SET archetype=NULL, quiz_scores=NULL, taste_weights=NULL,"
            " preferred_genres=NULL, updated_at=? WHERE user_id=?",
            (_now(), user_id),
        )
        conn.commit()
