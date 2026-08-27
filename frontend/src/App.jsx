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
import deloArt from './assets/delo_art.jpg';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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

const CITIES = [
    "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
    "Казань", "Нижний Новгород", "Челябинск", "Самара",
    "Омск", "Ростов-на-Дону", "Уфа", "Красноярск",
    "Воронеж", "Пермь", "Волгоград", "Краснодар"
];

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


const MasterBadge = ({ level = "novice", badges = [] }) => {
    const levelMap = {
        expert: { label: "👑 Эксперт", cls: "from-amber-400 to-yellow-500 text-black shadow-amber-500/20" },
        pro: { label: "⭐ Профи", cls: "from-blue-500 to-cyan-400 text-white shadow-blue-500/20" },
        master: { label: "🔨 Мастер", cls: "from-emerald-500 to-teal-400 text-white shadow-emerald-500/20" },
        novice: { label: "🌱 Новичок", cls: "from-zinc-600 to-zinc-500 text-zinc-100" }
    };
    const info = levelMap[level] || levelMap.novice;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 bg-gradient-to-r ${info.cls} text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm`}>
                {info.label}
            </span>
            {badges.map((b, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 bg-surface-2 border border-border text-ink text-[10px] font-bold px-2 py-0.5 rounded-full" title={b.desc || b.label}>
                    {b.icon} {b.label}
                </span>
            ))}
        </div>
    );
};

const ProBadge = () => (
    <span className="inline-block bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-black text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full align-middle">PRO</span>
);

const getInitial = (name, email) => {
    const src = (name && name.trim()) || email || '?';
    return src.trim().charAt(0).toUpperCase();
};

const AuthModal = ({ onClose }) => {
    const { login } = useAuthStore();
    const toast = useToast();
    const panelRef = useModalBehavior(onClose);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('customer');
    const [error, setError] = useState('');
    const [forgotMode, setForgotMode] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotMsg, setForgotMsg] = useState('');

    const handleForgot = async (e) => {
        e.preventDefault();
        setForgotMsg('');
        try {
            const res = await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail });
            setForgotMsg(res.data.message);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Ошибка отправки');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (isLogin) {
                const params = new URLSearchParams();
                params.append('username', email);
                params.append('password', password);

                const res = await axios.post(`${API_URL}/login`, params);
                login(res.data.access_token, res.data.role);
                onClose();
            } else {
                await axios.post(`${API_URL}/register/`, { email, password, role, name: name || null });
                setIsLogin(true);
                setError('Успешная регистрация! Теперь войдите.');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Ошибка авторизации');
        }
    };

    return (
        <div className={modalOverlay}>
            <div ref={panelRef} tabIndex={-1} className={`${modalPanel} w-full max-w-sm p-6 md:p-8 outline-none focus:ring-2 focus:ring-accent/50`}>
                <h2 className="font-display font-bold uppercase text-xl text-center">{forgotMode ? 'Сброс пароля' : isLogin ? 'Вход' : 'Регистрация'}</h2>
                {error && !forgotMode && <div className="mt-4 rounded-xl border border-danger/40 bg-danger/10 text-danger p-3 font-bold text-sm">{error}</div>}

                {forgotMode ? (
                    <form onSubmit={handleForgot} className="flex flex-col gap-4 mt-6">
                        <p className="text-sm font-semibold text-muted">Введите e-mail - пришлём ссылку для сброса пароля (действует 1 час).</p>
                        <input type="email" placeholder="Email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={inputCls} />
                        <button type="submit" className={`${btnPrimary} w-full mt-2`}>Отправить ссылку</button>
                        {forgotMsg && <div className="rounded-xl border border-border bg-surface-2 p-3 font-bold text-sm">{forgotMsg}</div>}
                        <button type="button" onClick={() => { setForgotMode(false); setForgotMsg(''); }} className="text-accent-bright font-bold text-xs uppercase tracking-wider hover:underline underline-offset-4">
                            ← Вернуться ко входу
                        </button>
                    </form>
                ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
                    {!isLogin && (
                        <input type="text" placeholder="Имя (как вас называть)" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                    )}
                    <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                    <input type="password" placeholder="Пароль" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />

                    {!isLogin && (
                        <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                            <option value="customer">Заказчик</option>
                            <option value="specialist">Специалист</option>
                        </select>
                    )}

                    <button type="submit" className={`${btnPrimary} w-full mt-2`}>
                        {isLogin ? 'Войти' : 'Зарегистрироваться'}
                    </button>

                    <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-accent-bright font-bold text-xs uppercase tracking-wider mt-2 hover:underline underline-offset-4">
                        {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
                    </button>

                    {isLogin && (
                        <button type="button" onClick={() => { setForgotMode(true); setError(''); }} className="text-muted hover:text-ink font-bold text-xs underline underline-offset-4 transition">
                            Забыли пароль?
                        </button>
                    )}
                </form>
                )}
                <button onClick={onClose} className="mt-6 text-muted hover:text-ink font-bold text-xs uppercase tracking-widest w-full text-center transition">Закрыть</button>
            </div>
        </div>
    );
};

const CreateTaskModal = ({ onClose, onTaskCreated }) => {
    const { token } = useAuthStore();
    const toast = useToast();
    const panelRef = useModalBehavior(onClose);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [category, setCategory] = useState('other');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    const [deadline, setDeadline] = useState('');
    const [isRemote, setIsRemote] = useState(false);
    const [uploadedImages, setUploadedImages] = useState([]);
    const [uploading, setUploading] = useState(false);

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Limit to 5 images
        if (uploadedImages.length + files.length > 5) {
            toast.error('Максимум 5 фотографий для задачи');
            return;
        }

        setUploading(true);
        try {
            const uploadPromises = files.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                const res = await axios.post(`${API_URL}/upload/task-image`, formData, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                return res.data.url;
            });

            const urls = await Promise.all(uploadPromises);
            setUploadedImages([...uploadedImages, ...urls]);
        } catch (err) {
            toast.error('Ошибка загрузки изображений: ' + (err.response?.data?.detail || err.message));
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const removeImage = (index) => {
        setUploadedImages(uploadedImages.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/tasks/`,
                {
                    title,
                    description,
                    budget: parseInt(budget) || 0,
                    category,
                    city: city || null,
                    address: address || null,
                    deadline: deadline || null,
                    is_remote: isRemote,
                    images: uploadedImages.length > 0 ? JSON.stringify(uploadedImages) : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onTaskCreated();
            onClose();
        } catch (err) {
            toast.error('Ошибка при создании заказа: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleAITaskApply = (parsedData) => {
        if (parsedData.title) setTitle(parsedData.title);
        if (parsedData.description) setDescription(parsedData.description);
        if (parsedData.budget) setBudget(String(parsedData.budget));
        if (parsedData.category) setCategory(parsedData.category);
        if (parsedData.city) setCity(parsedData.city);
        if (parsedData.address) setAddress(parsedData.address);
        if (parsedData.is_remote !== undefined) setIsRemote(parsedData.is_remote);
        toast.success("Данные от AI подставлены в форму!");
    };

    return (
        <div className={`${modalOverlay} overflow-y-auto`}>
            <div ref={panelRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto my-4 p-6 md:p-8 outline-none focus:ring-2 focus:ring-accent/50`}>
                <div className="flex items-center justify-between gap-4 mb-4">
                    <h2 className="font-display font-bold uppercase text-xl md:text-2xl">Новый заказ</h2>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted bg-surface-2 px-3 py-1 rounded-full border border-border">✨ AI Ускорение</span>
                </div>

                <div className="mb-6">
                    <AITaskAssistant onApplyTask={handleAITaskApply} onCancel={() => {}} />
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
                    <div>
                        <label className={labelCls}>Заголовок *</label>
                        <input type="text" placeholder="Например: Создать логотип для стартапа" required value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
                    </div>

                    <div>
                        <label className={labelCls}>Описание *</label>
                        <textarea placeholder="Подробно опишите задачу, требования и желаемый результат..." required rows="4" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Бюджет (₽) *</label>
                            <input type="number" placeholder="10000" required value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Категория *</label>
                            <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                                {CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3.5 cursor-pointer select-none transition hover:border-border-bright">
                        <input type="checkbox" id="isRemote" checked={isRemote} onChange={e => setIsRemote(e.target.checked)} className="w-5 h-5 accent-accent" />
                        <span className="text-sm font-bold">Можно выполнить удалённо 🌐</span>
                    </label>

                    {!isRemote && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 dot-grid rounded-xl border border-border bg-surface/60">
                            <div className="md:col-span-2">
                                <h3 className="font-display font-bold uppercase text-sm">📍 Место выполнения</h3>
                            </div>
                            <div>
                                <label className={labelCls}>Город</label>
                                <select value={city} onChange={e => setCity(e.target.value)} className={inputCls}>
                                    <option value="">Выберите город</option>
                                    {CITIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Адрес</label>
                                <input type="text" placeholder="ул. Ленина, д. 10" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={labelCls}>Срок выполнения</label>
                        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
                    </div>

                    {/* Image upload section */}
                    <div className="border-t border-border pt-4">
                        <label className={labelCls}>Фото задачи (до 5 штук)</label>

                        {uploadedImages.length > 0 && (
                            <div className="grid grid-cols-3 gap-3 mb-3 mt-1">
                                {uploadedImages.map((url, idx) => (
                                    <div key={idx} className="relative group">
                                        <img src={url} alt={`Task ${idx + 1}`} className="w-full h-24 object-cover rounded-lg border border-border" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            title="Удалить фото"
                                            className="absolute -top-2 -right-2 bg-danger text-white w-7 h-7 rounded-full font-extrabold text-sm flex items-center justify-center transition hover:scale-110"
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {uploadedImages.length < 5 && (
                            <label className={`${uploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'} flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-bright/60 p-4 hover:border-accent/60 hover:bg-surface-2/60 transition`}>
                                {uploading ? (
                                    <span className="font-bold text-muted">⏳ Загрузка...</span>
                                ) : (
                                    <>
                                        <span className="text-2xl">📷</span>
                                        <span className="font-bold">Добавить фото</span>
                                    </>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    disabled={uploading}
                                    className="hidden"
                                />
                            </label>
                        )}
                        <p className="text-xs text-muted mt-1 font-semibold">JPG, PNG, GIF, WebP до 5 МБ каждое</p>
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
                        <button type="button" onClick={onClose} className={btnGhost}>Отмена</button>
                        <button type="submit" className={btnPrimary}>Создать заказ</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

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
                            <select value={city} onChange={e => setCity(e.target.value)} className={inputCls}>
                                <option value="">Выберите город</option>
                                {CITIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
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
        window.addEventListener('delo:set-view-mode', handleSetViewMode);
        window.addEventListener('delo:open-create-task', handleOpenCreateTask);
        window.addEventListener('delo:open-task-chat', handleOpenTaskChat);
        return () => {
            window.removeEventListener('delo:set-view-mode', handleSetViewMode);
            window.removeEventListener('delo:open-create-task', handleOpenCreateTask);
            window.removeEventListener('delo:open-task-chat', handleOpenTaskChat);
        };
    }, [setViewMode, setCreateTaskOpen]);

    // Sync activeChatTask from store
    useEffect(() => {
        if (activeChatTask) {
            setChatTask(activeChatTask);
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
                    <select
                        className="h-[50px] w-full rounded-xl border border-border bg-surface-2 text-ink px-3 font-semibold outline-none focus:border-accent transition cursor-pointer"
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                    >
                        <option value="">Все города</option>
                        {CITIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
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

    // Listen for global open-auth events (from BottomNav, buttons, etc.)
    useEffect(() => {
        const handleOpenAuth = () => {
            setShowAuthModal(true);
            setAuthOpen(true);
        };
        window.addEventListener('delo:open-auth', handleOpenAuth);
        return () => window.removeEventListener('delo:open-auth', handleOpenAuth);
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
