import express, { Request, Response } from 'express';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

// POST /api/users/:userId/like - Like a user
router.post('/:userId/like', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'Cannot like yourself' });
    }

    // Check if user exists
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already liked
    const { data: existingLike, error: checkError } = await db.supabase
      .from('user_likes')
      .select('id')
      .eq('liker_id', currentUserId)
      .eq('liked_user_id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error)
      console.error('❌ Check existing like error:', checkError);
      const errorMsg = (checkError as any)?.message || (checkError as any)?.details || JSON.stringify(checkError);
      return res.status(500).json({ error: `Failed to check like: ${errorMsg}` });
    }

    if (existingLike) {
      return res.status(400).json({ error: 'Already liked this user' });
    }

    // Insert like
    const { data, error } = await db.supabase
      .from('user_likes')
      .insert([{ liker_id: currentUserId, liked_user_id: userId }])
      .select('id');

    if (error) {
      console.error('❌ Like error:', error);
      const errorMsg = (error as any)?.message || (error as any)?.details || JSON.stringify(error);
      return res.status(500).json({ error: `Failed to like user: ${errorMsg}` });
    }

    res.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error('❌ Like endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:userId/like - Unlike a user
router.delete('/:userId/like', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { error } = await db.supabase
      .from('user_likes')
      .delete()
      .eq('liker_id', currentUserId)
      .eq('liked_user_id', userId);

    if (error) {
      console.error('❌ Unlike error:', error);
      const errorMsg = (error as any)?.message || (error as any)?.details || JSON.stringify(error);
      return res.status(500).json({ error: `Failed to unlike user: ${errorMsg}` });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Unlike endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:userId/likes-count - Get likes count for a user
router.get('/:userId/likes-count', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: likes, error } = await db.supabase
      .from('user_likes')
      .select('id', { count: 'exact' })
      .eq('liked_user_id', userId);

    if (error) {
      console.error('❌ Likes count error:', error);
      const errorMsg = (error as any)?.message || (error as any)?.details || JSON.stringify(error);
      return res.status(500).json({ error: `Failed to fetch likes count: ${errorMsg}` });
    }

    const count = likes?.length || 0;
    res.json({ count });
  } catch (error) {
    console.error('❌ Likes count endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:userId/liked-by-me - Check if current user liked this user
router.get('/:userId/liked-by-me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.userId;

    if (!currentUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: like, error } = await db.supabase
      .from('user_likes')
      .select('id')
      .eq('liker_id', currentUserId)
      .eq('liked_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error)
      console.error('❌ Check like error:', error);
      const errorMsg = (error as any)?.message || (error as any)?.details || JSON.stringify(error);
      return res.status(500).json({ error: `Failed to check like: ${errorMsg}` });
    }

    res.json({ liked: !!like });
  } catch (error) {
    console.error('❌ Check like endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
