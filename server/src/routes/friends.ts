import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkCanAddFriends, checkCanAcceptFriends, checkBanned } from '../middleware/restrictions';
import { FriendRequest, Friendship } from '../types';
import { Response } from 'express';
import { getIO } from '../socket';

const router = Router();

// In-memory lock to prevent race-condition duplicate friend requests
const pendingRequestLocks = new Set<string>();

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
      return res.status(404).json({ error: 'errUserNotFound' });
    }

    if (receiver.id === senderId) {
      return res.status(400).json({ error: 'errSelfAdd' });
    }

    // Check if either user has blocked the other
    if (await db.isAnyBlockBetween(senderId, receiver.id)) {
      return res.status(403).json({ error: 'errBlocked' });
    }

    // Check if already friends
    if (await db.areFriends(senderId, receiver.id)) {
      return res.status(400).json({ error: 'errAlreadyFriends' });
    }

    // In-memory lock — prevent simultaneous duplicate requests (race condition)
    const lockKey = [senderId, receiver.id].sort().join(':');
    if (pendingRequestLocks.has(lockKey)) {
      return res.status(400).json({ error: 'errRequestExists' });
    }
    pendingRequestLocks.add(lockKey);

    try {
      // Check if request already exists
      const existingRequest = await db.findExistingFriendRequest(senderId, receiver.id);
      if (existingRequest && existingRequest.status === 'pending') {
        return res.status(400).json({ error: 'errRequestExists' });
      }
      // If old accepted/rejected request exists, delete it so we can create a fresh one
      if (existingRequest) {
        await db.deleteFriendRequestBetween(senderId, receiver.id);
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

      try {
        await db.createFriendRequest(request);
      } catch (dbErr: any) {
        // Catch race-condition duplicate (DB unique constraint violation: Postgres code 23505)
        const msg: string = dbErr?.message ?? dbErr?.code ?? '';
        if (dbErr?.code === '23505' || msg.includes('23505') || msg.includes('unique') || msg.includes('duplicate')) {
          return res.status(400).json({ error: 'errRequestExists' });
        }
        throw dbErr;
      }

      // Notify receiver via socket in real-time
      try {
        const io = getIO();
        io.to(`user:${receiver.id}`).emit('friend:request', request);
      } catch (e) { /* socket not yet initialized, ignore */ }

      res.json(request);
    } finally {
      pendingRequestLocks.delete(lockKey);
    }
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
      banner: friend.banner,
      status: friend.status,
      badges: friend.badges || [],
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
    // Also remove any friend_request records between these users
    // so they can re-send invitations after removal
    await db.deleteFriendRequestBetween(userId, friendId);
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

// Get blocked user IDs
router.get('/blocked', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const blockedIds = await db.getBlockedUsers(userId);
    if (blockedIds.length === 0) return res.json([]);
    // Fetch user details for each blocked user
    const blockedUsers = await Promise.all(
      blockedIds.map(async (id) => {
        const u = await db.getUserById(id);
        if (!u) return null;
        return { id: u.id, username: u.username, avatar: u.avatar };
      })
    );
    res.json(blockedUsers.filter(Boolean));
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Block a user
router.post('/:userId/block', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const blockerId = req.userId!;
    const { userId: blockedId } = req.params;

    if (blockerId === blockedId) {
      return res.status(400).json({ error: 'Nie możesz zablokować siebie' });
    }

    await db.blockUser(blockerId, blockedId);

    // Remove friendship if exists
    if (await db.areFriends(blockerId, blockedId)) {
      await db.removeFriendship(blockerId, blockedId);
    }

    // Notify blocked user via socket so they lose the friend from their list
    try {
      const io = getIO();
      io.to(`user:${blockedId}`).emit('friend:removed', { friendId: blockerId });
      io.to(`user:${blockerId}`).emit('friend:removed', { friendId: blockedId });
    } catch (e) { /* ignore */ }

    res.json({ message: 'Użytkownik zablokowany' });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Unblock a user
router.delete('/:userId/block', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const blockerId = req.userId!;
    const { userId: blockedId } = req.params;

    await db.unblockUser(blockerId, blockedId);
    res.json({ message: 'Użytkownik odblokowany' });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
