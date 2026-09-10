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


const TaskPage = () => {
    const { id } = useParams();
    const { token, role } = useAuthStore();
    const toast = useToast();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [connError, setConnError] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const [responseText, setResponseText] = useState('');
    const [proposedPrice, setProposedPrice] = useState('');
    const [estimatedDays, setEstimatedDays] = useState('');
    const [sending, setSending] = useState(false);

    const fetchTask = () => {
        setLoading(true);
        setNotFound(false);
        setConnError(false);
        axios.get(`${API_URL}/tasks/${id}`)
            .then(res => setTask(res.data))
            .catch(err => {
                if (err.response?.status === 404) setNotFound(true);
                else setConnError(true);
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchTask();
    }, [id]);

    const handleSendResponse = async () => {
        if (!responseText.trim() || sending) return;
        setSending(true);
        try {
            const res = await axios.post(`${API_URL}/tasks/${task.id}/responses`,
                {
                    text: responseText,
                    proposed_price: proposedPrice ? parseInt(proposedPrice) : null,
                    estimated_days: estimatedDays ? parseInt(estimatedDays) : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Ваш отклик успешно отправлен заказчику!' + (res.data && res.data.credits_left !== null && res.data.credits_left !== undefined ? ` Осталось откликов: ${res.data.credits_left}` : ''));
            setResponseText('');
            setProposedPrice('');
            setEstimatedDays('');
        } catch (err) {
            toast.error('Ошибка отправки отклика. Вы авторизованы?');
        } finally {
            setSending(false);
        }
    };

    const parseImages = (imgs) => { try { return imgs ? JSON.parse(imgs) : []; } catch { return []; } };
    const images = task ? parseImages(task.images) : [];
    const isOwner = token && role === 'customer' && task && task.customer_id === parseInt(jwtDecode(token).sub);

    const handleDeleteImage = async (url) => {
        try {
            await axios.delete(`${API_URL}/tasks/${task.id}/images`,
                { data: { urls_to_delete: [url] }, headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Фото удалено');
            fetchTask();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Не удалось удалить фото');
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <div className="glass rounded-2xl p-6 animate-pulse">
                    <div className="h-7 w-2/3 bg-surface-2 rounded-lg mb-4" />
                    <div className="h-4 w-1/2 bg-surface-2 rounded mb-6" />
                    <div className="h-4 w-full bg-surface-2 rounded mb-2" />
                    <div className="h-4 w-5/6 bg-surface-2 rounded mb-2" />
                    <div className="h-4 w-3/4 bg-surface-2 rounded" />
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Не найдено</div>
                <p className="text-muted mt-3 font-semibold">Такого заказа нет - возможно, его удалили.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← Все заказы</Link>
            </div>
        );
    }

    if (connError) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Нет соединения</div>
                <p className="text-muted mt-3 font-semibold">Сервер не отвечает. Попробуйте ещё раз.</p>
                <button onClick={fetchTask} className={`${btnGhost} mt-6`}>Повторить</button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
            <Link to="/" className="inline-block text-xs font-bold uppercase tracking-wider text-muted hover:text-accent-bright transition mb-6">← Все заказы</Link>

            <article className="glass rounded-2xl shadow-card overflow-hidden">
                <div className="p-6 border-b border-border aurora">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="rounded-full bg-surface-2 border border-border text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">{getCategoryLabelStandalone(task.category)}</span>
                        {getStatusBadgeStandalone(task.status)}
                    </div>
                    <h1 className="font-extrabold text-2xl md:text-3xl leading-tight mt-4">{task.title}</h1>
                    <div className="flex gap-4 mt-3 text-[11px] font-bold uppercase tracking-wide text-muted flex-wrap">
                        {task.is_remote ? <span>🌐 Удалённо</span> : task.city && <span>📍 {task.city}{task.address && `, ${task.address}`}</span>}
                        {task.deadline && <span>📅 До {new Date(task.deadline).toLocaleDateString('ru-RU')}</span>}
                        <span>💬 {task.responses_count} откл.</span>
                    </div>
                </div>

                <div className="p-6">
                    <div className="font-display font-bold text-3xl mb-4 text-accent-bright">{task.budget} ₽</div>
                    <p className="text-ink/85 whitespace-pre-wrap break-words font-medium">{task.description}</p>

                    {images.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mt-6">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative">
                                    <img
                                        src={img}
                                        alt={`Фото ${idx + 1}`}
                                        className="w-full h-28 object-cover rounded-lg border border-border cursor-pointer transition hover:border-accent/60 hover:glow-accent-sm"
                                        onClick={() => setLightbox({ images, index: idx })}
                                    />
                                    {isOwner && (
                                        <button
                                            onClick={() => handleDeleteImage(img)}
                                            title="Удалить фото"
                                            className="absolute -top-2 -right-2 bg-danger text-white w-7 h-7 rounded-full font-extrabold text-sm flex items-center justify-center transition hover:scale-110"
                                        >×</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {(task.latitude && task.longitude) && (
                        <div className="mt-6 rounded-xl border border-border overflow-hidden h-[280px]">
                            <TaskMap tasks={[task]} onTaskClick={() => {}} />
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t border-border/60 flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Заказчик:</span>
                        <Link to={`/user/${task.customer_id}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 font-bold text-sm hover:border-accent/50 transition">
                            {task.customer_name || `Пользователь №${task.customer_id}`}
                        </Link>
                    </div>
                </div>

                {/* Response form */}
                {task.status === 'open' && (
                    <div className="p-6 border-t border-border dot-grid">
                        <h3 className="font-display font-bold uppercase text-lg">Откликнуться</h3>
                        {!token ? (
                            <p className="mt-3 text-muted font-semibold text-sm">Войдите как специалист, чтобы отправить отклик.</p>
                        ) : role !== 'specialist' ? (
                            <p className="mt-3 text-muted font-semibold text-sm">Отклики доступны только для аккаунтов специалистов.</p>
                        ) : (
                            <div className="mt-4 flex flex-col gap-4">
                                <textarea value={responseText} onChange={e => setResponseText(e.target.value)} className={inputCls} rows="4" placeholder="Расскажите о вашем опыте и как вы решите эту задачу..."></textarea>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Ваша цена (₽)</label>
                                        <input type="number" value={proposedPrice} onChange={e => setProposedPrice(e.target.value)} placeholder={task.budget} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Срок (дней)</label>
                                        <input type="number" value={estimatedDays} onChange={e => setEstimatedDays(e.target.value)} placeholder="7" className={inputCls} />
                                    </div>
                                </div>
                                <button onClick={handleSendResponse} disabled={sending} className={`${btnPrimary} disabled:opacity-50`}>
                                    {sending ? 'Отправка...' : 'Отправить отклик'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </article>

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

export default TaskPage;
