import { User, Server, Message, DirectMessage, FriendRequest, Friendship } from '../types';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// In production (Electron), DB_DATA_PATH is set to AppData; fallback to server/data in dev
const dataDir = process.env.DB_DATA_PATH || path.join(__dirname, '../../data');
const DB_FILE = path.join(dataDir, 'db.json');

// In-memory database with JSON file persistence

export class Database {
  private users: Map<string, User> = new Map();
  private servers: Map<string, Server> = new Map();
  private messages: Map<string, Message[]> = new Map(); // channelId -> messages
  private directMessages: Map<string, DirectMessage[]> = new Map(); // userId pair -> DMs
  private friendRequests: Map<string, FriendRequest> = new Map(); // requestId -> request
  private friendships: Map<string, Friendship> = new Map(); // friendshipKey -> friendship
  private userSessions: Map<string, string> = new Map(); // socketId -> userId

  private saveTimeout: NodeJS.Timeout | null = null;

  private scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.persistToDisk(), 500);
  }

  private persistToDisk(): void {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        users: Array.from(this.users.entries()),
        friendRequests: Array.from(this.friendRequests.entries()),
        friendships: Array.from(this.friendships.entries()),
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist DB:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(DB_FILE)) return;
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data.users) {
        this.users = new Map(data.users.map(([k, v]: [string, User]) => [
          k,
          { ...v, createdAt: new Date(v.createdAt) }
        ]));
      }
      if (data.friendRequests) {
        this.friendRequests = new Map(data.friendRequests.map(([k, v]: [string, FriendRequest]) => [
          k,
          { ...v, createdAt: new Date(v.createdAt) }
        ]));
      }
      if (data.friendships) {
        this.friendships = new Map(data.friendships.map(([k, v]: [string, Friendship]) => [
          k,
          { ...v, createdAt: new Date(v.createdAt) }
        ]));
      }
      console.log(`✅ DB loaded: ${this.users.size} users, ${this.friendships.size} friendships`);
    } catch (err) {
      console.error('Failed to load DB from disk:', err);
    }
  }

  // Users
  createUser(user: User): User {
    this.users.set(user.id, user);
    this.scheduleSave();
    return user;
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.email === email);
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  updateUserStatus(userId: string, status: User['status']): void {
    const user = this.users.get(userId);
    if (user) {
      user.status = status;
      // Don't persist status changes (too frequent)
    }
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  updateUser(userId: string, updates: Partial<User>): User | null {
    const user = this.users.get(userId);
    if (user) {
      Object.assign(user, updates);
      this.scheduleSave();
      return user;
    }
    return null;
  }

  // Servers
  createServer(server: Server): Server {
    this.servers.set(server.id, server);
    return server;
  }

  getServerById(id: string): Server | undefined {
    return this.servers.get(id);
  }

  getServerByInviteCode(inviteCode: string): Server | undefined {
    return Array.from(this.servers.values()).find(s => s.inviteCode === inviteCode);
  }

  generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if code exists, regenerate if it does
    if (this.getServerByInviteCode(code)) {
      return this.generateInviteCode();
    }
    return code;
  }

  regenerateInviteCode(serverId: string): string | null {
    const server = this.servers.get(serverId);
    if (server) {
      server.inviteCode = this.generateInviteCode();
      return server.inviteCode;
    }
    return null;
  }

  getUserServers(userId: string): Server[] {
    return Array.from(this.servers.values()).filter(s => 
      s.members.includes(userId)
    );
  }

  addServerMember(serverId: string, userId: string): boolean {
    const server = this.servers.get(serverId);
    if (server && !server.members.includes(userId)) {
      server.members.push(userId);
      return true;
    }
    return false;
  }

  removeServerMember(serverId: string, userId: string): boolean {
    const server = this.servers.get(serverId);
    if (server) {
      server.members = server.members.filter(id => id !== userId);
      return true;
    }
    return false;
  }

  deleteServer(serverId: string): boolean {
    return this.servers.delete(serverId);
  }

  // Channels
  addChannel(serverId: string, channel: any): boolean {
    const server = this.servers.get(serverId);
    if (server) {
      server.channels.push(channel);
      this.messages.set(channel.id, []);
      return true;
    }
    return false;
  }

  deleteChannel(serverId: string, channelId: string): boolean {
    const server = this.servers.get(serverId);
    if (server) {
      server.channels = server.channels.filter(c => c.id !== channelId);
      this.messages.delete(channelId);
      return true;
    }
    return false;
  }

  // Messages
  addMessage(message: Message): Message {
    const channelMessages = this.messages.get(message.channelId) || [];
    channelMessages.push(message);
    this.messages.set(message.channelId, channelMessages);
    return message;
  }

  getChannelMessages(channelId: string, limit: number = 50): Message[] {
    const messages = this.messages.get(channelId) || [];
    return messages.slice(-limit);
  }

  deleteMessage(channelId: string, messageId: string): boolean {
    const messages = this.messages.get(channelId);
    if (messages) {
      const filtered = messages.filter(m => m.id !== messageId);
      this.messages.set(channelId, filtered);
      return true;
    }
    return false;
  }

  editMessage(channelId: string, messageId: string, newContent: string): Message | null {
    const messages = this.messages.get(channelId);
    if (messages) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date();
        return message;
      }
    }
    return null;
  }

  // Direct Messages
  addDirectMessage(dm: DirectMessage): DirectMessage {
    const key = this.getDMKey(dm.senderId, dm.receiverId);
    const dms = this.directMessages.get(key) || [];
    dms.push(dm);
    this.directMessages.set(key, dms);
    return dm;
  }

  getDirectMessages(userId1: string, userId2: string, limit: number = 50): DirectMessage[] {
    const key = this.getDMKey(userId1, userId2);
    const dms = this.directMessages.get(key) || [];
    return dms.slice(-limit);
  }

  getDirectMessageById(userId1: string, userId2: string, messageId: string): DirectMessage | null {
    const key = this.getDMKey(userId1, userId2);
    const dms = this.directMessages.get(key) || [];
    return dms.find(dm => dm.id === messageId) || null;
  }

  deleteDirectMessage(userId1: string, userId2: string, messageId: string): boolean {
    const key = this.getDMKey(userId1, userId2);
    const dms = this.directMessages.get(key);
    if (dms) {
      const filtered = dms.filter(dm => dm.id !== messageId);
      this.directMessages.set(key, filtered);
      return true;
    }
    return false;
  }

  editDirectMessage(userId1: string, userId2: string, messageId: string, newContent: string): DirectMessage | null {
    const key = this.getDMKey(userId1, userId2);
    const dms = this.directMessages.get(key);
    if (dms) {
      const message = dms.find(dm => dm.id === messageId);
      if (message) {
        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date();
        return message;
      }
    }
    return null;
  }

  private getDMKey(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join(':');
  }

  // Friend Requests
  createFriendRequest(request: FriendRequest): FriendRequest {
    this.friendRequests.set(request.id, request);
    this.scheduleSave();
    return request;
  }

  getFriendRequest(requestId: string): FriendRequest | undefined {
    return this.friendRequests.get(requestId);
  }

  getPendingFriendRequests(userId: string): FriendRequest[] {
    return Array.from(this.friendRequests.values()).filter(
      r => r.receiverId === userId && r.status === 'pending'
    );
  }

  getSentFriendRequests(userId: string): FriendRequest[] {
    return Array.from(this.friendRequests.values()).filter(
      r => r.senderId === userId && r.status === 'pending'
    );
  }

  updateFriendRequestStatus(requestId: string, status: 'accepted' | 'rejected'): FriendRequest | null {
    const request = this.friendRequests.get(requestId);
    if (request) {
      request.status = status;
      this.scheduleSave();
      return request;
    }
    return null;
  }

  findExistingFriendRequest(senderId: string, receiverId: string): FriendRequest | undefined {
    return Array.from(this.friendRequests.values()).find(
      r => (r.senderId === senderId && r.receiverId === receiverId) ||
           (r.senderId === receiverId && r.receiverId === senderId)
    );
  }

  // Friendships
  createFriendship(friendship: Friendship): Friendship {
    const key = this.getFriendshipKey(friendship.userId1, friendship.userId2);
    this.friendships.set(key, friendship);
    this.scheduleSave();
    return friendship;
  }

  areFriends(userId1: string, userId2: string): boolean {
    const key = this.getFriendshipKey(userId1, userId2);
    return this.friendships.has(key);
  }

  getFriends(userId: string): User[] {
    const friends: User[] = [];
    for (const friendship of this.friendships.values()) {
      if (friendship.userId1 === userId) {
        const friend = this.getUserById(friendship.userId2);
        if (friend) friends.push(friend);
      } else if (friendship.userId2 === userId) {
        const friend = this.getUserById(friendship.userId1);
        if (friend) friends.push(friend);
      }
    }
    return friends;
  }

  removeFriendship(userId1: string, userId2: string): boolean {
    const key = this.getFriendshipKey(userId1, userId2);
    const result = this.friendships.delete(key);
    if (result) this.scheduleSave();
    return result;
  }

  getMutualFriends(userId1: string, userId2: string): User[] {
    const user1Friends = this.getFriends(userId1);
    const user2Friends = this.getFriends(userId2);
    
    const user2FriendIds = new Set(user2Friends.map(f => f.id));
    
    return user1Friends.filter(friend => user2FriendIds.has(friend.id));
  }

  private getFriendshipKey(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join(':');
  }

  // Sessions
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

  // Initialize database with admin user
  async initialize(): Promise<void> {
    // Load persisted data first
    this.loadFromDisk();

    // Create admin user if doesn't exist
    const adminEmail = 'orzech@dmx.suko';
    const existingAdmin = this.getUserByEmail(adminEmail);
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('Siemasiema123!', 10);
      const adminUser: User = {
        id: uuidv4(),
        username: 'orzech',
        email: adminEmail,
        password: hashedPassword,
        bio: 'Administrator',
        createdAt: new Date(),
        status: 'offline',
        isAdmin: true
      };
      this.createUser(adminUser);
      console.log('✅ Admin user created: orzech@dmx.suko');
    } else {
      console.log('✅ Admin user loaded from disk');
    }
  }
}

export const db = new Database();

// Initialize database
db.initialize().catch(console.error);
