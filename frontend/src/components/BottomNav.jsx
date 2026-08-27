import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const BottomNav = ({
    viewMode: controlledViewMode,
    setViewMode: controlledSetViewMode,
    unreadMessagesCount = 0,
    unreadNotificationsCount = 0,
    onOpenCreateTask,
    onOpenAuth,
    onOpenDialogs
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { isAuth, role } = useAuthStore();
    const [currentViewMode, setCurrentViewMode] = useState(controlledViewMode || 'list');

    // Sync controlled view mode if passed as prop
    useEffect(() => {
        if (controlledViewMode) {
            setCurrentViewMode(controlledViewMode);
        }
    }, [controlledViewMode]);

    // Listen to global viewMode changes
    useEffect(() => {
        const handleViewModeChange = (e) => {
            if (e.detail) {
                setCurrentViewMode(e.detail);
            }
        };
        window.addEventListener('delo:set-view-mode', handleViewModeChange);
        return () => window.removeEventListener('delo:set-view-mode', handleViewModeChange);
    }, []);

    const isHomePage = location.pathname === '/';
    const isProfilePage = location.pathname === '/profile';

    // Trigger Telegram Haptic Feedback if running inside Telegram WebApp
    const triggerHaptic = (type = 'light') => {
        try {
            if (window.Telegram?.WebApp?.HapticFeedback) {
                if (type === 'selection') {
                    window.Telegram.WebApp.HapticFeedback.selectionChanged();
                } else {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
                }
            }
        } catch {
            // ignore haptic error
        }
    };

    const handleFeedClick = () => {
        triggerHaptic('selection');
        setCurrentViewMode('list');
        if (controlledSetViewMode) {
            controlledSetViewMode('list');
        }
        window.dispatchEvent(new CustomEvent('delo:set-view-mode', { detail: 'list' }));
        if (!isHomePage) {
            navigate('/');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleMapClick = () => {
        triggerHaptic('selection');
        setCurrentViewMode('map');
        if (controlledSetViewMode) {
            controlledSetViewMode('map');
        }
        window.dispatchEvent(new CustomEvent('delo:set-view-mode', { detail: 'map' }));
        if (!isHomePage) {
            navigate('/?view=map');
        }
    };

    const handleCreateClick = () => {
        triggerHaptic('medium');
        if (!isAuth) {
            if (onOpenAuth) {
                onOpenAuth();
            } else {
                window.dispatchEvent(new CustomEvent('delo:open-auth'));
            }
            return;
        }

        if (onOpenCreateTask) {
            onOpenCreateTask();
        } else {
            if (!isHomePage) {
                navigate('/?create=true');
            }
            window.dispatchEvent(new CustomEvent('delo:open-create-task'));
        }
    };

    const handleMessagesClick = () => {
        triggerHaptic('light');
        if (!isAuth) {
            if (onOpenAuth) {
                onOpenAuth();
            } else {
                window.dispatchEvent(new CustomEvent('delo:open-auth'));
            }
            return;
        }

        if (onOpenDialogs) {
            onOpenDialogs();
        } else {
            navigate('/profile', { state: { tab: 'dialogs' } });
            window.dispatchEvent(new CustomEvent('delo:open-chats'));
        }
    };

    const handleProfileClick = () => {
        triggerHaptic('selection');
        if (!isAuth) {
            if (onOpenAuth) {
                onOpenAuth();
            } else {
                window.dispatchEvent(new CustomEvent('delo:open-auth'));
            }
            return;
        }
        navigate('/profile');
    };

    return (
        <nav
            aria-label="Мобильная навигация"
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-border shadow-pop pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 pointer-events-auto"
        >
            <div className="flex items-center justify-around px-2 max-w-lg mx-auto">
                {/* 1. Feed / List */}
                <button
                    type="button"
                    onClick={handleFeedClick}
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] ${
                        isHomePage && currentViewMode === 'list'
                            ? 'text-accent-bright font-bold'
                            : 'text-muted hover:text-ink'
                    }`}
                >
                    <div className="relative">
                        <span className="text-xl">📋</span>
                        {isHomePage && currentViewMode === 'list' && (
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
                        isHomePage && currentViewMode === 'map'
                            ? 'text-accent-bright font-bold'
                            : 'text-muted hover:text-ink'
                    }`}
                >
                    <div className="relative">
                        <span className="text-xl">🗺️</span>
                        {isHomePage && currentViewMode === 'map' && (
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
                        className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent to-[#38BDF8] text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-accent/40 active:scale-90 transition-transform -translate-y-2 border-2 border-surface cursor-pointer"
                    >
                        +
                    </button>
                </div>

                {/* 4. Messages / Chats */}
                <button
                    type="button"
                    onClick={handleMessagesClick}
                    className="flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] text-muted hover:text-ink cursor-pointer"
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
                    className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-all duration-200 active:scale-95 min-w-[56px] cursor-pointer ${
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
