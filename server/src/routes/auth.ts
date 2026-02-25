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

// ── JWT secret helper ──────────────────────────────────────────────────────
const jwtSecret = (): string => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is not set');
  return s;
};

// ── In-memory pending email verifications ─────────────────────────────────
// Max 1000 slots to prevent memory exhaustion (each slot ≈ 256 bytes)
const MAX_PENDING = 1000;
const pendingVerifications = new Map<string, {
  code: string;
  username: string;
  email: string;
  hashedPassword: string;
  expires: number;
}>();

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
  badges: user.badges || [],
  hasDmxBoost: user.hasDmxBoost ?? false,
  dmxBoostExpiresAt: user.dmxBoostExpiresAt ?? undefined,
});

// Register
router.post('/register', async (req, res) => {
  try {
    let { username, email, password } = req.body;

    // Sanitize
    username = (username || '').trim();
    email    = (email    || '').trim().toLowerCase();
    password = (password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
    }
    if (username.length > 32) {
      return res.status(400).json({ error: 'Nazwa użytkownika może mieć maksymalnie 32 znaki' });
    }
    if (email.length > 254) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Nieprawidłowy adres email' });
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

    // Try to send verification email; if it fails, create account directly
    const code = generateVerificationCode();
    let emailSent = false;
    try {
      await sendVerificationEmail(email, username, code);
      emailSent = true;
    } catch (emailErr) {
      console.error('Email send error (falling back to direct registration):', emailErr);
    }

    if (emailSent) {
      // Throttle: don't allow memory exhaustion of pendingVerifications
    if (pendingVerifications.size >= MAX_PENDING) {
      // Evict oldest expired entries first
      for (const [k, v] of pendingVerifications) {
        if (Date.now() > v.expires) pendingVerifications.delete(k);
        if (pendingVerifications.size < MAX_PENDING) break;
      }
      // If still full, reject
      if (pendingVerifications.size >= MAX_PENDING) {
        return res.status(429).json({ error: 'Serwer jest tymczasowo przeciążony. Spróbuj za chwilę.' });
      }
    }

    pendingVerifications.set(email, {
        code,
        username,
        email,
        hashedPassword,
        expires: Date.now() + 15 * 60 * 1000 // 15 min
      });
      return res.status(200).json({ needsVerification: true, email });
    }

    // Email not available – create account immediately (emailVerified = true)
    const userId = uuidv4();
    const newUser: User = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      avatar: null,
      banner: null,
      bio: null,
      customStatus: null,
      createdAt: new Date() as unknown as string,
      status: 'online',
      language: 'pl',
      isAdmin: false,
      mustChangePassword: false,
      restrictions: [],
      warnings: [],
      activeRestrictions: [],
      badges: [],
      emailVerified: true,
    } as unknown as User;

    await db.createUser(newUser);

    const token = jwt.sign({ userId }, jwtSecret(), { expiresIn: '7d' });
    res.status(201).json({ token, user: serializeUser(newUser) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const pending = pendingVerifications.get(email);
    if (!pending) return res.status(400).json({ error: 'errInvalidCode' });
    if (Date.now() > pending.expires) {
      pendingVerifications.delete(email);
      return res.status(400).json({ error: 'errCodeExpired' });
    }
    if (pending.code !== code) return res.status(400).json({ error: 'errInvalidCode' });

    // Create the user now that the email is verified
    const user: User = {
      id: uuidv4(),
      username: pending.username,
      email: pending.email,
      password: pending.hashedPassword,
      createdAt: new Date(),
      status: 'offline',
      emailVerified: true
    };

    await db.createUser(user);
    pendingVerifications.delete(email);

    try { await db.addServerMember('default-server', user.id); } catch (_) {}

    const token = jwt.sign(
      { userId: user.id },
      jwtSecret(),
      { expiresIn: '7d' }
    );

    res.json({ token, user: serializeUser(user) });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const pending = pendingVerifications.get(email);
    if (!pending) return res.status(400).json({ error: 'No pending verification for this email' });

    const code = generateVerificationCode();
    pending.code = code;
    pending.expires = Date.now() + 15 * 60 * 1000;
    pendingVerifications.set(email, pending);

    await sendVerificationEmail(email, pending.username, code);

    res.json({ success: true });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    // Sanitize
    email    = (email    || '').trim().toLowerCase();
    password = (password || '');

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
      jwtSecret(),
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
    if (banner !== undefined) {
      // Banner requires DMX Boost — reject if user doesn't have it
      const currentUser = await db.getUserById(req.userId!);
      if (!currentUser?.hasDmxBoost) {
        return res.status(403).json({ error: 'Baner profilowy wymaga DMX Boost' });
      }
      updates.banner = banner;
    }
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
