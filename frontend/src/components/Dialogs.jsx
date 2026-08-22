import React, { useCallback, useEffect, useRef } from 'react';

// Esc closes the modal; focus moves into the panel on open
export const useModalBehavior = (onClose) => {
    const ref = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') closeRef.current();
        };
        document.addEventListener('keydown', onKey);
        if (ref.current) ref.current.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    return ref;
};

export const ConfirmDialog = ({ title, message, confirmText = 'Подтвердить', onConfirm, onClose }) => {
    const panelRef = useModalBehavior(onClose);
    return (
        <div className="fixed inset-0 bg-ink/60 flex items-center justify-center p-4 z-[90]">
            <div ref={panelRef} tabIndex={-1} className="bg-paper border-2 border-ink hard-shadow-lg w-full max-w-sm p-6 outline-none focus:ring-2 focus:ring-signal">
                <h3 className="font-display font-bold uppercase text-lg">{title}</h3>
                <p className="mt-3 text-ink/70 font-semibold text-sm">{message}</p>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="inline-flex items-center bg-white text-ink border-2 border-ink px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:hard-shadow-sm">Отмена</button>
                    <button onClick={() => { onConfirm(); onClose(); }} className="inline-flex items-center bg-signal text-white border-2 border-ink px-5 py-2.5 font-display text-xs uppercase tracking-wider transition hover:hard-shadow-sm">{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

export const Lightbox = ({ images, index, onClose, onNavigate }) => {
    const handleKey = useCallback((e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
        if (e.key === 'ArrowRight' && index < images.length - 1) onNavigate(index + 1);
    }, [index, images.length, onClose, onNavigate]);

    useEffect(() => {
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [handleKey]);

    return (
        <div className="fixed inset-0 bg-ink/90 flex items-center justify-center z-[95] p-4" onClick={onClose}>
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="absolute top-4 right-4 w-11 h-11 bg-paper border-2 border-ink font-extrabold text-xl flex items-center justify-center transition hover:hard-shadow-sm"
                aria-label="Закрыть просмотр"
            >
                ×
            </button>

            {images.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); if (index > 0) onNavigate(index - 1); }}
                        disabled={index === 0}
                        className="absolute left-4 w-11 h-11 bg-paper border-2 border-ink font-extrabold text-xl flex items-center justify-center transition hover:hard-shadow-sm disabled:opacity-30"
                        aria-label="Предыдущее фото"
                    >
                        ‹
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); if (index < images.length - 1) onNavigate(index + 1); }}
                        disabled={index === images.length - 1}
                        className="absolute right-4 w-11 h-11 bg-paper border-2 border-ink font-extrabold text-xl flex items-center justify-center transition hover:hard-shadow-sm disabled:opacity-30"
                        aria-label="Следующее фото"
                    >
                        ›
                    </button>
                </>
            )}

            <img
                src={images[index]}
                alt={`Фото ${index + 1} из ${images.length}`}
                className="max-w-full max-h-[85vh] object-contain border-2 border-paper hard-shadow-lg"
                onClick={(e) => e.stopPropagation()}
            />

            {images.length > 1 && (
                <div className="absolute bottom-5 bg-ink text-paper border-2 border-paper px-3 py-1 font-display text-xs">
                    {index + 1} / {images.length}
                </div>
            )}
        </div>
    );
};
