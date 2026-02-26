import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { UserRestriction, UserRestrictions } from '../types';
import { generateRandomPassword } from '../utils/passwordValidation';
import { getIO } from '../socket';
import { createBoostCode, listBoostCodes, deleteBoostCode } from '../utils/boostCodes';

// Helper: push updated user data to the affected user's socket room
const emitUserUpdated = (userId: string, user: any) => {
  try { getIO().to(`user:${userId}`).emit('user:updated', user); } catch (_) {}
};

const router: Router = express.Router();

// Admin middleware
const adminMiddleware = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const user = await db.getUserById(req.userId!);
  
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Brak uprawnień administratora' });
  }
  
  next();
};

// Get all users (admin only)
router.get('/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const users = await db.getAllUsers();
    
    // Remove passwords from response
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      banner: user.banner,
      bio: user.bio,
      status: user.status,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      lastLoginIp: user.lastLoginIp,
      lastLoginCountry: user.lastLoginCountry,
      language: user.language,
      restrictions: user.restrictions,
      warnings: user.warnings,
      activeRestrictions: user.activeRestrictions,
      badges: user.badges || []
    }));
    
    res.json(sanitizedUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Set user restrictions (admin only)
router.post('/users/:userId/restrictions', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { restrictions } = req.body as { restrictions: UserRestrictions };
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }
    
    const updated = await db.updateUser(userId, { restrictions });
    emitUserUpdated(userId, updated);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Set restrictions error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update user badges (admin only)
router.patch('/users/:userId/badges', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { badges } = req.body as { badges: string[] };

    const VALID_BADGES = [
      'ceo', 'staff', 'moderator', 'media',
      'bug-hunter-1', 'bug-hunter-2', 'bug-hunter-3',
      'partnership', 'famous', 'sponsor', 'beta-tester', 'management'
    ];
    const filtered = (badges || []).filter(b => VALID_BADGES.includes(b));

    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Użytkownik nie znaleziony' });

    await db.updateUser(userId, { badges: filtered });
    const updated = await db.getUserById(userId);
    emitUserUpdated(userId, updated);
    res.json({ success: true, badges: filtered });
  } catch (error) {
    console.error('Update badges error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Add warning or restriction to user (admin only)
router.post('/users/:userId/moderation', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { type, reason, expiresIn, category } = req.body as { 
      type: 'warning' | 'restriction' | 'ban'; 
      reason: string; 
      expiresIn?: number;
      category?: string;
    };
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    const adminUser = await db.getUserById(req.userId!);
    
    const moderation: UserRestriction = {
      type,
      category,
      reason,
      issuedAt: new Date(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined,
      issuedBy: req.userId!,
      issuedByUsername: adminUser?.username
    };
    
    if (type === 'warning') {
      const warnings = user.warnings || [];
      warnings.push(moderation);
      await db.updateUser(userId, { warnings });
    } else if (type === 'restriction' || type === 'ban') {
      const activeRestrictions = user.activeRestrictions || [];
      activeRestrictions.push(moderation);
      await db.updateUser(userId, { activeRestrictions });
      
      // If ban, set all restrictions
      if (type === 'ban') {
        await db.updateUser(userId, {
          restrictions: {
            canAddFriends: false,
            canAcceptFriends: false,
            canSendMessages: false,
            isBanned: true
          }
        });
      }
    }
    
    const updated = await db.getUserById(userId);
    emitUserUpdated(userId, updated);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Add moderation error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Remove restriction from user (admin only)
router.delete('/users/:userId/restrictions/:index', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId, index } = req.params;
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }
    
    if (user.activeRestrictions) {
      user.activeRestrictions.splice(parseInt(index), 1);
      await db.updateUser(userId, { activeRestrictions: user.activeRestrictions });
    }
    
    const updated = await db.getUserById(userId);
    emitUserUpdated(userId, updated);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Remove restriction error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Remove single warning from user (admin only)
router.delete('/users/:userId/warnings/:index', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId, index } = req.params;

    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    if (user.warnings) {
      user.warnings.splice(parseInt(index), 1);
      await db.updateUser(userId, { warnings: user.warnings });
    }

    const updated = await db.getUserById(userId);
    emitUserUpdated(userId, updated);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Remove warning error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Clear all restrictions (admin only)
router.post('/users/:userId/clear-restrictions', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }
    
    await db.updateUser(userId, {
      restrictions: {
        canAddFriends: true,
        canAcceptFriends: true,
        canSendMessages: true,
        isBanned: false
      },
      activeRestrictions: [],
      warnings: []
    });
    
    const updated = await db.getUserById(userId);
    emitUserUpdated(userId, updated);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Clear restrictions error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Reset user password (admin only)
router.post('/users/:userId/reset-password', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }
    
    // Generate new random password
    const newPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user with new password and force change flag
    await db.updateUser(userId, {
      password: hashedPassword,
      mustChangePassword: true
    });
    
    // Return the plain password to admin (shown once)
    res.json({
      success: true,
      password: newPassword,
      username: user.username
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get all reports (admin only)
router.get('/reports', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const reports = await db.getAllReports();
    res.json(reports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update report status (admin only)
router.patch('/reports/:reportId/status', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body as { status: 'pending' | 'reviewed' };
    await db.updateReportStatus(reportId, status);
    res.json({ success: true });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get conversation for a report — last 50 DMs between senderId and receiverId (admin only)
router.get('/reports/:reportId/conversation', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { reportId } = req.params;
    const reports = await db.getAllReports();
    const report = reports.find(r => r.id === reportId);
    if (!report) {
      return res.status(404).json({ error: 'Zgłoszenie nie znalezione' });
    }
    const messages = await db.getDirectMessages(report.senderId, report.receiverId, 50);
    res.json(messages);
  } catch (error) {
    console.error('Get report conversation error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ── Boost Codes ────────────────────────────────────────────────────────────────

// GET /api/admin/boost-codes  — list all active codes
router.get('/boost-codes', authMiddleware, adminMiddleware, async (_req, res) => {
  res.json(await listBoostCodes());
});

// POST /api/admin/boost-codes  — generate a new code
router.post('/boost-codes', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  const { durationDays, maxUses = 1, note } = req.body as {
    durationDays?: number;
    maxUses?: number;
    note?: string;
  };
  if (!durationDays || durationDays < 1) {
    return res.status(400).json({ error: 'durationDays must be >= 1' });
  }
  const code = await createBoostCode(Number(durationDays), Number(maxUses) || 1, note);
  res.json(code);
});

// DELETE /api/admin/boost-codes/:code  — revoke a code
router.delete('/boost-codes/:code', authMiddleware, adminMiddleware, async (req, res) => {
  const deleted = await deleteBoostCode(req.params.code);
  if (!deleted) return res.status(404).json({ error: 'Code not found' });
  res.json({ success: true });
});

export default router;
