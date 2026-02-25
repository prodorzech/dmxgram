import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth';
import serverRoutes from './routes/servers';
import friendRoutes from './routes/friends';
import uploadRoutes from './routes/upload';
import adminRoutes from './routes/admin';
import reportsRoutes from './routes/reports';
import paymentsRoutes from './routes/payments';
import { initializeSocket } from './socket';
import { db } from './database';

dotenv.config();

const app: Express = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// ── Security headers (helmet) ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false, // Blocks crossorigin script/css loads in Electron
  crossOriginOpenerPolicy: false,   // Can interfere with Electron window
}));
app.disable('x-powered-by');

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow: no origin (file://, Electron loadFile), null, localhost, dmx://
    if (!origin || origin === 'null' || origin.startsWith('dmx://') || origin.startsWith('file://')) {
      return callback(null, true);
    }
    const allowedOrigins = [
      'http://localhost:3000', 'http://localhost:3001',
      'http://localhost:3002', 'http://localhost:3003',
      process.env.CLIENT_URL
    ].filter(Boolean);
    if (allowedOrigins.some(allowed => origin?.startsWith(allowed as string))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// ── Body limits (prevent oversized payloads) ───────────────────────────────
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

// ── Request timeout (guard against hanging Supabase/DB calls) ─────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  const TIMEOUT_MS = 15_000;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timeout' });
    }
  }, TIMEOUT_MS);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// ── Rate limiters ──────────────────────────────────────────────────────────
// Strict limiter for auth endpoints (login, register, verify)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1', // localhost always allowed (Electron)
});

// Light limiter for all other API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele żądań. Zwolnij.' },
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

// ── Serve uploaded files ───────────────────────────────────────────────────
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/payments', paymentsRoutes);

// Health check (no rate limit needed)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'DMXGram Server is running' });
});

// ── Production: React app is served by Electron's dmx:// protocol ────────
// Express is now API-only. The fallback below handles edge cases only.
if (process.env.NODE_ENV === 'production') {
  const clientDist = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../../client/dist');
  console.log('[Server] Client dist path:', clientDist);
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    if (/\.(js|css|map|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|json)$/i.test(req.path)) {
      return next();
    }
    const indexPath = path.join(clientDist, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('[Fallback] sendFile failed:', indexPath, err.message);
        res.status(500).send('DMXGram UI Error: ' + err.message);
      }
    });
  });
}

// ── Global error handler ───────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Wewnętrzny błąd serwera';
  if (status >= 500) console.error('[Server Error]', err);
  res.status(status).json({ error: message });
});

// ── Socket.io ──────────────────────────────────────────────────────────────
initializeSocket(httpServer);

// ── Start ──────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌐 API available at http://localhost:${PORT}/api`);
});

// ── Revoke expired DMX Boost subscriptions every hour ─────────────────────
async function checkExpiredBoosts() {
  try {
    const revoked = await db.revokeExpiredBoosts();
    if (revoked > 0) console.log(`[DMX Boost] Revoked ${revoked} expired subscription(s).`);
  } catch (err) {
    console.error('[DMX Boost] Error revoking expired boosts:', err);
  }
}
checkExpiredBoosts();
setInterval(checkExpiredBoosts, 60 * 60 * 1000);

export default app;
