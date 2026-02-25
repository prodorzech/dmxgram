import { useState, useRef, useEffect } from 'react';
import { useUI } from '../../context/UIContext';
import { useStore } from '../../store';
import { api } from '../../services/api';
import {
  X, User as UserIcon, Upload, Moon, Sun, Globe, Layers, Bell,
  Palette, ImageOff, CheckCircle2, Ban, Shield, Calendar, Mail, Rocket, Lock,
  Mic, Volume2, LogOut, Key, ChevronDown, Check
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import { languages } from '../../i18n';
import { useTranslation } from 'react-i18next';
import './UserSettingsModal.css';

/* ── Custom Dropdown component ───────────────────────────────────────── */
interface DropdownOption {
  value: string;
  label: string;
}
interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}
function CustomDropdown({ options, value, onChange, icon }: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || value;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className={`custom-dropdown${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="custom-dropdown-trigger" onClick={() => setOpen(!open)}>
        {icon && <span className="custom-dropdown-icon">{icon}</span>}
        <span className="custom-dropdown-label">{selectedLabel}</span>
        <ChevronDown size={16} className={`custom-dropdown-chevron${open ? ' rotated' : ''}`} />
      </button>
      {open && (
        <div className="custom-dropdown-menu">
          {options.map(opt => (
            <button type="button" key={opt.value}
              className={`custom-dropdown-item${opt.value === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="custom-dropdown-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Accent colours palette ──────────────────────────────────────────── */
const ACCENT_COLORS = [
  { label: 'Czerwony',  value: '#dc2626', hover: '#b91c1c', shadow: 'rgba(220,38,38,0.35)'  },
  { label: 'Różowy',    value: '#ec4899', hover: '#db2777', shadow: 'rgba(236,72,153,0.35)'  },
  { label: 'Niebieski', value: '#3b82f6', hover: '#2563eb', shadow: 'rgba(59,130,246,0.35)'  },
  { label: 'Zielony',   value: '#22c55e', hover: '#16a34a', shadow: 'rgba(34,197,94,0.35)'   },
  { label: 'Pomarańcz', value: '#f97316', hover: '#ea580c', shadow: 'rgba(249,115,22,0.35)'  },
  { label: 'Żółty',     value: '#eab308', hover: '#ca8a04', shadow: 'rgba(234,179,8,0.35)'   },
  { label: 'Fioletowy', value: '#a855f7', hover: '#9333ea', shadow: 'rgba(168,85,247,0.35)'  },
];

type SettingsTab =
  | 'myAccount' | 'profile'
  | 'voiceAudio' | 'notifications' | 'appearance' | 'language'
  | 'boost' | 'accountStatus';

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { user, token, setUser, theme, toggleTheme, setToken } = useStore();
  const { i18n, t } = useTranslation();
  const { toast } = useUI();

  const [activeTab, setActiveTab] = useState<SettingsTab>('myAccount');

  /* ── Profile ── */
  const [username, setUsername]       = useState(user?.username || '');
  const [bio, setBio]                 = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [avatarFile, setAvatarFile]   = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [bannerFile, setBannerFile]   = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState(user?.banner || '');
  const [profileColorTop, setProfileColorTop] = useState(user?.profileColorTop || '#1a1a2e');
  const [profileColorBottom, setProfileColorBottom] = useState(user?.profileColorBottom || '#dc2626');

  /* ── Appearance ── */
  const [bgBlur, setBgBlur] = useState<number>(() =>
    parseInt(localStorage.getItem('dmx-bg-blur') ?? '0', 10)
  );
  const [accentColor, setAccentColor] = useState<string>(
    () => localStorage.getItem('dmx-accent-color') || '#dc2626'
  );
  const [noBg, setNoBg] = useState<boolean>(
    () => localStorage.getItem('dmx-no-bg') === 'true'
  );
  const [customBg, setCustomBg] = useState<string>(
    () => localStorage.getItem('dmx-custom-bg') || ''
  );

  /* ── Notifications ── */
  const [desktopNotif, setDesktopNotif] = useState<boolean>(
    () => localStorage.getItem('dmx-desktop-notifications') !== 'false'
  );

  /* ── Voice & Audio ── */
  const [audioInputDevices, setAudioInputDevices]   = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>(
    () => localStorage.getItem('dmx-audio-input') || 'default'
  );
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>(
    () => localStorage.getItem('dmx-audio-output') || 'default'
  );
  const [inputVolume, setInputVolume] = useState<number>(
    () => parseInt(localStorage.getItem('dmx-input-volume') ?? '100', 10)
  );
  const [outputVolume, setOutputVolume] = useState<number>(
    () => parseInt(localStorage.getItem('dmx-output-volume') ?? '100', 10)
  );
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const micTestRef = useRef<{ stream: MediaStream; ctx: AudioContext; anim: number } | null>(null);

  /* ── Boost ── */
  const [boostLoading, setBoostLoading]         = useState(false);
  const [boostCode, setBoostCode]               = useState('');
  const [boostCodeLoading, setBoostCodeLoading] = useState(false);
  const [boostCodeResult, setBoostCodeResult]   = useState<{ ok: boolean; msg: string } | null>(null);

  /* ── General ── */
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const avatarFileInputRef  = useRef<HTMLInputElement>(null);
  const bannerFileInputRef  = useRef<HTMLInputElement>(null);
  const customBgFileInputRef = useRef<HTMLInputElement>(null);

  /* ── Keyboard: Escape to close ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  /* ── Load audio devices when Voice tab is shown ── */
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(tr => tr.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
      } catch {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
          setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
        } catch { /* no devices */ }
      }
    };
    if (activeTab === 'voiceAudio') loadDevices();
  }, [activeTab]);

  /* ── Cleanup mic test on tab switch / unmount ── */
  useEffect(() => {
    return () => stopMicTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!user) return null;

  /* ══════════════════════════════════════════════════════════════════════
     MIC TEST
     ══════════════════════════════════════════════════════════════════════ */
  const startMicTest = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedInputDevice !== 'default'
          ? { deviceId: { exact: selectedInputDevice } }
          : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      setIsMicTesting(true);
      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicTestLevel(Math.min(100, (avg / 128) * 100 * (inputVolume / 100)));
        if (micTestRef.current) micTestRef.current.anim = requestAnimationFrame(update);
      };
      micTestRef.current = { stream, ctx, anim: requestAnimationFrame(update) };
    } catch {
      toast(t('chat.voiceMicError'), 'error');
    }
  };

  const stopMicTest = () => {
    if (micTestRef.current) {
      cancelAnimationFrame(micTestRef.current.anim);
      micTestRef.current.stream.getTracks().forEach(tr => tr.stop());
      micTestRef.current.ctx.close();
      micTestRef.current = null;
    }
    setIsMicTesting(false);
    setMicTestLevel(0);
  };

  /* ══════════════════════════════════════════════════════════════════════
     HANDLERS
     ══════════════════════════════════════════════════════════════════════ */
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(t('upload.avatarTooLarge')); return; }
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    if (isGif && !user?.hasDmxBoost) { setError(t('boost.gifAvatarRequiresBoost')); if (e.target) e.target.value = ''; return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError(t('upload.bannerTooLarge')); return; }
    setBannerFile(file);
    setBannerPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleBgBlurChange = (value: number) => {
    setBgBlur(value);
    localStorage.setItem('dmx-bg-blur', value.toString());
    document.documentElement.style.setProperty('--bg-blur', `${(value / 100) * 20}px`);
    document.documentElement.style.setProperty('--panel-opacity', ((value / 100) * 0.95).toFixed(2));
    window.dispatchEvent(new CustomEvent('dmx-blur-changed'));
  };

  const handleDesktopNotifToggle = () => {
    const next = !desktopNotif;
    setDesktopNotif(next);
    localStorage.setItem('dmx-desktop-notifications', next.toString());
  };

  const handleAccentChange = (color: typeof ACCENT_COLORS[0]) => {
    setAccentColor(color.value);
    localStorage.setItem('dmx-accent-color', color.value);
    document.documentElement.style.setProperty('--accent-primary', color.value);
    document.documentElement.style.setProperty('--accent-hover',   color.hover);
    document.documentElement.style.setProperty('--accent-active',  color.hover);
    document.documentElement.style.setProperty('--accent-shadow',  color.shadow);
  };

  const handleCustomBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!user?.hasDmxBoost) { setError(t('boost.customBgRequiresBoost')); if (e.target) e.target.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { setError(t('upload.fileTooLarge', { size: 10 })); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCustomBg(dataUrl);
      localStorage.setItem('dmx-custom-bg', dataUrl);
      window.dispatchEvent(new CustomEvent('dmx-bg-changed', { detail: { customBg: dataUrl } }));
    };
    reader.readAsDataURL(file);
  };

  const handleClearCustomBg = () => {
    setCustomBg('');
    localStorage.removeItem('dmx-custom-bg');
    window.dispatchEvent(new CustomEvent('dmx-bg-changed', { detail: { customBg: '' } }));
  };

  const handleNoBgToggle = () => {
    const next = !noBg;
    setNoBg(next);
    localStorage.setItem('dmx-no-bg', next.toString());
    window.dispatchEvent(new CustomEvent('dmx-nobg-changed', { detail: { noBg: next } }));
  };

  const handleInputDeviceChange = (deviceId: string) => {
    setSelectedInputDevice(deviceId);
    localStorage.setItem('dmx-audio-input', deviceId);
    if (isMicTesting) { stopMicTest(); setTimeout(() => startMicTest(), 200); }
  };

  const handleOutputDeviceChange = (deviceId: string) => {
    setSelectedOutputDevice(deviceId);
    localStorage.setItem('dmx-audio-output', deviceId);
  };

  const handleInputVolumeChange = (val: number) => {
    setInputVolume(val);
    localStorage.setItem('dmx-input-volume', val.toString());
  };

  const handleOutputVolumeChange = (val: number) => {
    setOutputVolume(val);
    localStorage.setItem('dmx-output-volume', val.toString());
  };

  /* ── Boost purchase ── */
  const handleBoostPurchase = async () => {
    if (!token) return;
    setBoostLoading(true);
    try {
      const { url } = await api.createBoostCheckout(token);
      if ((window as any).electronAPI?.openExternal) {
        (window as any).electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start purchase');
    } finally {
      setBoostLoading(false);
    }
  };

  /* ── Boost redeem ── */
  const handleRedeemCode = async () => {
    if (!token || !boostCode.trim()) return;
    setBoostCodeLoading(true);
    setBoostCodeResult(null);
    try {
      const result = await api.redeemBoostCode(boostCode.trim(), token);
      const expires = new Date(result.expiresAt).toLocaleDateString();
      const msg = t('boost.redeemSuccess', { days: result.durationDays, date: expires });
      setBoostCodeResult({ ok: true, msg });
      toast(msg, 'success');
      setBoostCode('');
      if (result.user) setUser({ ...user!, ...result.user });
    } catch (err: any) {
      const key = err.message === 'invalidCode' ? 'boost.redeemErrInvalid'
                : err.message === 'alreadyUsed' ? 'boost.redeemErrUsed'
                : err.message === 'missingBoostColumns' ? 'boost.redeemErrSchema'
                : null;
      const msg = key ? t(key) : (err.message || t('boost.redeemErrInvalid'));
      setBoostCodeResult({ ok: false, msg });
      toast(msg, 'error');
    } finally {
      setBoostCodeLoading(false);
    }
  };

  /* ── Language ── */
  const handleLanguageChange = async (languageCode: string) => {
    if (!token) return;
    try {
      await api.updateLanguage(languageCode, token);
      await i18n.changeLanguage(languageCode);
      localStorage.setItem('i18nextLng', languageCode);
      const updatedUser = await api.getMe(token);
      setUser(updatedUser);
    } catch {
      setError('Failed to change language');
    }
  };

  /* ── Logout ── */
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    onClose();
  };

  /* ── Profile save ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab !== 'profile') return;
    setError('');
    setLoading(true);
    try {
      let avatarUrl = user.avatar;
      let bannerUrl = user.banner;

      if (avatarFile) {
        const resp = await api.uploadAvatar(avatarFile, token!);
        avatarUrl = resp.url;
      }
      if (bannerFile) {
        const resp = await api.uploadBanner(bannerFile, token!);
        bannerUrl = resp.url;
      }

      const usernameChanged = username !== user.username;
      const avatarChanged   = avatarUrl !== user.avatar;
      const bannerChanged   = bannerUrl !== user.banner;
      const bioChanged      = bio !== user.bio;
      const statusChanged   = customStatus !== user.customStatus;
      const colorTopChanged = profileColorTop !== (user.profileColorTop || '#1a1a2e');
      const colorBottomChanged = profileColorBottom !== (user.profileColorBottom || '#dc2626');

      let finalUser = user;

      if (usernameChanged || avatarChanged || bannerChanged || bioChanged || colorTopChanged || colorBottomChanged) {
        finalUser = await api.updateProfile(
          usernameChanged ? username : undefined,
          avatarChanged   ? avatarUrl : undefined,
          bannerChanged   ? bannerUrl : undefined,
          bioChanged      ? bio        : undefined,
          token!,
          colorTopChanged ? profileColorTop : undefined,
          colorBottomChanged ? profileColorBottom : undefined
        );
      }

      if (statusChanged) {
        finalUser = await api.updateCustomStatus(customStatus, token!);
      }

      setUser(finalUser);
      toast(t('user.saveSuccess'), 'success');
    } catch (err: any) {
      setError(err.message || t('errors.updateProfile'));
    } finally {
      setLoading(false);
    }
  };

  /* ── Helpers ── */
  const maskedEmail = user.email
    ? (() => {
        const [local, domain] = user.email.split('@');
        const masked = local.length > 3
          ? local[0] + '•'.repeat(local.length - 2) + local[local.length - 1]
          : local[0] + '•'.repeat(local.length - 1);
        return `${masked}@${domain}`;
      })()
    : '—';

  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  /* ══════════════════════════════════════════════════════════════════════
     SIDEBAR CONFIG
     ══════════════════════════════════════════════════════════════════════ */
  const sidebarSections = [
    {
      label: t('settings.catUser'),
      items: [
        { id: 'myAccount' as SettingsTab, icon: <UserIcon size={18} />, label: t('settings.myAccount') },
        { id: 'profile'   as SettingsTab, icon: <UserIcon size={18} />, label: t('user.profile') },
      ],
    },
    {
      label: t('settings.catApp'),
      items: [
        { id: 'voiceAudio'    as SettingsTab, icon: <Mic size={18} />,     label: t('settings.voiceAudio') },
        { id: 'notifications' as SettingsTab, icon: <Bell size={18} />,    label: t('user.notifications') },
        { id: 'appearance'    as SettingsTab, icon: <Palette size={18} />, label: t('user.appearance') },
        { id: 'language'      as SettingsTab, icon: <Globe size={18} />,   label: t('user.language') },
      ],
    },
    {
      label: '',
      items: [
        { id: 'boost' as SettingsTab, icon: <Rocket size={18} />, label: 'DMX Boost', boost: true },
      ],
    },
    {
      label: '',
      items: [
        { id: 'accountStatus' as SettingsTab, icon: <Shield size={18} />, label: t('user.accountStatus') },
      ],
    },
  ];

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-container" onClick={e => e.stopPropagation()}>

        {/* ── LEFT SIDEBAR ── */}
        <nav className="settings-sidebar">
          <div className="settings-sidebar-scroll">
            {sidebarSections.map((section, si) => (
              <div key={si} className="settings-sidebar-section">
                {section.label && <h3 className="settings-sidebar-label">{section.label}</h3>}
                {section.items.map(item => (
                  <button
                    key={item.id}
                    className={
                      'settings-sidebar-item'
                      + (activeTab === item.id ? ' active' : '')
                      + ((item as any).boost ? ' boost-item' : '')
                    }
                    onClick={() => setActiveTab(item.id)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {(item as any).boost && user?.hasDmxBoost && <span className="boost-active-dot" />}
                  </button>
                ))}
                {si < sidebarSections.length - 1 && <div className="settings-sidebar-divider" />}
              </div>
            ))}

            {/* Logout at bottom */}
            <div className="settings-sidebar-section">
              <div className="settings-sidebar-divider" />
              <button className="settings-sidebar-item logout-item" onClick={handleLogout}>
                <LogOut size={18} />
                <span>{t('user.logout')}</span>
              </button>
            </div>
          </div>
        </nav>

        {/* ── RIGHT CONTENT ── */}
        <main className="settings-content">
          <div className="settings-content-header">
            <h2>{
              activeTab === 'myAccount'     ? t('settings.myAccount') :
              activeTab === 'profile'       ? t('user.profile') :
              activeTab === 'voiceAudio'    ? t('settings.voiceAudio') :
              activeTab === 'notifications' ? t('user.notifications') :
              activeTab === 'appearance'    ? t('user.appearance') :
              activeTab === 'language'      ? t('user.language') :
              activeTab === 'boost'         ? 'DMX Boost' :
              t('user.accountStatus')
            }</h2>
            <button className="settings-close-btn" onClick={onClose} title={t('user.cancel')}>
              <X size={20} />
              <span className="settings-close-hint">ESC</span>
            </button>
          </div>

          <div className="settings-content-scroll">
            {error && <div className="settings-error">{error}</div>}

            {/* ═══════════════ MY ACCOUNT ═══════════════ */}
            {activeTab === 'myAccount' && (
              <div className="settings-page">
                {/* User card */}
                <div className="account-card">
                  <div
                    className="account-card-banner"
                    style={
                      user.banner
                        ? { backgroundImage: `url(${getImageUrl(user.banner)})` }
                        : { background: 'linear-gradient(135deg, var(--accent-primary), #1a1a2e)' }
                    }
                  />
                  <div className="account-card-body">
                    <div className="account-card-avatar">
                      {user.avatar
                        ? <img src={getImageUrl(user.avatar)} alt={user.username} />
                        : <div className="avatar-initial-lg">{user.username[0].toUpperCase()}</div>}
                      <div className={`account-card-status-dot ${user.status || 'online'}`} />
                    </div>
                    <div className="account-card-info">
                      <h3>{user.username}</h3>
                      {user.customStatus && <p className="account-card-custom-status">{user.customStatus}</p>}
                    </div>
                    <button type="button" className="account-edit-btn" onClick={() => setActiveTab('profile')}>
                      {t('settings.editProfile')}
                    </button>
                  </div>
                </div>

                {/* Fields card */}
                <div className="settings-card">
                  <div className="settings-card-row">
                    <div className="settings-card-field">
                      <span className="settings-card-label">{t('user.username')}</span>
                      <span className="settings-card-value">{user.username}</span>
                    </div>
                    <button type="button" className="settings-card-action" onClick={() => setActiveTab('profile')}>
                      {t('settings.edit')}
                    </button>
                  </div>
                  <div className="settings-card-divider" />
                  <div className="settings-card-row">
                    <div className="settings-card-field">
                      <span className="settings-card-label">{t('settings.email')}</span>
                      <span className="settings-card-value">{maskedEmail}</span>
                    </div>
                  </div>
                  <div className="settings-card-divider" />
                  <div className="settings-card-row">
                    <div className="settings-card-field">
                      <span className="settings-card-label">{t('user.accountJoined')}</span>
                      <span className="settings-card-value">{joinDate}</span>
                    </div>
                  </div>
                  {user.badges && user.badges.length > 0 && (
                    <>
                      <div className="settings-card-divider" />
                      <div className="settings-card-row">
                        <div className="settings-card-field">
                          <span className="settings-card-label">{t('settings.badges')}</span>
                          <span className="settings-card-value">{t('user.accountBadgesCount', { count: user.badges.length })}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Password */}
                <div className="settings-card">
                  <h4 className="settings-card-title">{t('settings.passwordSecurity')}</h4>
                  <p className="settings-card-desc">{t('settings.passwordDesc')}</p>
                  <button type="button" className="settings-card-btn" onClick={() => {
                    window.dispatchEvent(new CustomEvent('dmx-open-change-password'));
                    onClose();
                  }}>
                    <Key size={16} />
                    {t('settings.changePassword')}
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════════ PROFILE ═══════════════ */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSubmit} className="settings-page">
                {/* Preview card */}
                <div className="profile-preview-card">
                  <div
                    className="profile-preview-banner"
                    style={
                      bannerPreview
                        ? { backgroundImage: `url(${getImageUrl(bannerPreview)})` }
                        : user?.hasDmxBoost
                          ? { background: `linear-gradient(to bottom, ${profileColorTop}, ${profileColorBottom})` }
                          : { background: 'linear-gradient(135deg, var(--accent-primary), #1a1a2e)' }
                    }
                  />
                  <div className="profile-preview-body">
                    <div className="profile-preview-avatar">
                      {avatarPreview
                        ? <img src={getImageUrl(avatarPreview)} alt="Preview" />
                        : <div className="avatar-initial-lg">{user.username[0].toUpperCase()}</div>}
                    </div>
                    <div className="profile-preview-name">{username || user.username}</div>
                  </div>
                </div>

                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.username')}</h4>
                  <input type="text" className="settings-input" value={username}
                    onChange={e => setUsername(e.target.value)} placeholder={t('user.username')} disabled={loading} />
                </div>

                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.bio')}</h4>
                  <textarea className="settings-input settings-textarea" value={bio}
                    onChange={e => setBio(e.target.value)} placeholder={t('user.bioPlaceholder')}
                    rows={3} maxLength={200} disabled={loading} />
                  <span className="settings-char-count">{bio.length}/200</span>
                </div>

                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.customStatus')}</h4>
                  <input type="text" className="settings-input" value={customStatus}
                    onChange={e => setCustomStatus(e.target.value)} placeholder={t('user.customStatusPlaceholder')}
                    maxLength={100} disabled={loading} />
                  <span className="settings-char-count">{customStatus.length}/100</span>
                </div>

                {/* Avatar */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.avatar')}</h4>
                  <div className="settings-upload-row">
                    <div className="settings-avatar-preview">
                      {avatarPreview
                        ? <img src={getImageUrl(avatarPreview)} alt="Avatar" />
                        : <div className="avatar-initial-sm">{user.username[0].toUpperCase()}</div>}
                    </div>
                    <div className="settings-upload-actions">
                      <input ref={avatarFileInputRef} type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleAvatarChange} disabled={loading} style={{ display: 'none' }} />
                      <button type="button" className="settings-upload-btn"
                        onClick={() => avatarFileInputRef.current?.click()} disabled={loading}>
                        <Upload size={16} /> {avatarFile ? t('user.changeFile') : t('user.selectFile')}
                      </button>
                      {avatarFile && <span className="settings-file-name">{avatarFile.name}</span>}
                      {!user?.hasDmxBoost && (
                        <span className="settings-hint accent"><Rocket size={12} /> {t('boost.gifAvatarHint')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner (boost-locked) */}
                <div className={`settings-group${!user?.hasDmxBoost ? ' boost-locked-group' : ''}`}>
                  <h4 className="settings-group-title">
                    {t('settings.profileBanner')}
                    {!user?.hasDmxBoost && <span className="boost-badge"><Lock size={12} /> DMX Boost</span>}
                  </h4>
                  <div className="settings-upload-row">
                    <div className="settings-banner-mini">
                      {bannerPreview
                        ? <img src={getImageUrl(bannerPreview)} alt="Banner" />
                        : <div className="banner-placeholder" />}
                    </div>
                    <div className="settings-upload-actions">
                      <input ref={bannerFileInputRef} type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleBannerChange} disabled={loading || !user?.hasDmxBoost} style={{ display: 'none' }} />
                      <button type="button" className="settings-upload-btn"
                        onClick={() => bannerFileInputRef.current?.click()} disabled={loading || !user?.hasDmxBoost}>
                        <Upload size={16} /> {bannerFile ? t('user.changeFile') : t('user.selectFile')}
                      </button>
                      {bannerFile && <span className="settings-file-name">{bannerFile.name}</span>}
                    </div>
                  </div>
                </div>

                {/* Profile Gradient (boost-locked) */}
                <div className={`settings-group${!user?.hasDmxBoost ? ' boost-locked-group' : ''}`}>
                  <h4 className="settings-group-title">
                    Kolor profilu
                    {!user?.hasDmxBoost && <span className="boost-badge"><Lock size={12} /> DMX Boost</span>}
                  </h4>
                  <p className="settings-group-desc" style={{ marginBottom: 10 }}>Ustaw gradient kolorów na swoim profilu — jak na Discordzie.</p>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Góra</label>
                      <input type="color" value={profileColorTop}
                        onChange={e => setProfileColorTop(e.target.value)}
                        disabled={loading || !user?.hasDmxBoost}
                        style={{ width: 48, height: 48, border: 'none', borderRadius: 8, cursor: user?.hasDmxBoost ? 'pointer' : 'not-allowed', background: 'transparent' }} />
                    </div>
                    <div style={{
                      width: 60, height: 60, borderRadius: 10, flexShrink: 0,
                      background: `linear-gradient(to bottom, ${profileColorTop}, ${profileColorBottom})`,
                      border: '2px solid var(--border-primary)',
                    }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Dół</label>
                      <input type="color" value={profileColorBottom}
                        onChange={e => setProfileColorBottom(e.target.value)}
                        disabled={loading || !user?.hasDmxBoost}
                        style={{ width: 48, height: 48, border: 'none', borderRadius: 8, cursor: user?.hasDmxBoost ? 'pointer' : 'not-allowed', background: 'transparent' }} />
                    </div>
                  </div>
                </div>

                <div className="settings-actions">
                  <button type="submit" className="settings-save-btn" disabled={loading}>
                    {loading ? t('user.saving') : t('user.save')}
                  </button>
                </div>
              </form>
            )}

            {/* ═══════════════ VOICE & AUDIO ═══════════════ */}
            {activeTab === 'voiceAudio' && (
              <div className="settings-page">
                {/* Input device */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('settings.inputDevice')}</h4>
                  <p className="settings-group-desc">{t('settings.inputDeviceDesc')}</p>
                  <CustomDropdown
                    icon={<Mic size={16} />}
                    value={selectedInputDevice}
                    onChange={handleInputDeviceChange}
                    options={[
                      { value: 'default', label: t('settings.defaultDevice') },
                      ...audioInputDevices.map(d => ({
                        value: d.deviceId,
                        label: d.label || `${t('settings.microphone')} (${d.deviceId.slice(0, 8)})`
                      }))
                    ]}
                  />
                </div>

                {/* Input volume */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('settings.inputVolume')}</h4>
                  <div className="settings-slider-row">
                    <Mic size={16} className="settings-slider-icon" />
                    <input type="range" className="settings-slider" min={0} max={200} value={inputVolume}
                      onChange={e => handleInputVolumeChange(parseInt(e.target.value))} />
                    <span className="settings-slider-value">{inputVolume}%</span>
                  </div>
                </div>

                {/* Mic test */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('settings.micTest')}</h4>
                  <div className="mic-test-container">
                    <button type="button"
                      className={`settings-card-btn${isMicTesting ? ' active' : ''}`}
                      onClick={isMicTesting ? stopMicTest : startMicTest}>
                      <Mic size={16} />
                      {isMicTesting ? t('settings.stopTest') : t('settings.startTest')}
                    </button>
                    <div className="mic-test-bar">
                      <div className="mic-test-fill" style={{ width: `${micTestLevel}%` }} />
                    </div>
                  </div>
                </div>

                <div className="settings-divider" />

                {/* Output device */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('settings.outputDevice')}</h4>
                  <p className="settings-group-desc">{t('settings.outputDeviceDesc')}</p>
                  <CustomDropdown
                    icon={<Volume2 size={16} />}
                    value={selectedOutputDevice}
                    onChange={handleOutputDeviceChange}
                    options={[
                      { value: 'default', label: t('settings.defaultDevice') },
                      ...audioOutputDevices.map(d => ({
                        value: d.deviceId,
                        label: d.label || `${t('settings.speaker')} (${d.deviceId.slice(0, 8)})`
                      }))
                    ]}
                  />
                </div>

                {/* Output volume */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('settings.outputVolume')}</h4>
                  <div className="settings-slider-row">
                    <Volume2 size={16} className="settings-slider-icon" />
                    <input type="range" className="settings-slider" min={0} max={200} value={outputVolume}
                      onChange={e => handleOutputVolumeChange(parseInt(e.target.value))} />
                    <span className="settings-slider-value">{outputVolume}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════ NOTIFICATIONS ═══════════════ */}
            {activeTab === 'notifications' && (
              <div className="settings-page">
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.desktopNotifications')}</h4>
                  <p className="settings-group-desc">{t('user.desktopNotificationsHint')}</p>
                  <div className="settings-toggle-row">
                    <span>{desktopNotif ? t('user.notifEnabled') : t('user.notifDisabled')}</span>
                    <button type="button"
                      className={`settings-toggle${desktopNotif ? ' active' : ''}`}
                      onClick={handleDesktopNotifToggle}>
                      <div className="settings-toggle-knob" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════ APPEARANCE ═══════════════ */}
            {activeTab === 'appearance' && (
              <div className="settings-page">
                {/* Theme */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.theme')}</h4>
                  <div className="settings-theme-grid">
                    <button type="button"
                      className={`settings-theme-card${theme === 'dark' ? ' active' : ''}`}
                      onClick={() => theme !== 'dark' && toggleTheme()}>
                      <div className="settings-theme-preview dark-preview"><Moon size={24} /></div>
                      <span>{t('user.dark')}</span>
                    </button>
                    <button type="button"
                      className={`settings-theme-card${theme === 'light' ? ' active' : ''}`}
                      onClick={() => theme !== 'light' && toggleTheme()}>
                      <div className="settings-theme-preview light-preview"><Sun size={24} /></div>
                      <span>{t('user.light')}</span>
                    </button>
                  </div>
                </div>

                {/* Accent Color (boost-locked) */}
                <div className={`settings-group${!user?.hasDmxBoost ? ' boost-locked-group' : ''}`}>
                  <h4 className="settings-group-title">
                    {t('user.accentColor')}
                    {!user?.hasDmxBoost && <span className="boost-badge"><Lock size={12} /> DMX Boost</span>}
                  </h4>
                  <p className="settings-group-desc">{t('user.accentColorHint')}</p>
                  <div className="settings-accent-grid">
                    {ACCENT_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label}
                        className={`settings-accent-swatch${accentColor === c.value ? ' selected' : ''}`}
                        style={{ '--swatch-color': c.value, '--swatch-shadow': c.shadow } as React.CSSProperties}
                        onClick={() => user?.hasDmxBoost && handleAccentChange(c)}
                        disabled={!user?.hasDmxBoost} />
                    ))}
                  </div>
                </div>

                <div className="settings-divider" />

                {/* Background toggle */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.bgTitle')}</h4>
                  <div className="settings-toggle-row">
                    <span>{noBg ? t('user.bgDisabled') : t('user.bgEnabled')}</span>
                    <button type="button"
                      className={`settings-toggle${!noBg ? ' active' : ''}`}
                      onClick={handleNoBgToggle}>
                      <div className="settings-toggle-knob" />
                    </button>
                  </div>
                </div>

                {/* Custom background (boost-locked) */}
                <div className={`settings-group${!user?.hasDmxBoost ? ' boost-locked-group' : ''}`}>
                  <h4 className="settings-group-title">
                    {t('user.customBgUpload')}
                    {!user?.hasDmxBoost && <span className="boost-badge"><Lock size={12} /> DMX Boost</span>}
                  </h4>
                  <p className="settings-group-desc">{t('user.customBgHint')}</p>
                  <div className="settings-upload-actions">
                    <input ref={customBgFileInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleCustomBgChange} disabled={!user?.hasDmxBoost} style={{ display: 'none' }} />
                    <button type="button" className="settings-upload-btn"
                      onClick={() => customBgFileInputRef.current?.click()} disabled={!user?.hasDmxBoost}>
                      <Upload size={16} /> {customBg ? t('user.changeFile') : t('user.selectFile')}
                    </button>
                    {customBg && (
                      <button type="button" className="settings-upload-btn danger" onClick={handleClearCustomBg}>
                        <ImageOff size={16} /> {t('user.clearCustomBg')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Blur slider */}
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.bgBlur')}</h4>
                  <p className="settings-group-desc">{t('user.bgBlurHint')}</p>
                  <div className="settings-slider-row">
                    <Layers size={16} className="settings-slider-icon" />
                    <input type="range" className="settings-slider" min={0} max={100} value={bgBlur}
                      onChange={e => handleBgBlurChange(parseInt(e.target.value, 10))} />
                    <span className="settings-slider-value">{bgBlur}%</span>
                  </div>
                  {/* Live preview */}
                  <div className="blur-preview-container">
                    <div className="blur-preview-bg" style={{
                      ...(customBg
                        ? { backgroundImage: `url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }),
                      filter: `blur(${(bgBlur / 100) * 20}px)`,
                      transform: 'scale(1.08)',
                    }} />
                    <div className="blur-preview-overlay">
                      <div className="blur-preview-msg blur-preview-msg--received">
                        <div className="blur-preview-avatar">A</div>
                        <div className="blur-preview-bubble blur-preview-bubble--received">Hey, how are you? 👋</div>
                      </div>
                      <div className="blur-preview-msg blur-preview-msg--sent">
                        <div className="blur-preview-bubble blur-preview-bubble--sent">I'm good! 😄</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════ LANGUAGE ═══════════════ */}
            {activeTab === 'language' && (
              <div className="settings-page">
                <div className="settings-group">
                  <h4 className="settings-group-title">{t('user.selectLanguage')}</h4>
                  <div className="settings-language-grid">
                    {languages.map(lang => (
                      <button key={lang.code} type="button"
                        className={`settings-language-card${i18n.language === lang.code ? ' active' : ''}`}
                        onClick={() => handleLanguageChange(lang.code)}>
                        <span className="settings-language-flag">{lang.flag}</span>
                        <span className="settings-language-name">{lang.nativeName}</span>
                        {i18n.language === lang.code && <CheckCircle2 size={16} className="settings-language-check" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════ BOOST ═══════════════ */}
            {activeTab === 'boost' && (
              <div className="settings-page">
                {/* Hero */}
                <div className="boost-hero-card">
                  <div className="boost-hero-bg" />
                  <div className="boost-hero-content">
                    <div className="boost-hero-icon"><Rocket size={36} /></div>
                    <div className="boost-hero-text">
                      {user?.hasDmxBoost ? (
                        <>
                          <h3>{t('boost.active')}</h3>
                          {user.dmxBoostExpiresAt && (
                            <p>{t('boost.expiresOn', { date: new Date(user.dmxBoostExpiresAt).toLocaleDateString() })}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <h3>DMX Boost</h3>
                          <p>{t('boost.tagline')}</p>
                        </>
                      )}
                    </div>
                    {!user?.hasDmxBoost && (
                      <button type="button" className="boost-buy-btn" onClick={handleBoostPurchase} disabled={boostLoading}>
                        <Rocket size={18} />
                        {boostLoading ? t('boost.loading') : t('boost.buy')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Features list */}
                <div className="settings-card">
                  <h4 className="settings-card-title">{t('boost.features')}</h4>
                  <div className="boost-features-list">
                    <div className="boost-feature-item"><Palette size={16} /><span>{t('user.accentColor')}</span></div>
                    <div className="boost-feature-item"><Upload size={16} /><span>{t('settings.profileBanner')}</span></div>
                    <div className="boost-feature-item"><ImageOff size={16} /><span>{t('user.customBgUpload')}</span></div>
                    <div className="boost-feature-item"><UserIcon size={16} /><span>{t('boost.gifAvatarHint')}</span></div>
                  </div>
                </div>

                {/* Redeem */}
                <div className="settings-card">
                  <h4 className="settings-card-title">{t('boost.redeemCode')}</h4>
                  <div className="boost-redeem-row">
                    <input type="text" className="settings-input" placeholder={t('boost.redeemPlaceholder')}
                      value={boostCode}
                      onChange={e => { setBoostCode(e.target.value.toUpperCase()); setBoostCodeResult(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRedeemCode(); } }}
                      disabled={boostCodeLoading} maxLength={14} spellCheck={false} autoComplete="off" />
                    <button type="button" className="settings-save-btn"
                      onClick={handleRedeemCode} disabled={boostCodeLoading || !boostCode.trim()}>
                      {boostCodeLoading ? t('boost.loading') : t('boost.redeemBtn')}
                    </button>
                  </div>
                  {boostCodeResult && (
                    <div className={`boost-redeem-result boost-redeem-result--${boostCodeResult.ok ? 'ok' : 'err'}`}>
                      {boostCodeResult.ok ? '✅' : '❌'} {boostCodeResult.msg}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════ ACCOUNT STATUS ═══════════════ */}
            {activeTab === 'accountStatus' && (
              <div className="settings-page">
                {/* Overview banner */}
                {(() => {
                  const isBanned = user.restrictions?.isBanned;
                  const hasActive = user.activeRestrictions && user.activeRestrictions.length > 0;
                  const hasWarnings = user.warnings && user.warnings.length > 0;
                  const isGood = !isBanned && !hasActive;
                  return (
                    <div className={`account-overview-card ${isBanned ? 'banned' : isGood ? 'good' : 'restricted'}`}>
                      <div className="account-overview-icon">
                        {isBanned ? <Ban size={36} /> : isGood ? <CheckCircle2 size={36} /> : <Shield size={36} />}
                      </div>
                      <div className="account-overview-info">
                        <div className="account-overview-status">
                          {isBanned ? t('user.accountBanned') :
                           hasActive ? t('user.accountRestricted') :
                           hasWarnings ? t('user.accountWarnings') :
                           t('user.accountGood')}
                        </div>
                        <div className="account-overview-meta">
                          <span><Calendar size={13} /> {t('user.accountJoined')}: {joinDate}</span>
                          <span><Mail size={13} /> {maskedEmail}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Restrictions grid */}
                <div className="settings-card">
                  <h4 className="settings-card-title">{t('user.currentRestrictions')}</h4>
                  {user.restrictions ? (
                    <div className="restrictions-grid">
                      {(['canAddFriends', 'canAcceptFriends', 'canSendMessages', 'isBanned'] as const).map(key => {
                        const val = user.restrictions![key];
                        const isRestricted = key === 'isBanned' ? val : !val;
                        return (
                          <div key={key} className={`restriction-item ${isRestricted ? 'restricted' : 'allowed'}`}>
                            <span className="restriction-label">{t(`user.${key}`)}</span>
                            <span className="restriction-value">{val ? t('user.yes') : t('user.no')}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="settings-empty">{t('user.noRestrictionsData')}</p>
                  )}
                </div>

                {/* Active restrictions */}
                {user.activeRestrictions && user.activeRestrictions.length > 0 && (
                  <div className="settings-card">
                    <h4 className="settings-card-title">{t('user.activeRestrictions')}</h4>
                    <div className="restrictions-list">
                      {user.activeRestrictions.map((r, i) => (
                        <div key={i} className={`restriction-card ${r.type}`}>
                          <div className="restriction-header">
                            <span className="restriction-type">{t(`user.${r.type}`)}</span>
                            {r.category && <span className="restriction-category">{r.category}</span>}
                          </div>
                          <div className="restriction-details">
                            <p><strong>{t('user.reason')}:</strong> {r.reason}</p>
                            <p><strong>{t('user.issuedBy')}:</strong> {r.issuedByUsername || r.issuedBy}</p>
                            <p><strong>{t('user.issuedAt')}:</strong> {new Date(r.issuedAt).toLocaleString(i18n.language)}</p>
                            {r.expiresAt
                              ? <p><strong>{t('user.expiresAt')}:</strong> {new Date(r.expiresAt).toLocaleString(i18n.language)}</p>
                              : <p><strong>{t('user.duration')}:</strong> {t('user.permanent')}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                <div className="settings-card">
                  <h4 className="settings-card-title">{t('user.warningHistory')}</h4>
                  {user.warnings && user.warnings.length > 0 ? (
                    <div className="warnings-list">
                      {user.warnings.map((w, i) => (
                        <div key={i} className="warning-card">
                          <div className="warning-header">
                            <span className="warning-type">{t(`user.${w.type}`)}</span>
                            {w.category && <span className="warning-category">{w.category}</span>}
                          </div>
                          <div className="warning-details">
                            <p><strong>{t('user.reason')}:</strong> {w.reason}</p>
                            <p><strong>{t('user.issuedBy')}:</strong> {w.issuedByUsername || w.issuedBy}</p>
                            <p><strong>{t('user.issuedAt')}:</strong> {new Date(w.issuedAt).toLocaleString(i18n.language)}</p>
                            {w.expiresAt && (
                              <p><strong>{t('user.expiresAt')}:</strong> {new Date(w.expiresAt).toLocaleString(i18n.language)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-empty">{t('user.noWarnings')}</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
