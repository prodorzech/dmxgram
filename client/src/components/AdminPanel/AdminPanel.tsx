import { useState, useEffect } from 'react';
import { Users, Mail, Shield, X, Ban, CheckCircle, Settings, Flag, MessageSquare, Eye, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { useUI } from '../../context/UIContext';
import { api } from '../../services/api';
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
  badges?: string[];
}

interface Report {
  id: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  messageId: string;
  messageContent: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'reviewed';
  createdAt: string;
}

interface ConversationMessage {
  id: string;
  senderId: string;
  receiverId: string;
  senderUsername: string;
  senderAvatar?: string;
  content: string;
  createdAt: string;
}

export function AdminPanel() {
  const { user, token } = useStore();
  const { toast } = useUI();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'users' | 'reports'>('users');

  // Users tab state
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  // Reports tab state
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [showConvModal, setShowConvModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab]);

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

  const loadReports = async () => {
    if (!token) return;
    try {
      setReportsLoading(true);
      setReportsError('');
      const data = await api.getAdminReports(token);
      setReports(data);
    } catch (err: any) {
      setReportsError(err.message);
    } finally {
      setReportsLoading(false);
    }
  };

  const handleMarkReviewed = async (report: Report) => {
    if (!token) return;
    const newStatus = report.status === 'reviewed' ? 'pending' : 'reviewed';
    try {
      await api.updateReportStatus(report.id, newStatus, token);
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: newStatus } : r));
      toast(newStatus === 'reviewed' ? t('admin.markedReviewed') : t('admin.markedPending'), 'success');
    } catch {
      toast(t('admin.failedUpdateReport'), 'error');
    }
  };

  const handleViewConversation = async (report: Report) => {
    if (!token) return;
    setSelectedReport(report);
    setConversation([]);
    setShowConvModal(true);
    setConvLoading(true);
    try {
      const data = await api.getReportConversation(report.id, token);
      setConversation(data);
    } catch {
      toast(t('admin.failedLoadConversation'), 'error');
    } finally {
      setConvLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const parseReportContent = (content: string): { text: string; category: string; reason: string } => {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.text === 'string') return parsed;
    } catch {}
    return { text: content, category: '', reason: '' };
  };

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      spam: t('report.catSpam'),
      harassment: t('report.catHarassment'),
      inappropriate: t('report.catInappropriate'),
      misinformation: t('report.catMisinformation'),
      other: t('report.catOther'),
    };
    return map[cat] || cat;
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  if (!user?.isAdmin) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <Ban size={64} />
          <h2>{t('admin.accessDeniedTitle')}</h2>
          <p>{t('admin.accessDeniedMsg')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div className="admin-title">
          <Shield size={24} />
          <h1>{t('admin.title')}</h1>
        </div>
        <div className="admin-badge">
          <Shield size={16} />
          <span>{t('admin.administrator')}</span>
        </div>
      </div>

      <div className="admin-stats">
        <div className="stat-card">
          <Users size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">{t('admin.totalUsers')}</span>
          </div>
        </div>
        <div className="stat-card">
          <CheckCircle size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.filter(u => u.status === 'online').length}</span>
            <span className="stat-label">{t('admin.online')}</span>
          </div>
        </div>
        <div className="stat-card">
          <Shield size={24} />
          <div className="stat-info">
            <span className="stat-value">{users.filter(u => u.isAdmin).length}</span>
            <span className="stat-label">{t('admin.admins')}</span>
          </div>
        </div>
        <div className="stat-card">
          <Flag size={24} />
          <div className="stat-info">
            <span className="stat-value">{pendingCount}</span>
            <span className="stat-label">{t('admin.newReports')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === 'users' ? ' active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          {t('admin.users')}
        </button>
        <button
          className={`admin-tab${activeTab === 'reports' ? ' active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <Flag size={16} />
          {t('admin.reports')}
          {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="admin-content">
          <h2 className="section-title">
            <Users size={20} />
            {t('admin.usersList')}
          </h2>

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('admin.loadingUsers')}</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <X size={48} />
              <p>{error}</p>
            </div>
          ) : (
            <div className="users-table">
              <div className="table-header">
                <div className="col-avatar">{t('admin.colAvatar')}</div>
                <div className="col-username">{t('admin.colUsername')}</div>
                <div className="col-email">{t('admin.colEmail')}</div>
                <div className="col-id">{t('admin.colId')}</div>
                <div className="col-status">{t('admin.colStatus')}</div>
                <div className="col-role">{t('admin.colRole')}</div>
                <div className="col-created">{t('admin.colCreated')}</div>
                <div className="col-actions">{t('admin.colActions')}</div>
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
                      <span className="banned-badge"><Ban size={12} /> {t('admin.banned')}</span>
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
                        {t('admin.roleAdmin')}
                      </span>
                    ) : (
                      <span className="role-badge user">
                        <Users size={14} />
                        {t('admin.roleUser')}
                      </span>
                    )}
                  </div>
                  <div className="col-created">
                    {new Date(userData.createdAt).toLocaleDateString()}
                  </div>
                  <div className="col-actions">
                    <button
                      className="moderate-btn"
                      onClick={() => setSelectedUser(userData)}
                      title={t('admin.moderateBtn')}
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="admin-content">
          <h2 className="section-title">
            <Flag size={20} />
            {t('admin.reportsList')}
          </h2>

          {reportsLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>{t('admin.loadingReports')}</p>
            </div>
          ) : reportsError ? (
            <div className="error-state">
              <X size={48} />
              <p>{reportsError}</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="empty-reports">
              <Flag size={48} />
              <p>{t('admin.noReports')}</p>
            </div>
          ) : (
            <div className="reports-list">
              {reports.map(report => {
                const parsed = parseReportContent(report.messageContent);
                return (
                <div key={report.id} className={`report-card${report.status === 'reviewed' ? ' reviewed' : ''}`}>
                  <div className="report-header">
                    <div className="report-meta">
                      <span className="report-reporter">
                        <Users size={13} />
                        <strong>{report.reporterUsername}</strong> {t('admin.reportedWord')}
                      </span>
                      <span className="report-target">
                        {t('admin.messageFrom')} <strong>{report.reportedUsername}</strong>
                      </span>
                    </div>
                    <div className="report-right">
                      <span className={`report-status-badge ${report.status}`}>
                        {report.status === 'pending' ? (
                          <><Clock size={12} /> {t('admin.pending')}</>
                        ) : (
                          <><CheckCircle size={12} /> {t('admin.reviewed')}</>
                        )}
                      </span>
                      <span className="report-date">
                        {new Date(report.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="report-message-preview">
                    <MessageSquare size={14} />
                    <p>"{parsed.text}"</p>
                  </div>
                  {(parsed.category || parsed.reason) && (
                    <div className="report-details">
                      {parsed.category && (
                        <div className="report-detail-row">
                          <span className="report-detail-label">{t('admin.category')}:</span>
                          <span className="report-detail-value">{getCategoryLabel(parsed.category)}</span>
                        </div>
                      )}
                      {parsed.reason && (
                        <div className="report-detail-row">
                          <span className="report-detail-label">{t('admin.reason')}:</span>
                          <span className="report-detail-value">{parsed.reason}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="report-actions">
                    <button
                      className="report-btn view-btn"
                      onClick={() => handleViewConversation(report)}
                      title={t('admin.viewConv')}
                    >
                      <Eye size={14} />
                      {t('admin.viewConv')}
                    </button>
                    <button
                      className={`report-btn ${report.status === 'reviewed' ? 'reopen-btn' : 'reviewed-btn'}`}
                      onClick={() => handleMarkReviewed(report)}
                    >
                      <CheckCircle size={14} />
                      {report.status === 'reviewed' ? t('admin.markPending') : t('admin.markReviewed')}
                    </button>
                    {users.find(u => u.id === report.reportedUserId) && (
                      <button
                        className="report-btn moderate-user-btn"
                        onClick={() => {
                          const u = users.find(ud => ud.id === report.reportedUserId);
                          if (u) { setSelectedUser(u); setActiveTab('users'); }
                        }}
                        title={`${t('admin.moderate')} ${report.reportedUsername}`}
                      >
                        <Settings size={14} />
                        {t('admin.moderate')} {report.reportedUsername}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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

      {/* Conversation Viewer Modal */}
      {showConvModal && selectedReport && (
        <div className="conv-modal-overlay" onClick={() => setShowConvModal(false)}>
          <div className="conv-modal" onClick={e => e.stopPropagation()}>
            <div className="conv-modal-header">
              <div className="conv-modal-title">
                <MessageSquare size={20} />
                <span>{t('admin.conversation')}: <strong>{selectedReport.reporterUsername}</strong> ↔ <strong>{selectedReport.reportedUsername}</strong></span>
              </div>
              <button className="conv-close-btn" onClick={() => setShowConvModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="conv-modal-reported">
              <Flag size={14} />
              <span>{t('admin.reportedMessage')}: "</span>
              <em>{parseReportContent(selectedReport.messageContent).text}</em>
              <span>"</span>
            </div>
            <div className="conv-messages">
              {convLoading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>{t('admin.loadingConversation')}</p>
                </div>
              ) : conversation.length === 0 ? (
                <div className="empty-conv">
                  <MessageSquare size={32} />
                  <p>{t('admin.noMessages')}</p>
                </div>
              ) : (
                conversation.map(msg => (
                  <div
                    key={msg.id}
                    className={`conv-msg${msg.id === selectedReport.messageId ? ' conv-msg-reported' : ''}`}
                  >
                    <div className="conv-msg-avatar">
                      {msg.senderAvatar ? (
                        <img src={getImageUrl(msg.senderAvatar)} alt={msg.senderUsername} />
                      ) : (
                        <div className="conv-avatar-initial">{msg.senderUsername[0].toUpperCase()}</div>
                      )}
                    </div>
                    <div className="conv-msg-body">
                      <div className="conv-msg-meta">
                        <span className="conv-msg-username">{msg.senderUsername}</span>
                        {msg.id === selectedReport.messageId && (
                            <span className="conv-msg-reported-badge"><Flag size={11} /> {t('admin.reportedBadge')}</span>
                        )}
                        <span className="conv-msg-time">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="conv-msg-content">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
