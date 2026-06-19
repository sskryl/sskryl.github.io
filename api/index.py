"""Vercel serverless-функция: отдаёт Flask-приложение веб-API.

Vercel запускает Python-файлы из /api как функции; здесь экспортируется WSGI
`app` из bot/web_api.py. Все запросы /api/* маршрутизируются сюда (см. vercel.json).

Переменные окружения (задаются в дашборде Vercel):
  TELEGRAM_BOT_TOKEN   — для проверки подписи входа
  TURSO_DATABASE_URL   — libsql://...  (общая база с ботом)
  TURSO_AUTH_TOKEN     — токен Turso
  CORS_ORIGIN          — https://<username>.github.io
  SESSION_SECRET       — (необязательно) секрет подписи сессий
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "bot"))

from web_api import app  # noqa: E402,F401  (Vercel обслуживает этот WSGI app)
