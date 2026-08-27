import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const BottomNav = ({
    viewMode,
    setViewMode,
    unreadMessagesCount = 0,
    unreadNotificationsCount = 0,
    isAuth = false,
    role = 'specialist',
    onOpenCreateTask,
    onOpenAuth,
    onOpenDialogs
}) => {
    const location = useLocation();
    const navigate = useNavigate();

    const isHomePage = location.pathname === '/';
    const isProfilePage = location.pathname === '/profile';

    const handleFeedClick = () => {
        if (!isHomePage) {
            navigate('/');
        }
        setViewMode('list');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleMapClick = () => {
        if (!isHomePage) {
            navigate('/');
        }
        setViewMode('map');
    };

    const handleCreateClick = () => {
        if (!isAuth) {
            onOpenAuth();
            return;
        }
        if (role === 'customer') {
            onOpenCreateTask();
        } else {
            // If specialist, navigate to feed or alert
            onOpenCreateTask();
        }
    };

    const handleMessagesClick = () => {
        if (!isAuth) {
            onOpenAuth();
            return;
        }
        if (onOpenDialogs) {
            onOpenDialogs();
        }
    };

    const handleProfileClick = () => {
        if (!isAuth) {
            onOpenAuth();
            return;
        }
        navigate('/profile');
    };

    return (
        <nav
            aria-label="Мобильная навигация"
            className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-border shadow-pop pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
        >
            <div className="flex items-center justify-around px-2 max-w-lg mx-auto">
                {/* 1. Feed / List */}
                <button
                    type="button"
                    onClick={handleFeedClick}
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] ${
                        isHomePage && viewMode === 'list'
                            ? 'text-accent-bright font-bold'
                            : 'text-muted hover:text-ink'
                    }`}
                >
                    <div className="relative">
                        <span className="text-xl">📋</span>
                        {isHomePage && viewMode === 'list' && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent glow-accent-sm"></span>
                        )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider mt-0.5">Заказы</span>
                </button>

                {/* 2. Map */}
                <button
                    type="button"
                    onClick={handleMapClick}
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] ${
                        isHomePage && viewMode === 'map'
                            ? 'text-accent-bright font-bold'
                            : 'text-muted hover:text-ink'
                    }`}
                >
                    <div className="relative">
                        <span className="text-xl">🗺️</span>
                        {isHomePage && viewMode === 'map' && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent glow-accent-sm"></span>
                        )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider mt-0.5">Карта</span>
                </button>

                {/* 3. Center Action: Create task */}
                <div className="flex-1 flex justify-center items-center py-1 min-w-[56px]">
                    <button
                        type="button"
                        onClick={handleCreateClick}
                        title="Создать заказ"
                        className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent to-[#38BDF8] text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-accent/40 active:scale-90 transition-transform -translate-y-2 border-2 border-surface"
                    >
                        +
                    </button>
                </div>

                {/* 4. Messages / Chats */}
                <button
                    type="button"
                    onClick={handleMessagesClick}
                    className="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] text-muted hover:text-ink"
                >
                    <div className="relative">
                        <span className="text-xl">💬</span>
                        {unreadMessagesCount > 0 && (
                            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-surface animate-pulse">
                                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider mt-0.5">Чаты</span>
                </button>

                {/* 5. Profile */}
                <button
                    type="button"
                    onClick={handleProfileClick}
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] ${
                        isProfilePage
                            ? 'text-accent-bright font-bold'
                            : 'text-muted hover:text-ink'
                    }`}
                >
                    <div className="relative">
                        <span className="text-xl">👤</span>
                        {unreadNotificationsCount > 0 && !isProfilePage && (
                            <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-accent rounded-full animate-ping"></span>
                        )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider mt-0.5">
                        {isAuth ? 'Профиль' : 'Войти'}
                    </span>
                </button>
            </div>
        </nav>
    );
};
