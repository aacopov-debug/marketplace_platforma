import { create } from 'zustand';

export const useNavStore = create((set) => ({
    viewMode: 'list', // 'list' | 'map'
    setViewMode: (mode) => set({ viewMode: mode }),

    isChatsOpen: false,
    setChatsOpen: (open) => set({ isChatsOpen: open }),

    isAuthOpen: false,
    setAuthOpen: (open) => set({ isAuthOpen: open }),

    isCreateTaskOpen: false,
    setCreateTaskOpen: (open) => set({ isCreateTaskOpen: open }),

    activeChatTask: null,
    setActiveChatTask: (task) => set({ activeChatTask: task }),
}));
