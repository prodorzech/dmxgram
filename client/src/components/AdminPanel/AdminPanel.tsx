import { useState, useEffect } from 'react';
import { Users, Mail, Shield, X, Ban, CheckCircle, Settings } from 'lucide-react';
import { useStore } from '../../store';
import { ModerationModalNew } from '../ModerationModal/ModerationModalNew';
import { getImageUrl } from '../../utils/imageUrl';
import './AdminPanel.css';

interface UserData {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  status: 'online' | 'offline' | 'away';
  isAdmin?: boolean;
  createdAt: Date;
  lastLoginIp?: string;
  lastLoginCountry?: string;
  language?: string;
  restrictions?: any;
  warnings?: any[];
  activeRestrictions?: any[];
}

export function AdminPanel() {
  const { user, token } = useStore();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Nie udało się pobrać użytkowników');
      
      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <Ban size={64} />
          <h2>Brak dostępu</h2>
          <p>Tylko administratorzy mają dostęp do tego panelu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-title">
          <Shield size={24} />
          <h1>Panel Administracyjny</h1>
        </div>
        <div className="admin-badge">
          <Shield size={16} />
          <span>Administrator</span>
        </div>
      </div>

      <div className="admin-stats">
        <div className="stat-card">
          <Users size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">Użytkowników</span>
          </div>
        </div>
        <div className="stat-card">
          <CheckCircle size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.filter(u => u.status === 'online').length}</span>
            <span className="stat-label">Online</span>
          </div>
        </div>
        <div className="stat-card">
          <Shield size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.filter(u => u.isAdmin).length}</span>
            <span className="stat-label">Adminów</span>
          </div>
        </div>
      </div>

      <div className="admin-content">
        <h2 className="section-title">
          <Users size={20} />
          Lista użytkowników
        </h2>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Ładowanie użytkowników...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <X size={48} />
            <p>{error}</p>
          </div>
        ) : (
          <div className="users-table">
            <div className="table-header">
              <div className="col-avatar">Avatar</div>
              <div className="col-username">Nazwa</div>
              <div className="col-email">Email</div>
              <div className="col-id">ID</div>
              <div className="col-status">Status</div>
              <div className="col-role">Rola</div>
              <div className="col-created">Utworzono</div>
              <div className="col-actions">Akcje</div>
            </div>
            {users.map(userData => (
              <div key={userData.id} className="table-row">
                <div className="col-avatar">
                  <div className="user-avatar-cell">
                    {userData.avatar ? (
                      <img src={getImageUrl(userData.avatar)} alt={userData.username} />
                    ) : (
                      <div className="avatar-initial">{userData.username[0].toUpperCase()}</div>
                    )}
                    <div 
                      className="status-dot" 
                      style={{ backgroundColor: getStatusColor(userData.status) }}
                    />
                  </div>
                </div>
                <div className="col-username">
                  <span className="username-text">{userData.username}</span>
                  {userData.restrictions?.isBanned && (
                    <span className="banned-badge"><Ban size={12} /> Zbanowany</span>
                  )}
                </div>
                <div className="col-email">
                  <Mail size={14} />
                  <span>{userData.email}</span>
                </div>
                <div className="col-id">
                  <code>{userData.id}</code>
                </div>
                <div className="col-status">
                  <span className="status-badge" style={{ 
                    backgroundColor: getStatusColor(userData.status) + '20',
                    color: getStatusColor(userData.status)
                  }}>
                    {userData.status}
                  </span>
                </div>
                <div className="col-role">
                  {userData.isAdmin ? (
                    <span className="role-badge admin">
                      <Shield size={14} />
                      Admin
                    </span>
                  ) : (
                    <span className="role-badge user">
                      <Users size={14} />
                      User
                    </span>
                  )}
                </div>
                <div className="col-created">
                  {new Date(userData.createdAt).toLocaleDateString('pl-PL')}
                </div>
                <div className="col-actions">
                  <button
                    className="moderate-btn"
                    onClick={() => setSelectedUser(userData)}
                    title="Moderacja"
                  >
                    <Settings size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedUser && token && (
        <ModerationModalNew
          user={selectedUser}
          token={token}
          onClose={() => setSelectedUser(null)}
          onUpdate={() => {
            loadUsers();
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}
