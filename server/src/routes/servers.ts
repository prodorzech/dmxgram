import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database';
import { Server, Channel } from '../types';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router: Router = express.Router();

// Get all user's servers
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const servers = await db.getUserServers(req.userId!);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get server by ID
router.get('/:serverId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
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
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
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
      inviteCode: await db.generateInviteCode(),
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
    await db.createServer(server);

    res.status(201).json(server);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Join server
router.post('/:serverId/join', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.members.includes(req.userId!)) {
      return res.status(400).json({ error: 'Już jesteś członkiem serwera' });
    }

    await db.addServerMember(server.id, req.userId!);
    res.json({ message: 'Dołączono do serwera', server });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Leave server
router.post('/:serverId/leave', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId === req.userId) {
      return res.status(400).json({ error: 'Właściciel nie może opuścić serwera' });
    }

    await db.removeServerMember(server.id, req.userId!);
    res.json({ message: 'Opuszczono serwer' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Delete server
router.delete('/:serverId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może usunąć serwer' });
    }

    await db.deleteServer(server.id);
    res.json({ message: 'Serwer usunięty' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Create channel
router.post('/:serverId/channels', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, type = 'text' } = req.body;
    const server = await db.getServerById(req.params.serverId);

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

    await db.addChannel(server.id, channel);
    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Delete channel
router.delete('/:serverId/channels/:channelId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może usuwać kanały' });
    }

    await db.deleteChannel(server.id, req.params.channelId);
    res.json({ message: 'Kanał usunięty' });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get channel messages
router.get('/:serverId/channels/:channelId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (!server.members.includes(req.userId!)) {
      return res.status(403).json({ error: 'Brak dostępu' });
    }

    const messages = await db.getChannelMessages(req.params.channelId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Join server by invite code
router.post('/join-by-code', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Kod zaproszenia jest wymagany' });
    }

    const server = await db.getServerByInviteCode(inviteCode);
    if (!server) {
      return res.status(404).json({ error: 'Nieprawidłowy kod zaproszenia' });
    }

    if (server.members.includes(req.userId!)) {
      return res.status(400).json({ error: 'Już jesteś członkiem tego serwera' });
    }

    await db.addServerMember(server.id, req.userId!);
    res.json({ message: 'Dołączono do serwera', server });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// Get server invite code
router.get('/:serverId/invite', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
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
router.post('/:serverId/invite/regenerate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const server = await db.getServerById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Serwer nie znaleziony' });
    }

    if (server.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Tylko właściciel może regenerować kod' });
    }

    const newCode = await db.regenerateInviteCode(server.id);
    res.json({ inviteCode: newCode });
  } catch (error) {
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

export default router;
