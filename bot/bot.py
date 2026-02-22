import asyncio, aiohttp
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

import os

BOT_TOKEN = os.environ.get("BOT_TOKEN", "8523952909:AAESKomXnkBfQjY5BEdghsZYQmwNPLecA6Y")
API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000/tasks/")
TEST_TOKEN = os.environ.get("JWT_TOKEN", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImN1c3RvbWVyIiwiZXhwIjoxNzcxNzAyMTE2fQ.zwfNjnibh9-UwriJBCeel4VmZyKUY5ffCY99Xl3bLF4")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()

class TaskFSM(StatesGroup):
    title = State()
    desc = State()

@router.message(CommandStart())
async def start(m: Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Создать заказ", callback_data="new")]])
    await m.answer("Добро пожаловать в Маркетплейс!", reply_markup=kb)

@router.callback_query(F.data == "new")
async def new_task(c: CallbackQuery, state: FSMContext):
    await c.message.answer("Введите название:")
    await state.set_state(TaskFSM.title)

@router.message(TaskFSM.title)
async def get_title(m: Message, state: FSMContext):
    await state.update_data(title=m.text)
    await m.answer("Опишите задачу:")
    await state.set_state(TaskFSM.desc)

@router.message(TaskFSM.desc)
async def get_desc(m: Message, state: FSMContext):
    data = await state.get_data()
    async with aiohttp.ClientSession() as s:
        async with s.post(API_URL, json={"title": data['title'], "description": m.text, "budget": 0}, headers={"Authorization": f"Bearer {TEST_TOKEN}"}) as r:
            if r.status == 200:
                await m.answer("✅ Заказ успешно опубликован!")
            else:
                await m.answer("❌ Ошибка авторизации сервера.")
    await state.clear()

async def main():
    dp.include_router(router)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
