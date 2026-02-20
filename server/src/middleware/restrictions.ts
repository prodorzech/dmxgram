import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../database';

// Helper to check if restriction has expired
const isRestrictionExpired = (expiresAt?: Date): boolean => {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
};

// Check if user is banned
export const checkBanned = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await db.getUserById(req.userId!);

  if (!user) {
    return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }

  if (user.restrictions?.isBanned) {
    const banRestriction = user.activeRestrictions?.find((r: any) => r.type === 'ban');
    return res.status(403).json({
      error: 'Konto zostało zablokowane',
      reason: banRestriction?.reason,
      expiresAt: banRestriction?.expiresAt
    });
  }

  // Auto-remove expired restrictions
  if (user.activeRestrictions) {
    const active = user.activeRestrictions.filter((r: any) => !isRestrictionExpired(r.expiresAt));
    if (active.length !== user.activeRestrictions.length) {
      await db.updateUser(req.userId!, { activeRestrictions: active });
    }
  }

  next();
};

// Check if user can add friends
export const checkCanAddFriends = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await db.getUserById(req.userId!);

  if (!user) {
    return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }

  if (user.restrictions?.canAddFriends === false) {
    return res.status(403).json({
      error: 'Nie możesz dodawać znajomych',
      reason: 'Nałożono ograniczenie dodawania znajomych'
    });
  }

  next();
};

// Check if user can accept friend requests
export const checkCanAcceptFriends = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await db.getUserById(req.userId!);

  if (!user) {
    return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }

  if (user.restrictions?.canAcceptFriends === false) {
    return res.status(403).json({
      error: 'Nie możesz akceptować zaproszeń do znajomych',
      reason: 'Nałożono ograniczenie akceptowania zaproszeń'
    });
  }

  next();
};

// Check if user can send messages
export const checkCanSendMessages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = await db.getUserById(req.userId!);

  if (!user) {
    return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }

  if (user.restrictions?.canSendMessages === false) {
    return res.status(403).json({
      error: 'Nie możesz wysyłać wiadomości',
      reason: 'Nałożono ograniczenie wysyłania wiadomości'
    });
  }

  next();
};
