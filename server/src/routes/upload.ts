import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Base uploads directory: AppData in production, server/uploads in dev
const uploadsBase = process.env.UPLOADS_PATH || 'uploads';

// Ensure upload directories exist
fs.mkdirSync(path.join(uploadsBase, 'avatars'), { recursive: true });
fs.mkdirSync(path.join(uploadsBase, 'banners'), { recursive: true });

// Configure multer for avatar storage
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(uploadsBase, 'avatars'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Configure multer for banner storage
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(uploadsBase, 'banners'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki obrazów są dozwolone (.jpg, .jpeg, .png, .gif, .webp)'));
    }
  }
});

const uploadBanner = multer({
  storage: bannerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for banners
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki obrazów są dozwolone (.jpg, .jpeg, .png, .gif, .webp)'));
    }
  }
});

// Upload avatar endpoint
router.post('/avatar', authMiddleware, uploadAvatar.single('avatar'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Brak pliku' });
    }

    // Return the file URL
    const fileUrl = `/uploads/avatars/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Błąd podczas uploadu pliku' });
  }
});

// Upload banner endpoint
router.post('/banner', authMiddleware, uploadBanner.single('banner'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Brak pliku' });
    }

    // Return the file URL
    const fileUrl = `/uploads/banners/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Błąd podczas uploadu pliku' });
  }
});

export default router;
