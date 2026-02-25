export interface UserRestriction {
  type: 'warning' | 'restriction' | 'ban';
  category?: string; // For warnings: spam, harassment, inappropriate, other
  reason: string;
  issuedAt: Date;
  expiresAt?: Date;
  issuedBy: string; // admin user ID
  issuedByUsername?: string; // admin username for display
}

export interface UserRestrictions {
  canAddFriends?: boolean;
  canAcceptFriends?: boolean;
  canSendMessages?: boolean;
  isBanned?: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  customStatus?: string;
  createdAt: Date;
  status: 'online' | 'offline' | 'away';
  isAdmin?: boolean;
  mustChangePassword?: boolean;
  lastLoginIp?: string;
  lastLoginCountry?: string;
  language?: string;
  restrictions?: UserRestrictions;
  warnings?: UserRestriction[];
  activeRestrictions?: UserRestriction[];
  badges?: string[];
  hasDmxBoost?: boolean;
  dmxBoostExpiresAt?: Date;
  profileColorTop?: string;
  profileColorBottom?: string;
  emailVerified?: boolean;
  emailVerificationCode?: string;
  emailVerificationExpires?: Date;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  icon?: string;
  inviteCode: string;
  createdAt: Date;
  members: string[]; // user IDs
  channels: Channel[];
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  description?: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  userAvatar?: string;
  content: string;
  createdAt: Date;
  edited?: boolean;
  editedAt?: Date;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderUsername: string;
  senderAvatar?: string;
  senderBio?: string;
  senderStatus?: 'online' | 'offline' | 'away';
  content: string;
  createdAt: Date;
  read: boolean;
  edited?: boolean;
  editedAt?: Date;
  reactions?: { emoji: string; userIds: string[] }[];
}

export interface FriendRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export interface Friendship {
  userId1: string;
  userId2: string;
  createdAt: Date;
}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'password'>;
}
