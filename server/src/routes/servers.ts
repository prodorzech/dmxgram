import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { Server, Channel } from '../types';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router: Router = express.Router();

// Get all user's servers
router.get('/', authMiddleware, (req: AuthRequest, res) => {
  try {
    const servers = db.getUserServers(req.userId!);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get server by ID
router.get('/:serverId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (!server.members.includes(req.userId!)) {
      return res.status(403).json({ error: 'Brak dostępu' });
    }

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Create server
router.post('/', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nazwa serwera jest wymagana' });
    }

    const server: Server = {
      id: uuidv4(),
      name,
      description,
      ownerId: req.userId!,
      inviteCode: db.generateInviteCode(),
      createdAt: new Date(),
      members: [req.userId!],
      channels: [
        {
          id: uuidv4(),
          serverId: '', // będzie ustawiony niżej
          name: 'general',
          type: 'text',
          description: 'Ogólny kanał',
          createdAt: new Date()
        }
      ]
    };

    server.channels[0].serverId = server.id;
    db.createServer(server);

    res.status(201).json(server);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Join server
router.post('/:serverId/join', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.members.includes(req.userId!)) {
      return res.status(400).json({ error: 'Już jesteś członkiem serwera' });
    }

    db.addServerMember(server.id, req.userId!);
    res.json({ message: 'Dołączono do serwera', server });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Leave server
router.post('/:serverId/leave', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId === req.userId) {
      return res.status(400).json({ error: 'Właściciel nie może opuścić serwera' });
    }

    db.removeServerMember(server.id, req.userId!);
    res.json({ message: 'Opuszczono serwer' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Delete server
router.delete('/:serverId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może usunąć serwer' });
    }

    db.deleteServer(server.id);
    res.json({ message: 'Serwer usunięty' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Create channel
router.post('/:serverId/channels', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, description, type = 'text' } = req.body;
    const server = db.getServerById(req.params.serverId);

    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może tworzyć kanały' });
    }

    const channel: Channel = {
      id: uuidv4(),
      serverId: server.id,
      name,
      description,
      type,
      createdAt: new Date()
    };

    db.addChannel(server.id, channel);
    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Delete channel
router.delete('/:serverId/channels/:channelId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może usuwać kanały' });
    }

    db.deleteChannel(server.id, req.params.channelId);
    res.json({ message: 'Kanał usunięty' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get channel messages
router.get('/:serverId/channels/:channelId/messages', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (!server.members.includes(req.userId!)) {
      return res.status(403).json({ error: 'Brak dostępu' });
    }

    const messages = db.getChannelMessages(req.params.channelId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Join server by invite code
router.post('/join-by-code', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Kod zaproszenia jest wymagany' });
    }

    const server = db.getServerByInviteCode(inviteCode);
    if (!server) {
      return res.status(404).json({ error: 'Nieprawidłowy kod zaproszenia' });
    }

    if (server.members.includes(req.userId!)) {
      return res.status(400).json({ error: 'Już jesteś członkiem tego serwera' });
    }

    db.addServerMember(server.id, req.userId!);
    res.json({ message: 'Dołączono do serwera', server });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get server invite code
router.get('/:serverId/invite', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (!server.members.includes(req.userId!)) {
      return res.status(403).json({ error: 'Brak dostępu' });
    }

    res.json({ inviteCode: server.inviteCode });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Regenerate invite code (owner only)
router.post('/:serverId/invite/regenerate', authMiddleware, (req: AuthRequest, res) => {
  try {
    const server = db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może regenerować kod' });
    }

    const newCode = db.regenerateInviteCode(server.id);
    res.json({ inviteCode: newCode });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
