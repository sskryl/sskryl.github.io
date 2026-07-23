"""LLM-сомелье: словесный портрет вкуса + объяснения «почему зайдёт».

Берёт список любимых фильмов пользователя и список кандидатов-рекомендаций,
просит Claude (Anthropic) описать вкус человеческим языком и объяснить,
почему каждый кандидат подойдёт именно этому зрителю.

Ключ берётся из ANTHROPIC_API_KEY (только на сервере — никогда на клиенте).
Если ключа или пакета нет — вежливо возвращаем configured=False, и фронт
просто прячет фичу.
"""
from __future__ import annotations

import json
import os
import re
from typing import List, Optional

# Модель по умолчанию — самая способная; можно переопределить через env.
DEFAULT_MODEL = os.getenv("SOMMELIER_MODEL", "claude-opus-4-8")
MAX_LIKED = 24
MAX_CANDIDATES = 18


def is_configured() -> bool:
    return bool((os.getenv("ANTHROPIC_API_KEY") or "").strip())


def _client():
    from anthropic import Anthropic  # ленивый импорт: пакет нужен только здесь

    return Anthropic()  # ключ из ANTHROPIC_API_KEY


def _fmt_movie(m: dict, with_overview: bool = False) -> str:
    title = (m.get("title") or "").strip()
    year = m.get("year") or ""
    genres = m.get("genres") or []
    if isinstance(genres, list):
        genres = ", ".join(str(g) for g in genres if g)
    line = f"«{title}»"
    if year:
        line += f" ({year})"
    if genres:
        line += f" — {genres}"
    if with_overview:
        ov = (m.get("overview") or "").strip()
        if ov:
            line += f". {ov[:220]}"
    return line


def _build_prompt(liked: List[dict], candidates: List[dict]) -> str:
    liked = [m for m in liked if m.get("title")][:MAX_LIKED]
    candidates = [m for m in candidates if m.get("title")][:MAX_CANDIDATES]

    liked_txt = "\n".join(f"- {_fmt_movie(m)}" for m in liked) or "- (пока пусто)"
    cand_txt = "\n".join(
        f"[{i}] {_fmt_movie(m, with_overview=True)}" for i, m in enumerate(candidates)
    )

    return (
        "Ты — кино-сомелье. По списку любимых фильмов зрителя составь живой, "
        "конкретный словесный портрет его вкуса и объясни, почему подойдут фильмы-кандидаты.\n\n"
        "ЛЮБИМЫЕ ФИЛЬМЫ ЗРИТЕЛЯ:\n" + liked_txt + "\n\n"
        "ФИЛЬМЫ-КАНДИДАТЫ (по индексам):\n" + cand_txt + "\n\n"
        "Верни СТРОГО JSON без markdown-обёртки такого вида:\n"
        "{\n"
        '  "profile": "2-4 живых предложения о вкусе зрителя на русском: какие темы, '
        'настроение, эпохи и режиссёрские приёмы он любит. Без воды и клише, конкретно.",\n'
        '  "picks": [ {"i": <индекс кандидата>, "reason": "1-2 предложения на русском: '
        'почему именно этот фильм зайдёт этому зрителю, со ссылкой на его вкус"} ]\n'
        "}\n\n"
        "Правила: пиши тепло и по делу, как знающий друг, а не рекламный текст. "
        "Включи в picks только действительно подходящих кандидатов (можно не все), "
        "самые точные — первыми. Никакого текста вне JSON."
    )


def _extract_json(text: str) -> Optional[dict]:
    text = (text or "").strip()
    # убрать возможную ```json ... ``` обёртку
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fence:
        text = fence.group(1)
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:  # noqa: BLE001
                return None
    return None


def taste_profile(liked: List[dict], candidates: List[dict]) -> dict:
    """Возвращает {profile, picks:[{id, reason}], model}. Кидает исключение при сбое LLM."""
    prompt = _build_prompt(liked, candidates)
    client = _client()
    msg = client.messages.create(
        model=DEFAULT_MODEL,
        max_tokens=1400,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = "".join(
        block.text for block in msg.content if getattr(block, "type", "") == "text"
    )
    data = _extract_json(raw) or {}

    cand = [m for m in candidates if m.get("title")][:MAX_CANDIDATES]
    picks = []
    for p in data.get("picks", []) or []:
        try:
            idx = int(p.get("i"))
        except (TypeError, ValueError):
            continue
        if 0 <= idx < len(cand):
            mid = cand[idx].get("id") or cand[idx].get("key")
            if mid is not None:
                picks.append({"id": mid, "reason": (p.get("reason") or "").strip()})

    return {
        "profile": (data.get("profile") or "").strip(),
        "picks": picks,
        "model": DEFAULT_MODEL,
    }
