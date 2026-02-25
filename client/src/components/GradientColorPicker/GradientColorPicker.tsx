import React, { useState, useRef, useCallback, useEffect } from 'react';
import './GradientColorPicker.css';

/* ═══════════════════════════════════════════════════════════════════════════
   COLOUR HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/** HSV → HEX */
function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`;
}

/** HEX → HSV */
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESET COLOR PALETTE
   ═══════════════════════════════════════════════════════════════════════════ */
const PRESET_COLORS = [
  '#1a1a2e', '#0f3460', '#16213e', '#1b1b2f',
  '#e94560', '#dc2626', '#f97316', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#14b8a6', '#84cc16', '#ffffff',
  '#000000', '#374151', '#78716c', '#d4d4d8',
];

/* ═══════════════════════════════════════════════════════════════════════════
   SINGLE COLOUR PICKER (saturation panel + hue bar + hex input + presets)
   ═══════════════════════════════════════════════════════════════════════════ */

interface SinglePickerProps {
  label: string;
  color: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

function SingleColorPicker({ label, color, onChange, disabled }: SinglePickerProps) {
  const satRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingSat = useRef(false);
  const draggingHue = useRef(false);

  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color.toUpperCase());

  /* sync external changes */
  useEffect(() => {
    const incoming = hexToHsv(color);
    setHsv(incoming);
    setHexInput(color.toUpperCase());
  }, [color]);

  const commitColor = useCallback((h: number, s: number, v: number) => {
    const newHsv = { h, s, v };
    setHsv(newHsv);
    const hex = hsvToHex(h, s, v);
    setHexInput(hex.toUpperCase());
    onChange(hex);
  }, [onChange]);

  /* ── Saturation/Brightness drag ───────────────────────────────────── */
  const handleSatMove = useCallback((clientX: number, clientY: number) => {
    const el = satRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    commitColor(hsv.h, s, v);
  }, [hsv.h, commitColor]);

  const handleSatDown = (e: React.MouseEvent) => {
    if (disabled) return;
    draggingSat.current = true;
    handleSatMove(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => { if (draggingSat.current) handleSatMove(ev.clientX, ev.clientY); };
    const onUp = () => { draggingSat.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ── Hue drag ─────────────────────────────────────────────────────── */
  const handleHueMove = useCallback((clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
    commitColor(h, hsv.s, hsv.v);
  }, [hsv.s, hsv.v, commitColor]);

  const handleHueDown = (e: React.MouseEvent) => {
    if (disabled) return;
    draggingHue.current = true;
    handleHueMove(e.clientX);
    const onMove = (ev: MouseEvent) => { if (draggingHue.current) handleHueMove(ev.clientX); };
    const onUp = () => { draggingHue.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ── Hex input ────────────────────────────────────────────────────── */
  const handleHexChange = (val: string) => {
    let v = val.replace(/[^0-9a-fA-F#]/g, '');
    if (!v.startsWith('#')) v = '#' + v;
    if (v.length > 7) v = v.slice(0, 7);
    setHexInput(v.toUpperCase());
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const newHsv = hexToHsv(v);
      setHsv(newHsv);
      onChange(v.toLowerCase());
    }
  };

  const hueColor = hsvToHex(hsv.h, 1, 1);

  return (
    <div className="gradient-picker-column">
      <span className="gradient-picker-label">{label}</span>

      {/* Saturation / Brightness */}
      <div
        ref={satRef}
        className="color-picker-saturation"
        style={{ backgroundColor: hueColor }}
        onMouseDown={handleSatDown}
      >
        <div className="color-picker-saturation-white" />
        <div className="color-picker-saturation-black" />
        <div
          className="color-picker-saturation-cursor"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
          }}
        />
      </div>

      {/* Hue */}
      <div ref={hueRef} className="color-picker-hue-bar" onMouseDown={handleHueDown}>
        <div
          className="color-picker-hue-thumb"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: hueColor,
          }}
        />
      </div>

      {/* Hex + preview swatch */}
      <div className="color-picker-hex-row">
        <div className="color-picker-swatch-preview" style={{ backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v) }} />
        <input
          className="color-picker-hex-input"
          value={hexInput}
          onChange={e => handleHexChange(e.target.value)}
          maxLength={7}
          spellCheck={false}
          disabled={disabled}
        />
      </div>

      {/* Preset swatches */}
      <div className="color-picker-presets">
        {PRESET_COLORS.map(c => (
          <div
            key={c}
            className={`color-picker-preset${color.toLowerCase() === c ? ' active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => !disabled && onChange(c)}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRADIENT COLOR PICKER (two SingleColorPickers + live gradient preview)
   ═══════════════════════════════════════════════════════════════════════════ */

interface GradientColorPickerProps {
  colorTop: string;
  colorBottom: string;
  onChangeTop: (hex: string) => void;
  onChangeBottom: (hex: string) => void;
  disabled?: boolean;
}

export function GradientColorPicker({ colorTop, colorBottom, onChangeTop, onChangeBottom, disabled }: GradientColorPickerProps) {
  return (
    <div className={`gradient-picker${disabled ? ' disabled' : ''}`}>
      {/* Live gradient preview bar */}
      <div
        className="gradient-picker-preview"
        style={{ background: `linear-gradient(to right, ${colorTop}, ${colorBottom})` }}
      />

      <div className="gradient-picker-row">
        <SingleColorPicker label="Góra (Top)" color={colorTop} onChange={onChangeTop} disabled={disabled} />
        <SingleColorPicker label="Dół (Bottom)" color={colorBottom} onChange={onChangeBottom} disabled={disabled} />
      </div>
    </div>
  );
}
