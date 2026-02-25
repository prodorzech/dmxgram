import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { Message, DirectMessage } from '../types';

let io: SocketIOServer;

export const getIO = (): SocketIOServer => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

export const initializeSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow file:// (Electron loadFile), null origin, and localhost
        if (!origin || origin === 'null' || origin.startsWith('file://') || origin.startsWith('dmx://')) {
          return callback(null, true);
        }
        const allowed = [
          'http://localhost:3000', 'http://localhost:3001',
          'http://localhost:3002', 'http://localhost:3003',
          process.env.CLIENT_URL || ''
        ].filter(Boolean);
        if (allowed.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Socket CORS: not allowed'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error('Authentication error'));
      const decoded = jwt.verify(token, secret) as { userId: string };
      (socket as any).userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`User connected: ${userId}`);

    // Save session
    db.setUserSession(socket.id, userId);

    // Restore preferred status from DB (fallback to 'online')
    const userForStatus = await db.getUserById(userId);
    const preferredStatus: 'online' | 'offline' | 'away' =
      (userForStatus?.status === 'away') ? 'away' : 'online';
    db.updateUserStatus(userId, preferredStatus);

    // ── Heartbeat — refresh last_online every 60s so stale-status detection
    //   can tell when a user's machine cut out without a clean disconnect.
    const heartbeatInterval = setInterval(() => {
      db.updateUserStatus(userId, db.getStatusFromCache(userId) ?? 'online');
    }, 60_000);

    // Join personal room for notifications (friend requests, etc.)
    socket.join(`user:${userId}`);

    // Notify others AND the connecting socket itself about restored status
    socket.broadcast.emit('user:status', { userId, status: preferredStatus });
    socket.emit('user:status', { userId, status: preferredStatus });

    // Join server rooms
    const userServers = await db.getUserServers(userId);
    userServers.forEach(server => {
      socket.join(`server:${server.id}`);
    });

    // Join channel
    socket.on('channel:join', async (data: { channelId: string }) => {
      socket.join(`channel:${data.channelId}`);
      console.log(`User ${userId} joined channel ${data.channelId}`);
    });

    // Leave channel
    socket.on('channel:leave', async (data: { channelId: string }) => {
      socket.leave(`channel:${data.channelId}`);
    });

    // Send message
    socket.on('message:send', async (data: { channelId: string; content: string; serverId: string }) => {
      try {
        const user = await db.getUserById(userId);
        if (!user) return;

        const server = await db.getServerById(data.serverId);
        if (!server || !server.members.includes(userId)) {
          socket.emit('error', { message: 'Brak dostępu do kanału' });
          return;
        }

        const message: Message = {
          id: uuidv4(),
          channelId: data.channelId,
          userId: user.id,
          username: user.username,
          userAvatar: user.avatar,
          content: data.content,
          createdAt: new Date(),
          edited: false
        };

        await db.addMessage(message);

        // Broadcast to all users in channel
        io.to(`channel:${data.channelId}`).emit('message:new', message);
      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Błąd wysyłania wiadomości' });
      }
    });

    // Edit message
    socket.on('message:edit', async (data: { channelId: string; messageId: string; content: string }) => {
      try {
        const message = await db.editMessage(data.channelId, data.messageId, data.content);
        if (message && message.userId === userId) {
          io.to(`channel:${data.channelId}`).emit('message:edited', message);
        }
      } catch (error) {
        console.error('Message edit error:', error);
      }
    });

    // Delete message
    socket.on('message:delete', async (data: { channelId: string; messageId: string }) => {
      try {
        // In real app, check if user owns the message or is admin
        await db.deleteMessage(data.channelId, data.messageId);
        io.to(`channel:${data.channelId}`).emit('message:deleted', {
          channelId: data.channelId,
          messageId: data.messageId
        });
      } catch (error) {
        console.error('Message delete error:', error);
      }
    });

    // Direct Messages
    socket.on('dm:join', async (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.join(`dm:${roomId}`);
      console.log(`User ${userId} joined DM room with ${data.friendId}`);
    });

    socket.on('dm:leave', async (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.leave(`dm:${roomId}`);
    });

    socket.on('dm:send', async (data: { friendId: string; content: string }) => {
      try {
        const user = await db.getUserById(userId);
        if (!user) return;

        // Check if user is banned
        if (user.restrictions?.isBanned) {
          socket.emit('error', { message: 'Twoje konto zostało zablokowane' });
          return;
        }

        // Check if user can send messages
        if (user.restrictions?.canSendMessages === false) {
          socket.emit('error', { message: 'Nie możesz wysyłać wiadomości' });
          return;
        }

        // Check if they are friends
        if (!await db.areFriends(userId, data.friendId)) {
          socket.emit('error', { message: 'Możesz wysyłać wiadomości tylko do znajomych' });
          return;
        }

        // Check if either user has blocked the other
        if (await db.isAnyBlockBetween(userId, data.friendId)) {
          socket.emit('error', { message: 'Nie możesz wysyłać wiadomości temu użytkownikowi' });
          return;
        }

        const dm: DirectMessage = {
          id: uuidv4(),
          senderId: userId,
          receiverId: data.friendId,
          senderUsername: user.username,
          senderAvatar: user.avatar,
          senderBio: user.bio,
          senderStatus: user.status,
          content: data.content,
          createdAt: new Date(),
          read: false
        };

        await db.addDirectMessage(dm);

        // Deliver to sender (this socket) and directly to receiver's personal room.
        // Using personal rooms guarantees delivery even if the receiver hasn't
        // opened the conversation (and therefore never emitted dm:join).
        socket.emit('dm:new', dm);
        socket.to(`user:${data.friendId}`).emit('dm:new', dm);
      } catch (error) {
        console.error('DM send error:', error);
        socket.emit('error', { message: 'Błąd wysyłania wiadomości' });
      }
    });

    socket.on('dm:typing:start', async (data: { friendId: string }) => {
      const user = await db.getUserById(userId);
      if (user) {
        const roomId = [userId, data.friendId].sort().join(':');
        socket.to(`dm:${roomId}`).emit('dm:typing:start', {
          friendId: userId,
          username: user.username
        });
      }
    });

    socket.on('dm:typing:stop', async (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.to(`dm:${roomId}`).emit('dm:typing:stop', {
        friendId: userId
      });
    });

    // Edit DM (only sender can edit)
    socket.on('dm:edit', async (data: { friendId: string; messageId: string; content: string }) => {
      try {
        const updated = await db.editDirectMessage(userId, data.friendId, data.messageId, data.content);
        if (!updated) return;
        socket.emit('dm:edited', updated);
        socket.to(`user:${data.friendId}`).emit('dm:edited', updated);
      } catch (error) {
        console.error('DM edit error:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Delete DM (only sender can delete)
    socket.on('dm:delete', async (data: { friendId: string; messageId: string }) => {
      try {
        await db.deleteDirectMessage(userId, data.friendId, data.messageId);
        socket.emit('dm:deleted', { messageId: data.messageId });
        socket.to(`user:${data.friendId}`).emit('dm:deleted', { messageId: data.messageId });
      } catch (error) {
        console.error('DM delete error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Toggle emoji reaction on a DM
    socket.on('dm:react', async (data: { friendId: string; messageId: string; emoji: string }) => {
      try {
        const reactions = await db.getMessageReactions(data.messageId);
        const alreadyReacted = (reactions.find(r => r.emoji === data.emoji)?.userIds ?? []).includes(userId);
        if (alreadyReacted) await db.removeReaction(data.messageId, userId, data.emoji);
        else await db.addReaction(data.messageId, userId, data.emoji);
        const updatedReactions = await db.getMessageReactions(data.messageId);
        db.setReactionMemory(data.messageId, updatedReactions); // sync to memory as well
        const payload = { messageId: data.messageId, reactions: updatedReactions };
        socket.emit('dm:reactions:update', payload);
        socket.to(`user:${data.friendId}`).emit('dm:reactions:update', payload);
      } catch (error) {
        // DB table doesn't exist yet — use in-memory fallback
        console.warn('dm:react DB fallback (create message_reactions table in Supabase):', (error as any)?.message);
        const updatedReactions = db.toggleReactionInMemory(data.messageId, userId, data.emoji);
        const payload = { messageId: data.messageId, reactions: updatedReactions };
        socket.emit('dm:reactions:update', payload);
        socket.to(`user:${data.friendId}`).emit('dm:reactions:update', payload);
      }
    });

    // Clear all DMs between two users (both sides)
    socket.on('dm:clear', async (data: { friendId: string }) => {
      try {
        await db.clearDirectMessages(userId, data.friendId);
        socket.emit('dm:cleared', { friendId: data.friendId });
        socket.to(`user:${data.friendId}`).emit('dm:cleared', { friendId: userId });
      } catch (error) {
        console.error('DM clear error:', error);
        socket.emit('error', { message: 'Failed to clear chat' });
      }
    });

    // Status change
    socket.on('status:change', async (data: { status: 'online' | 'offline' | 'away' }) => {
      db.updateUserStatus(userId, data.status);
      socket.broadcast.emit('user:status', { userId, status: data.status });
    });

    // Typing indicator
    socket.on('typing:start', async (data: { channelId: string }) => {
      const user = await db.getUserById(userId);
      if (user) {
        socket.to(`channel:${data.channelId}`).emit('typing:start', {
          channelId: data.channelId,
          userId: user.id,
          username: user.username
        });
      }
    });

    socket.on('typing:stop', async (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:stop', {
        channelId: data.channelId,
        userId
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId}`);
      clearInterval(heartbeatInterval);
      db.removeSession(socket.id);
      // Only mark offline if this was the last active connection for this user
      if (db.countActiveSessions(userId) === 0) {
        db.updateUserStatus(userId, 'offline');
        socket.broadcast.emit('user:status', { userId, status: 'offline' });
      }
    });
  });

  return io;
};
