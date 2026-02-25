import { create } from 'zustand';
import { User, DirectMessage, Friend, FriendRequest } from '../types';

/* ── Call types ────────────────────────────────────────────────────────── */
export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';
export type CallType = 'voice' | 'video';

export interface CallInfo {
  peerId: string;           // remote user id
  peerUsername: string;
  peerAvatar?: string;
  callType: CallType;
}

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
  blockedUserIds: string[];
  setFriends: (friends: Friend[]) => void;
  setCurrentFriend: (friend: Friend | null) => void;
  addFriend: (friend: Friend) => void;
  removeFriend: (friendId: string) => void;
  setFriendRequests: (requests: FriendRequest[]) => void;
  addFriendRequest: (request: FriendRequest) => void;
  removeFriendRequest: (requestId: string) => void;
  setBlockedUserIds: (ids: string[]) => void;
  addBlockedUserId: (id: string) => void;
  removeBlockedUserId: (id: string) => void;

  // Direct Messages
  directMessages: DirectMessage[];
  setDirectMessages: (messages: DirectMessage[]) => void;
  addDirectMessage: (message: DirectMessage) => void;
  updateDirectMessage: (id: string, content: string) => void;
  updateDirectMessageReactions: (id: string, reactions: DirectMessage['reactions']) => void;
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

  // Calls
  callState: CallState;
  callInfo: CallInfo | null;
  pendingCallOffer: any;
  setCallState: (state: CallState) => void;
  setCallInfo: (info: CallInfo | null) => void;
  startOutgoingCall: (info: CallInfo) => void;
  receiveIncomingCall: (info: CallInfo) => void;
  callConnected: () => void;
  endCall: () => void;
  setPendingCallOffer: (data: any) => void;
  clearPendingCallOffer: () => void;
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
  blockedUserIds: [],
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
  setBlockedUserIds: (ids) => set({ blockedUserIds: ids }),
  addBlockedUserId: (id) => set((state) => ({ blockedUserIds: [...state.blockedUserIds.filter(x => x !== id), id] })),
  removeBlockedUserId: (id) => set((state) => ({ blockedUserIds: state.blockedUserIds.filter(x => x !== id) })),

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
  updateDirectMessageReactions: (id, reactions) =>
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.id === id ? { ...dm, reactions } : dm
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
    }),

  // Calls
  callState: 'idle',
  callInfo: null,
  pendingCallOffer: null,
  setCallState: (callState) => set({ callState }),
  setCallInfo: (callInfo) => set({ callInfo }),
  startOutgoingCall: (info) => set({ callState: 'outgoing', callInfo: info }),
  receiveIncomingCall: (info) => set({ callState: 'incoming', callInfo: info }),
  callConnected: () => set({ callState: 'connected' }),
  endCall: () => set({ callState: 'idle', callInfo: null, pendingCallOffer: null }),
  setPendingCallOffer: (data) => set({ pendingCallOffer: data }),
  clearPendingCallOffer: () => set({ pendingCallOffer: null }),
}));
