import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { jwtDecode } from 'jwt-decode';
import { AvatarUploader, PortfolioUploader } from './components/ImageUploader';
import { TaskMap } from './components/TaskMap';
import { NotificationBell } from './components/NotificationBell';
import { useToast } from './components/Toast';
import { ConfirmDialog, Lightbox, useModalBehavior } from './components/Dialogs';
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

// ---- Design system: shared class recipes (paper & ink, constructivist) ----
const inputCls = "w-full border-2 border-ink bg-white p-3 outline-none focus:ring-2 focus:ring-signal";
const labelCls = "block text-[11px] font-extrabold uppercase tracking-wider text-ink/60 mb-1.5";
const btnPrimary = "inline-flex items-center justify-center gap-2 bg-ink text-paper border-2 border-ink px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:hard-shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5";
const btnGhost = "inline-flex items-center justify-center gap-2 bg-white text-ink border-2 border-ink px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:hard-shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5";
const btnSignal = "inline-flex items-center justify-center gap-2 bg-signal text-white border-2 border-ink px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:hard-shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5";
const modalOverlay = "fixed inset-0 bg-ink/60 flex items-center justify-center p-4 z-50";
const modalPanel = "bg-paper border-2 border-ink hard-shadow-lg";

const chipCls = (active) =>
    `border-2 border-ink px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition hover:hard-shadow-sm ${active ? 'bg-ink text-paper' : 'bg-white text-ink'}`;

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
            <div ref={panelRef} tabIndex={-1} className={`${modalPanel} w-full max-w-sm p-6 md:p-8 outline-none focus:ring-2 focus:ring-signal`}>
                <h2 className="font-display font-bold uppercase text-xl text-center">{isLogin ? 'Вход' : 'Регистрация'}</h2>
                {error && <div className="mt-4 border-2 border-signal bg-signal/10 text-signal p-3 font-bold text-sm">{error}</div>}

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

                    <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-signal font-extrabold text-xs uppercase tracking-wider mt-2 hover:underline underline-offset-4">
                        {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
                    </button>
                </form>
                <button onClick={onClose} className="mt-6 text-ink/40 hover:text-ink font-extrabold text-xs uppercase tracking-widest w-full text-center transition">Закрыть</button>
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

    return (
        <div className={`${modalOverlay} overflow-y-auto`}>
            <div ref={panelRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl my-8 p-6 md:p-8 outline-none focus:ring-2 focus:ring-signal`}>
                <h2 className="font-display font-bold uppercase text-xl md:text-2xl">Новый заказ</h2>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
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

                    <label className="flex items-center gap-3 border-2 border-ink bg-white p-3 cursor-pointer select-none transition hover:hard-shadow-sm">
                        <input type="checkbox" id="isRemote" checked={isRemote} onChange={e => setIsRemote(e.target.checked)} className="w-5 h-5 accent-signal" />
                        <span className="text-sm font-extrabold">Можно выполнить удалённо 🌐</span>
                    </label>

                    {!isRemote && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 grain border-2 border-ink">
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
                    <div className="border-t-2 border-ink pt-4">
                        <label className={labelCls}>Фото задачи (до 5 штук)</label>

                        {uploadedImages.length > 0 && (
                            <div className="grid grid-cols-3 gap-3 mb-3 mt-1">
                                {uploadedImages.map((url, idx) => (
                                    <div key={idx} className="relative group">
                                        <img src={url} alt={`Task ${idx + 1}`} className="w-full h-24 object-cover border-2 border-ink" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-1 right-1 bg-signal text-white w-6 h-6 flex items-center justify-center font-bold opacity-0 group-hover:opacity-100 transition"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {uploadedImages.length < 5 && (
                            <label className={`${uploading ? 'opacity-50 cursor-wait' : 'cursor-pointer'} flex items-center justify-center gap-2 border-2 border-dashed border-ink/40 p-4 hover:border-ink hover:bg-paper-dark transition`}>
                                {uploading ? (
                                    <span className="font-bold text-ink/50">⏳ Загрузка...</span>
                                ) : (
                                    <>
                                        <span className="text-2xl">📷</span>
                                        <span className="font-extrabold">Добавить фото</span>
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
                        <p className="text-xs text-ink/50 mt-1 font-semibold">JPG, PNG, GIF, WebP до 5 МБ каждое</p>
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t-2 border-ink">
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
            })
            .catch(err => console.error("Error fetching profile", err));
    };

    useEffect(() => {
        fetchProfile();

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
            <div className="bg-white border-2 border-ink hard-shadow">
                {/* Header panel */}
                <div className="grain border-b-2 border-ink p-6 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        {avatar ? (
                            <img src={avatar} alt="Аватар" className="w-20 h-20 object-cover border-2 border-ink" />
                        ) : (
                            <div className="w-20 h-20 bg-ink text-paper font-display font-bold text-3xl flex items-center justify-center border-2 border-ink">
                                {getInitial(name, email)}
                            </div>
                        )}
                        <div>
                            <h1 className="font-display font-bold uppercase text-xl md:text-2xl flex items-center gap-2">
                                Мой профиль
                                {verified && <span className="text-signal" title="Проверенный пользователь">✓</span>}
                            </h1>
                            <span className="inline-block mt-2 bg-ink text-paper text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">
                                {role === 'specialist' ? '🛠 Специалист' : '🤝 Заказчик'}
                            </span>
                        </div>
                    </div>
                    <div className="bg-ink text-paper px-4 py-2 font-display text-sm flex items-center gap-3">
                        <span>{balance} ₽</span>
                        <button type="button" onClick={() => setShowDepositModal(true)} className="bg-signal text-white w-7 h-7 flex items-center justify-center font-extrabold hover:hard-shadow-sm transition" title="Пополнить баланс">+</button>
                    </div>
                </div>

                {msg && <div className="m-6 mb-0 border-2 border-ink bg-paper-dark p-3 font-bold text-sm">{msg}</div>}

                {role === 'specialist' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 pb-0">
                        {rating !== null && (
                            <div className="border-2 border-ink bg-white p-4 flex items-center gap-4">
                                <span className="text-3xl">⭐</span>
                                <div>
                                    <div className="font-display font-bold text-xl">{rating} / 5</div>
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50">Ваш рейтинг</div>
                                </div>
                            </div>
                        )}
                        <div className="border-2 border-ink bg-white p-4 flex items-center gap-4">
                            <span className="text-3xl">📋</span>
                            <div>
                                <div className="font-display font-bold text-xl">{completedTasks}</div>
                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50">Выполнено заказов</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Avatar Uploader */}
                <div className="p-6 border-b border-ink/15">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50 mb-3">Аватар</div>
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
                    <div className="p-6 border-b border-ink/15">
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

                <form onSubmit={handleSave} className="flex flex-col gap-5 p-6">
                    <div>
                        <label className={labelCls}>Ваш Email (Логин)</label>
                        <input type="text" value={email} disabled className="w-full border-2 border-ink/30 bg-paper-dark p-3 text-ink/50 cursor-not-allowed font-semibold" />
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
                            <p className="text-xs text-ink/50 mt-1 font-semibold">Перечислите через запятую</p>
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
                    <div ref={depositRef} tabIndex={-1} className={`${modalPanel} w-full max-w-sm p-6 outline-none focus:ring-2 focus:ring-signal`}>
                        <h2 className="font-display font-bold uppercase text-xl">💰 Пополнить баланс</h2>

                        <div className="mt-4 mb-4 p-3 border-2 border-ink text-sm font-bold bg-paper-dark">
                            {paymentsConfigured
                                ? '💳 Оплата картой через ЮKassa'
                                : '⚙️ Демо-режим: баланс пополнится мгновенно без реальной оплаты'}
                        </div>

                        <form onSubmit={handleDeposit} className="flex flex-col gap-4">
                            <input type="number" placeholder="Сумма (₽)" required min="1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={paymentProcessing} className={inputCls} />

                            <div className="flex gap-2 flex-wrap">
                                {[500, 1000, 5000].map(sum => (
                                    <button key={sum} type="button" onClick={() => setDepositAmount(String(sum))} className="px-3 py-1.5 border-2 border-ink bg-white font-extrabold text-sm transition hover:hard-shadow-sm">
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
        case 'open': return <span className="border-2 border-ink bg-white text-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">Открыт</span>;
        case 'in_progress': return <span className="bg-signal text-white border-2 border-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">В работе</span>;
        case 'completed': return <span className="bg-ink text-paper border-2 border-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">Завершён</span>;
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
            await axios.post(`${API_URL}/tasks/${task.id}/responses`,
                {
                    text: responseText,
                    proposed_price: proposedPrice ? parseInt(proposedPrice) : null,
                    estimated_days: estimatedDays ? parseInt(estimatedDays) : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Ваш отклик успешно отправлен заказчику!');
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

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-10">
                <div className="bg-white border-2 border-ink/20 p-6 animate-pulse">
                    <div className="h-7 w-2/3 bg-paper-dark mb-4" />
                    <div className="h-4 w-1/2 bg-paper-dark mb-6" />
                    <div className="h-4 w-full bg-paper-dark mb-2" />
                    <div className="h-4 w-5/6 bg-paper-dark mb-2" />
                    <div className="h-4 w-3/4 bg-paper-dark" />
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Не найдено</div>
                <p className="text-ink/60 mt-3 font-semibold">Такого заказа нет — возможно, его удалили.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← Все заказы</Link>
            </div>
        );
    }

    if (connError) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Нет соединения</div>
                <p className="text-ink/60 mt-3 font-semibold">Сервер не отвечает. Попробуйте ещё раз.</p>
                <button onClick={fetchTask} className={`${btnGhost} mt-6`}>Повторить</button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
            <Link to="/" className="inline-block text-xs font-extrabold uppercase tracking-wider text-ink/60 hover:text-signal transition mb-6">← Все заказы</Link>

            <article className="bg-white border-2 border-ink hard-shadow">
                <div className="p-6 border-b-2 border-ink">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="bg-ink text-paper text-[10px] font-extrabold uppercase tracking-widest px-2 py-1">{getCategoryLabelStandalone(task.category)}</span>
                        {getStatusBadgeStandalone(task.status)}
                    </div>
                    <h1 className="font-extrabold text-2xl md:text-3xl leading-tight mt-4">{task.title}</h1>
                    <div className="flex gap-4 mt-3 text-[11px] font-extrabold uppercase tracking-wide text-ink/50 flex-wrap">
                        {task.is_remote ? <span>🌐 Удалённо</span> : task.city && <span>📍 {task.city}{task.address && `, ${task.address}`}</span>}
                        {task.deadline && <span>📅 До {new Date(task.deadline).toLocaleDateString('ru-RU')}</span>}
                        <span>💬 {task.responses_count} откл.</span>
                    </div>
                </div>

                <div className="p-6">
                    <div className="font-display font-bold text-3xl mb-4">{task.budget} ₽</div>
                    <p className="text-ink/80 whitespace-pre-wrap break-words font-medium">{task.description}</p>

                    {images.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mt-6">
                            {images.map((img, idx) => (
                                <img
                                    key={idx}
                                    src={img}
                                    alt={`Фото ${idx + 1}`}
                                    className="w-full h-28 object-cover border-2 border-ink cursor-pointer transition hover:hard-shadow-sm"
                                    onClick={() => setLightbox({ images, index: idx })}
                                />
                            ))}
                        </div>
                    )}

                    {(task.latitude && task.longitude) && (
                        <div className="mt-6 border-2 border-ink h-[280px]">
                            <TaskMap tasks={[task]} onTaskClick={() => {}} />
                        </div>
                    )}

                    <div className="mt-6 pt-6 border-t-2 border-ink/15 flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50">Заказчик:</span>
                        <Link to={`/user/${task.customer_id}`} className="inline-flex items-center gap-2 border-2 border-ink bg-paper-dark px-3 py-1.5 font-bold text-sm hover:hard-shadow-sm transition">
                            {task.customer_name || `Пользователь №${task.customer_id}`}
                        </Link>
                    </div>
                </div>

                {/* Response form */}
                {task.status === 'open' && (
                    <div className="p-6 border-t-2 border-ink grain">
                        <h3 className="font-display font-bold uppercase text-lg">Откликнуться</h3>
                        {!token ? (
                            <p className="mt-3 text-ink/60 font-semibold text-sm">Войдите как специалист, чтобы отправить отклик.</p>
                        ) : role !== 'specialist' ? (
                            <p className="mt-3 text-ink/60 font-semibold text-sm">Отклики доступны только для аккаунтов специалистов.</p>
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
                <div className="bg-white border-2 border-ink/20 p-6 animate-pulse">
                    <div className="flex gap-4 items-center">
                        <div className="w-20 h-20 bg-paper-dark" />
                        <div className="flex-1"><div className="h-6 w-1/2 bg-paper-dark mb-3" /><div className="h-4 w-1/3 bg-paper-dark" /></div>
                    </div>
                </div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Не найдено</div>
                <p className="text-ink/60 mt-3 font-semibold">Такого пользователя нет.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← На главную</Link>
            </div>
        );
    }

    if (connError) {
        return (
            <div className="max-w-xl mx-auto my-20 text-center px-4">
                <div className="font-display font-bold uppercase text-3xl">Нет соединения</div>
                <p className="text-ink/60 mt-3 font-semibold">Сервер не отвечает.</p>
                <Link to="/" className={`${btnGhost} mt-6`}>← На главную</Link>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10">
            <div className="bg-white border-2 border-ink hard-shadow">
                <div className="grain border-b-2 border-ink p-6 flex items-center gap-5 flex-wrap">
                    {user.avatar ? (
                        <img src={user.avatar} alt="Аватар" className="w-24 h-24 object-cover border-2 border-ink" />
                    ) : (
                        <div className="w-24 h-24 bg-ink text-paper font-display font-bold text-4xl flex items-center justify-center border-2 border-ink">
                            {(user.name || 'П').trim().charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-grow">
                        <h1 className="font-display font-bold uppercase text-xl md:text-2xl flex items-center gap-2 flex-wrap">
                            {user.name || `Пользователь №${user.id}`}
                            {user.verified && <span className="text-signal" title="Проверенный">✓</span>}
                        </h1>
                        <div className="flex gap-2 mt-3 flex-wrap">
                            <span className="bg-ink text-paper text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">
                                {user.role === 'specialist' ? '🛠 Специалист' : '🤝 Заказчик'}
                            </span>
                            {user.city && <span className="border-2 border-ink bg-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">📍 {user.city}</span>}
                            {user.rating !== null && <span className="border-2 border-ink bg-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">⭐ {user.rating} / 5</span>}
                            {user.role === 'specialist' && <span className="border-2 border-ink bg-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1">📋 {user.completed_tasks} заказов</span>}
                        </div>
                    </div>
                </div>

                {user.bio && (
                    <div className="p-6 border-b border-ink/15">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50 mb-2">О себе</div>
                        <p className="text-ink/80 whitespace-pre-wrap break-words font-medium">{user.bio}</p>
                    </div>
                )}

                {skills.length > 0 && (
                    <div className="p-6 border-b border-ink/15">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50 mb-3">Навыки</div>
                        <div className="flex flex-wrap gap-2">
                            {skills.map((s, i) => (
                                <span key={i} className="bg-ink text-paper text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1">{s}</span>
                            ))}
                        </div>
                    </div>
                )}

                {portfolio.length > 0 && (
                    <div className="p-6 border-b border-ink/15">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50 mb-3">Портфолио</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {portfolio.map((img, idx) => (
                                <img key={idx} src={img} alt={`Работа ${idx + 1}`} className="w-full h-28 object-cover border-2 border-ink cursor-pointer transition hover:hard-shadow-sm" onClick={() => setLightbox({ images: portfolio, index: idx })} />
                            ))}
                        </div>
                    </div>
                )}

                <div className="p-6">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink/50 mb-4">Отзывы ({reviews.length})</div>
                    {reviews.length === 0 ? (
                        <p className="text-ink/50 font-semibold text-sm">Отзывов пока нет.</p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {reviews.map(r => (
                                <div key={r.id} className="border-2 border-ink bg-paper-dark/50 p-4">
                                    <div className="flex justify-between items-center gap-3 flex-wrap">
                                        <span className="font-extrabold">{r.reviewer_name}</span>
                                        <span className="bg-ink text-paper text-xs font-extrabold px-2 py-0.5">{"★".repeat(r.rating)}</span>
                                    </div>
                                    {r.task_title && (
                                        <Link to={`/task/${r.task_id}`} className="text-xs font-bold text-signal hover:underline mt-1 inline-block">Заказ: {r.task_title}</Link>
                                    )}
                                    {r.comment && <p className="text-sm text-ink/80 mt-2 font-medium">{r.comment}</p>}
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

const Feed = () => {
    const { token, role } = useAuthStore();
    const toast = useToast();
    const [selectedTask, setSelectedTask] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [remoteOnly, setRemoteOnly] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
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
            await axios.post(`${API_URL}/tasks/${selectedTask.id}/responses`,
                {
                    text: responseText,
                    proposed_price: proposedPrice ? parseInt(proposedPrice) : null,
                    estimated_days: estimatedDays ? parseInt(estimatedDays) : null
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Ваш отклик успешно отправлен заказчику!');
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
            setReviewComment('');
        } catch (err) {
            toast.error('Ошибка отправки отзыва.');
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
            case 'open': return <span className="border-2 border-ink bg-white text-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">Открыт</span>;
            case 'in_progress': return <span className="bg-signal text-white border-2 border-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">В работе</span>;
            case 'completed': return <span className="bg-ink text-paper border-2 border-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">Завершён</span>;
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
            <section className="grain border-b-2 border-ink">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16 text-center">
                    <span className="inline-block bg-ink text-paper font-display text-[10px] uppercase tracking-[0.2em] px-3 py-1.5">Маркетплейс услуг</span>
                    <h1 className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-[56px] sm:text-[96px] md:text-[136px] mt-6">
                        ДЕЛО<span className="text-signal">.</span>
                    </h1>
                    <p className="mt-5 text-ink/70 font-semibold max-w-md mx-auto">
                        Найди своего специалиста: 12 категорий · отклики за минуты · безопасная сделка с резервированием средств.
                    </p>

                    <form className="mt-8 flex max-w-lg mx-auto" onSubmit={e => { e.preventDefault(); document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth' }); }}>
                        <input
                            type="text"
                            placeholder="Что нужно сделать?"
                            className="flex-1 min-w-0 border-2 border-r-0 border-ink bg-white p-3 md:p-4 font-medium outline-none focus:ring-2 focus:ring-signal"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        <button type="submit" className="bg-ink text-paper border-2 border-ink px-5 md:px-8 font-display text-[11px] uppercase tracking-wider transition hover:bg-signal hover:border-signal">
                            Найти
                        </button>
                    </form>

                    <div className="mt-5 flex flex-wrap gap-2 justify-center">
                        <button onClick={() => setCategoryFilter('')} className={chipCls(categoryFilter === '')}>Все</button>
                        {CATEGORIES.slice(0, 5).map(cat => (
                            <button key={cat.value} onClick={() => setCategoryFilter(cat.value)} className={chipCls(categoryFilter === cat.value)}>
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 md:mt-10">
                        <img src={deloArt} alt="Фирменный арт ДЕЛО" className="w-full max-w-[260px] md:max-w-[320px] mx-auto aspect-square object-cover border-2 border-ink hard-shadow" />
                    </div>
                </div>
            </section>

            {/* FILTERS — все элементы одной высоты на одной линии */}
            <section className="border-b-2 border-ink bg-paper">
                <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] gap-3 items-center">
                    <select
                        className="h-[50px] w-full border-2 border-ink bg-white px-3 font-semibold outline-none focus:ring-2 focus:ring-signal cursor-pointer"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="">Все категории</option>
                        {CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                    </select>
                    <select
                        className="h-[50px] w-full border-2 border-ink bg-white px-3 font-semibold outline-none focus:ring-2 focus:ring-signal cursor-pointer"
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                    >
                        <option value="">Все города</option>
                        {CITIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <label className="h-[50px] flex items-center gap-3 border-2 border-ink bg-white px-4 cursor-pointer select-none transition hover:hard-shadow-sm">
                        <input
                            type="checkbox"
                            checked={remoteOnly}
                            onChange={(e) => setRemoteOnly(e.target.checked)}
                            className="w-5 h-5 accent-signal"
                        />
                        <span className="font-extrabold text-sm whitespace-nowrap">🌐 Только удалённые</span>
                    </label>
                    <div className="flex gap-3 items-stretch flex-wrap">
                        <select
                            className="h-[50px] flex-1 min-w-[150px] lg:flex-none border-2 border-ink bg-white px-3 font-semibold outline-none focus:ring-2 focus:ring-signal cursor-pointer"
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
                            className={`h-[50px] flex-1 lg:flex-none px-4 border-2 border-ink font-display text-[11px] uppercase tracking-wider transition hover:hard-shadow-sm ${viewMode === 'list' ? 'bg-ink text-paper' : 'bg-white text-ink'}`}
                        >
                            📋 Список
                        </button>
                        <button
                            onClick={() => setViewMode('map')}
                            className={`h-[50px] flex-1 lg:flex-none px-4 border-2 border-ink font-display text-[11px] uppercase tracking-wider transition hover:hard-shadow-sm ${viewMode === 'map' ? 'bg-ink text-paper' : 'bg-white text-ink'}`}
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
                        <span className="bg-paper-dark border-2 border-ink text-xs font-extrabold px-2 py-0.5">{tasks.length}</span>
                    </h2>
                    {role === 'customer' && (
                        <button onClick={() => setShowCreateModal(true)} className={btnPrimary}>+ Создать заказ</button>
                    )}
                </div>

                {viewMode === 'map' ? (
                    <div className="border-2 border-ink h-[600px]">
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
 <div key={i} className="bg-white border-2 border-ink/20 p-5 flex flex-col animate-pulse">
 <div className="flex gap-3 mb-3"><div className="bg-paper-dark h-6 w-24" /><div className="bg-paper-dark h-6 w-16" /></div>
 <div className="bg-paper-dark h-6 w-3/4 mb-2" /><div className="bg-paper-dark h-4 w-1/3 mb-4" />
 <div className="flex-1 bg-paper-dark h-4 mb-1" /><div className="bg-paper-dark h-4 w-2/3 mb-4" />
 <div className="border-t-2 border-ink/10 pt-4 flex justify-between"><div className="bg-paper-dark h-6 w-20" /><div className="bg-paper-dark h-9 w-32" /></div>
 </div>
 ))
 ) : connError ? (
 <div className="md:col-span-2 border-2 border-signal bg-signal/5 py-14 text-center">
 <div className="font-display font-bold uppercase text-2xl text-signal">Нет соединения</div>
 <p className="text-ink/60 mt-2 font-semibold">Сервер не отвечает. Проверьте, запущен ли бэкенд.</p>
 <button onClick={fetchTasks} className={`${btnGhost} mt-5`}>Повторить</button>
 </div>
 ) : tasks.length === 0 ? (
                            <div className="md:col-span-2 border-2 border-dashed border-ink/40 bg-paper-dark/50 py-16 text-center">
                                <div className="font-display font-bold uppercase text-2xl">Пока пусто</div>
                                <p className="text-ink/60 mt-2 font-semibold">Заказов по этим фильтрам не найдено — попробуйте изменить условия.</p>
                            </div>
                        ) : (
                            [...tasks].sort((a, b) => {
                                if (sortBy === 'budget_desc') return (b.budget || 0) - (a.budget || 0);
                                if (sortBy === 'budget_asc') return (a.budget || 0) - (b.budget || 0);
                                if (sortBy === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                                if (sortBy === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                                return 0;
                            }).slice(0, visibleCount).map(t => (
                                <article key={t.id} className="bg-white border-2 border-ink p-5 flex flex-col transition duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:hard-shadow">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="bg-ink text-paper text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 truncate">{getCategoryLabel(t.category)}</span>
                                        {getStatusBadge(t.status)}
                                    </div>
                                    <h3 className="font-extrabold text-lg leading-snug mt-3 break-words">
                                        <Link to={`/task/${t.id}`} className="hover:text-signal transition">{t.title}</Link>
                                    </h3>
                                    <div className="flex gap-4 mt-2 text-[11px] font-extrabold uppercase tracking-wide text-ink/50 flex-wrap">
                                        {t.is_remote ? (
                                            <span>🌐 Удалённо</span>
                                        ) : t.city && (
                                            <span className="truncate">📍 {t.city}{t.address && `, ${t.address}`}</span>
                                        )}
                                        {t.deadline && (
                                            <span>📅 До {new Date(t.deadline).toLocaleDateString('ru-RU')}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-ink/70 mt-3 mb-4 whitespace-pre-wrap break-words line-clamp-3 flex-grow">{t.description}</p>

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
                                            className="w-full h-20 object-cover border-2 border-ink cursor-pointer transition hover:hard-shadow-sm"
                                            onClick={() => setLightbox({ images: imgs, index: idx })}
                                        />
                                    ))}
                                </div>
                                );
                            })()}

                                    <div className="flex justify-between items-center border-t-2 border-ink pt-4 gap-3 flex-wrap">
                                        <span className="font-display font-bold text-lg">{t.budget} ₽</span>

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
                                            </div>
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
                        <div ref={responseRef} tabIndex={-1} className={`${modalPanel} w-full max-w-lg p-6 outline-none focus:ring-2 focus:ring-signal`}>
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
                        <div ref={responsesRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl max-h-[80vh] flex flex-col p-6 outline-none focus:ring-2 focus:ring-signal`}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="font-display font-bold uppercase text-xl">Отклики исполнителей</h2>
                                <button onClick={() => setViewingResponsesTask(null)} className="w-9 h-9 bg-white border-2 border-ink font-extrabold flex items-center justify-center transition hover:hard-shadow-sm">&times;</button>
                            </div>

                            <div className="overflow-y-auto pr-2 flex-grow">
                                {taskResponses.length === 0 ? (
                                    <div className="text-center py-12 border-2 border-dashed border-ink/40">
                                        <div className="font-display font-bold uppercase text-lg">Тишина</div>
                                        <p className="text-ink/60 mt-2 font-semibold">На этот заказ пока нет откликов.</p>
                                    </div>
                                ) : (
                                    taskResponses.map(r => (
                                        <div key={r.id} className="border-2 border-ink p-4 mb-4 bg-white">
                                            <div className="flex justify-between items-start mb-2 gap-3 flex-wrap">
                                                <div>
                                                    <h3 className="font-extrabold text-lg flex items-center gap-2 flex-wrap">
                                                        {r.specialist_name}
                                                        {r.specialist_verified && (
                                                            <span className="text-signal" title="Проверенный">✓</span>
                                                        )}
                                                        {r.specialist_rating !== null && r.specialist_rating !== undefined && (
                                                            <span className="bg-paper-dark border-2 border-ink text-[11px] font-extrabold px-2 py-0.5">
                                                                ⭐ {r.specialist_rating}
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="flex gap-3 text-xs font-semibold text-ink/50 mt-1 flex-wrap">
                                                        <span>{r.specialist_email}</span>
                                                        {r.specialist_city && <span>📍 {r.specialist_city}</span>}
                                                        {r.specialist_completed_tasks > 0 && <span>✅ {r.specialist_completed_tasks} заказов</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleAssign(viewingResponsesTask, r.specialist_id)} className={btnSignal}>Назначить</button>
                                            </div>
                                            {(r.proposed_price || r.estimated_days) && (
                                                <div className="flex gap-4 mt-2 text-sm font-extrabold">
                                                    {r.proposed_price && <span className="font-display">{r.proposed_price} ₽</span>}
                                                    {r.estimated_days && <span className="text-ink/50 uppercase text-xs tracking-wider pt-1">⏱ {r.estimated_days} дн.</span>}
                                                </div>
                                            )}
                                            <p className="text-sm whitespace-pre-wrap mt-3 border-t-2 border-ink/15 pt-3">{r.text}</p>
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
                        <div ref={chatRef} tabIndex={-1} className={`${modalPanel} w-full max-w-2xl h-[80vh] flex flex-col p-6 outline-none focus:ring-2 focus:ring-signal`}>
                            <div className="flex justify-between items-center mb-4 border-b-2 border-ink pb-4 gap-3 flex-wrap">
                                <div>
                                    <h2 className="font-display font-bold uppercase text-xl flex items-center gap-3 flex-wrap">
                                        Рабочая область
                                        <span className="bg-signal text-white border-2 border-ink text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5">В работе</span>
                                    </h2>
                                    <p className="text-ink/50 font-semibold text-sm mt-1">Заказ: {chatTask.title}</p>
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
                                    }} className="w-10 h-10 shrink-0 bg-white border-2 border-ink font-extrabold flex items-center justify-center transition hover:hard-shadow-sm">&times;</button>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-grow overflow-y-auto mb-4 flex flex-col gap-3 p-2 bg-paper-dark border-2 border-ink/30">
                                {messages.length === 0 ? (
                                    <div className="text-center text-ink/40 my-auto font-display uppercase text-sm">Нет сообщений. Начните общение первым.</div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.sender_id === parseInt(jwtDecode(token).sub);
                                        return (
                                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[75%] px-4 py-2 border-2 ${isMe ? 'bg-ink text-paper border-ink' : 'bg-white border-ink'}`}>
                                                    {!isMe && <div className="text-[10px] font-extrabold uppercase tracking-widest text-ink/40 mb-1">{msg.sender_name}</div>}
                                                    <div className="whitespace-pre-wrap text-sm font-medium">{msg.text}</div>
                                                    <div className={`text-[10px] text-right mt-1 font-semibold ${isMe ? 'text-paper/50' : 'text-ink/40'}`}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            {/* Chat Input */}
                            <form onSubmit={handleSendMessage} className="flex gap-2 border-t-2 border-ink pt-4">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    className={`${inputCls} flex-grow min-w-0`}
                                    placeholder="Введите сообщение..."
                                />
                                <button type="submit" disabled={!newMessage.trim()} className="bg-ink hover:bg-signal disabled:bg-ink/30 text-paper font-bold px-6 border-2 border-ink transition">
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
                        <div ref={reviewRef} tabIndex={-1} className={`${modalPanel} w-full max-w-md p-6 outline-none focus:ring-2 focus:ring-signal`}>
                            <h2 className="font-display font-bold uppercase text-xl">Оцените исполнителя</h2>
                            <p className="mt-3 text-ink/60 font-semibold">Заказ &laquo;{reviewingTask.title}&raquo; завершен. Как вам работа специалиста?</p>

                            <div className="my-6 flex gap-2 justify-center">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        onClick={() => setReviewRating(star)}
                                        className={`w-12 h-12 border-2 border-ink text-2xl flex items-center justify-center transition hover:hard-shadow-sm ${reviewRating >= star ? 'bg-ink text-paper' : 'bg-white text-ink/25'}`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>

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

                {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} onTaskCreated={fetchTasks} />}

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
    const [showAuthModal, setShowAuthModal] = useState(false);

    return (
        <BrowserRouter>
            <div className="min-h-screen flex flex-col bg-paper text-ink font-sans">
                <nav className="bg-paper border-b-2 border-ink sticky top-0 z-40">
                    <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex justify-between items-center gap-3 md:gap-6">
                        <Link to="/" className="font-display font-extrabold text-base sm:text-lg md:text-xl tracking-tight shrink-0">
                            ДЕЛО<span className="text-signal">.</span>
                        </Link>
                        {isAuth ? (
                            <div className="flex gap-3 md:gap-5 items-center">
                                <Link to="/profile" className="font-extrabold text-xs uppercase tracking-wider hover:text-signal transition">Профиль</Link>
                                <span className="hidden md:inline bg-ink text-paper text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1.5">
                                    {role === 'customer' ? '🤝 Заказчик' : '🛠 Специалист'}
                                </span>
                                <NotificationBell token={token} />
                                <button onClick={logout} className="text-signal font-extrabold text-xs uppercase tracking-wider hover:underline underline-offset-4 transition">Выйти</button>
                            </div>
                        ) : (
                            <button onClick={() => setShowAuthModal(true)} className="bg-ink text-paper border-2 border-ink px-4 md:px-5 py-2 font-display text-[11px] uppercase tracking-wider transition hover:hard-shadow-sm hover:-translate-x-0.5 hover:-translate-y-0.5">
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
                        <Route path="/profile" element={isAuth ? <ProfilePage /> : (
                            <div className="max-w-xl mx-auto my-24 text-center px-4">
                                <div className="font-display font-bold uppercase text-3xl">Только для своих</div>
                                <p className="text-ink/60 mt-3 font-semibold">Войдите, чтобы просматривать профиль.</p>
                            </div>
                        )} />
                    </Routes>
                </main>

                <footer className="bg-ink text-paper mt-16">
                    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 grid gap-8 md:grid-cols-3">
                        <div>
                            <div className="font-display font-extrabold text-lg">ДЕЛО<span className="text-signal">.</span></div>
                            <p className="text-paper/60 text-sm mt-3 font-medium max-w-xs">Маркетплейс услуг: находите проверенных специалистов для любого дела.</p>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[10px] font-extrabold uppercase tracking-widest text-paper/50 mb-3">Категории</div>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map(c => (
                                    <span key={c.value} className="border border-paper/30 text-paper/80 text-[11px] font-bold uppercase tracking-wide px-2 py-1">{c.label}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-paper/15">
                        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 text-xs text-paper/50 font-medium">© 2026 ДЕЛО — маркетплейс услуг</div>
                    </div>
                </footer>

                {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            </div>
        </BrowserRouter>
    );
}
