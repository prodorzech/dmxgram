import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { db } from '../database';

// Helper to check if restriction has expired
const isRestrictionExpired = (expiresAt?: Date): boolean => {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
};

// Helper to get active restrictions
const getActiveRestrictions = (userId: string) => {
  const user = db.getUserById(userId);
  if (!user) return null;
  
  // Filter out expired restrictions
  if (user.activeRestrictions) {
    const active = user.activeRestrictions.filter(r => !isRestrictionExpired(r.expiresAt));
    if (active.length !== user.activeRestrictions.length) {
      db.updateUser(userId, { activeRestrictions: active });
    }
    return active;
  }
  
  return [];
};

// Check if user is banned
export const checkBanned = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = db.getUserById(req.userId!);
  
  if (!user) {
    return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  }
  
  if (user.restrictions?.isBanned) {
    const banRestriction = user.activeRestrictions?.find(r => r.type === 'ban');
    return res.status(403).json({ 
      error: 'Konto zostało zablokowane',
      reason: banRestriction?.reason,
      expiresAt: banRestriction?.expiresAt
    });
  }
  
  next();
};

// Check if user can add friends
export const checkCanAddFriends = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = db.getUserById(req.userId!);
  
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
export const checkCanAcceptFriends = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = db.getUserById(req.userId!);
  
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
export const checkCanSendMessages = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = db.getUserById(req.userId!);
  
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
