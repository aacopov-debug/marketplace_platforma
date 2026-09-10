import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNavStore } from './store/navStore';
import { jwtDecode } from 'jwt-decode';
import { AvatarUploader, PortfolioUploader } from './components/ImageUploader';
import { TaskMap } from './components/TaskMap';
import { NotificationBell } from './components/NotificationBell';
import { useToast } from './components/Toast';
import { ConfirmDialog, Lightbox, useModalBehavior } from './components/Dialogs';
import { AITaskAssistant } from './components/AITaskAssistant';
import { BottomNav } from './components/BottomNav';
import { MobileFilterDrawer } from './components/MobileFilterDrawer';
import { ChatsDrawer } from './components/ChatsDrawer';
import CityInput, { POPULAR_CITIES } from './components/CityInput';
import deloArt from './assets/delo_art.jpg';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
import { ProfilePage, TaskPage, PublicProfilePage, ResetPasswordPage, Feed } from './pages/index.jsx';


const CATEGORIES = [
    { value: 'design', label: '🎨 Дизайн' },
    { value: 'development', label: '💻 Разработка' },
    { value: 'writing', label: '✍️ Тексты' },
    { value: 'repairs', label: '🔧 Ремонт' },
    { value: 'cleaning', label: '🧹 Уборка' },
    { value: 'delivery', label: '🚚 Доставка' },
    { value: 'photo_video', label: '📷 Фото/Видео' },
    { value: 'tutoring', label: '📚 Репетиторство' },
    { value: 'beauty', label: '💄 Красота' },
    { value: 'events', label: '🎉 Мероприятия' },
    { value: 'business', label: '💼 Бизнес' },
    { value: 'other', label: '📦 Другое' }
];

const CITIES = POPULAR_CITIES;

// ---- Design system: shared class recipes (dark modern, glass & glow) ----
const inputCls = "w-full rounded-xl border border-border bg-surface-2 text-ink placeholder-muted/60 p-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40";
const labelCls = "block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5";
const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-white px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:bg-accent-bright hover:glow-accent-sm active:scale-[0.98]";
const btnGhost = "inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 text-ink border border-border px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:border-border-bright hover:bg-elevated active:scale-[0.98]";
const btnSignal = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#38BDF8] text-white px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:glow-accent-sm active:scale-[0.98]";
const modalOverlay = "fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50";
const modalPanel = "glass rounded-2xl shadow-pop";

const chipCls = (active) =>
    `rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${active ? 'bg-accent text-white glow-accent-sm' : 'bg-surface-2 text-muted border border-border hover:text-ink hover:border-border-bright'}`;


const getInitial = (name, email) => {
    const src = (name && name.trim()) || email || '?';
    return src.trim().charAt(0).toUpperCase();
};

const getStatusBadgeStandalone = (status) => {
    switch (status) {
        case 'open': return <span className="rounded-full border border-border bg-surface-2 text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">Открыт</span>;
        case 'in_progress': return <span className="rounded-full bg-accent/20 text-accent-bright border border-accent/40 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">В работе</span>;
        case 'completed': return <span className="rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">Завершён</span>;
        default: return null;
    }
};

const getCategoryLabelStandalone = (cat) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found ? found.label : cat;
};

export default function App() {
    const { isAuth, role, logout, token } = useAuthStore();
    const {
        isAuthOpen,
        setAuthOpen,
        isChatsOpen,
        setChatsOpen,
        isCreateTaskOpen,
        setCreateTaskOpen,
        activeChatTask,
        setActiveChatTask
    } = useNavStore();
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Initialize Telegram Mini App SDK and synchronize Native BackButton
    useEffect(() => {
        try {
            const tg = window.Telegram?.WebApp;
            if (tg) {
                tg.ready();
                tg.expand?.();
                if (tg.setHeaderColor) tg.setHeaderColor('#0A0E17');
                if (tg.setBackgroundColor) tg.setBackgroundColor('#0A0E17');
                tg.enableClosingConfirmation?.();
            }
        } catch (e) {
            console.log('Telegram WebApp init error', e);
        }
    }, []);

    // Telegram Native BackButton sync for mobile drawer & modals
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.BackButton) return;

        const isAnyModalOpen = isChatsOpen || isAuthOpen || showAuthModal || isCreateTaskOpen || !!activeChatTask;

        if (isAnyModalOpen) {
            tg.BackButton.show();
            const handleBackClick = () => {
                if (isChatsOpen) setChatsOpen(false);
                if (isAuthOpen || showAuthModal) {
                    setAuthOpen(false);
                    setShowAuthModal(false);
                }
                if (isCreateTaskOpen) setCreateTaskOpen(false);
                if (activeChatTask) setActiveChatTask(null);
                try {
                    tg.HapticFeedback?.impactOccurred?.('light');
                } catch {}
            };
            tg.BackButton.onClick(handleBackClick);
            return () => {
                tg.BackButton.offClick(handleBackClick);
            };
        } else {
            tg.BackButton.hide();
        }
    }, [isChatsOpen, isAuthOpen, showAuthModal, isCreateTaskOpen, activeChatTask, setChatsOpen, setAuthOpen, setCreateTaskOpen, setActiveChatTask]);

    // Listen for global open-auth and close-all-modals events
    useEffect(() => {
        const handleOpenAuth = () => {
            setShowAuthModal(true);
            setAuthOpen(true);
        };
        const handleCloseAllModals = () => {
            setShowAuthModal(false);
            setAuthOpen(false);
        };
        window.addEventListener('delo:open-auth', handleOpenAuth);
        window.addEventListener('delo:close-all-modals', handleCloseAllModals);
        return () => {
            window.removeEventListener('delo:open-auth', handleOpenAuth);
            window.removeEventListener('delo:close-all-modals', handleCloseAllModals);
        };
    }, [setAuthOpen]);

    return (
        <BrowserRouter>
            <div className="min-h-screen flex flex-col bg-base text-ink font-sans">
                <nav className="glass sticky top-0 z-40 border-x-0 border-t-0">
                    <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex justify-between items-center gap-3 md:gap-6">
                        <Link to="/" className="font-display font-extrabold text-base sm:text-lg md:text-xl tracking-tight shrink-0">
                            ДЕЛО<span className="text-accent">.</span>
                        </Link>
                        {isAuth ? (
                            <div className="flex gap-3 md:gap-5 items-center">
                                <Link to="/profile" className="font-bold text-xs uppercase tracking-wider text-muted hover:text-accent-bright transition">Профиль</Link>
                                <span className="hidden md:inline rounded-full bg-surface-2 border border-border text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5">
                                    {role === 'customer' ? '🤝 Заказчик' : '🛠 Специалист'}
                                </span>
                                <NotificationBell token={token} />
                                <button onClick={logout} className="text-accent-bright font-bold text-xs uppercase tracking-wider hover:underline underline-offset-4 transition">Выйти</button>
                            </div>
                        ) : (
                            <button onClick={() => setAuthOpen(true)} className="rounded-xl bg-accent text-white px-4 md:px-5 py-2 font-display text-[11px] uppercase tracking-wider transition hover:bg-accent-bright hover:glow-accent-sm">
                                Войти
                            </button>
                        )}
                    </div>
                </nav>

                <main className="flex-grow">
                    <Routes>
                        <Route path="/" element={<Feed />} />
                        <Route path="/task/:id" element={<TaskPage />} />
                        <Route path="/user/:id" element={<PublicProfilePage />} />
                        <Route path="/reset" element={<ResetPasswordPage />} />
                        <Route path="/profile" element={isAuth ? <ProfilePage /> : (
                            <div className="max-w-xl mx-auto my-24 text-center px-4">
                                <div className="font-display font-bold uppercase text-3xl">Только для своих</div>
                                <p className="text-muted mt-3 font-semibold">Войдите, чтобы просматривать профиль.</p>
                            </div>
                        )} />
                    </Routes>
                </main>

                <footer className="bg-surface border-t border-border mt-16 mb-16 md:mb-0">
                    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 grid gap-8 md:grid-cols-3">
                        <div>
                            <div className="font-display font-extrabold text-lg">ДЕЛО<span className="text-accent">.</span></div>
                            <p className="text-muted text-sm mt-3 font-medium max-w-xs">Маркетплейс услуг: находите проверенных специалистов для любого дела.</p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Категории</div>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map(c => (
                                    <span key={c.value} className="rounded-full border border-border text-muted text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">{c.label}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-border/60">
                        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 text-xs text-muted font-medium">© 2026 ДЕЛО - маркетплейс услуг</div>
                    </div>
                </footer>

                {(showAuthModal || isAuthOpen) && (
                    <AuthModal onClose={() => {
                        setShowAuthModal(false);
                        setAuthOpen(false);
                    }} />
                )}

                {/* Sliding Chats Drawer over page */}
                <ChatsDrawer
                    isOpen={isChatsOpen}
                    onClose={() => setChatsOpen(false)}
                    onSelectTask={(task) => {
                        setChatsOpen(false);
                        setActiveChatTask(task);
                        window.dispatchEvent(new CustomEvent('delo:open-task-chat', { detail: task }));
                    }}
                />

                {/* Mobile Bottom Navigation Bar */}
                <BottomNav onOpenAuth={() => setAuthOpen(true)} />
            </div>
        </BrowserRouter>
    );
}
