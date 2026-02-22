import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { jwtDecode } from 'jwt-decode';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const AuthModal = ({ onClose }) => {
    const { login } = useAuthStore();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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
                await axios.post(`${API_URL}/register/`, { email, password, role });
                setIsLogin(true);
                setError('Успешная регистрация! Теперь войдите.');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Ошибка авторизации');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-xl w-full max-w-sm">
                <h2 className="text-2xl font-bold mb-6 text-center">{isLogin ? 'Вход' : 'Регистрация'}</h2>
                {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className="border p-3 rounded-lg w-full" />
                    <input type="password" placeholder="Пароль" required value={password} onChange={e => setPassword(e.target.value)} className="border p-3 rounded-lg w-full" />

                    {!isLogin && (
                        <select value={role} onChange={e => setRole(e.target.value)} className="border p-3 rounded-lg w-full">
                            <option value="customer">Заказчик</option>
                            <option value="specialist">Специалист</option>
                        </select>
                    )}

                    <button type="submit" className="bg-blue-600 text-white p-3 rounded-lg font-bold mt-2">
                        {isLogin ? 'Войти' : 'Зарегистрироваться'}
                    </button>

                    <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-blue-600 text-sm mt-2 hover:underline">
                        {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
                    </button>
                </form>
                <button onClick={onClose} className="mt-6 text-gray-400 hover:text-gray-600 w-full text-center">Закрыть</button>
            </div>
        </div>
    );
};

const CreateTaskModal = ({ onClose, onTaskCreated }) => {
    const { token } = useAuthStore();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [category, setCategory] = useState('other');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/tasks/`,
                { title, description, budget: parseInt(budget) || 0, category },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onTaskCreated();
            onClose();
        } catch (err) {
            alert('Ошибка при создании заказа');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4">Новый заказ</h2>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input type="text" placeholder="Заголовок (например, Создать логотип)" required value={title} onChange={e => setTitle(e.target.value)} className="border p-3 rounded-lg" />
                    <textarea placeholder="Подробное описание задачи..." required rows="4" value={description} onChange={e => setDescription(e.target.value)} className="border p-3 rounded-lg" />
                    <div className="flex gap-4">
                        <input type="number" placeholder="Бюджет (₽)" required value={budget} onChange={e => setBudget(e.target.value)} className="border p-3 rounded-lg flex-1" />
                        <select value={category} onChange={e => setCategory(e.target.value)} className="border p-3 rounded-lg flex-1 bg-white">
                            <option value="design">Дизайн</option>
                            <option value="development">Разработка</option>
                            <option value="writing">Тексты</option>
                            <option value="repairs">Ремонт</option>
                            <option value="other">Другое</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 rounded-lg font-medium hover:bg-gray-300">Отмена</button>
                        <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Создать</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ProfilePage = () => {
    const { token, role } = useAuthStore();
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [rating, setRating] = useState(null);
    const [balance, setBalance] = useState(0);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');

    const fetchProfile = () => {
        axios.get(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                setName(res.data.name || '');
                setBio(res.data.bio || '');
                setEmail(res.data.email);
                setRating(res.data.rating);
                setBalance(res.data.balance || 0);
            })
            .catch(err => console.error("Error fetching profile", err));
    };

    useEffect(() => {
        fetchProfile();
    }, [token]);

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            await axios.put(`${API_URL}/users/me`, { name, bio }, { headers: { Authorization: `Bearer ${token}` } });
            setMsg('Профиль успешно сохранен!');
            setTimeout(() => setMsg(''), 3000);
        } catch (err) {
            setMsg('Ошибка сохранения профиля');
        }
    };

    const handleDeposit = async (e) => {
        e.preventDefault();
        if (!depositAmount || depositAmount <= 0) return;
        try {
            await axios.post(`${API_URL}/wallet/deposit`, { amount: parseInt(depositAmount) }, { headers: { Authorization: `Bearer ${token}` } });
            alert('Баланс успешно пополнен!');
            setShowDepositModal(false);
            setDepositAmount('');
            fetchProfile();
        } catch (err) {
            alert('Ошибка пополнения баланса');
        }
    };

    return (
        <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-xl border shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Мой профиль</h1>
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                    <span>Баланс: {balance} ₽</span>
                    <button type="button" onClick={() => setShowDepositModal(true)} className="bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700 transition">+</button>
                </div>
            </div>
            {msg && <div className="mb-4 p-3 bg-blue-100 text-blue-800 rounded-lg font-medium">{msg}</div>}

            {role === 'specialist' && rating !== null && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
                    <span className="text-3xl">⭐</span>
                    <div>
                        <div className="font-bold text-yellow-800 text-lg">Ваш рейтинг: {rating} / 5</div>
                        <div className="text-sm text-yellow-600">На основе выполненных заказов</div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave} className="flex flex-col gap-5">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Ваш Email (Логин)</label>
                    <input type="text" value={email} disabled className="w-full border p-3 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Имя / Название компании</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">О себе / Описание услуг</label>
                    <textarea rows="4" value={bio} onChange={e => setBio(e.target.value)} placeholder={role === 'specialist' ? 'Расскажите о своих навыках и опыте...' : 'Расскажите о вашей компании...'} className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
                </div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition mt-2">Сохранить изменения</button>
            </form>

            {/* Deposit Modal */}
            {showDepositModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-sm shadow-2xl">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">💰 Пополнить баланс</h2>
                        <form onSubmit={handleDeposit} className="flex flex-col gap-4">
                            <input type="number" placeholder="Сумма (₽)" required min="1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="border p-3 rounded-lg w-full focus:ring-2 focus:ring-green-500 outline-none" />
                            <div className="flex justify-end gap-3 mt-2">
                                <button type="button" onClick={() => setShowDepositModal(false)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition">Отмена</button>
                                <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition flex items-center gap-2">Оплатить</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const Feed = () => {
    const { token, role } = useAuthStore();
    const [selectedTask, setSelectedTask] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // For specialists applying
    const [responseText, setResponseText] = useState('');

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
        const params = new URLSearchParams();
        if (categoryFilter) params.append('category', categoryFilter);
        if (searchQuery) params.append('search', searchQuery);

        axios.get(`${API_URL}/tasks/?${params.toString()}`)
            .then(res => setTasks(res.data))
            .catch(err => console.error("Error fetching tasks:", err));
    };

    useEffect(() => {
        fetchTasks();
    }, [categoryFilter, searchQuery]);

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

        // Construct WebSocket URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = API_URL.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${wsHost}/ws/tasks/${chatTask.id}?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => console.log("WebSocket connected for task", chatTask.id);

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
                { text: responseText },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            alert('Ваш отклик успешно отправлен заказчику!');
            setSelectedTask(null);
            setResponseText('');
        } catch (err) {
            alert('Ошибка отправки отклика. Вы авторизованы?');
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
            alert('Не удалось загрузить отклики.');
        }
    };

    const handleAssign = async (taskId, specialistId) => {
        try {
            await axios.put(`${API_URL}/tasks/${taskId}/assign?specialist_id=${specialistId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Исполнитель назначен! Средства зарезервированы.');
            setViewingResponsesTask(null);
            fetchTasks(); // refresh task list to see status change
        } catch (err) {
            if (err.response?.status === 400 && err.response?.data?.detail === 'Недостаточно средств для безопасной сделки') {
                alert('Ошибка: Недостаточно средств для безопасной сделки.\nПожалуйста, пополните баланс в профиле.');
            } else {
                alert('Ошибка назначения исполнителя.');
            }
        }
    };

    const handleCompleteTask = async (taskId) => {
        if (!confirm('Вы уверены, что хотите завершить этот заказ?')) return;
        try {
            await axios.put(`${API_URL}/tasks/${taskId}/complete`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Заказ завершен! Пожалуйста, оставьте отзыв.');
            setReviewingTask(chatTask);
            setChatTask(null);
            fetchTasks(); // refresh task list
        } catch (err) {
            alert('Ошибка завершения заказа.');
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
            alert('Спасибо за ваш отзыв!');
            setReviewingTask(null);
            setReviewRating(5);
            setReviewComment('');
        } catch (err) {
            alert('Ошибка отправки отзыва.');
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
            alert('Ошибка отправки сообщения.');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'open': return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full border border-blue-200">Открыт</span>;
            case 'in_progress': return <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full border border-yellow-200">В работе</span>;
            case 'completed': return <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full border border-green-200">Завершен</span>;
            default: return null;
        }
    };

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Лента заказов</h1>
                {role === 'customer' && (
                    <button onClick={() => setShowCreateModal(true)} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition">
                        + Создать заказ
                    </button>
                )}
            </div>

            <div className="mb-6 flex flex-col md:flex-row gap-4">
                <input
                    type="text"
                    placeholder="Поиск по заголовку или описанию..."
                    className="flex-grow border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                    className="border border-gray-300 p-3 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="">Все категории</option>
                    <option value="design">Дизайн</option>
                    <option value="development">Разработка</option>
                    <option value="writing">Тексты</option>
                    <option value="repairs">Ремонт</option>
                    <option value="other">Другое</option>
                </select>
            </div>

            <div className="flex flex-col gap-4">
                {tasks.length === 0 ? (
                    <div className="text-center text-gray-500 py-10 bg-gray-50 rounded-xl border border-dashed">Пока нет активных заказов.</div>
                ) : (
                    tasks.map(t => (
                        <div key={t.id} className="border border-gray-200 p-6 rounded-xl shadow-sm bg-white hover:shadow-md transition">
                            <div className="flex justify-between items-start">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                    {t.title}
                                    {getStatusBadge(t.status)}
                                </h2>
                            </div>
                            <p className="text-gray-600 mt-3 mb-4 whitespace-pre-wrap">{t.description}</p>
                            <div className="flex justify-between items-center border-t pt-4">
                                <span className="font-bold text-lg text-green-700">{t.budget} ₽</span>

                                {role === 'specialist' && t.status === 'open' && (
                                    <button onClick={() => setSelectedTask(t)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium transition">Откликнуться</button>
                                )}
                                {role === 'specialist' && t.status === 'in_progress' && t.executor_id === parseInt(jwtDecode(token).sub) && (
                                    <button onClick={() => setChatTask(t)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg font-medium transition">Рабочая область</button>
                                )}
                                {role === 'customer' && t.customer_id === parseInt(jwtDecode(token).sub) && (
                                    <div className="flex gap-2">
                                        {t.status === 'open' && (
                                            <button onClick={() => loadResponses(t.id)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-5 py-2 rounded-lg font-medium border transition">Смотреть отклики</button>
                                        )}
                                        {t.status === 'in_progress' && (
                                            <button onClick={() => setChatTask(t)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg font-medium transition">Перейти в чат</button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal for Specialist to Write Response */}
            {selectedTask && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">Отклик на: {selectedTask.title}</h2>
                        <textarea value={responseText} onChange={e => setResponseText(e.target.value)} className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none" rows="5" placeholder="Напишите сопроводительное письмо заказчику... Расскажите о вашем опыте и предложите цену."></textarea>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setSelectedTask(null)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Отмена</button>
                            <button onClick={handleSendResponse} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">Отправить отклик</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Customer to View Responses */}
            {viewingResponsesTask && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Отклики исполнителей</h2>
                            <button onClick={() => setViewingResponsesTask(null)} className="text-gray-400 hover:text-black text-xl font-bold">&times;</button>
                        </div>

                        <div className="overflow-y-auto pr-2 flex-grow">
                            {taskResponses.length === 0 ? (
                                <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-lg">На этот заказ пока нет откликов.</div>
                            ) : (
                                taskResponses.map(r => (
                                    <div key={r.id} className="border p-4 rounded-xl mb-4 bg-gray-50">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-bold text-lg flex items-center gap-2">
                                                    {r.specialist_name}
                                                    {r.specialist_rating !== null && r.specialist_rating !== undefined && (
                                                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full border border-yellow-200">
                                                            ⭐ {r.specialist_rating}
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-sm text-gray-500">{r.specialist_email}</p>
                                            </div>
                                            <button onClick={() => handleAssign(viewingResponsesTask, r.specialist_id)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition">Назначить</button>
                                        </div>
                                        <p className="text-gray-800 whitespace-pre-wrap mt-3 border-t pt-3">{r.text}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Chat / Workspace */}
            {chatTask && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-2xl shadow-2xl h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4 border-b pb-4">
                            <div>
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    Рабочая область
                                    <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full border border-yellow-200">В работе</span>
                                </h2>
                                <p className="text-gray-500">Заказ: {chatTask.title}</p>
                            </div>
                            <div className="flex gap-2">
                                {role === 'customer' && (
                                    <button onClick={() => handleCompleteTask(chatTask.id)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold transition text-sm">Завершить заказ</button>
                                )}
                                <button onClick={() => {
                                    setChatTask(null);
                                    if (wsRef.current) {
                                        wsRef.current.close();
                                        wsRef.current = null;
                                    }
                                }} className="text-gray-400 hover:text-black bg-gray-100 w-10 h-10 rounded-full flex items-center justify-center font-bold transition">&times;</button>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-grow overflow-y-auto mb-4 flex flex-col gap-3 p-2 bg-gray-50 rounded-lg border">
                            {messages.length === 0 ? (
                                <div className="text-center text-gray-400 my-auto text-sm">Нет сообщений. Начните общение первым.</div>
                            ) : (
                                messages.map(msg => {
                                    const isMe = msg.sender_id === parseInt(jwtDecode(token).sub);
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border rounded-tl-none'}`}>
                                                {!isMe && <div className="text-xs font-bold text-gray-400 mb-1">{msg.sender_name}</div>}
                                                <div className="whitespace-pre-wrap">{msg.text}</div>
                                                <div className={`text-[10px] text-right mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {/* Chat Input */}
                        <form onSubmit={handleSendMessage} className="flex gap-2 border-t pt-4">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={e => setNewMessage(e.target.value)}
                                className="flex-grow border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Введите сообщение..."
                            />
                            <button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold px-6 py-3 rounded-xl transition">
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h2 className="text-2xl font-bold mb-2">Оцените исполнителя</h2>
                        <p className="mb-6 text-gray-600">Заказ &laquo;{reviewingTask.title}&raquo; завершен. Как вам работа специалиста?</p>

                        <div className="mb-6 flex gap-2 justify-center">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    onClick={() => setReviewRating(star)}
                                    className={`text-5xl transition-transform hover:scale-110 ${reviewRating >= star ? 'text-yellow-400' : 'text-gray-200'}`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={reviewComment}
                            onChange={e => setReviewComment(e.target.value)}
                            className="w-full border border-gray-300 p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                            rows="4"
                            placeholder="Напишите пару слов о том, как всё прошло..."
                        ></textarea>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setReviewingTask(null)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition">Пропустить</button>
                            <button onClick={handleSubmitReview} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">Оставить отзыв</button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} onTaskCreated={fetchTasks} />}
        </div>
    );
};

export default function App() {
    const { isAuth, role, logout } = useAuthStore();
    const [showAuthModal, setShowAuthModal] = useState(false);

    return (
        <BrowserRouter>
            <nav className="p-4 bg-white shadow-sm flex justify-between items-center border-b sticky top-0 z-40">
                <Link to="/" className="font-black text-2xl text-blue-600 tracking-tight">ProfiClone</Link>
                {isAuth ? (
                    <div className="flex gap-6 items-center">
                        <Link to="/profile" className="text-gray-600 font-bold hover:text-blue-600 transition underline underline-offset-4 decoration-2 decoration-transparent hover:decoration-blue-600">Мой профиль</Link>
                        <span className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-600">
                            {role === 'customer' ? '🤝 Заказчик' : '🛠 Специалист'}
                        </span>
                        <button onClick={logout} className="text-red-600 font-bold hover:text-red-800 transition">Выйти</button>
                    </div>
                ) : (
                    <button onClick={() => setShowAuthModal(true)} className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-5 py-2 rounded-lg font-bold transition">Войти / Регистрация</button>
                )}
            </nav>

            <Routes>
                <Route path="/" element={<Feed />} />
                <Route path="/profile" element={isAuth ? <ProfilePage /> : <div className="p-10 text-center text-xl text-gray-500 font-bold">Войдите, чтобы просматривать профиль.</div>} />
            </Routes>

            {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </BrowserRouter>
    );
}
