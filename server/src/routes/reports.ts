import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router: Router = express.Router();

// Submit a report (any authenticated user)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      messageId,
      messageContent,
      reportedUserId,
      reportedUsername,
      senderId,
      receiverId,
      category,
      reason,
    } = req.body as {
      messageId: string;
      messageContent: string;
      reportedUserId: string;
      reportedUsername: string;
      senderId: string;
      receiverId: string;
      category?: string;
      reason?: string;
    };

    if (!messageId || !messageContent || !reportedUserId || !senderId || !receiverId) {
      return res.status(400).json({ error: 'Brakujące pola' });
    }

    const reporter = await db.getUserById(req.userId!);
    if (!reporter) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    // Encode category + reason into message_content so no schema change is needed
    const encodedContent = JSON.stringify({
      text: messageContent,
      category: category || 'other',
      reason: reason || '',
    });

    await db.createReport({
      id: uuidv4(),
      reporterId: req.userId!,
      reporterUsername: reporter.username,
      reportedUserId,
      reportedUsername: reportedUsername || 'Nieznany',
      messageId,
      messageContent: encodedContent,
      senderId,
      receiverId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
