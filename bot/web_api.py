"""Веб-API для сайта: вход через Telegram + синхронизация профиля.

Делит ту же базу SQLite (storage.py) и ту же модель вкуса (taste.py), что и бот,
поэтому оценки и вкус пользователя собираются в ЕДИНЫЙ аккаунт независимо от того,
оценивал он в боте или на сайте.

Эндпоинты:
  POST /api/auth/telegram  — проверка подписи Telegram Login Widget, выдача сессии
  GET  /api/profile        — профиль (оценки, веса модели, любимые жанры)
  PUT  /api/profile        — слить локальные оценки сайта в аккаунт
  POST /api/rate           — оценить один фильм (обновляет модель)

Запуск:  python web_api.py   (порт из переменной PORT, по умолчанию 8080)
Для прод-нагрузки: gunicorn -w 2 -b 0.0.0.0:8080 web_api:app
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time

from dotenv import load_dotenv
from flask import Flask, jsonify, request

import storage
import taste

load_dotenv()
storage.init_db()


def _read_token() -> str:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if token:
        return token
    path = os.path.join(os.path.dirname(__file__), "token.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


BOT_TOKEN = _read_token()
SESSION_SECRET = (os.getenv("SESSION_SECRET") or hashlib.sha256(("sess::" + BOT_TOKEN).encode()).hexdigest())
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
SESSION_TTL = 30 * 24 * 3600  # 30 дней

app = Flask(__name__)


# --------------------------------------------------------------- CORS
@app.before_request
def _preflight():
    if request.method == "OPTIONS":
        return ("", 204)


@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
    resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
    return resp


# --------------------------------------------------------------- Telegram auth
def verify_telegram(data: dict):
    """Проверяет подпись данных Telegram Login Widget. Возвращает user_id или None."""
    recv_hash = data.get("hash")
    if not recv_hash or not BOT_TOKEN:
        return None
    check = "\n".join(f"{k}={data[k]}" for k in sorted(data) if k != "hash")
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, str(recv_hash)):
        return None
    try:
        if time.time() - int(data.get("auth_date", 0)) > 86400:
            return None  # данные старше суток
    except (TypeError, ValueError):
        return None
    try:
        return int(data["id"])
    except (TypeError, ValueError, KeyError):
        return None


def make_session(user_id: int) -> str:
    payload = f"{user_id}.{int(time.time()) + SESSION_TTL}"
    sig = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def read_session(token: str):
    try:
        uid, exp, sig = token.split(".")
        payload = f"{uid}.{exp}"
        calc = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, sig):
            return None
        if int(exp) < time.time():
            return None
        return int(uid)
    except (ValueError, AttributeError):
        return None


def current_user():
    h = request.headers.get("Authorization", "")
    return read_session(h[7:]) if h.startswith("Bearer ") else None


def _movie_from_meta(key: str, meta: dict) -> dict:
    return {
        "key": key,
        "source": "tmdb" if str(key).startswith("tmdb:") else "local",
        "title": meta.get("title", ""),
        "year": meta.get("year"),
        "poster": meta.get("poster"),
        "url": meta.get("url"),
        "genres": meta.get("genres", []),
    }


def _apply_rating(uid: int, movie: dict, value: int, known: set) -> None:
    is_new = movie["key"] not in known
    storage.add_rating(uid, movie, value)
    if is_new:  # новый рейтинг — двигаем модель вкуса
        weights = taste.update(storage.get_taste(uid), movie, value > 0)
        storage.set_taste(uid, weights)


# --------------------------------------------------------------- routes
@app.get("/")
def health():
    return jsonify({"ok": True, "service": "kinoflex-api"})


@app.post("/api/auth/telegram")
def auth_telegram():
    data = {k: str(v) for k, v in (request.get_json(force=True) or {}).items()}
    uid = verify_telegram(data)
    if not uid:
        return jsonify({"error": "invalid_signature"}), 401
    storage.upsert_user(uid, data.get("first_name", ""), data.get("username", ""))
    return jsonify({
        "token": make_session(uid),
        "user": {"id": uid, "name": data.get("first_name", ""), "photo": data.get("photo_url", "")},
        "profile": storage.get_profile(uid),
    })


@app.get("/api/profile")
def get_profile():
    uid = current_user()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(storage.get_profile(uid))


@app.put("/api/profile")
def put_profile():
    uid = current_user()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(force=True) or {}
    known = storage.get_rated_keys(uid)
    movies = data.get("movies", {}) or {}
    for key, value in (data.get("ratings") or {}).items():
        try:
            value = int(value)
        except (TypeError, ValueError):
            continue
        _apply_rating(uid, _movie_from_meta(key, movies.get(key, {})), value, known)
    if data.get("preferred_genres") is not None:
        storage.set_preferred_genres(uid, data["preferred_genres"])
    return jsonify(storage.get_profile(uid))


@app.post("/api/rate")
def rate():
    uid = current_user()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(force=True) or {}
    m = data.get("movie") or {}
    key = m.get("id") or m.get("key")
    if not key:
        return jsonify({"error": "no_movie"}), 400
    try:
        value = int(data.get("value", 0))
    except (TypeError, ValueError):
        value = 0
    _apply_rating(uid, _movie_from_meta(key, m), value, storage.get_rated_keys(uid))
    return jsonify({"taste_weights": storage.get_taste(uid)})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
