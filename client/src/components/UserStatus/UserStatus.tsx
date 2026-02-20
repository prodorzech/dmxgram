import { AlertTriangle, CheckCircle, Shield, Ban } from 'lucide-react';
import { User, UserRestriction } from '../../types';
import './UserStatus.css';

interface UserStatusProps {
  user: User;
}

export function UserStatus({ user }: UserStatusProps) {
  const hasRestrictions = user.restrictions && (
    user.restrictions.isBanned ||
    user.restrictions.canAddFriends === false ||
    user.restrictions.canAcceptFriends === false ||
    user.restrictions.canSendMessages === false
  );

  const hasWarnings = user.warnings && user.warnings.length > 0;
  const hasActiveRestrictions = user.activeRestrictions && user.activeRestrictions.length > 0;

  const getRestrictionStatus = (restriction: UserRestriction) => {
    if (restriction.expiresAt) {
      const expiresDate = new Date(restriction.expiresAt);
      const now = new Date();
      if (expiresDate > now) {
        const daysLeft = Math.ceil((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `Wygasa za ${daysLeft} dni`;
      } else {
        return 'Wygasło';
      }
    }
    return 'Permanentne';
  };

  return (
    <div className="user-status-panel">
      <h3>Status Konta</h3>

      {!hasRestrictions && !hasWarnings && !hasActiveRestrictions ? (
        <div className="status-card good">
          <CheckCircle size={48} />
          <h4>Konto w dobrym stanie</h4>
          <p>Twoje konto nie ma żadnych ograniczeń ani ostrzeżeń</p>
        </div>
      ) : (
        <>
          {/* Bans */}
          {user.restrictions?.isBanned && (
            <div className="status-card banned">
              <Ban size={48} />
              <h4>Konto zablokowane</h4>
              <p>Twoje konto zostało zablokowane i nie możesz korzystać z aplikacji</p>
            </div>
          )}

          {/* Active Restrictions */}
          {hasActiveRestrictions && (
            <div className="status-section">
              <h4>
                <Shield size={20} />
                Aktywne ograniczenia
              </h4>
              {user.activeRestrictions!.map((restriction, index) => (
                <div key={index} className="restriction-item">
                  <div className="restriction-header">
                    <span className={`restriction-type ${restriction.type}`}>
                      {restriction.type === 'warning' && <AlertTriangle size={16} />}
                      {restriction.type === 'restriction' && <Shield size={16} />}
                      {restriction.type === 'ban' && <Ban size={16} />}
                      {restriction.type === 'warning' ? 'Ostrzeżenie' : restriction.type === 'ban' ? 'Ban' : 'Ograniczenie'}
                    </span>
                    <span className="restriction-status">{getRestrictionStatus(restriction)}</span>
                  </div>
                  <div className="restriction-reason">
                    <strong>Powód:</strong> {restriction.reason}
                  </div>
                  <div className="restriction-date">
                    <strong>Nałożono:</strong> {new Date(restriction.issuedAt).toLocaleString('pl-PL')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual Restrictions */}
          {hasRestrictions && !user.restrictions?.isBanned && (
            <div className="status-section">
              <h4>
                <Shield size={20} />
                Ograniczenia funkcji
              </h4>
              <ul className="restrictions-list">
                {user.restrictions?.canAddFriends === false && (
                  <li className="blocked">Nie możesz dodawać znajomych</li>
                )}
                {user.restrictions?.canAcceptFriends === false && (
                  <li className="blocked">Nie możesz akceptować zaproszeń do znajomych</li>
                )}
                {user.restrictions?.canSendMessages === false && (
                  <li className="blocked">Nie możesz wysyłać wiadomości</li>
                )}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="status-section">
              <h4>
                <AlertTriangle size={20} />
                Ostrzeżenia
              </h4>
              {user.warnings!.map((warning, index) => (
                <div key={index} className="warning-item">
                  <div className="warning-reason">{warning.reason}</div>
                  <div className="warning-date">
                    {new Date(warning.issuedAt).toLocaleString('pl-PL')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
