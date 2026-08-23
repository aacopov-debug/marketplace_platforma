# -*- coding: utf-8 -*-
"""
Телеграм-бот ДЕЛО — уведомления о новых заказах.

Команды:
  /start — подписаться на новые заказы
  /stop  — отписаться

Запуск: TG_BOT_TOKEN обязателен; API_URL и FRONTEND_URL — опциональны.
Подписки хранятся в файле subscriptions.json.
"""
import json
import os
import time
import urllib.request

BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
API_BASE = os.environ.get("API_URL", "https://deloz-backend.onrender.com")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://delo-jhcy.onrender.com")
SUBS_FILE = os.environ.get("SUBS_FILE", "subscriptions.json")

CATEGORIES = {
    "design": "🎨 Дизайн", "development": "💻 Разработка", "writing": "✍️ Тексты",
    "repairs": "🔧 Ремонт", "cleaning": "🧹 Уборка", "delivery": "🚚 Доставка",
    "photo_video": "📷 Фото/Видео", "tutoring": "📚 Репетиторство", "beauty": "💄 Красота",
    "events": "🎉 Мероприятия", "business": "💼 Бизнес", "other": "📦 Другое",
}


def tg(method, **params):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def load_subs():
    try:
        with open(SUBS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_subs(subs):
    with open(SUBS_FILE, "w", encoding="utf-8") as f:
        json.dump(subs, f)


def fetch_new_tasks(last_id):
    """Возвращает заказы с id больше last_id (или последний максимум, если бот только запущен)."""
    try:
        with urllib.request.urlopen(f"{API_BASE}/tasks/", timeout=30) as r:
            tasks = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print("tasks fetch error:", e)
        return [], last_id
    if not tasks:
        return [], last_id
    max_id = max(t["id"] for t in tasks)
    if last_id is None:
        return [], max_id  # при старте просто запоминаем текущий максимум
    fresh = [t for t in tasks if t["id"] > last_id]
    return fresh, max_id


def notify_all(task):
    cat = CATEGORIES.get(task.get("category"), task.get("category"))
    place = "🌐 Удалённо" if task.get("is_remote") else (f"📍 {task.get('city')}" if task.get("city") else "")
    text = (
        f"Новый заказ на ДЕЛО\n\n"
        f"<b>{task['title']}</b>\n"
        f"{cat}" + (f" · {place}" if place else "") + "\n"
        f"💰 Бюджет: {task.get('budget') or 0} ₽\n\n"
        f"Откликнуться: {FRONTEND_URL}/task/{task['id']}"
    )
    for chat_id in load_subs():
        try:
            tg("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML",
               disable_web_page_preview=True)
        except Exception as e:
            print(f"send to {chat_id} failed:", e)


def handle_update(upd):
    msg = upd.get("message") or upd.get("channel_post")
    if not msg:
        return
    chat_id = msg["chat"]["id"]
    text = (msg.get("text") or "").strip().lower()
    subs = load_subs()
    if text.startswith("/start"):
        if chat_id not in subs:
            subs.append(chat_id)
            save_subs(subs)
        tg("sendMessage", chat_id=chat_id,
           text=f"Подписка оформлена! Буду присылать новые заказы с сайта ДЕЛО.\n"
                f"Отписаться: /stop\nСайт: {FRONTEND_URL}")
    elif text.startswith("/stop"):
        if chat_id in subs:
            subs.remove(chat_id)
            save_subs(subs)
        tg("sendMessage", chat_id=chat_id, text="Подписка отключена. /start — включить снова.")


def start_health_server():
    """Render требует открытый порт у web-сервиса — отдаём простой health-check."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading
    port = int(os.environ.get("PORT", "10000"))

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write("ДЕЛО бот работает".encode("utf-8"))

        def log_message(self, *a):
            pass

    server = HTTPServer(("0.0.0.0", port), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def main():
    if not BOT_TOKEN:
        print("TG_BOT_TOKEN не задан — бот не запущен")
        return
    start_health_server()
    print("Bot started, polling...")
    offset = None
    last_task_id = None
    while True:
        # 1) телеграм-апдейты
        try:
            params = {"timeout": 25}
            if offset is not None:
                params["offset"] = offset
            result = tg("getUpdates", **params)
            for upd in result.get("result", []):
                offset = upd["update_id"] + 1
                handle_update(upd)
        except Exception as e:
            print("poll error:", e)
            time.sleep(3)
        # 2) новые заказы
        fresh, new_max = fetch_new_tasks(last_task_id)
        if last_task_id is not None and fresh:
            print(f"{len(fresh)} new task(s), notifying {len(load_subs())} subscriber(s)")
            for t in sorted(fresh, key=lambda x: x["id"]):
                notify_all(t)
        last_task_id = new_max


if __name__ == "__main__":
    main()
