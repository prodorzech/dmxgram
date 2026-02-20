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
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        process.env.CLIENT_URL || ''
      ].filter(Boolean),
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string };
      (socket as any).userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`User connected: ${userId}`);

    // Save session
    db.setUserSession(socket.id, userId);
    db.updateUserStatus(userId, 'online');

    // Join personal room for notifications (friend requests, etc.)
    socket.join(`user:${userId}`);

    // Notify others about user status
    socket.broadcast.emit('user:status', { userId, status: 'online' });

    // Join server rooms
    const userServers = db.getUserServers(userId);
    userServers.forEach(server => {
      socket.join(`server:${server.id}`);
    });

    // Join channel
    socket.on('channel:join', (data: { channelId: string }) => {
      socket.join(`channel:${data.channelId}`);
      console.log(`User ${userId} joined channel ${data.channelId}`);
    });

    // Leave channel
    socket.on('channel:leave', (data: { channelId: string }) => {
      socket.leave(`channel:${data.channelId}`);
    });

    // Send message
    socket.on('message:send', (data: { channelId: string; content: string; serverId: string }) => {
      try {
        const user = db.getUserById(userId);
        if (!user) return;

        const server = db.getServerById(data.serverId);
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

        db.addMessage(message);

        // Broadcast to all users in channel
        io.to(`channel:${data.channelId}`).emit('message:new', message);
      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Błąd wysyłania wiadomości' });
      }
    });

    // Edit message
    socket.on('message:edit', (data: { channelId: string; messageId: string; content: string }) => {
      try {
        const message = db.editMessage(data.channelId, data.messageId, data.content);
        if (message && message.userId === userId) {
          io.to(`channel:${data.channelId}`).emit('message:edited', message);
        }
      } catch (error) {
        console.error('Message edit error:', error);
      }
    });

    // Delete message
    socket.on('message:delete', (data: { channelId: string; messageId: string }) => {
      try {
        // In real app, check if user owns the message or is admin
        db.deleteMessage(data.channelId, data.messageId);
        io.to(`channel:${data.channelId}`).emit('message:deleted', {
          channelId: data.channelId,
          messageId: data.messageId
        });
      } catch (error) {
        console.error('Message delete error:', error);
      }
    });

    // Direct Messages
    socket.on('dm:join', (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.join(`dm:${roomId}`);
      console.log(`User ${userId} joined DM room with ${data.friendId}`);
    });

    socket.on('dm:leave', (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.leave(`dm:${roomId}`);
    });

    socket.on('dm:send', (data: { friendId: string; content: string }) => {
      try {
        const user = db.getUserById(userId);
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
        if (!db.areFriends(userId, data.friendId)) {
          socket.emit('error', { message: 'Możesz wysyłać wiadomości tylko do znajomych' });
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

        db.addDirectMessage(dm);

        // Send to both users
        const roomId = [userId, data.friendId].sort().join(':');
        io.to(`dm:${roomId}`).emit('dm:new', dm);
      } catch (error) {
        console.error('DM send error:', error);
        socket.emit('error', { message: 'Błąd wysyłania wiadomości' });
      }
    });

    socket.on('dm:typing:start', (data: { friendId: string }) => {
      const user = db.getUserById(userId);
      if (user) {
        const roomId = [userId, data.friendId].sort().join(':');
        socket.to(`dm:${roomId}`).emit('dm:typing:start', {
          friendId: userId,
          username: user.username
        });
      }
    });

    socket.on('dm:typing:stop', (data: { friendId: string }) => {
      const roomId = [userId, data.friendId].sort().join(':');
      socket.to(`dm:${roomId}`).emit('dm:typing:stop', {
        friendId: userId
      });
    });

    // Status change
    socket.on('status:change', (data: { status: 'online' | 'offline' | 'away' }) => {
      db.updateUserStatus(userId, data.status);
      socket.broadcast.emit('user:status', { userId, status: data.status });
    });

    // Typing indicator
    socket.on('typing:start', (data: { channelId: string }) => {
      const user = db.getUserById(userId);
      if (user) {
        socket.to(`channel:${data.channelId}`).emit('typing:start', {
          channelId: data.channelId,
          userId: user.id,
          username: user.username
        });
      }
    });

    socket.on('typing:stop', (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:stop', {
        channelId: data.channelId,
        userId
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
      db.removeSession(socket.id);
      db.updateUserStatus(userId, 'offline');
      socket.broadcast.emit('user:status', { userId, status: 'offline' });
    });
  });

  return io;
};
