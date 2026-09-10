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


const ProfilePage = () => {
    const { token, role } = useAuthStore();
    const toast = useToast();
    const depositRef = useModalBehavior(() => { if (showDepositModal) setShowDepositModal(false); });
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [city, setCity] = useState('');
    const [phone, setPhone] = useState('');
    const [skills, setSkills] = useState('');
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [rating, setRating] = useState(null);
    const [balance, setBalance] = useState(0);
    const [completedTasks, setCompletedTasks] = useState(0);
    const [verified, setVerified] = useState(false);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [avatar, setAvatar] = useState('');
    const [portfolio, setPortfolio] = useState([]);
    const [paymentsConfigured, setPaymentsConfigured] = useState(false);
    const [responseCredits, setResponseCredits] = useState(0);
    const [isPro, setIsPro] = useState(false);
    const [proUntil, setProUntil] = useState(null);
    const [packages, setPackages] = useState([]);
    const [paymentProcessing, setPaymentProcessing] = useState(false);

    const fetchProfile = () => {
        axios.get(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                setName(res.data.name || '');
                setBio(res.data.bio || '');
                setCity(res.data.city || '');
                setPhone(res.data.phone || '');
                setSkills(res.data.skills || '');
                setEmail(res.data.email);
                setRating(res.data.rating);
                setBalance(res.data.balance || 0);
                setCompletedTasks(res.data.completed_tasks || 0);
                setVerified(res.data.verified || false);
                setAvatar(res.data.avatar || '');
                setPortfolio(res.data.portfolio ? JSON.parse(res.data.portfolio) : []);
                setResponseCredits(res.data.response_credits ?? 0);
                setIsPro(res.data.is_pro || false);
                setProUntil(res.data.pro_until || null);
            })
            .catch(err => console.error("Error fetching profile", err));
    };

    const buyPackage = async (packageId) => {
        try {
            const res = await axios.post(`${API_URL}/monetization/buy`,
                { package_id: packageId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(res.data.message);
            fetchProfile();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка покупки');
        }
    };

    useEffect(() => {
        fetchProfile();

        // Пакеты монетизации для специалистов
        if (role === 'specialist') {
            axios.get(`${API_URL}/monetization/packages`)
                .then(res => setPackages(res.data.packages))
                .catch(() => {});
        }

        // Check if real payments are configured
        axios.get(`${API_URL}/payments/status`)
            .then(res => setPaymentsConfigured(res.data.configured))
            .catch(() => setPaymentsConfigured(false));

        // Handle return from YooKassa payment
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('payment_id');
        if (paymentId) {
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            axios.post(`${API_URL}/payments/confirm?payment_id=${paymentId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                if (res.data.credited) {
                    setMsg('Оплата прошла успешно! Баланс пополнен.');
                    fetchProfile();
                } else if (res.data.status === 'succeeded') {
                    setMsg('Этот платёж уже был зачислен.');
                } else {
                    setMsg('Платёж не завершён. Попробуйте ещё раз.');
                }
                setTimeout(() => setMsg(''), 5000);
            }).catch(() => {
                setMsg('Не удалось проверить статус платежа.');
                setTimeout(() => setMsg(''), 5000);
            });
        }
    }, [token]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/users/me`, { name, bio, city, phone, skills }, { headers: { Authorization: `Bearer ${token}` } });
            setMsg('Профиль успешно сохранен!');
            setTimeout(() => setMsg(''), 3000);
        } catch (err) {
            setMsg('Ошибка сохранения профиля');
        }
    };

    // Demo top-up (instant, no real payment)
    const handleDemoDeposit = async () => {
        if (!depositAmount || depositAmount <= 0) return;
        try {
            await axios.post(`${API_URL}/wallet/deposit`, { amount: parseInt(depositAmount) }, { headers: { Authorization: `Bearer ${token}` } });
            toast.success('Баланс успешно пополнен (демо)!');
            setShowDepositModal(false);
            setDepositAmount('');
            fetchProfile();
        } catch (err) {
            toast.error('Ошибка пополнения баланса');
        }
    };

    // Real payment via YooKassa
    const handleRealPayment = async () => {
        if (!depositAmount || depositAmount <= 0) return;
        setPaymentProcessing(true);
        try {
            const res = await axios.post(`${API_URL}/payments/create`, { amount: parseInt(depositAmount) }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Redirect user to YooKassa payment page
            window.location.href = res.data.confirmation_url;
        } catch (err) {
            toast.error('Ошибка создания платежа: ' + (err.response?.data?.detail || err.message));
            setPaymentProcessing(false);
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        if (paymentsConfigured) {
            await handleRealPayment();
        } else {
            await handleDemoDeposit();
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
            <div className="glass rounded-2xl shadow-card overflow-hidden">
                {/* Header panel */}
                <div className="aurora border-b border-border p-6 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        {avatar ? (
                            <img src={avatar} alt="Аватар" className="w-20 h-20 object-cover rounded-xl border border-border" />
                        ) : (
                            <div className="w-20 h-20 bg-gradient-to-br from-accent to-[#38BDF8] text-white font-display font-bold text-3xl flex items-center justify-center rounded-xl">
                                {getInitial(name, email)}
                            </div>
                        )}
                        <div>
                            <h1 className="font-display font-bold uppercase text-xl md:text-2xl flex items-center gap-2">
                                Мой профиль
                                {verified && <span className="text-accent-bright" title="Проверенный пользователь">✓</span>}
                            </h1>
                            <span className="inline-block mt-2 bg-surface-2 text-ink text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-border">
                                {role === 'specialist' ? '🛠 Специалист' : '🤝 Заказчик'}
                            </span>
                        </div>
                    </div>
                    <div className="bg-surface-2 border border-border rounded-xl px-4 py-2 font-display text-sm flex items-center gap-3">
                        <span>{balance} ₽</span>
                        <button type="button" onClick={() => setShowDepositModal(true)} className="bg-accent text-white w-7 h-7 rounded-full flex items-center justify-center font-extrabold hover:bg-accent-bright hover:glow-accent-sm transition" title="Пополнить баланс">+</button>
                    </div>
                </div>

                {msg && <div className="m-6 mb-0 rounded-xl border border-border bg-surface-2 p-3 font-bold text-sm">{msg}</div>}

                {role === 'specialist' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 pb-0">
                        {rating !== null && (
                            <div className="rounded-xl border border-border bg-surface-2/60 p-4 flex items-center gap-4">
                                <span className="text-3xl">⭐</span>
                                <div>
                                    <div className="font-display font-bold text-xl">{rating} / 5</div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Ваш рейтинг</div>
                                </div>
                            </div>
                        )}
                        <div className="rounded-xl border border-border bg-surface-2/60 p-4 flex items-center gap-4">
                            <span className="text-3xl">📋</span>
                            <div>
                                <div className="font-display font-bold text-xl">{completedTasks}</div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Выполнено заказов</div>
                            </div>
                        </div>
                        <div className="md:col-span-2 rounded-xl border border-accent/30 bg-accent/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1">Уровень мастерства</div>
                                <MasterBadge
                                    level={completedTasks >= 20 && (rating || 0) >= 4.9 ? "expert" : completedTasks >= 10 && (rating || 0) >= 4.7 ? "pro" : completedTasks >= 3 ? "master" : "novice"}
                                    badges={[
                                        { icon: "🛡", label: "Паспорт проверен", desc: "Личность подтверждена" },
                                        { icon: "🤝", label: "Безопасная сделка", desc: "Гарантия выплат" },
                                        { icon: "⚡", label: "Быстрый ответ", desc: "Отвечает за 5 минут" }
                                    ]}
                                />
                            </div>
                            <div className="text-xs font-bold text-accent-bright">
                                {completedTasks < 3 ? "До уровня «Мастер»: еще " + (3 - completedTasks) + " зак." : completedTasks < 10 ? "До уровня «Профи»: еще " + (10 - completedTasks) + " зак." : "Высший статус"}
                            </div>
                        </div>
                    </div>
                )}

                {/* Avatar Uploader */}
                <div className="p-6 border-b border-border/60">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">Аватар</div>
                    <AvatarUploader
                        token={token}
                        currentAvatar={avatar}
                        onUploadSuccess={(url) => {
                            setAvatar(url);
                            setMsg('Аватар успешно обновлён!');
                            setTimeout(() => setMsg(''), 3000);
                        }}
                    />
                </div>

                {/* Portfolio for specialists */}
                {role === 'specialist' && (
                    <div className="p-6 border-b border-border/60">
                        <PortfolioUploader
                            token={token}
                            portfolio={portfolio}
                            onUploadSuccess={(url) => {
                                setPortfolio([...portfolio, url]);
                                setMsg('Работа добавлена в портфолио!');
                                setTimeout(() => setMsg(''), 3000);
                            }}
                        />
                    </div>
                )}

                {/* Монетизация: пакеты откликов и PRO */}
                {role === 'specialist' && (
                    <div className="p-6 border-b border-border/60 dot-grid">
                        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                            <h3 className="font-display font-bold uppercase text-sm">Отклики и PRO</h3>
                            {isPro ? (
                                <span className="text-xs font-bold"><ProBadge /> <span className="ml-2 text-muted">до {(proUntil || '').slice(0, 10)} · отклики безлимит</span></span>
                            ) : (
                                <span className="text-xs font-bold uppercase tracking-wider text-muted">Осталось откликов: {responseCredits}</span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {packages.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => buyPackage(p.id)}
                                    className={`rounded-xl border p-4 text-left transition ${p.type === 'pro' ? 'border-star/40 bg-star/10 hover:border-star/70' : 'border-border bg-surface-2/60 hover:border-accent/50 hover:glow-accent-sm'}`}
                                >
                                    <div className="font-bold flex items-center gap-2">{p.type === 'pro' && <ProBadge />}{p.title}</div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted mt-1">
                                        {p.type === 'responses' ? `${p.credits} откликов` : 'Безлимит откликов · приоритет в списке · значок PRO'}
                                    </div>
                                    <div className="font-display font-bold text-lg mt-2">{p.price} ₽ <span className="font-sans text-[11px] font-bold text-muted uppercase tracking-wider">с баланса</span></div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSave} className="flex flex-col gap-5 p-6">
                    <div>
                        <label className={labelCls}>Ваш Email (Логин)</label>
                        <input type="text" value={email} disabled className="w-full rounded-xl border border-border bg-surface/80 p-3 text-muted cursor-not-allowed font-semibold" />
                    </div>
                    <div>
                        <label className={labelCls}>Имя / Название компании</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Город</label>
                            <CityInput
                                value={city}
                                onChange={setCity}
                                placeholder="Введите или выберите город..."
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Телефон</label>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (900) 123-45-67" className={inputCls} />
                        </div>
                    </div>
                    {role === 'specialist' && (
                        <div>
                            <label className={labelCls}>Навыки и специализации</label>
                            <input type="text" value={skills} onChange={e => setSkills(e.target.value)} placeholder="HTML, CSS, JavaScript, React, Node.js" className={inputCls} />
                            <p className="text-xs text-muted mt-1 font-semibold">Перечислите через запятую</p>
                        </div>
                    )}
                    <div>
                        <label className={labelCls}>О себе / Описание услуг</label>
                        <textarea rows="4" value={bio} onChange={e => setBio(e.target.value)} placeholder={role === 'specialist' ? 'Расскажите о своих навыках и опыте...' : 'Расскажите о вашей компании...'} className={inputCls}></textarea>
                    </div>
                    <button type="submit" className={`${btnPrimary} w-full`}>Сохранить изменения</button>
                </form>
            </div>

            {/* Deposit Modal */}
            {showDepositModal && (
                <div className={modalOverlay}>
                    <div ref={depositRef} tabIndex={-1} className={`${modalPanel} w-full max-w-sm p-6 outline-none focus:ring-2 focus:ring-accent/50`}>
                        <h2 className="font-display font-bold uppercase text-xl">💰 Пополнить баланс</h2>

                        <div className="mt-4 mb-4 p-3 rounded-xl border border-border bg-surface-2 text-sm font-bold">
                            {paymentsConfigured
                                ? '💳 Оплата картой через ЮKassa'
                                : '⚙️ Демо-режим: баланс пополнится мгновенно без реальной оплаты'}
                        </div>

                        <form onSubmit={handleDeposit} className="flex flex-col gap-4">
                            <input type="number" placeholder="Сумма (₽)" required min="1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={paymentProcessing} className={inputCls} />

                            <div className="flex gap-2 flex-wrap">
                                {[500, 1000, 5000].map(sum => (
                                    <button key={sum} type="button" onClick={() => setDepositAmount(String(sum))} className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 font-bold text-sm transition hover:border-accent/60 hover:glow-accent-sm">
                                        {sum} ₽
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3 mt-2">
                                <button type="button" onClick={() => setShowDepositModal(false)} disabled={paymentProcessing} className={btnGhost}>Отмена</button>
                                <button type="submit" disabled={paymentProcessing} className={btnSignal}>
                                    {paymentProcessing ? 'Переход к оплате...' : (paymentsConfigured ? 'Перейти к оплате' : 'Пополнить')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
