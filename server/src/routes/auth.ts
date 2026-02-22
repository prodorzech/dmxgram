import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { User, AuthResponse } from '../types';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validatePassword } from '../utils/passwordValidation';
import { generateVerificationCode, sendVerificationEmail } from '../utils/email';
import { getIO } from '../socket';

const router: Router = express.Router();

// Helper function to serialize user data for responses
const serializeUser = (user: User) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  avatar: user.avatar,
  banner: user.banner,
  bio: user.bio,
  customStatus: user.customStatus,
  createdAt: user.createdAt,
  status: user.status,
  language: user.language,
  isAdmin: user.isAdmin,
  mustChangePassword: user.mustChangePassword,
  restrictions: user.restrictions,
  warnings: user.warnings,
  activeRestrictions: user.activeRestrictions,
  badges: user.badges || []
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
    }

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Check if user exists
    if (await db.getUserByEmail(email)) {
      return res.status(400).json({ error: 'Email już istnieje' });
    }

    if (await db.getUserByUsername(username)) {
      return res.status(400).json({ error: 'Nazwa użytkownika zajęta' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user: User = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date(),
      status: 'offline'
    };

    await db.createUser(user);

    // Add user to default server (best-effort – server may not exist)
    try {
      await db.addServerMember('default-server', user.id);
    } catch (_) { /* default-server not present, skip */ }

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    const response: AuthResponse = {
      token,
      user: serializeUser(user)
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email i hasło są wymagane' });
    }

    // Find user
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowe dane logowania' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Nieprawidłowe dane logowania' });
    }
    // Block login if email not verified
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'errEmailNotVerified', email: user.email });
    }
    // Update last login IP and language from Accept-Language header
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                     req.socket.remoteAddress || 
                     'Unknown';
    const language = req.headers['accept-language']?.split(',')[0] || 'pl-PL';
    
    await db.updateUser(user.id, {
      lastLoginIp: clientIp,
      language: language
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    const response: AuthResponse = {
      token,
      user: serializeUser(user)
    };

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await db.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update user profile
router.patch('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { username, avatar, banner, bio } = req.body;
    const updates: Partial<User> = {};

    if (username) {
      // Check if username is taken
      const existingUser = await db.getUserByUsername(username);
      if (existingUser && existingUser.id !== req.userId) {
        return res.status(400).json({ error: 'Nazwa użytkownika jest zajęta' });
      }
      updates.username = username;
    }

    if (avatar !== undefined) updates.avatar = avatar;
    if (banner !== undefined) updates.banner = banner;
    if (bio !== undefined) updates.bio = bio;

    const updatedUser = await db.updateUser(req.userId!, updates);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    // Notify all friends about profile update (so their friend list refreshes avatar etc.)
    try {
      const io = getIO();
      const friends = await db.getFriends(req.userId!);
      const payload = {
        userId: updatedUser.id,
        username: updatedUser.username,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio,
      };
      friends.forEach(f => io.to(`user:${f.id}`).emit('user:profile:updated', payload));
    } catch (_) { /* socket not ready */ }

    res.json(serializeUser(updatedUser));
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update user status
router.patch('/me/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;

    if (!status || !['online', 'offline', 'away'].includes(status)) {
      return res.status(400).json({ error: 'Nieprawidłowy status' });
    }

    // Update in-memory cache AND persist to DB as preferred status
    db.updateUserStatus(req.userId!, status);
    await db.updateUser(req.userId!, { status });
    const user = await db.getUserById(req.userId!);

    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    res.json(serializeUser(user));
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update user language
router.patch('/me/language', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({ error: 'Język jest wymagany' });
    }

    await db.updateUser(req.userId!, { language });
    const user = await db.getUserById(req.userId!);

    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    res.json(serializeUser(user));
  } catch (error) {
    console.error('Update language error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Update user custom status
router.patch('/me/custom-status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { customStatus } = req.body;

    await db.updateUser(req.userId!, { customStatus: customStatus || undefined });
    const user = await db.getUserById(req.userId!);

    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    res.json(serializeUser(user));
  } catch (error) {
    console.error('Update custom status error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Change password
router.post('/me/change-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Nowe hasło jest wymagane' });
    }

    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    const user = await db.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    // If user must change password, allow without current password verification
    if (!user.mustChangePassword) {
      // Normal password change requires current password
      if (!currentPassword) {
        return res.status(400).json({ error: 'Obecne hasło jest wymagane' });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Nieprawidłowe obecne hasło' });
      }
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(req.userId!, {
      password: hashedPassword,
      mustChangePassword: false
    });

    res.json({ success: true, message: 'Hasło zostało zmienione' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});
// Change password
router.post('/me/change-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'Nowe hasło jest wymagane' });
    }

    // Validate new password
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    const user = await db.getUserById(req.userId!);
    if (!user) {
      return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
    }

    // If user must change password, allow without current password verification
    if (!user.mustChangePassword) {
      // Normal password change requires current password
      if (!currentPassword) {
        return res.status(400).json({ error: 'Obecne hasło jest wymagane' });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Nieprawidłowe obecne hasło' });
      }
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.updateUser(req.userId!, {
      password: hashedPassword,
      mustChangePassword: false
    });

    res.json({ success: true, message: 'Hasło zostało zmienione' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
