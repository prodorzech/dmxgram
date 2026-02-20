import { createClient } from '@supabase/supabase-js';
import { User, Server, Channel, Message, DirectMessage, FriendRequest, Friendship } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Row mappers (snake_case DB → camelCase TS) ──────────────────────────────

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    avatar: row.avatar ?? undefined,
    banner: row.banner ?? undefined,
    bio: row.bio ?? undefined,
    customStatus: row.custom_status ?? undefined,
    createdAt: new Date(row.created_at),
    status: row.status || 'offline',
    isAdmin: row.is_admin || false,
    mustChangePassword: row.must_change_password || false,
    lastLoginIp: row.last_login_ip ?? undefined,
    lastLoginCountry: row.last_login_country ?? undefined,
    language: row.language ?? undefined,
    restrictions: row.restrictions || {},
    warnings: row.warnings || [],
    activeRestrictions: row.active_restrictions || [],
  };
}

function rowToChannel(row: any): Channel {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    type: row.type || 'text',
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    username: row.username,
    userAvatar: row.user_avatar ?? undefined,
    content: row.content,
    createdAt: new Date(row.created_at),
    edited: row.edited || false,
    editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
  };
}

function rowToDM(row: any): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    senderUsername: row.sender_username,
    senderAvatar: row.sender_avatar ?? undefined,
    senderBio: row.sender_bio ?? undefined,
    senderStatus: row.sender_status ?? undefined,
    content: row.content,
    createdAt: new Date(row.created_at),
    read: row.read || false,
    edited: row.edited || false,
    editedAt: row.edited_at ? new Date(row.edited_at) : undefined,
  };
}

function rowToFriendRequest(row: any): FriendRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderUsername: row.sender_username,
    receiverId: row.receiver_id,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

function rowToFriendship(row: any): Friendship {
  return {
    userId1: row.user_id1,
    userId2: row.user_id2,
    createdAt: new Date(row.created_at),
  };
}

async function fetchFullServer(serverRow: any): Promise<Server> {
  const [{ data: channelRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from('channels')
      .select('*')
      .eq('server_id', serverRow.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('server_members')
      .select('user_id')
      .eq('server_id', serverRow.id),
  ]);

  return {
    id: serverRow.id,
    name: serverRow.name,
    description: serverRow.description ?? undefined,
    ownerId: serverRow.owner_id,
    icon: serverRow.icon ?? undefined,
    inviteCode: serverRow.invite_code,
    createdAt: new Date(serverRow.created_at),
    channels: (channelRows || []).map(rowToChannel),
    members: (memberRows || []).map((r: any) => r.user_id),
  };
}

// ─── Database class ───────────────────────────────────────────────────────────

export class Database {
  // In-memory only: transient socket sessions
  private userSessions: Map<string, string> = new Map(); // socketId → userId

  // In-memory status cache (updates too frequent for DB writes)
  private statusCache: Map<string, User['status']> = new Map();
  // ── Users ──────────────────────────────────────────────────────────────────

  async createUser(user: User): Promise<User> {
    const { error } = await supabase.from('users').insert({
      id: user.id,
      username: user.username,
      email: user.email,
      password: user.password,
      avatar: user.avatar ?? null,
      banner: user.banner ?? null,
      bio: user.bio ?? null,
      custom_status: user.customStatus ?? null,
      created_at: user.createdAt.toISOString(),
      status: user.status,
      is_admin: user.isAdmin || false,
      must_change_password: user.mustChangePassword || false,
      last_login_ip: user.lastLoginIp ?? null,
      last_login_country: user.lastLoginCountry ?? null,
      language: user.language ?? null,
      restrictions: user.restrictions || {},
      warnings: user.warnings || [],
      active_restrictions: user.activeRestrictions || [],
    });
    if (error) throw error;
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const user = rowToUser(data);
    if (this.statusCache.has(id)) user.status = this.statusCache.get(id)!;
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const user = rowToUser(data);
    if (this.statusCache.has(user.id)) user.status = this.statusCache.get(user.id)!;
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', username)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const user = rowToUser(data);
    if (this.statusCache.has(user.id)) user.status = this.statusCache.get(user.id)!;
    return user;
  }

  updateUserStatus(userId: string, status: User['status']): void {
    this.statusCache.set(userId, status);
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(row => {
      const user = rowToUser(row);
      if (this.statusCache.has(user.id)) user.status = this.statusCache.get(user.id)!;
      return user;
    });
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const dbUpdates: Record<string, any> = {};
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.password !== undefined) dbUpdates.password = updates.password;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
    if (updates.banner !== undefined) dbUpdates.banner = updates.banner;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.customStatus !== undefined) dbUpdates.custom_status = updates.customStatus;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.isAdmin !== undefined) dbUpdates.is_admin = updates.isAdmin;
    if (updates.mustChangePassword !== undefined) dbUpdates.must_change_password = updates.mustChangePassword;
    if (updates.lastLoginIp !== undefined) dbUpdates.last_login_ip = updates.lastLoginIp;
    if (updates.lastLoginCountry !== undefined) dbUpdates.last_login_country = updates.lastLoginCountry;
    if (updates.language !== undefined) dbUpdates.language = updates.language;
    if (updates.restrictions !== undefined) dbUpdates.restrictions = updates.restrictions;
    if (updates.warnings !== undefined) dbUpdates.warnings = updates.warnings;
    if (updates.activeRestrictions !== undefined) dbUpdates.active_restrictions = updates.activeRestrictions;

    const { data, error } = await supabase
      .from('users')
      .update(dbUpdates)
      .eq('id', userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToUser(data);
  }

  // ── Servers ────────────────────────────────────────────────────────────────

  async createServer(server: Server): Promise<Server> {
    const { error: sErr } = await supabase.from('servers').insert({
      id: server.id,
      name: server.name,
      description: server.description ?? null,
      owner_id: server.ownerId,
      icon: server.icon ?? null,
      invite_code: server.inviteCode,
      created_at: server.createdAt.toISOString(),
    });
    if (sErr) throw sErr;

    if (server.channels.length > 0) {
      const { error: chErr } = await supabase.from('channels').insert(
        server.channels.map(ch => ({
          id: ch.id,
          server_id: server.id,
          name: ch.name,
          type: ch.type,
          description: ch.description ?? null,
          created_at: ch.createdAt.toISOString(),
        }))
      );
      if (chErr) throw chErr;
    }

    if (server.members.length > 0) {
      const { error: mErr } = await supabase.from('server_members').insert(
        server.members.map(uid => ({ server_id: server.id, user_id: uid }))
      );
      if (mErr) throw mErr;
    }

    return server;
  }

  async getServerById(id: string): Promise<Server | undefined> {
    const { data, error } = await supabase
      .from('servers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fetchFullServer(data);
  }

  async getServerByInviteCode(inviteCode: string): Promise<Server | undefined> {
    const { data, error } = await supabase
      .from('servers')
      .select('*')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fetchFullServer(data);
  }

  async generateInviteCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const existing = await this.getServerByInviteCode(code);
    if (existing) return this.generateInviteCode();
    return code;
  }

  async regenerateInviteCode(serverId: string): Promise<string | null> {
    const code = await this.generateInviteCode();
    const { error } = await supabase
      .from('servers')
      .update({ invite_code: code })
      .eq('id', serverId);
    if (error) throw error;
    return code;
  }

  async getUserServers(userId: string): Promise<Server[]> {
    const { data: memberRows, error: mErr } = await supabase
      .from('server_members')
      .select('server_id')
      .eq('user_id', userId);
    if (mErr) throw mErr;
    if (!memberRows || memberRows.length === 0) return [];

    const serverIds = memberRows.map((r: any) => r.server_id);
    const { data: serverRows, error: sErr } = await supabase
      .from('servers')
      .select('*')
      .in('id', serverIds);
    if (sErr) throw sErr;

    return Promise.all((serverRows || []).map(fetchFullServer));
  }

  async addServerMember(serverId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('server_members')
      .insert({ server_id: serverId, user_id: userId });
    if (error) {
      if (error.code === '23505') return false; // already a member
      throw error;
    }
    return true;
  }

  async removeServerMember(serverId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  }

  async deleteServer(serverId: string): Promise<boolean> {
    const { error } = await supabase.from('servers').delete().eq('id', serverId);
    if (error) throw error;
    return true;
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  async addChannel(serverId: string, channel: Channel): Promise<boolean> {
    const { error } = await supabase.from('channels').insert({
      id: channel.id,
      server_id: serverId,
      name: channel.name,
      type: channel.type,
      description: channel.description ?? null,
      created_at: channel.createdAt.toISOString(),
    });
    if (error) throw error;
    return true;
  }

  async deleteChannel(serverId: string, channelId: string): Promise<boolean> {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', channelId)
      .eq('server_id', serverId);
    if (error) throw error;
    return true;
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async addMessage(message: Message): Promise<Message> {
    const { error } = await supabase.from('messages').insert({
      id: message.id,
      channel_id: message.channelId,
      user_id: message.userId,
      username: message.username,
      user_avatar: message.userAvatar ?? null,
      content: message.content,
      created_at: message.createdAt.toISOString(),
      edited: message.edited || false,
    });
    if (error) throw error;
    return message;
  }

  async getChannelMessages(channelId: string, limit: number = 50): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(rowToMessage).reverse();
  }

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('channel_id', channelId);
    if (error) throw error;
    return true;
  }

  async editMessage(channelId: string, messageId: string, newContent: string): Promise<Message | null> {
    const { data, error } = await supabase
      .from('messages')
      .update({ content: newContent, edited: true, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('channel_id', channelId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToMessage(data);
  }

  // ── Direct Messages ────────────────────────────────────────────────────────

  async addDirectMessage(dm: DirectMessage): Promise<DirectMessage> {
    const { error } = await supabase.from('direct_messages').insert({
      id: dm.id,
      sender_id: dm.senderId,
      receiver_id: dm.receiverId,
      sender_username: dm.senderUsername,
      sender_avatar: dm.senderAvatar ?? null,
      sender_bio: dm.senderBio ?? null,
      sender_status: dm.senderStatus ?? null,
      content: dm.content,
      created_at: dm.createdAt.toISOString(),
      read: dm.read || false,
      edited: dm.edited || false,
    });
    if (error) throw error;
    return dm;
  }

  async getDirectMessages(userId1: string, userId2: string, limit: number = 50): Promise<DirectMessage[]> {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(rowToDM).reverse();
  }

  async getDirectMessageById(userId1: string, userId2: string, messageId: string): Promise<DirectMessage | null> {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToDM(data);
  }

  async deleteDirectMessage(userId1: string, userId2: string, messageId: string): Promise<boolean> {
    const { error } = await supabase.from('direct_messages').delete().eq('id', messageId);
    if (error) throw error;
    return true;
  }

  async editDirectMessage(
    userId1: string,
    userId2: string,
    messageId: string,
    newContent: string
  ): Promise<DirectMessage | null> {
    const { data, error } = await supabase
      .from('direct_messages')
      .update({ content: newContent, edited: true, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToDM(data);
  }

  // ── Friend Requests ────────────────────────────────────────────────────────

  async createFriendRequest(request: FriendRequest): Promise<FriendRequest> {
    const { error } = await supabase.from('friend_requests').insert({
      id: request.id,
      sender_id: request.senderId,
      sender_username: request.senderUsername,
      receiver_id: request.receiverId,
      status: request.status,
      created_at: request.createdAt.toISOString(),
    });
    if (error) throw error;
    return request;
  }

  async getFriendRequest(requestId: string): Promise<FriendRequest | undefined> {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return rowToFriendRequest(data);
  }

  async getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return (data || []).map(rowToFriendRequest);
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('sender_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return (data || []).map(rowToFriendRequest);
  }

  async updateFriendRequestStatus(
    requestId: string,
    status: 'accepted' | 'rejected'
  ): Promise<FriendRequest | null> {
    const { data, error } = await supabase
      .from('friend_requests')
      .update({ status })
      .eq('id', requestId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToFriendRequest(data);
  }

  async findExistingFriendRequest(senderId: string, receiverId: string): Promise<FriendRequest | undefined> {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(
        `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
      );
    if (error) throw error;
    if (!data || data.length === 0) return undefined;
    return rowToFriendRequest(data[0]);
  }

  // ── Friendships ────────────────────────────────────────────────────────────

  async createFriendship(friendship: Friendship): Promise<Friendship> {
    const [uid1, uid2] = [friendship.userId1, friendship.userId2].sort();
    const { error } = await supabase.from('friendships').insert({
      user_id1: uid1,
      user_id2: uid2,
      created_at: friendship.createdAt.toISOString(),
    });
    if (error) throw error;
    return friendship;
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const [uid1, uid2] = [userId1, userId2].sort();
    const { data, error } = await supabase
      .from('friendships')
      .select('user_id1')
      .eq('user_id1', uid1)
      .eq('user_id2', uid2)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async getFriends(userId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('friendships')
      .select('user_id1, user_id2')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`);
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const friendIds = data.map((r: any) => (r.user_id1 === userId ? r.user_id2 : r.user_id1));
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('*')
      .in('id', friendIds);
    if (uErr) throw uErr;

    return (users || []).map(row => {
      const user = rowToUser(row);
      if (this.statusCache.has(user.id)) user.status = this.statusCache.get(user.id)!;
      return user;
    });
  }

  async removeFriendship(userId1: string, userId2: string): Promise<boolean> {
    const [uid1, uid2] = [userId1, userId2].sort();
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('user_id1', uid1)
      .eq('user_id2', uid2);
    if (error) throw error;
    return true;
  }

  async getMutualFriends(userId1: string, userId2: string): Promise<User[]> {
    const [friends1, friends2] = await Promise.all([
      this.getFriends(userId1),
      this.getFriends(userId2),
    ]);
    const ids2 = new Set(friends2.map(f => f.id));
    return friends1.filter(f => ids2.has(f.id));
  }

  // ── Sessions (in-memory only) ──────────────────────────────────────────────

  setUserSession(socketId: string, userId: string): void {
    this.userSessions.set(socketId, userId);
  }

  getUserIdBySocket(socketId: string): string | undefined {
    return this.userSessions.get(socketId);
  }

  getSocketIdByUserId(userId: string): string | undefined {
    for (const [socketId, uid] of this.userSessions.entries()) {
      if (uid === userId) return socketId;
    }
    return undefined;
  }

  removeSession(socketId: string): void {
    this.userSessions.delete(socketId);
  }

  // ── Initialize ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.log('🔌 Connecting to Supabase...');

    const adminEmail = 'orzech@dmx.suko';
    const existing = await this.getUserByEmail(adminEmail);

    if (!existing) {
      const hashedPassword = await bcrypt.hash('Siemasiema123!', 10);
      await this.createUser({
        id: uuidv4(),
        username: 'orzech',
        email: adminEmail,
        password: hashedPassword,
        bio: 'Administrator',
        createdAt: new Date(),
        status: 'offline',
        isAdmin: true,
      });
      console.log('✅ Admin user created: orzech@dmx.suko');
    } else {
      console.log('✅ Admin user found in Supabase');
    }
  }
}

export const db = new Database();

db.initialize().catch(console.error);

