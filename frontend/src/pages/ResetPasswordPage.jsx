import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useNavStore } from '../store/navStore';
import { useToast } from '../components/Toast';
import { AvatarUploader, PortfolioUploader } from '../components/ImageUploader';
import { TaskMap } from '../components/TaskMap';
import { NotificationBell } from '../components/NotificationBell';
import { ConfirmDialog, Lightbox, useModalBehavior } from '../components/Dialogs';
import { AITaskAssistant } from '../components/AITaskAssistant';
import { BottomNav } from '../components/BottomNav';
import { MobileFilterDrawer } from '../components/MobileFilterDrawer';
import { ChatsDrawer } from '../components/ChatsDrawer';
import CityInput, { POPULAR_CITIES } from '../components/CityInput';
import { api } from '../api';
import deloArt from '../assets/delo_art.jpg';

const CATEGORIES = [
    { id: "repairs", label: "Ремонт", icon: "🔧", color: "#F59E0B" },
    { id: "cleaning", label: "Уборка", icon: "🧹", color: "#10B981" },
    { id: "development", label: "Разработка", icon: "💻", color: "#6366F1" },
    { id: "design", label: "Дизайн", icon: "🎨", color: "#EC4899" },
    { id: "writing", label: "Тексты", icon: "✍️", color: "#8B5CF6" },
    { id: "delivery", label: "Доставка", icon: "🚚", color: "#F97316" },
    { id: "photo_video", label: "Фото/Видео", icon: "📸", color: "#06B6D4" },
    { id: "tutoring", label: "Обучение", icon: "📚", color: "#84CC16" },
    { id: "beauty", label: "Красота", icon: "💄", color: "#F43F5E" },
    { id: "events", label: "Мероприятия", icon: "🎉", color: "#A855F7" },
    { id: "business", label: "Бизнес", icon: "💼", color: "#3B82F6" },
    { id: "other", label: "Другое", icon: "📦", color: "#94A3B8" },
];
const CITIES = POPULAR_CITIES;
const inputCls = "w-full rounded-xl border border-border bg-surface-2 text-ink placeholder-muted/60 p-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5";
const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-white px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:bg-accent-bright hover:glow-accent-sm active:scale-[0.98]";
const btnGhost = "inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 text-ink border border-border px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:border-border-bright hover:bg-elevated active:scale-[0.98]";
const btnSignal = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#38BDF8] text-white px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:glow-accent-sm active:scale-[0.98]";
const modalOverlay = "fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50";
const modalPanel = "glass rounded-2xl shadow-pop";
const chipCls = (active) => `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${active ? "bg-accent text-white shadow-glow-sm" : "bg-surface-2 text-muted border border-border hover:border-accent/50 hover:text-ink"}`;
const MasterBadge = ({ level = "novice", badges = [] }) => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-[10px] font-extrabold uppercase tracking-wider text-white px-2.5 py-1 shadow-glow-sm">👑 PRO</span>
);
const ProBadge = () => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-[10px] font-extrabold uppercase tracking-wider text-white px-2.5 py-1 shadow-glow-sm">★ PRO</span>
);
const getInitial = (name, email) => (name ? name[0].toUpperCase() : (email ? email[0].toUpperCase() : 'U'));
const getStatusBadgeStandalone = (status) => {
    const map = { open: "Открыт", in_progress: "В работе", completed: "Завершён" };
    return ( <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border">{map[status] || status}</span> );
};
const getCategoryLabelStandalone = (cat) => ((CATEGORIES.find(c => c.id === cat) || {}).label || cat);


const ResetPasswordPage = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const token = params.get('token');
    const [pw1, setPw1] = useState('');
    const [pw2, setPw2] = useState('');
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pw1.length < 6) return toast.error('Пароль должен быть не короче 6 символов');
        if (pw1 !== pw2) return toast.error('Пароли не совпадают');
        setBusy(true);
        try {
            await axios.post(`${API_URL}/auth/reset-password`, { token, new_password: pw1 });
            toast.success('Пароль обновлён! Войдите с новым паролем.');
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-16">
            <div className="glass rounded-2xl shadow-pop p-8">
                <h1 className="font-display font-bold uppercase text-xl text-center">Новый пароль</h1>
                {!token ? (
                    <>
                        <p className="mt-4 text-muted font-semibold text-sm text-center">Ссылка недействительна - в ней нет ключа сброса.</p>
                        <Link to="/" className={`${btnGhost} w-full mt-6`}>На главную</Link>
                    </>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
                        <input type="password" placeholder="Новый пароль" required value={pw1} onChange={e => setPw1(e.target.value)} className={inputCls} />
                        <input type="password" placeholder="Повторите пароль" required value={pw2} onChange={e => setPw2(e.target.value)} className={inputCls} />
                        <button type="submit" disabled={busy} className={`${btnPrimary} w-full mt-2 disabled:opacity-50`}>
                            {busy ? 'Сохранение...' : 'Сохранить пароль'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
