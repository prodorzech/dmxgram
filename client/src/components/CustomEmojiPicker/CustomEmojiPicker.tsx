import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Clock, Smile, Users, Heart, Coffee, Plane, Package, Hash, type LucideIcon } from 'lucide-react';
import './CustomEmojiPicker.css';

interface EmojiCategory {
  name: string;
  Icon: LucideIcon;
  emojis: string[];
}

interface CustomEmojiPickerProps {
  onEmojiClick: (emoji: string) => void;
}

const BASE_CATEGORIES: EmojiCategory[] = [
  {
    name: 'emoji.recent',
    Icon: Clock,
    emojis: []
  },
  {
    name: 'emoji.smileys',
    Icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶',
      '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
      '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
      '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩',
      '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡'
    ]
  },
  {
    name: 'emoji.people',
    Icon: Users,
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾',
      '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅',
      '👄', '💋', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨',
      '👩‍🦱', '👨‍🦱', '👩‍🦰', '👨‍🦰', '👱‍♀️', '👱', '👱‍♂️', '👩‍🦳', '👨‍🦳',
      '👩‍🦲', '👨‍🦲', '🧔', '👵', '🧓', '👴', '👲', '👳'
    ]
  },
  {
    name: 'emoji.hearts',
    Icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️',
      '✡️', '🔯', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌',
      '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️',
      '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲',
      '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫'
    ]
  },
  {
    name: 'emoji.food',
    Icon: Coffee,
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑',
      '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥒', '🌶️', '🌽', '🥕',
      '🧄', '🧅', '🥔', '🍠', '🥐', '🍞', '🥖', '🧀', '🥚', '🍳', '🧈', '🥞',
      '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯',
      '🥗', '🥘', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚',
      '🍘', '🍥', '🍧', '🍨', '🍦', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫',
      '🍿', '🍩', '🍪', '🌰', '🥜', '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂',
      '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🥄', '🍴', '🍽️', '🧂'
    ]
  },
  {
    name: 'emoji.travel',
    Icon: Plane,
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚',
      '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🚨', '🚡', '🚠', '🚟', '🚃', '🚋',
      '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬',
      '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🚢', '⚓',
      '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '⛲', '🏖️', '🏝️',
      '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🏠', '🏡', '🏘️', '🏗️', '🏭',
      '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️'
    ]
  },
  {
    name: 'emoji.objects',
    Icon: Package,
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🕹️', '💾',
      '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📞', '☎️', '📺', '📻', '🎙️',
      '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦',
      '🕯️', '💸', '💵', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧',
      '🔨', '⚒️', '🛠️', '🔩', '⚙️', '🧱', '🧲', '🔪', '⚔️', '🛡️',
      '🔮', '📿', '🧿', '⚗️', '🔭', '🔬', '🩹', '🩺', '💊', '💉',
      '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🧺', '🧻', '🚽', '🚰', '🧼', '🪥'
    ]
  },
  {
    name: 'emoji.symbols',
    Icon: Hash,
    emojis: [
      '💯', '▶️', '⏸️', '⏹️', '⏭️', '⏮️', '⏩', '⏪', '◀️', '🔼', '🔽',
      '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️',
      '🔀', '🔁', '🔂', '🔄', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲',
      '💱', '™️', '©️', '®️', '✔️', '☑️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
      '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲',
      '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫',
      '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🎴'
    ]
  }
];

export function CustomEmojiPicker({ onEmojiClick }: CustomEmojiPickerProps) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('recentEmojis');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const handleEmojiSelect = (emoji: string) => {
    onEmojiClick(emoji);
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 24);
    setRecentEmojis(updated);
    localStorage.setItem('recentEmojis', JSON.stringify(updated));
  };

  // Build categories WITHOUT mutating BASE_CATEGORIES
  const categories: EmojiCategory[] = BASE_CATEGORIES.map((cat, i) =>
    i === 0 ? { ...cat, emojis: recentEmojis } : cat
  );

  const activeEmojis = searchQuery
    ? categories.flatMap(cat => cat.emojis).filter(emoji => emoji.includes(searchQuery))
    : (categories[activeCategory]?.emojis ?? []);

  const activeName = searchQuery
    ? t('emoji.searchResults')
    : t(categories[activeCategory]?.name ?? '');

  return (
    <div className="custom-emoji-picker">
      {/* Search bar */}
      <div className="emoji-search">
        <Search size={14} />
        <input
          type="text"
          placeholder={t('emoji.search')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          autoFocus
        />
        {searchQuery && (
          <button className="emoji-search-clear" onClick={() => setSearchQuery('')} type="button">×</button>
        )}
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div className="emoji-categories">
          {categories.map((cat, index) => {
            const Icon = cat.Icon;
            const disabled = index === 0 && recentEmojis.length === 0;
            return (
              <button
                key={cat.name}
                className={`category-btn ${activeCategory === index ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && setActiveCategory(index)}
                title={t(cat.name)}
                type="button"
              >
                <Icon size={17} />
              </button>
            );
          })}
        </div>
      )}

      {/* Category name label */}
      <div className="emoji-category-label">{activeName}</div>

      {/* Emoji grid */}
      <div className="emoji-grid">
        {activeEmojis.length > 0 ? (
          activeEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              className="emoji-btn"
              onClick={() => handleEmojiSelect(emoji)}
              title={emoji}
              type="button"
            >
              {emoji}
            </button>
          ))
        ) : (
          <div className="emoji-empty">
            <span>{searchQuery ? '🔍' : '⏳'}</span>
            <p>{searchQuery ? t('emoji.noEmoji') : t('emoji.noRecent')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
