const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = {
  // Auth
  async register(username: string, email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Registration failed');
    }
    return res.json(); // { needsVerification: true, email }  OR  normal user response
  },

  async verifyEmail(email: string, code: string) {
    const res = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Verification failed');
    }
    return res.json(); // AuthResponse with token + user
  },

  async resendVerification(email: string) {
    const res = await fetch(`${API_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to resend code');
    }
    return res.json();
  },

  async login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const body = await res.json();
      const err: any = new Error(body.error || 'Login failed');
      if (body.email) err.email = body.email;  // carry email for verification redirect
      throw err;
    }
    return res.json();
  },

  async getMe(token: string) {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
  },

  async updateStatus(status: 'online' | 'offline' | 'away', token: string) {
    const res = await fetch(`${API_URL}/api/auth/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update status');
    }
    return res.json();
  },

  async updateLanguage(language: string, token: string) {
    const res = await fetch(`${API_URL}/api/auth/me/language`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ language })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update language');
    }
    return res.json();
  },

  async updateCustomStatus(customStatus: string, token: string) {
    const res = await fetch(`${API_URL}/api/auth/me/custom-status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ customStatus })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update custom status');
    }
    return res.json();
  },

  async updateProfile(username: string | undefined, avatar: string | undefined, banner: string | undefined, bio: string | undefined, token: string) {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username, avatar, banner, bio })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update profile');
    }
    return res.json();
  },

  async uploadAvatar(file: File, token: string) {
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch(`${API_URL}/api/upload/avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to upload avatar');
    }
    return res.json();
  },

  async uploadBanner(file: File, token: string) {
    const formData = new FormData();
    formData.append('banner', file);

    const res = await fetch(`${API_URL}/api/upload/banner`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to upload banner');
    }
    return res.json();
  },

  async uploadChatFiles(files: File[], token: string): Promise<{ attachments: Array<{ url: string; filename: string; mimetype: string; size: number }> }> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    const res = await fetch(`${API_URL}/api/upload/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to upload files');
    }
    return res.json();
  },

  // Servers
  async getServers(token: string) {
    const res = await fetch(`${API_URL}/api/servers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch servers');
    return res.json();
  },

  async getServer(serverId: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch server');
    return res.json();
  },

  async createServer(name: string, description: string | undefined, token: string) {
    const res = await fetch(`${API_URL}/api/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) throw new Error('Failed to create server');
    return res.json();
  },

  async deleteServer(serverId: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete server');
    return res.json();
  },

  async createChannel(serverId: string, name: string, description: string | undefined, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) throw new Error('Failed to create channel');
    return res.json();
  },

  async getMessages(serverId: string, channelId: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}/channels/${channelId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async joinServerByCode(inviteCode: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/join-by-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ inviteCode })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to join server');
    }
    return res.json();
  },

  async getInviteCode(serverId: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}/invite`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to get invite code');
    return res.json();
  },

  async regenerateInviteCode(serverId: string, token: string) {
    const res = await fetch(`${API_URL}/api/servers/${serverId}/invite/regenerate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to regenerate invite code');
    return res.json();
  },

  // Friends
  async sendFriendRequest(username: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to send friend request');
    }
    return res.json();
  },

  async getFriendRequests(token: string) {
    const res = await fetch(`${API_URL}/api/friends/requests/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch friend requests');
    return res.json();
  },

  async getSentFriendRequests(token: string) {
    const res = await fetch(`${API_URL}/api/friends/requests/sent`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch sent requests');
    return res.json();
  },

  async acceptFriendRequest(requestId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to accept friend request');
    return res.json();
  },

  async rejectFriendRequest(requestId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/requests/${requestId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to reject friend request');
    return res.json();
  },

  async getFriends(token: string) {
    const res = await fetch(`${API_URL}/api/friends`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch friends');
    return res.json();
  },

  async removeFriend(friendId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/${friendId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to remove friend');
    return res.json();
  },

  async getBlockedUsers(token: string): Promise<{id: string; username: string; avatar?: string}[]> {
    const res = await fetch(`${API_URL}/api/friends/blocked`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    return res.json();
  },

  async blockUser(userId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/${userId}/block`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to block user');
    }
    return res.json();
  },

  async unblockUser(userId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/${userId}/block`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to unblock user');
    }
    return res.json();
  },

  async getDirectMessages(friendId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/${friendId}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch direct messages');
    return res.json();
  },

  async getMutualFriends(friendId: string, token: string) {
    const res = await fetch(`${API_URL}/api/friends/${friendId}/mutual`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch mutual friends');
    return res.json();
  },

  async reportMessage(payload: {
    messageId: string;
    messageContent: string;
    reportedUserId: string;
    reportedUsername: string;
    senderId: string;
    receiverId: string;
    category: string;
    reason: string;
  }, token: string) {
    const res = await fetch(`${API_URL}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to submit report');
    return res.json();
  },

  // Admin report methods
  async getAdminReports(token: string) {
    const res = await fetch(`${API_URL}/api/admin/reports`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch reports');
    return res.json();
  },

  async updateReportStatus(reportId: string, status: 'pending' | 'reviewed', token: string) {
    const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update report status');
    return res.json();
  },

  async getReportConversation(reportId: string, token: string) {
    const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/conversation`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
  },

  async updateUserBadges(userId: string, badges: string[], token: string) {
    const res = await fetch(`${API_URL}/api/admin/users/${userId}/badges`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ badges })
    });
    if (!res.ok) throw new Error('Failed to update badges');
    return res.json();
  }
};
