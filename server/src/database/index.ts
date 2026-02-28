import { createClient } from '@supabase/supabase-js';
import { User, Server, Channel, Message, DirectMessage, FriendRequest, Friendship } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Lazy Supabase client — created on first use so that env vars set by
// electron/main.js before require() are already in process.env
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): any {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ─── Row mappers (snake_case DB → camelCase TS) ──────────────────────────────

function rowToUser(row: any): User {
  // If last_online is missing or stale (>3 min), treat online/away as offline.
  // This ensures a crashed/closed machine shows offline within 3 minutes.
  const STALE_MS = 3 * 60 * 1000;
  let dbStatus: string = row.status || 'offline';
  if (dbStatus === 'online' || dbStatus === 'away') {
    const lastOnline: Date | null = row.last_online ? new Date(row.last_online) : null;
    if (!lastOnline || (Date.now() - lastOnline.getTime()) > STALE_MS) {
      dbStatus = 'offline';
    }
  }
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
    status: dbStatus as User['status'],
    isAdmin: row.is_admin || false,
    mustChangePassword: row.must_change_password || false,
    lastLoginIp: row.last_login_ip ?? undefined,
    lastLoginCountry: row.last_login_country ?? undefined,
    language: row.language ?? undefined,
    restrictions: row.restrictions || {},
    warnings: row.warnings || [],
    activeRestrictions: row.active_restrictions || [],
    badges: row.badges || [],
    emailVerified: row.email_verified ?? false,
    hasDmxBoost: row.has_dmx_boost ?? false,
    dmxBoostExpiresAt: row.dmx_boost_expires_at ? new Date(row.dmx_boost_expires_at) : undefined,
    profileColorTop: row.profile_color_top ?? undefined,
    profileColorBottom: row.profile_color_bottom ?? undefined,
    emailVerificationCode: row.email_verification_code ?? undefined,
    emailVerificationExpires: row.email_verification_expires ? new Date(row.email_verification_expires) : undefined,
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
    reactions: [],
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
    getSupabase()
      .from('channels')
      .select('*')
      .eq('server_id', serverRow.id)
      .order('created_at', { ascending: true }),
    getSupabase()
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

  // In-memory reaction fallback – used when message_reactions table doesn’t exist yet
  private reactionMemory: Map<string, { emoji: string; userIds: string[] }[]> = new Map();

  // Supabase client accessor
  get supabase() {
    return getSupabase();
  }

  toggleReactionInMemory(messageId: string, userId: string, emoji: string): { emoji: string; userIds: string[] }[] {
    const current = this.reactionMemory.get(messageId) || [];
    const existingIdx = current.findIndex(r => r.emoji === emoji);
    let updated: { emoji: string; userIds: string[] }[];
    if (existingIdx >= 0 && current[existingIdx].userIds.includes(userId)) {
      const newUserIds = current[existingIdx].userIds.filter(id => id !== userId);
      updated = newUserIds.length === 0
        ? current.filter(r => r.emoji !== emoji)
        : current.map(r => r.emoji === emoji ? { ...r, userIds: newUserIds } : r);
    } else if (existingIdx >= 0) {
      updated = current.map(r => r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r);
    } else {
      updated = [...current, { emoji, userIds: [userId] }];
    }
    this.reactionMemory.set(messageId, updated);
    return updated;
  }

  getReactionMemory(messageId: string): { emoji: string; userIds: string[] }[] {
    return this.reactionMemory.get(messageId) || [];
  }

  setReactionMemory(messageId: string, reactions: { emoji: string; userIds: string[] }[]): void {
    this.reactionMemory.set(messageId, reactions);
  }
  // ── Users ──────────────────────────────────────────────────────────────────

  async createUser(user: User): Promise<User> {
    // Build the insert row — exclude optional email-verification columns
    // that may not exist in older DB schemas
    const insertRow: Record<string, any> = {
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
      badges: user.badges || [],
    };
    // Include email_verified only if the field is explicitly set
    if (user.emailVerified !== undefined) {
      insertRow.email_verified = user.emailVerified;
    }
    let { error } = await getSupabase().from('users').insert(insertRow);
    // If the email_verified column doesn't exist in the schema yet, retry without it
    if (error && (error.code === 'PGRST204' || (error.message || '').includes('email_verified'))) {
      delete insertRow.email_verified;
      const { error: error2 } = await getSupabase().from('users').insert(insertRow);
      error = error2;
    }
    if (error) throw error;
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const { data, error } = await getSupabase()
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
    const { data, error } = await getSupabase()
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
    const { data, error } = await getSupabase()
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
    // Write to Supabase so all other users' servers see the correct status.
    // last_online is set to NOW when online/away, cleared to NULL when offline.
    const lastOnline = (status === 'online' || status === 'away')
      ? new Date().toISOString()
      : null;
    getSupabase()
      .from('users')
      .update({ status, last_online: lastOnline })
      .eq('id', userId)
      .then(() => {})
      .catch((err: any) => console.error('updateUserStatus DB write failed:', err));
  }

  /** Read the cached status for a locally connected user (for heartbeat use). */
  getStatusFromCache(userId: string): User['status'] | undefined {
    return this.statusCache.get(userId) as User['status'] | undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await getSupabase()
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => {
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
    if (updates.badges !== undefined) dbUpdates.badges = updates.badges;
    if (updates.emailVerified !== undefined) dbUpdates.email_verified = updates.emailVerified;
    if ((updates as any).hasDmxBoost !== undefined) dbUpdates.has_dmx_boost = (updates as any).hasDmxBoost;
    if ((updates as any).dmxBoostExpiresAt !== undefined) dbUpdates.dmx_boost_expires_at = (updates as any).dmxBoostExpiresAt ? (updates as any).dmxBoostExpiresAt.toISOString() : null;
    if (updates.profileColorTop !== undefined) dbUpdates.profile_color_top = updates.profileColorTop || null;
    if (updates.profileColorBottom !== undefined) dbUpdates.profile_color_bottom = updates.profileColorBottom || null;
    if (updates.emailVerificationCode !== undefined) dbUpdates.email_verification_code = updates.emailVerificationCode;
    if (updates.emailVerificationExpires !== undefined) dbUpdates.email_verification_expires = updates.emailVerificationExpires?.toISOString() ?? null;

    let { data, error } = await getSupabase()
      .from('users')
      .update(dbUpdates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    // If boost columns don't exist yet, throw a clear migration error
    if (error && (error.message || '').toLowerCase().includes('has_dmx_boost')) {
      console.error('❌ has_dmx_boost column missing! Run server/src/database/users_boost_migration.sql in Supabase.');
      throw new Error('missingBoostColumns');
    }

    if (error) throw error;
    if (!data) return null;
    return rowToUser(data);
  }

  // Revoke boost for all users whose dmx_boost_expires_at is in the past
  async revokeExpiredBoosts(): Promise<number> {
    const now = new Date().toISOString();
    // Find expired users
    const { data, error } = await getSupabase()
      .from('users')
      .select('id, badges')
      .eq('has_dmx_boost', true)
      .lt('dmx_boost_expires_at', now);
    if (error) throw error;
    if (!data || data.length === 0) return 0;

    for (const row of data) {
      const badges: string[] = (row.badges || []).filter((b: string) => b !== 'dmx-boost');
      await getSupabase().from('users').update({
        has_dmx_boost: false,
        dmx_boost_expires_at: null,
        badges,
      }).eq('id', row.id);
    }
    return data.length;
  }

  // ── Servers ────────────────────────────────────────────────────────────────

  async createServer(server: Server): Promise<Server> {
    const { error: sErr } = await getSupabase().from('servers').insert({
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
      const { error: chErr } = await getSupabase().from('channels').insert(
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
      const { error: mErr } = await getSupabase().from('server_members').insert(
        server.members.map(uid => ({ server_id: server.id, user_id: uid }))
      );
      if (mErr) throw mErr;
    }

    return server;
  }

  async getServerById(id: string): Promise<Server | undefined> {
    const { data, error } = await getSupabase()
      .from('servers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return fetchFullServer(data);
  }

  async getServerByInviteCode(inviteCode: string): Promise<Server | undefined> {
    const { data, error } = await getSupabase()
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
    const { error } = await getSupabase()
      .from('servers')
      .update({ invite_code: code })
      .eq('id', serverId);
    if (error) throw error;
    return code;
  }

  async getUserServers(userId: string): Promise<Server[]> {
    const { data: memberRows, error: mErr } = await getSupabase()
      .from('server_members')
      .select('server_id')
      .eq('user_id', userId);
    if (mErr) throw mErr;
    if (!memberRows || memberRows.length === 0) return [];

    const serverIds = memberRows.map((r: any) => r.server_id);
    const { data: serverRows, error: sErr } = await getSupabase()
      .from('servers')
      .select('*')
      .in('id', serverIds);
    if (sErr) throw sErr;

    return Promise.all((serverRows || []).map(fetchFullServer));
  }

  async addServerMember(serverId: string, userId: string): Promise<boolean> {
    const { error } = await getSupabase()
      .from('server_members')
      .insert({ server_id: serverId, user_id: userId });
    if (error) {
      if (error.code === '23505') return false; // already a member
      throw error;
    }
    return true;
  }

  async removeServerMember(serverId: string, userId: string): Promise<boolean> {
    const { error } = await getSupabase()
      .from('server_members')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId);
    if (error) throw error;
    return true;
  }

  async deleteServer(serverId: string): Promise<boolean> {
    const { error } = await getSupabase().from('servers').delete().eq('id', serverId);
    if (error) throw error;
    return true;
  }

  // ── Channels ───────────────────────────────────────────────────────────────

  async addChannel(serverId: string, channel: Channel): Promise<boolean> {
    const { error } = await getSupabase().from('channels').insert({
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
    const { error } = await getSupabase()
      .from('channels')
      .delete()
      .eq('id', channelId)
      .eq('server_id', serverId);
    if (error) throw error;
    return true;
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async addMessage(message: Message): Promise<Message> {
    const { error } = await getSupabase().from('messages').insert({
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
    const { data, error } = await getSupabase()
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(rowToMessage).reverse();
  }

  async deleteMessage(channelId: string, messageId: string): Promise<boolean> {
    const { error } = await getSupabase()
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('channel_id', channelId);
    if (error) throw error;
    return true;
  }

  async editMessage(channelId: string, messageId: string, newContent: string): Promise<Message | null> {
    const { data, error } = await getSupabase()
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
    const { error } = await getSupabase().from('direct_messages').insert({
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
    const { data, error } = await getSupabase()
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const messages: DirectMessage[] = (data || []).map(rowToDM).reverse();
    if (messages.length === 0) return messages;

    // Attach reactions (if table exists)
    try {
      const messageIds = messages.map(m => m.id);
      const { data: reactionRows } = await getSupabase()
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messageIds);
      if (reactionRows && reactionRows.length > 0) {
        const reactionMap = new Map<string, { emoji: string; userIds: string[] }[]>();
        for (const row of reactionRows) {
          if (!reactionMap.has(row.message_id)) reactionMap.set(row.message_id, []);
          const list = reactionMap.get(row.message_id)!;
          const existing = list.find(r => r.emoji === row.emoji);
          if (existing) existing.userIds.push(row.user_id);
          else list.push({ emoji: row.emoji, userIds: [row.user_id] });
        }
        for (const msg of messages) {
          msg.reactions = reactionMap.get(msg.id) || [];
        }
      }
    } catch {
      // message_reactions table may not exist yet — fall back to in-memory cache
      for (const msg of messages) {
        const memReactions = this.getReactionMemory(msg.id);
        if (memReactions.length) msg.reactions = memReactions;
      }
    }

    return messages;
  }

  async getDirectMessageById(userId1: string, userId2: string, messageId: string): Promise<DirectMessage | null> {
    const { data, error } = await getSupabase()
      .from('direct_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToDM(data);
  }

  async deleteDirectMessage(userId1: string, userId2: string, messageId: string): Promise<boolean> {
    const { error } = await getSupabase().from('direct_messages').delete().eq('id', messageId);
    if (error) throw error;
    return true;
  }

  async clearDirectMessages(userId1: string, userId2: string): Promise<void> {
    const { error } = await getSupabase()
      .from('direct_messages')
      .delete()
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      );
    if (error) throw error;
  }

  async editDirectMessage(
    userId1: string,
    userId2: string,
    messageId: string,
    newContent: string
  ): Promise<DirectMessage | null> {
    const { data, error } = await getSupabase()
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
    const { error } = await getSupabase().from('friend_requests').insert({
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
    const { data, error } = await getSupabase()
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return rowToFriendRequest(data);
  }

  async getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await getSupabase()
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return (data || []).map(rowToFriendRequest);
  }

  async getSentFriendRequests(userId: string): Promise<FriendRequest[]> {
    const { data, error } = await getSupabase()
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
    const { data, error } = await getSupabase()
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
    const { data, error } = await getSupabase()
      .from('friend_requests')
      .select('*')
      .or(
        `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
      );
    if (error) throw error;
    if (!data || data.length === 0) return undefined;
    return rowToFriendRequest(data[0]);
  }

  async deleteFriendRequestBetween(userId1: string, userId2: string): Promise<void> {
    // Delete any friend_request between these two users regardless of direction or status
    await getSupabase()
      .from('friend_requests')
      .delete()
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      );
  }

  // ── Friendships ────────────────────────────────────────────────────────────

  async createFriendship(friendship: Friendship): Promise<Friendship> {
    const [uid1, uid2] = [friendship.userId1, friendship.userId2].sort();
    const { error } = await getSupabase().from('friendships').insert({
      user_id1: uid1,
      user_id2: uid2,
      created_at: friendship.createdAt.toISOString(),
    });
    if (error) throw error;
    return friendship;
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const [uid1, uid2] = [userId1, userId2].sort();
    const { data, error } = await getSupabase()
      .from('friendships')
      .select('user_id1')
      .eq('user_id1', uid1)
      .eq('user_id2', uid2)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  async getFriends(userId: string): Promise<User[]> {
    const { data, error } = await getSupabase()
      .from('friendships')
      .select('user_id1, user_id2')
      .or(`user_id1.eq.${userId},user_id2.eq.${userId}`);
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const friendIds = data.map((r: any) => (r.user_id1 === userId ? r.user_id2 : r.user_id1));
    const { data: users, error: uErr } = await getSupabase()
      .from('users')
      .select('*')
      .in('id', friendIds);
    if (uErr) throw uErr;

    return (users || []).map((row: any) => {
      const user = rowToUser(row);
      if (this.statusCache.has(user.id)) user.status = this.statusCache.get(user.id)!;
      return user;
    });
  }

  async removeFriendship(userId1: string, userId2: string): Promise<boolean> {
    const [uid1, uid2] = [userId1, userId2].sort();
    const { error } = await getSupabase()
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

  /** Returns how many active sockets this user still has after a disconnect. */
  countActiveSessions(userId: string): number {
    let count = 0;
    for (const uid of this.userSessions.values()) {
      if (uid === userId) count++;
    }
    return count;
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  async createReport(report: {
    id: string;
    reporterId: string;
    reporterUsername: string;
    reportedUserId: string;
    reportedUsername: string;
    messageId: string;
    messageContent: string;
    senderId: string;
    receiverId: string;
  }): Promise<void> {
    const { error } = await getSupabase().from('reports').insert({
      id: report.id,
      reporter_id: report.reporterId,
      reporter_username: report.reporterUsername,
      reported_user_id: report.reportedUserId,
      reported_username: report.reportedUsername,
      message_id: report.messageId,
      message_content: report.messageContent,
      sender_id: report.senderId,
      receiver_id: report.receiverId,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async getAllReports(): Promise<any[]> {
    const { data, error } = await getSupabase()
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      reporterId: row.reporter_id,
      reporterUsername: row.reporter_username,
      reportedUserId: row.reported_user_id,
      reportedUsername: row.reported_username,
      messageId: row.message_id,
      messageContent: row.message_content,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async updateReportStatus(reportId: string, status: 'pending' | 'reviewed'): Promise<void> {
    const { error } = await getSupabase()
      .from('reports')
      .update({ status })
      .eq('id', reportId);
    if (error) throw error;
  }

  // ── Message Reactions ──────────────────────────────────────────────────────

  async addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const { error } = await getSupabase().from('message_reactions').upsert({
      message_id: messageId,
      user_id: userId,
      emoji,
      created_at: new Date().toISOString(),
    }, { onConflict: 'message_id,user_id,emoji' });
    if (error) throw error;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const { error } = await getSupabase()
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji);
    if (error) throw error;
  }

  async getMessageReactions(messageId: string): Promise<{ emoji: string; userIds: string[] }[]> {
    const { data, error } = await getSupabase()
      .from('message_reactions')
      .select('user_id, emoji')
      .eq('message_id', messageId);
    if (error) return [];
    const map = new Map<string, string[]>();
    for (const row of (data || [])) {
      if (!map.has(row.emoji)) map.set(row.emoji, []);
      map.get(row.emoji)!.push(row.user_id);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
  }

  // ── User Blocks ────────────────────────────────────────────────────────────

  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await getSupabase().from('user_blocks').upsert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      created_at: new Date().toISOString(),
    }, { onConflict: 'blocker_id,blocked_id' });
    if (error) throw error;
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) throw error;
  }

  /** Returns true if blockerId has blocked blockedId */
  async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const { data, error } = await getSupabase()
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  }

  /** Returns true if EITHER user has blocked the other */
  async isAnyBlockBetween(userId1: string, userId2: string): Promise<boolean> {
    const { data, error } = await getSupabase()
      .from('user_blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`
      )
      .limit(1);
    if (error) return false;
    return data && data.length > 0;
  }

  /** Returns list of users that userId has blocked */
  async getBlockedUsers(userId: string): Promise<string[]> {
    const { data, error } = await getSupabase()
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', userId);
    if (error) return [];
    return (data || []).map((r: any) => r.blocked_id);
  }

  // ── Initialize ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.log('🔌 Connecting to Supabase...');

    // Probe for user_blocks table — it's created via the Supabase dashboard migration.
    // Block/unblock methods already return safe defaults on error, so we just warn here.
    try {
      const { error } = await getSupabase().from('user_blocks').select('blocker_id').limit(1);
      if (error && (error.code === '42P01' || (error.message || '').includes('user_blocks'))) {
        console.warn('⚠️  user_blocks table missing — run migration: CREATE TABLE user_blocks (blocker_id UUID, blocked_id UUID, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (blocker_id, blocked_id))');
      } else {
        console.log('✅ user_blocks table ready');
      }
    } catch (e) {
      console.warn('⚠️  Could not probe user_blocks table:', e);
    }

    // Probe for boost_codes tables — created via boost_codes_migration.sql
    try {
      const { error: bcErr } = await getSupabase().from('boost_codes').select('code').limit(1);
      if (bcErr && (bcErr.code === '42P01' || (bcErr.message || '').includes('boost_codes'))) {
        console.warn('⚠️  boost_codes table MISSING — please run server/src/database/boost_codes_migration.sql in your Supabase SQL editor!');
        console.warn('    SQL:\n    CREATE TABLE IF NOT EXISTS boost_codes (code TEXT PRIMARY KEY, duration_days INTEGER NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1, uses_left INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), note TEXT);\n    CREATE TABLE IF NOT EXISTS boost_code_uses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL REFERENCES boost_codes(code) ON DELETE CASCADE, user_id TEXT NOT NULL, username TEXT NOT NULL, used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (code, user_id));');
      } else {
        console.log('✅ boost_codes table ready');
      }
    } catch (e) {
      console.warn('⚠️  Could not probe boost_codes table:', e);
    }

    // Probe for has_dmx_boost column in users — added via users_boost_migration.sql
    try {
      const { data: boostProbe, error: boostColErr } = await getSupabase()
        .from('users')
        .select('has_dmx_boost')
        .limit(1);
      if (boostColErr && (boostColErr.message || '').toLowerCase().includes('has_dmx_boost')) {
        console.warn('⚠️  has_dmx_boost column MISSING from users table — please run server/src/database/users_boost_migration.sql in your Supabase SQL editor!');
      } else {
        console.log('✅ users boost columns ready');
      }
    } catch (e) {
      console.warn('⚠️  Could not probe users boost columns:', e);
    }

    // Probe for last_online column in users — added via last_online_migration.sql
    try {
      const { error: loErr } = await getSupabase()
        .from('users')
        .select('last_online')
        .limit(1);
      if (loErr && (loErr.message || '').toLowerCase().includes('last_online')) {
        console.warn('⚠️  last_online column MISSING from users table — online status will be stale. Run server/src/database/last_online_migration.sql in Supabase!');
      } else {
        console.log('✅ last_online column ready (stale-status detection active)');
      }
    } catch (e) {
      console.warn('⚠️  Could not probe last_online column:', e);
    }

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

