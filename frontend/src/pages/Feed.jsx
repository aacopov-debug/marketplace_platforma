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


const Feed = () => {
    const { token, role } = useAuthStore();
    const {
        viewMode,
        setViewMode,
        isCreateTaskOpen,
        setCreateTaskOpen,
        activeChatTask,
        setActiveChatTask
    } = useNavStore();
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedTask, setSelectedTask] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [showHeroAIModal, setShowHeroAIModal] = useState(false);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [remoteOnly, setRemoteOnly] = useState(false);

    // Listen for custom events from BottomNav, ChatsDrawer or elsewhere
    useEffect(() => {
        const handleSetViewMode = (e) => {
            if (e.detail) {
                setViewMode(e.detail);
            }
        };
        const handleOpenCreateTask = () => {
            setShowCreateModal(true);
            setCreateTaskOpen(true);
        };
        const handleOpenTaskChat = (e) => {
            if (e.detail) {
                setChatTask(e.detail);
            }
        };
        const handleCloseAllModals = () => {
            setSelectedTask(null);
            setViewingResponsesTask(null);
            setChatTask(null);
            setReviewingTask(null);
            setShowCreateModal(false);
            setShowMobileFilters(false);
            setLightbox(null);
            setConfirmingComplete(false);
            setResponseText('');
            setProposedPrice('');
            setEstimatedDays('');
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };

        window.addEventListener('delo:set-view-mode', handleSetViewMode);
        window.addEventListener('delo:open-create-task', handleOpenCreateTask);
        window.addEventListener('delo:open-task-chat', handleOpenTaskChat);
        window.addEventListener('delo:close-all-modals', handleCloseAllModals);
        return () => {
            window.removeEventListener('delo:set-view-mode', handleSetViewMode);
            window.removeEventListener('delo:open-create-task', handleOpenCreateTask);
            window.removeEventListener('delo:open-task-chat', handleOpenTaskChat);
            window.removeEventListener('delo:close-all-modals', handleCloseAllModals);
        };
    }, [setViewMode, setCreateTaskOpen]);

    // Sync activeChatTask from store
    useEffect(() => {
        if (activeChatTask) {
            setSelectedTask(null);
            setViewingResponsesTask(null);
            setShowCreateModal(false);
            setChatTask(activeChatTask);
        } else if (!activeChatTask && chatTask) {
            setChatTask(null);
        }
    }, [activeChatTask]);

    // Sync from URL search params (e.g. /?view=map or /?create=true)
    useEffect(() => {
        const view = searchParams.get('view');
        if (view === 'map' || view === 'list') {
            setViewMode(view);
        }
        if (searchParams.get('create') === 'true') {
            setShowCreateModal(true);
            setCreateTaskOpen(true);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('create');
            setSearchParams(newParams, { replace: true });
        }
    }, [searchParams, setSearchParams, setViewMode, setCreateTaskOpen]);
    const [sortBy, setSortBy] = useState('default');
    const [loading, setLoading] = useState(true);
    const [connError, setConnError] = useState(false);
    const [visibleCount, setVisibleCount] = useState(12);
    const [lightbox, setLightbox] = useState(null); // { images: [], index: n }
    const [confirmingComplete, setConfirmingComplete] = useState(false);

    // Esc-закрытие модалок ленты
    const responseRef = useModalBehavior(() => { if (selectedTask) { setSelectedTask(null); setResponseText(''); setProposedPrice(''); setEstimatedDays(''); } });
    const responsesRef = useModalBehavior(() => setViewingResponsesTask(null));
    const chatRef = useModalBehavior(() => {
        setChatTask(null);
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    });
    const reviewRef = useModalBehavior(() => setReviewingTask(null));

    // For specialists applying
    const [responseText, setResponseText] = useState('');
    const [proposedPrice, setProposedPrice] = useState('');
    const [estimatedDays, setEstimatedDays] = useState('');

    // For customers viewing responses
    const [viewingResponsesTask, setViewingResponsesTask] = useState(null);
    const [taskResponses, setTaskResponses] = useState([]);

    // For Task Workspace (Chat)
    const [chatTask, setChatTask] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const wsRef = useRef(null);

    // For Reviews
    const [reviewingTask, setReviewingTask] = useState(null);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewHover, setReviewHover] = useState(0);
    const [reviewComment, setReviewComment] = useState('');

    const fetchTasks = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (categoryFilter) params.append('category', categoryFilter);
        if (searchQuery) params.append('search', searchQuery);
        if (cityFilter) params.append('city', cityFilter);
        if (remoteOnly) params.append('is_remote', 'true');

        axios.get(`${API_URL}/tasks/?${params.toString()}`)
            .then(res => {
                setTasks(res.data);
                setConnError(false);
                setVisibleCount(12);
            })
            .catch(err => {
                console.error("Error fetching tasks:", err);
                if (!err.response) setConnError(true);
            })
            .finally(() => setLoading(false));
    };

    // Debounce the search box so typing doesn't hit the API on every keystroke
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput), 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
        fetchTasks();
    }, [categoryFilter, searchQuery, cityFilter, remoteOnly]);

    const fetchMessages = async (taskId) => {
        try {
            const res = await axios.get(`${API_URL}/tasks/${taskId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMessages(res.data);
        } catch (err) {
            console.error("Failed to load messages:", err);
        }
    };

    // Load initial messages and establish WebSocket connection when chat is opened
    useEffect(() => {
        if (!chatTask) return;

        // Initial load of history
        fetchMessages(chatTask.id);

        // Construct WebSocket URL (token goes in the first message, not the URL)
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = API_URL.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${wsHost}/ws/tasks/${chatTask.id}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
            const incomingMessage = JSON.parse(event.data);
            // Deduplicate if we somehow received it through API and WS simultaneously
            setMessages(prev => {
                if (prev.find(m => m.id === incomingMessage.id)) return prev;
                return [...prev, incomingMessage];
            });
        };

        ws.onclose = () => console.log("WebSocket disconnected");

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [chatTask, token]);

    const handleSendResponse = async () => {
        if (!responseText.trim()) return;
        try {
            const res = await axios.post(`${API_URL}/tasks/${selectedTask.id}/responses`,
                {
                    text: responseText,
                    proposed_price: proposedPrice ? parseInt(proposedPrice) : null,
                    estimated_days: estimatedDays ? parseInt(estimatedDays) : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Ваш отклик успешно отправлен заказчику!' + (res.data && res.data.credits_left !== null && res.data.credits_left !== undefined ? ` Осталось откликов: ${res.data.credits_left}` : ''));
            setSelectedTask(null);
            setResponseText('');
            setProposedPrice('');
            setEstimatedDays('');
        } catch (err) {
            toast.error('Ошибка отправки отклика. Вы авторизованы?');
        }
    };

    const loadResponses = async (task_id) => {
        try {
            const res = await axios.get(`${API_URL}/tasks/${task_id}/responses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTaskResponses(res.data);
            setViewingResponsesTask(task_id);
        } catch (err) {
            toast.error('Не удалось загрузить отклики.');
        }
    };

    const handleAssign = async (taskId, specialistId) => {
        try {
            await axios.put(`${API_URL}/tasks/${taskId}/assign?specialist_id=${specialistId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Исполнитель назначен! Средства зарезервированы.');
            setViewingResponsesTask(null);
            fetchTasks(); // refresh task list to see status change
        } catch (err) {
            if (err.response?.status === 400 && err.response?.data?.detail === 'Недостаточно средств для безопасной сделки') {
                toast.error('Недостаточно средств для безопасной сделки. Пополните баланс в профиле.');
            } else {
                toast.error('Ошибка назначения исполнителя.');
            }
        }
    };

    const handleCompleteTask = async (taskId) => {
        try {
            await axios.put(`${API_URL}/tasks/${taskId}/complete`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Заказ завершен! Пожалуйста, оставьте отзыв.');
            setReviewingTask(chatTask);
            setChatTask(null);
            fetchTasks(); // refresh task list
        } catch (err) {
            toast.error('Ошибка завершения заказа.');
        }
    };

    const handleSubmitReview = async () => {
        try {
            await axios.post(`${API_URL}/tasks/${reviewingTask.id}/review`, {
                rating: reviewRating,
                comment: reviewComment
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Спасибо за ваш отзыв!');
            setReviewingTask(null);
            setReviewRating(5);
            setReviewHover(0);
            setReviewComment('');
            fetchTasks();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка отправки отзыва.');
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;
        try {
            await axios.post(`${API_URL}/tasks/${chatTask.id}/messages`,
                { text: newMessage },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewMessage('');
            // We no longer need to fetchMessages() manually, the WebSocket will push the new message to us (and everyone else).
        } catch (err) {
            toast.error('Ошибка отправки сообщения.');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'open': return <span className="rounded-full border border-border bg-surface-2 text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">Открыт</span>;
            case 'in_progress': return <span className="rounded-full bg-accent/20 text-accent-bright border border-accent/40 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">В работе</span>;
            case 'completed': return <span className="rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">Завершён</span>;
            default: return null;
        }
    };

    const getCategoryLabel = (cat) => {
        const found = CATEGORIES.find(c => c.value === cat);
        return found ? found.label : cat;
    };

    return (
        <div>
            {/* HERO */}
            <section className="aurora dot-grid border-b border-border">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16 text-center">
                    <span className="inline-block glass rounded-full font-display text-[10px] uppercase tracking-[0.2em] px-3.5 py-1.5 text-muted">Маркетплейс услуг</span>
                    <h1 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-[56px] sm:text-[96px] md:text-[136px] mt-6 text-center text-white">
                        ДЕЛО
                    </h1>
                    <p className="mt-5 text-muted font-semibold max-w-md mx-auto">
                        Найди своего специалиста: 12 категорий · отклики за минуты · безопасная сделка с резервированием средств.
                    </p>

                    {/* AI Prompt Quick Bar & Feature Trigger */}
                    <div className="mt-8 max-w-2xl mx-auto">
                        <div className="glass p-2 sm:p-2.5 rounded-2xl border border-accent/40 shadow-glow-sm flex flex-col sm:flex-row gap-2 items-stretch">
                            <div className="flex-1 flex items-center gap-2.5 px-3 py-2 bg-surface-2/80 rounded-xl border border-border">
                                <span className="text-accent text-lg">✨</span>
                                <input
                                    type="text"
                                    placeholder="Опишите задачу AI (напр. «Починить кран в Казани»)..."
                                    className="w-full bg-transparent text-sm font-medium outline-none placeholder-muted/60 text-ink"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && searchInput.trim()) {
                                            e.preventDefault();
                                            setShowCreateModal(true);
                                        }
                                    }}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex-1 sm:flex-none rounded-xl bg-gradient-to-r from-accent to-[#38BDF8] text-white px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:glow-accent-sm active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-md"
                                >
                                    <span>AI Создать</span>
                                    <span className="text-xs">⚡</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })}
                                    className="rounded-xl bg-surface-2 text-ink border border-border px-4 py-2.5 font-display text-xs uppercase tracking-wider transition hover:bg-elevated"
                                >
                                    Поиск
                                </button>
                            </div>
                        </div>
                    </div>


                    <div className="mt-5 flex flex-wrap gap-2 justify-center">
                        <button onClick={() => setCategoryFilter('')} className={chipCls(categoryFilter === '')}>Все</button>
                        {CATEGORIES.slice(0, 5).map(cat => (
                            <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} className={chipCls(categoryFilter === cat.value)}>
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 md:mt-10">
                        <img src={deloArt} alt="Фирменный арт ДЕЛО" className="w-full max-w-[260px] md:max-w-[320px] mx-auto aspect-square object-cover rounded-2xl border border-border shadow-card" />
                    </div>
                </div>
            </section>

            {/* FILTERS — desktop grid & mobile drawer trigger */}
            <section className="border-b border-border bg-surface/60 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 md:hidden flex justify-between items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowMobileFilters(true)}
                        className="flex-1 rounded-xl bg-surface-2 border border-border px-4 py-2.5 font-display text-xs uppercase tracking-wider text-ink flex items-center justify-center gap-2 transition hover:border-accent"
                    >
                        <span>⚙️ Фильтры</span>
                        {(categoryFilter || cityFilter || remoteOnly || sortBy !== "default") && (
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        )}
                    </button>
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${viewMode === "list" ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted border-border"}`}
                        >
                            📋
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("map")}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${viewMode === "map" ? "bg-accent text-white border-accent" : "bg-surface-2 text-muted border-border"}`}
                        >
                            🗺
                        </button>
                    </div>
                </div>
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] gap-3 items-center">
                    <select
                        className="h-[50px] w-full rounded-xl border border-border bg-surface-2 text-ink px-3 font-semibold outline-none focus:border-accent transition cursor-pointer"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="">Все категории</option>
                        {CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                    </select>
                    <div className="w-full">
                        <CityInput
                            value={cityFilter}
                            onChange={setCityFilter}
                            placeholder="Все города (или введите свой)..."
                            className="h-[50px] w-full rounded-xl border border-border bg-surface-2 text-ink px-3 font-semibold outline-none focus:border-accent transition"
                        />
                    </div>
                    <label className="h-[50px] flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 cursor-pointer select-none transition hover:border-border-bright">
                        <input
                            type="checkbox"
                            checked={remoteOnly}
                            onChange={(e) => setRemoteOnly(e.target.checked)}
                            className="w-5 h-5 accent-accent"
                        />
                        <span className="font-bold text-sm whitespace-nowrap">🌐 Только удалённые</span>
                    </label>
                    <div className="flex gap-3 items-stretch flex-wrap">
                        <select
                            className="h-[50px] flex-1 min-w-[150px] lg:flex-none rounded-xl border border-border bg-surface-2 text-ink px-3 font-semibold outline-none focus:border-accent transition cursor-pointer"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        >
                            <option value="default">По умолчанию</option>
                            <option value="budget_desc">Бюджет ↓</option>
                            <option value="budget_asc">Бюджет ↑</option>
                            <option value="newest">Сначала новые</option>
                            <option value="oldest">Сначала старые</option>
                        </select>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`h-[50px] flex-1 lg:flex-none px-4 rounded-xl border font-display text-[11px] uppercase tracking-wider transition ${viewMode === 'list' ? 'bg-accent text-white border-accent glow-accent-sm' : 'bg-surface-2 text-muted border-border hover:text-ink hover:border-border-bright'}`}
                        >
                            📋 Список
                        </button>
                        <button
                            onClick={() => setViewMode('map')}
                            className={`h-[50px] flex-1 lg:flex-none px-4 rounded-xl border font-display text-[11px] uppercase tracking-wider transition ${viewMode === 'map' ? 'bg-accent text-white border-accent glow-accent-sm' : 'bg-surface-2 text-muted border-border hover:text-ink hover:border-border-bright'}`}
                        >
                            🗺 Карта
                        </button>
                    </div>
                </div>
            </section>

            {/* TASKS */}
            <section id="feed" className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-10 scroll-mt-16">
                <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                    <h2 className="font-display font-bold uppercase text-xl md:text-2xl flex items-center gap-3">
                        Лента заказов
                        <span className="rounded-full bg-surface-2 border border-border text-muted text-xs font-bold px-2.5 py-0.5">{tasks.length}</span>
                    </h2>
                    {role === 'customer' && (
                        <button onClick={() => setShowCreateModal(true)} className={btnPrimary}>+ Создать заказ</button>
                    )}
                </div>

                {viewMode === 'map' ? (
                    <div className="rounded-2xl border border-border overflow-hidden h-[600px]">
                        <TaskMap
                            tasks={tasks}
                            onTaskClick={(taskId) => {
                                const task = tasks.find(t => t.id === taskId);
                                if (task && role === 'specialist' && task.status === 'open') {
                                    setSelectedTask(task);
                                }
                            }}
                        />
                    </div>
                ) : (
 <div className="grid md:grid-cols-2 gap-5">
 {loading ? (
 Array.from({ length: 4 }).map((_, i) => (
 <div key={i} className="glass rounded-2xl p-5 flex flex-col animate-pulse">
 <div className="flex gap-3 mb-3"><div className="bg-surface-2 h-6 w-24 rounded-full" /><div className="bg-surface-2 h-6 w-16 rounded-full" /></div>
 <div className="bg-surface-2 h-6 w-3/4 rounded mb-2" /><div className="bg-surface-2 h-4 w-1/3 rounded mb-4" />
 <div className="flex-1 bg-surface-2 h-4 rounded mb-1" /><div className="bg-surface-2 h-4 w-2/3 rounded mb-4" />
 <div className="border-t border-border pt-4 flex justify-between"><div className="bg-surface-2 h-6 w-20 rounded" /><div className="bg-surface-2 h-9 w-32 rounded-xl" /></div>
 </div>
 ))
 ) : connError ? (
 <div className="md:col-span-2 rounded-2xl border border-danger/40 bg-danger/5 py-14 text-center">
 <div className="font-display font-bold uppercase text-2xl text-danger">Нет соединения</div>
 <p className="text-muted mt-2 font-semibold">Сервер не отвечает. Проверьте, запущен ли бэкенд.</p>
 <button onClick={fetchTasks} className={`${btnGhost} mt-5`}>Повторить</button>
 </div>
 ) : tasks.length === 0 ? (
                            <div className="md:col-span-2 rounded-2xl border border-dashed border-border-bright/60 dot-grid py-16 text-center">
                                <div className="font-display font-bold uppercase text-2xl">Пока пусто</div>
                                <p className="text-muted mt-2 font-semibold">Заказов по этим фильтрам не найдено — попробуйте изменить условия.</p>
                            </div>
                        ) : (
                            [...tasks].sort((a, b) => {
                                if (sortBy === 'budget_desc') return (b.budget || 0) - (a.budget || 0);
                                if (sortBy === 'budget_asc') return (a.budget || 0) - (b.budget || 0);
                                if (sortBy === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                                if (sortBy === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                                return 0;
                            }).slice(0, visibleCount).map(t => (
                                <article key={t.id} className="glass rounded-2xl p-5 flex flex-col transition duration-150 hover:border-accent/50 hover:shadow-card">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="rounded-full bg-surface-2 border border-border text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 truncate">{getCategoryLabel(t.category)}</span>
                                        {getStatusBadge(t.status)}
                                    </div>
                                    <h3 className="font-extrabold text-lg leading-snug mt-3 break-words">
                                        <Link to={`/task/${t.id}`} className="hover:text-accent-bright transition">{t.title}</Link>
                                    </h3>
                                    <div className="flex gap-4 mt-2 text-[11px] font-bold uppercase tracking-wide text-muted flex-wrap">
                                        {t.is_remote ? (
                                            <span>🌐 Удалённо</span>
                                        ) : t.city && (
                                            <span className="truncate">📍 {t.city}{t.address && `, ${t.address}`}</span>
                                        )}
                                        {t.deadline && (
                                            <span>📅 До {new Date(t.deadline).toLocaleDateString('ru-RU')}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted mt-3 mb-4 whitespace-pre-wrap break-words line-clamp-3 flex-grow">{t.description}</p>

                                    {/* Task images */}
 {t.images && (() => { try { return JSON.parse(t.images); } catch { return []; } })().length > 0 && (() => {
                                const imgs = (() => { try { return JSON.parse(t.images); } catch { return []; } })();
                                return (
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {imgs.map((img, idx) => (
                                        <img
                                            key={idx}
                                            src={img}
                                            alt={`${t.title} ${idx + 1}`}
                                            className="w-full h-20 object-cover rounded-lg border border-border cursor-pointer transition hover:border-accent/60 hover:glow-accent-sm"
                                            onClick={() => setLightbox({ images: imgs, index: idx })}
                                        />
                                    ))}
                                </div>
                                );
                            })()}

                                    <div className="flex justify-between items-center border-t border-border pt-4 gap-3 flex-wrap">
                                        <span className="font-display font-bold text-lg text-accent-bright">{t.budget} ₽</span>

                                        {role === 'specialist' && t.status === 'open' && (
                                            <button onClick={() => setSelectedTask(t)} className={btnPrimary}>Откликнуться</button>
                                        )}
                                        {role === 'specialist' && t.status === 'in_progress' && t.executor_id === parseInt(jwtDecode(token).sub) && (
                                            <button onClick={() => setChatTask(t)} className={btnSignal}>Рабочая область</button>
                                        )}
                                        {role === 'customer' && t.customer_id === parseInt(jwtDecode(token).sub) && (
                                            <div className="flex gap-2 flex-wrap">
                                                {t.status === 'open' && (
                                                    <button onClick={() => loadResponses(t.id)} className={btnGhost}>Смотреть отклики</button>
                                                )}
                                                {t.status === 'in_progress' && (
                                                    <button onClick={() => setChatTask(t)} className={btnSignal}>Перейти в чат</button>
                                                )}
                                                {t.status === 'completed' && (
                                                    <button onClick={() => setReviewingTask(t)} className={btnGhost}>★ Отзыв о специалисте</button>
                                                )}
                                            </div>
                                        )}
                                        {role === 'specialist' && t.status === 'completed' && t.executor_id === parseInt(jwtDecode(token).sub) && (
                                            <button onClick={() => setReviewingTask(t)} className={btnGhost}>★ Отзыв о заказчике</button>
                                        )}
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                )}

                {!loading && !connError && viewMode === 'list' && tasks.length > visibleCount && (
                    <div className="mt-6 text-center">
                        <button onClick={() => setVisibleCount(c => c + 12)} className={btnGhost}>
                            Показать ещё · {tasks.length - visibleCount}
                        </button>
                    </div>
                )}

                {/* Modal for Specialist to Write Response */}
                {selectedTask && (
                    <div className={modalOverlay}>
                        <div ref={responseRef} tabIndex={-1} className={`${modalPanel} w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto p-6 outline-none focus:ring-2 focus:ring-accent/50`}>
                            <h2 className="font-display font-bold uppercase text-lg leading-snug">Отклик: «{selectedTask.title}»</h2>
                            <textarea value={responseText} onChange={e => setResponseText(e.target.value)} className={`${inputCls} mt-5 mb-4`} rows="5" placeholder="Напишите сопроводительное письмо заказчику... Расскажите о вашем опыте."></textarea>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Ваша цена (₽)</label>
                                    <input type="number" value={proposedPrice} onChange={e => setProposedPrice(e.target.value)} placeholder={selectedTask.budget} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Срок (дней)</label>
                                    <input type="number" value={estimatedDays} onChange={e => setEstimatedDays(e.target.value)} placeholder="7" className={inputCls} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => { setSelectedTask(null); setResponseText(''); setProposedPrice(''); setEstimatedDays(''); }} className={btnGhost}>Отмена</button>
                                <button onClick={handleSendResponse} className={btnPrimary}>Отправить отклик</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal for Customer to View Responses */}
                {viewingResponsesTask && (
                    <div className={modalOverlay}>
                        <div ref={responsesRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl max-h-[80vh] flex flex-col p-6 outline-none focus:ring-2 focus:ring-accent/50`}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="font-display font-bold uppercase text-xl">Отклики исполнителей</h2>
                                <button onClick={() => setViewingResponsesTask(null)} className="w-9 h-9 rounded-lg bg-surface-2 border border-border font-extrabold flex items-center justify-center transition hover:border-border-bright">&times;</button>
                            </div>

                            <div className="overflow-y-auto pr-2 flex-grow">
                                {taskResponses.length === 0 ? (
                                    <div className="text-center py-12 rounded-xl border border-dashed border-border-bright/60">
                                        <div className="font-display font-bold uppercase text-lg">Тишина</div>
                                        <p className="text-muted mt-2 font-semibold">На этот заказ пока нет откликов.</p>
                                    </div>
                                ) : (
                                    taskResponses.map(r => (
                                        <div key={r.id} className="rounded-xl border border-border bg-surface-2/60 p-4 mb-4">
                                            <div className="flex justify-between items-start mb-2 gap-3 flex-wrap">
                                                <div>
                                                    <h3 className="font-bold text-lg flex items-center gap-2 flex-wrap">
                                                        <Link to={`/user/${r.specialist_id}`} className="hover:text-accent-bright underline decoration-transparent hover:decoration-accent transition">
                                                            {r.specialist_online && <span className="inline-block w-2.5 h-2.5 rounded-full bg-success mr-2 align-middle" title="Сейчас онлайн"></span>}
                                                            {r.specialist_name || `Специалист №${r.specialist_id}`}
                                                        </Link>
                                                        {r.specialist_pro && <ProBadge />}
                                                        {r.specialist_verified && (
                                                            <span className="text-accent-bright" title="Проверенный">✓</span>
                                                        )}
                                                        {r.specialist_rating !== null && r.specialist_rating !== undefined && (
                                                            <span className="rounded-full bg-surface border border-border text-[11px] font-bold px-2 py-0.5">
                                                                ⭐ {r.specialist_rating}
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="flex gap-3 text-xs font-semibold text-muted mt-1 flex-wrap">
                                                        <span>{r.specialist_email}</span>
                                                        {r.specialist_city && <span>📍 {r.specialist_city}</span>}
                                                        {r.specialist_completed_tasks > 0 && <span>✅ {r.specialist_completed_tasks} заказов</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleAssign(viewingResponsesTask, r.specialist_id)} className={btnSignal}>Назначить</button>
                                            </div>
                                            {(r.proposed_price || r.estimated_days) && (
                                                <div className="flex gap-4 mt-2 text-sm font-bold">
                                                    {r.proposed_price && <span className="font-display text-accent-bright">{r.proposed_price} ₽</span>}
                                                    {r.estimated_days && <span className="text-muted uppercase text-xs tracking-wider pt-1">⏱ {r.estimated_days} дн.</span>}
                                                </div>
                                            )}
                                            <p className="text-sm whitespace-pre-wrap mt-3 border-t border-border/60 pt-3 text-ink/85">{r.text}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal for Chat / Workspace */}
                {chatTask && (
                    <div className={modalOverlay}>
                        <div ref={chatRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl h-[80vh] flex flex-col p-6 outline-none focus:ring-2 focus:ring-accent/50`}>
                            <div className="flex justify-between items-center mb-4 border-b border-border pb-4 gap-3 flex-wrap">
                                <div>
                                    <h2 className="font-display font-bold uppercase text-xl flex items-center gap-3 flex-wrap">
                                        Рабочая область
                                        <span className="rounded-full bg-accent/20 text-accent-bright border border-accent/40 text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5">В работе</span>
                                    </h2>
                                    <p className="text-muted font-semibold text-sm mt-1">Заказ: {chatTask.title}</p>
                                </div>
                                <div className="flex gap-2">
                                    {role === 'customer' && (
                                        <button onClick={() => setConfirmingComplete(true)} className={btnSignal}>Завершить заказ</button>
                                    )}
                                    <button onClick={() => {
                                        setChatTask(null);
                                        if (wsRef.current) {
                                            wsRef.current.close();
                                            wsRef.current = null;
                                        }
                                    }} className="w-10 h-10 shrink-0 rounded-lg bg-surface-2 border border-border font-extrabold flex items-center justify-center transition hover:border-border-bright">&times;</button>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-grow overflow-y-auto mb-4 flex flex-col gap-3 p-3 rounded-xl border border-border/60 bg-base/60">
                                {messages.length === 0 ? (
                                    <div className="text-center text-muted/60 my-auto font-display uppercase text-sm">Нет сообщений. Начните общение первым.</div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.sender_id === parseInt(jwtDecode(token).sub);
                                        return (
                                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[75%] px-4 py-2 rounded-2xl ${isMe ? 'bg-accent text-white rounded-br-md' : 'bg-surface-2 border border-border rounded-bl-md'}`}>
                                                    {!isMe && <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">{msg.sender_name}</div>}
                                                    <div className="whitespace-pre-wrap text-sm font-medium">{msg.text}</div>
                                                    <div className={`text-[10px] text-right mt-1 font-semibold ${isMe ? 'text-white/60' : 'text-muted/70'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            {/* Chat Input */}
                            <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-border pt-4">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    className={`${inputCls} flex-grow min-w-0`}
                                    placeholder="Введите сообщение..."
                                />
                                <button type="submit" disabled={!newMessage.trim()} className="bg-accent hover:bg-accent-bright disabled:opacity-40 text-white font-bold px-6 rounded-xl transition hover:glow-accent-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                        <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                                    </svg>
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal for Review */}
                {reviewingTask && (
                    <div className={modalOverlay}>
                        <div ref={reviewRef} tabIndex={-1} className={`${modalPanel} w-full max-w-md p-6 outline-none focus:ring-2 focus:ring-accent/50`}>
                            <h2 className="font-display font-bold uppercase text-xl">{role === 'customer' ? 'Оцените исполнителя' : 'Оцените заказчика'}</h2>
                            <p className="mt-3 text-muted font-semibold">Заказ &laquo;{reviewingTask.title}&raquo; завершен. {role === 'customer' ? 'Как вам работа специалиста?' : 'Как вам работа с этим заказчиком?'}</p>

                            <div className="my-6 flex gap-2 justify-center" onMouseLeave={() => setReviewHover(0)}>
                                {[1, 2, 3, 4, 5].map(star => {
                                    const active = (reviewHover || reviewRating) >= star;
                                    return (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setReviewRating(star)}
                                            onMouseEnter={() => setReviewHover(star)}
                                            className={`w-12 h-12 rounded-xl border text-2xl flex items-center justify-center transition ${active ? 'bg-star/15 border-star/50 text-star scale-110' : 'bg-surface-2 border-border text-muted/30 hover:text-star/70'}`}
                                        >
                                            ★
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="-mt-3 mb-4 text-center text-sm font-bold uppercase tracking-wider text-muted">{reviewRating} / 5</p>

                            <textarea
                                value={reviewComment}
                                onChange={e => setReviewComment(e.target.value)}
                                className={`${inputCls} mb-4`}
                                rows="4"
                                placeholder="Напишите пару слов о том, как всё прошло..."
                            ></textarea>

                            <div className="flex justify-end gap-3">
                                <button onClick={() => setReviewingTask(null)} className={btnGhost}>Пропустить</button>
                                <button onClick={handleSubmitReview} className={btnPrimary}>Оставить отзыв</button>
                            </div>
                        </div>
                    </div>
                )}

                {(showCreateModal || isCreateTaskOpen) && (
                    <CreateTaskModal
                        onClose={() => {
                            setShowCreateModal(false);
                            setCreateTaskOpen(false);
                        }}
                        onTaskCreated={fetchTasks}
                    />
                )}

                {/* Mobile Filter Drawer */}
                <MobileFilterDrawer
                    isOpen={showMobileFilters}
                    onClose={() => setShowMobileFilters(false)}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    cityFilter={cityFilter}
                    setCityFilter={setCityFilter}
                    remoteOnly={remoteOnly}
                    setRemoteOnly={setRemoteOnly}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    categories={CATEGORIES}
                    cities={CITIES}
                    totalCount={tasks.length}
                    activeFiltersCount={
                        (categoryFilter ? 1 : 0) +
                        (cityFilter ? 1 : 0) +
                        (remoteOnly ? 1 : 0) +
                        (sortBy !== "default" ? 1 : 0)
                    }
                    onReset={() => {
                        setCategoryFilter("");
                        setCityFilter("");
                        setRemoteOnly(false);
                        setSortBy("default");
                    }}
                />

                {lightbox && (
                    <Lightbox
                        images={lightbox.images}
                        index={lightbox.index}
                        onClose={() => setLightbox(null)}
                        onNavigate={(i) => setLightbox({ ...lightbox, index: i })}
                    />
                )}

                {confirmingComplete && (
                    <ConfirmDialog
                        title="Завершить заказ?"
                        message={`Заказ «${chatTask?.title}» будет отмечен как завершённый. Средства поступят специалисту.`}
                        confirmText="Завершить"
                        onConfirm={() => handleCompleteTask(chatTask.id)}
                        onClose={() => setConfirmingComplete(false)}
                    />
                )}
            </section>
        </div>
    );
};

export default Feed;
