import { create } from 'zustand';
import { User, DirectMessage, Friend, FriendRequest } from '../types';

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  updateUserStatus: (status: 'online' | 'offline' | 'away') => void;

  // Friends
  friends: Friend[];
  currentFriend: Friend | null;
  friendRequests: FriendRequest[];
  setFriends: (friends: Friend[]) => void;
  setCurrentFriend: (friend: Friend | null) => void;
  addFriend: (friend: Friend) => void;
  removeFriend: (friendId: string) => void;
  setFriendRequests: (requests: FriendRequest[]) => void;
  addFriendRequest: (request: FriendRequest) => void;
  removeFriendRequest: (requestId: string) => void;

  // Direct Messages
  directMessages: DirectMessage[];
  setDirectMessages: (messages: DirectMessage[]) => void;
  addDirectMessage: (message: DirectMessage) => void;
  updateDirectMessage: (id: string, content: string) => void;
  removeDirectMessage: (id: string) => void;

  // UI State
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Typing (for DMs)
  typingFriends: Set<string>; // Set of friendIds who are typing
  addTypingFriend: (friendId: string) => void;
  removeTypingFriend: (friendId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  // Auth
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token, isAuthenticated: !!token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      friends: [],
      currentFriend: null,
      friendRequests: [],
      directMessages: []
    });
  },
  updateUserStatus: (status) =>
    set((state) => ({
      user: state.user ? { ...state.user, status } : null
    })),

  // Friends
  friends: [],
  currentFriend: null,
  friendRequests: [],
  setFriends: (friends) => set({ friends }),
  setCurrentFriend: (friend) => set({ currentFriend: friend }),
  addFriend: (friend) => set((state) => ({ friends: [...state.friends, friend] })),
  removeFriend: (friendId) =>
    set((state) => ({
      friends: state.friends.filter((f) => f.id !== friendId),
      currentFriend: state.currentFriend?.id === friendId ? null : state.currentFriend
    })),
  setFriendRequests: (requests) => set({ friendRequests: requests }),
  addFriendRequest: (request) => set((state) => ({ friendRequests: [...state.friendRequests, request] })),
  removeFriendRequest: (requestId) =>
    set((state) => ({
      friendRequests: state.friendRequests.filter((r) => r.id !== requestId)
    })),

  // Direct Messages
  directMessages: [],
  setDirectMessages: (messages) => set({ directMessages: messages }),
  addDirectMessage: (message) => set((state) => ({ directMessages: [...state.directMessages, message] })),
  updateDirectMessage: (id, content) =>
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.id === id ? { ...dm, content, edited: true } : dm
      )
    })),
  removeDirectMessage: (id) =>
    set((state) => ({
      directMessages: state.directMessages.filter((dm) => dm.id !== id)
    })),

  // UI State
  theme: (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    }),
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  // Typing (for DMs)
  typingFriends: new Set(),
  addTypingFriend: (friendId) =>
    set((state) => {
      const newSet = new Set(state.typingFriends);
      newSet.add(friendId);
      return { typingFriends: newSet };
    }),
  removeTypingFriend: (friendId) =>
    set((state) => {
      const newSet = new Set(state.typingFriends);
      newSet.delete(friendId);
      return { typingFriends: newSet };
    })
}));
