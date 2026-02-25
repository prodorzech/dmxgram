export interface UserRestriction {
  type: 'warning' | 'restriction' | 'ban';
  category?: string;
  reason: string;
  issuedAt: Date;
  expiresAt?: Date;
  issuedBy: string;
  issuedByUsername?: string;
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
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  icon?: string;
  inviteCode: string;
  createdAt: Date;
  members: string[];
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

export interface MessageAttachment {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
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

export interface Friend {
  id: string;
  username: string;
  avatar?: string;
  bio?: string;
  banner?: string;
  status: 'online' | 'offline' | 'away';
  badges?: string[];
  profileColorTop?: string;
  profileColorBottom?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
