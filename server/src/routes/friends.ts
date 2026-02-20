import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkCanAddFriends, checkCanAcceptFriends, checkBanned } from '../middleware/restrictions';
import { FriendRequest, Friendship } from '../types';
import { Response } from 'express';
import { getIO } from '../socket';

const router = Router();

// Send friend request
router.post('/request', authMiddleware, checkBanned, checkCanAddFriends, async (req: AuthRequest, res) => {
  try {
    const { username } = req.body;
    const senderId = req.userId!;
    
    if (!username) {
      return res.status(400).json({ error: 'Username jest wymagany' });
    }

    // Find receiver by username
    const receiver = await db.getUserByUsername(username);
    if (!receiver) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    if (receiver.id === senderId) {
      return res.status(400).json({ error: 'Nie możesz dodać siebie do znajomych' });
    }

    // Check if already friends
    if (await db.areFriends(senderId, receiver.id)) {
      return res.status(400).json({ error: 'Już jesteście znajomymi' });
    }

    // Check if request already exists
    const existingRequest = await db.findExistingFriendRequest(senderId, receiver.id);
    if (existingRequest && existingRequest.status === 'pending') {
      return res.status(400).json({ error: 'Zaproszenie do znajomych już istnieje' });
    }

    const sender = await db.getUserById(senderId);
    if (!sender) return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    const request: FriendRequest = {
      id: uuidv4(),
      senderId,
      senderUsername: sender.username,
      receiverId: receiver.id,
      status: 'pending',
      createdAt: new Date(),
    };

    await db.createFriendRequest(request);

    // Notify receiver via socket in real-time
    try {
      const io = getIO();
      io.to(`user:${receiver.id}`).emit('friend:request', request);
    } catch (e) { /* socket not yet initialized, ignore */ }

    res.json(request);
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get pending friend requests (received)
router.get('/requests/pending', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const requests = await db.getPendingFriendRequests(userId);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching friend requests:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get sent friend requests
router.get('/requests/sent', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const requests = await db.getSentFriendRequests(userId);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Accept friend request
router.post('/requests/:requestId/accept', authMiddleware, checkBanned, checkCanAcceptFriends, async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId!;

    const request = await db.getFriendRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Zaproszenie nie znalezione' });
    }

    if (request.receiverId !== userId) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Zaproszenie już przetworzone' });
    }

    // Update request status
    await db.updateFriendRequestStatus(requestId, 'accepted');

    // Create friendship
    const friendship: Friendship = {
      userId1: request.senderId,
      userId2: request.receiverId,
      createdAt: new Date(),
    };
    await db.createFriendship(friendship);

    // Notify both users via socket
    try {
      const io = getIO();
      const accepter = await db.getUserById(userId);
      const senderUser = await db.getUserById(request.senderId);
      // Notify sender that request was accepted
      io.to(`user:${request.senderId}`).emit('friend:accepted', {
        requestId,
        friendship,
        friend: accepter ? {
          id: accepter.id,
          username: accepter.username,
          avatar: accepter.avatar,
          bio: accepter.bio,
          status: accepter.status
        } : null
      });
      // Notify accepter with sender data
      io.to(`user:${userId}`).emit('friend:accepted', {
        requestId,
        friendship,
        friend: senderUser ? {
          id: senderUser.id,
          username: senderUser.username,
          avatar: senderUser.avatar,
          bio: senderUser.bio,
          status: senderUser.status
        } : null
      });
    } catch (e) { /* socket not yet initialized, ignore */ }

    res.json({ message: 'Zaproszenie zaakceptowane', friendship });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Reject friend request
router.post('/requests/:requestId/reject', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId!;

    const request = await db.getFriendRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Zaproszenie nie znalezione' });
    }

    if (request.receiverId !== userId) {
      return res.status(403).json({ error: 'Brak uprawnień' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Zaproszenie już przetworzone' });
    }

    await db.updateFriendRequestStatus(requestId, 'rejected');
    res.json({ message: 'Zaproszenie odrzucone' });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get friends list
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const friends = (await db.getFriends(userId)).map(friend => ({
      id: friend.id,
      username: friend.username,
      avatar: friend.avatar,
      bio: friend.bio,
      status: friend.status,
    }));
    res.json(friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Remove friend
router.delete('/:friendId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;

    if (!await db.areFriends(userId, friendId)) {
      return res.status(400).json({ error: 'Nie jesteście znajomymi' });
    }

    await db.removeFriendship(userId, friendId);
    res.json({ message: 'Znajomy usunięty' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get direct messages with a friend
router.get('/:friendId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;

    if (!await db.areFriends(userId, friendId)) {
      return res.status(403).json({ error: 'Możesz wysyłać wiadomości tylko do znajomych' });
    }

    const messages = await db.getDirectMessages(userId, friendId);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching direct messages:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get mutual friends
router.get('/:friendId/mutual', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;

    if (!await db.areFriends(userId, friendId)) {
      return res.status(403).json({ error: 'Możesz sprawdzać wspólnych znajomych tylko ze znajomymi' });
    }

    const mutualFriends = (await db.getMutualFriends(userId, friendId)).map(friend => ({
      id: friend.id,
      username: friend.username,
      avatar: friend.avatar,
      status: friend.status,
    }));
    
    res.json(mutualFriends);
  } catch (error) {
    console.error('Error fetching mutual friends:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
