import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { Response } from 'express';
import { getSupabase } from '../database';

const router = Router();

// ─── All uploads use memory storage — files go to Supabase Storage (public CDN)
// so every user can access each other's media regardless of who hosts the server.

const memoryStorage = multer.memoryStorage();

// ─── Helper: ensure bucket exists (ignores "already exists" error) ────────────
async function ensureBucket(name: string) {
  const supabase = getSupabase();
  const { error } = await supabase.storage.createBucket(name, { public: true });
  if (error && !error.message?.includes('already exists') && error.message !== 'The resource already exists') {
    console.warn(`[upload] ensureBucket(${name}):`, error.message);
  }
}

// ─── Helper: upload buffer → Supabase Storage and return public URL ────────────
async function uploadToStorage(bucket: string, filename: string, buffer: Buffer, mimetype: string): Promise<string> {
  await ensureBucket(bucket);
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, { contentType: mimetype, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl as string;
}

// ─── Avatar upload ─────────────────────────────────────────────────────────────
const uploadAvatar = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki obrazów są dozwolone (.jpg, .jpeg, .png, .gif, .webp)'));
    }
  }
});

router.post('/avatar', authMiddleware, uploadAvatar.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
    const filename = `${uuidv4()}${path.extname(req.file.originalname)}`;
    const publicUrl = await uploadToStorage('avatars', filename, req.file.buffer, req.file.mimetype);
    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: error.message || 'Błąd podczas uploadu pliku' });
  }
});

// ─── Banner upload ─────────────────────────────────────────────────────────────
const uploadBanner = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tylko pliki obrazów są dozwolone (.jpg, .jpeg, .png, .gif, .webp)'));
    }
  }
});

router.post('/banner', authMiddleware, uploadBanner.single('banner'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Brak pliku' });
    const filename = `${uuidv4()}${path.extname(req.file.originalname)}`;
    const publicUrl = await uploadToStorage('banners', filename, req.file.buffer, req.file.mimetype);
    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Banner upload error:', error);
    res.status(500).json({ error: error.message || 'Błąd podczas uploadu pliku' });
  }
});

// ─── Chat media upload ─────────────────────────────────────────────────────────
const ALLOWED_CHAT_MIME = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|webm|quicktime|x-msvideo|avi|mov))$/;
const ALLOWED_CHAT_EXT = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi)$/i;

const uploadChatMedia = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const extOk = ALLOWED_CHAT_EXT.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = ALLOWED_CHAT_MIME.test(file.mimetype);
    if (extOk || mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpg, png, gif, webp) and videos (mp4, webm, mov) are allowed'));
    }
  }
});

router.post('/chat', authMiddleware, uploadChatMedia.array('files', 10), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const files = req.files as Express.Multer.File[];

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'Total file size exceeds 20 MB' });
    }

    const attachments = await Promise.all(files.map(async (f) => {
      const filename = `${uuidv4()}${path.extname(f.originalname)}`;
      const publicUrl = await uploadToStorage('chat', filename, f.buffer, f.mimetype);
      return { url: publicUrl, filename: f.originalname, mimetype: f.mimetype, size: f.size };
    }));

    res.json({ attachments });
  } catch (error: any) {
    console.error('Chat upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

export default router;
