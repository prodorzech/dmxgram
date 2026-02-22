import './UserBadges.css';

export type BadgeId = 'ceo' | 'staff' | 'og' | 'popular' | 'media' | 'bug_hunter' | 'moderator';

interface BadgeDef {
  id: BadgeId;
  label: string;
  icon: string;   // emoji
  color: string;
  bg: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'ceo',       label: 'CEO',        icon: '👑', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  { id: 'staff',     label: 'Staff',      icon: '🛡️', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  { id: 'og',        label: 'OG',         icon: '⭐', color: '#D97706', bg: 'rgba(217,119,6,0.15)'  },
  { id: 'popular',   label: 'Popular',    icon: '🔥', color: '#EF4444', bg: 'rgba(239,68,68,0.15)'  },
  { id: 'media',     label: 'Media',      icon: '🎥', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  { id: 'bug_hunter',label: 'Bug Hunter', icon: '🐛', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  { id: 'moderator', label: 'Moderator',  icon: '⚒️', color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
];

interface UserBadgesProps {
  badges: string[];
  size?: 'sm' | 'md';
}

export function UserBadges({ badges, size = 'sm' }: UserBadgesProps) {
  if (!badges || badges.length === 0) return null;

  const active = BADGE_DEFS.filter(b => badges.includes(b.id));
  if (active.length === 0) return null;

  return (
    <span className={`user-badges user-badges--${size}`}>
      {active.map(badge => (
        <span
          key={badge.id}
          className="user-badge"
          style={{ color: badge.color }}
          data-label={badge.label}
          title={badge.label}
        >
          {badge.label}
        </span>
      ))}
    </span>
  );
}
