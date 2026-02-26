import { Wrench, Bug, Link, CheckCircle2, Wallet, Camera, Shield, Headphones, Zap, Rocket, Crown, type LucideIcon } from 'lucide-react';
import './UserBadges.css';

export type BadgeId =
  | 'ceo'
  | 'bug-hunter-1'
  | 'bug-hunter-2'
  | 'bug-hunter-3'
  | 'partnership'
  | 'famous'
  | 'sponsor'
  | 'media'
  | 'staff'
  | 'moderator'
  | 'beta-tester'
  | 'dmx-boost'
  | 'management';

interface BadgeDef {
  id: BadgeId;
  label: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'ceo',          label: 'CEO',             Icon: Wrench,      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { id: 'bug-hunter-1', label: 'Bug Hunter Lv.1', Icon: Bug,         color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  { id: 'bug-hunter-2', label: 'Bug Hunter Lv.2', Icon: Bug,         color: '#eab308', bg: 'rgba(234,179,8,0.15)'  },
  { id: 'bug-hunter-3', label: 'Bug Hunter Lv.3', Icon: Bug,         color: '#dc2626', bg: 'rgba(220,38,38,0.15)'  },
  { id: 'partnership',  label: 'Partnership',     Icon: Link,        color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { id: 'famous',       label: 'Famous',          Icon: CheckCircle2, color: '#a855f7', bg: 'rgba(168,85,247,0.15)' },
  { id: 'sponsor',      label: 'Sponsor',         Icon: Wallet,      color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { id: 'media',        label: 'Media',           Icon: Camera,      color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
  { id: 'staff',        label: 'Staff',           Icon: Shield,      color: '#2563eb', bg: 'rgba(37,99,235,0.15)'  },
  { id: 'moderator',    label: 'Moderator',       Icon: Headphones,  color: '#14b8a6', bg: 'rgba(20,184,166,0.15)' },
  { id: 'beta-tester',  label: 'Beta Tester',     Icon: Zap,         color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  { id: 'dmx-boost',    label: 'DMX Boost',        Icon: Rocket,      color: '#a855f7', bg: 'rgba(168,85,247,0.18)' },
  { id: 'management',   label: 'Management',       Icon: Crown,       color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
];

interface UserBadgesProps {
  badges: string[];
  size?: 'sm' | 'md';
}

export function UserBadges({ badges, size = 'sm' }: UserBadgesProps) {
  if (!badges || badges.length === 0) return null;

  const active = BADGE_DEFS.filter(b => badges.includes(b.id));
  if (active.length === 0) return null;

  const iconSize = size === 'md' ? 16 : 14;

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
          <badge.Icon size={iconSize} />
        </span>
      ))}
    </span>
  );
}
