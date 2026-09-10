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


const PublicProfilePage = () => {
    const { id } = useParams();
    const [user, setUser] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [connError, setConnError] = useState(false);
    const [lightbox, setLightbox] = useState(null);

    useEffect(() => {
        setLoading(true);
        setNotFound(false);
        setConnError(false);
        axios.get(`${API_URL}/users/${id}/public`)
            .then(res => {
                setUser(res.data);
                return axios.get(`${API_URL}/users/${id}/reviews`);
            })
            .then(res => setReviews(res.data))
            .catch(err => {
                if (err.response?.status === 404) setNotFound(true);
                else setConnError(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const parseList = (raw) => { try { return raw ? JSON.parse(raw) : []; } catch { return []; } };
    const portfolio = user ? parseList(user.portfolio) : [];
    const skills = user ? (user.skills ? user.skills.split(',').map(s => s.trim()).filter(Boolean) : []) : [];

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <div className="glass rounded-2xl p-6 animate-pulse">
                    <div className="flex gap-4 items-center">
                        <div className="w-20 h-20 bg-surface-2 rounded-xl" />
                        <div className="flex-1"><div className="h-6 w-1/2 bg-surface-2 rounded mb-3" /><div className="h-4 w-1/3 bg-surface-2 rounded" /></div>
                    </div>
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Не найдено</div>
                <p className="text-muted mt-3 font-semibold">Такого пользователя нет.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← На главную</Link>
            </div>
        );
    }

    if (connError) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Нет соединения</div>
                <p className="text-muted mt-3 font-semibold">Сервер не отвечает.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← На главную</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
            <div className="glass rounded-2xl shadow-card overflow-hidden">
                <div className="aurora border-b border-border p-6 flex items-center gap-5 flex-wrap">
                    {user.avatar ? (
                        <img src={user.avatar} alt="Аватар" className="w-24 h-24 object-cover rounded-xl border border-border" />
                    ) : (
                        <div className="w-24 h-24 bg-gradient-to-br from-accent to-[#38BDF8] text-white font-display font-bold text-4xl flex items-center justify-center rounded-xl">
                            {(user.name || 'П').trim().charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-grow">
                        <h1 className="font-display font-bold uppercase text-xl md:text-2xl flex items-center gap-2 flex-wrap">
                            {user.name || `Пользователь №${user.id}`}
                            {user.is_pro && <ProBadge />}
                            {user.verified && <span className="text-accent-bright" title="Проверенный">✓</span>}
                        </h1>
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {(user.online || user.last_seen) && (
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${user.online ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-surface-2 text-muted'}`}>
                                    <span className={`inline-block w-2 h-2 mr-1.5 rounded-full ${user.online ? 'bg-success' : 'bg-muted/50'}`}></span>
                                    {user.online ? 'Онлайн' : 'Был(а) недавно'}
                                </span>
                            )}
                            <span className="rounded-full bg-surface-2 border border-border text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">
                                {user.role === 'specialist' ? '🛠 Специалист' : '🤝 Заказчик'}
                            </span>
                            {user.city && <span className="rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">📍 {user.city}</span>}
                            {user.rating !== null && <span className="rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">⭐ {user.rating} / 5</span>}
                            {user.role === 'specialist' && (
                                <>
                                    <span className="rounded-full border border-border bg-surface-2 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">📋 {user.completed_tasks} заказов</span>
                                    <MasterBadge
                                        level={(user.completed_tasks || 0) >= 20 && (user.rating || 0) >= 4.9 ? "expert" : (user.completed_tasks || 0) >= 10 && (user.rating || 0) >= 4.7 ? "pro" : (user.completed_tasks || 0) >= 3 ? "master" : "novice"}
                                        badges={[
                                            { icon: "🛡", label: "Проверен" },
                                            { icon: "🤝", label: "Гарант" }
                                        ]}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {user.bio && (
                    <div className="p-6 border-b border-border/60">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">О себе</div>
                        <p className="text-ink/85 whitespace-pre-wrap break-words font-medium">{user.bio}</p>
                    </div>
                )}

                {skills.length > 0 && (
                    <div className="p-6 border-b border-border/60">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">Навыки</div>
                        <div className="flex flex-wrap gap-2">
                            {skills.map((s, i) => (
                                <span key={i} className="rounded-full bg-accent/15 text-accent-bright border border-accent/30 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">{s}</span>
                            ))}
                        </div>
                    </div>
                )}

                {portfolio.length > 0 && (
                    <div className="p-6 border-b border-border/60">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">Портфолио</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {portfolio.map((img, idx) => (
                                <img key={idx} src={img} alt={`Работа ${idx + 1}`} className="w-full h-28 object-cover rounded-lg border border-border cursor-pointer transition hover:border-accent/60 hover:glow-accent-sm" onClick={() => setLightbox({ images: portfolio, index: idx })} />
                            ))}
                        </div>
                    </div>
                )}

                <div className="p-6">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-4">Отзывы ({reviews.length})</div>
                    {reviews.length === 0 ? (
                        <p className="text-muted font-semibold text-sm">Отзывов пока нет.</p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {reviews.map(r => (
                                <div key={r.id} className="rounded-xl border border-border bg-surface-2/60 p-4">
                                    <div className="flex justify-between items-center gap-3 flex-wrap">
                                        <span className="font-bold">{r.reviewer_name}{r.reviewer_role && <span className="text-[10px] font-bold uppercase tracking-wider text-muted ml-2">{r.reviewer_role}</span>}</span>
                                        <span className="rounded-full bg-star/15 text-star border border-star/30 text-xs font-bold px-2 py-0.5">{"★".repeat(r.rating)}</span>
                                    </div>
                                    {r.task_title && (
                                        <Link to={`/task/${r.task_id}`} className="text-xs font-bold text-accent-bright hover:underline mt-1 inline-block">Заказ: {r.task_title}</Link>
                                    )}
                                    {r.comment && <p className="text-sm text-ink/85 mt-2 font-medium">{r.comment}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {lightbox && (
                <Lightbox
                    images={lightbox.images}
                    index={lightbox.index}
                    onClose={() => setLightbox(null)}
                    onNavigate={(i) => setLightbox({ ...lightbox, index: i })}
                />
            )}
        </div>
    );
};

export default PublicProfilePage;
