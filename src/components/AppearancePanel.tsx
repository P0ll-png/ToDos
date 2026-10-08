/**
 * AppearancePanel — per-user theme customization, reachable from the gear/
 * palette icon in the Header. Available to EVERYONE (anonymous persists to
 * localStorage only; logged-in also to their profile via ThemeProvider).
 *
 * Controls (all real <button>/<input> with the global focus ring):
 *  - Mode: Light / Dark / System
 *  - Accent: color picker + a few presets + manual hex (validated)
 *  - Optional background tint + surface tint (picker/presets, clearable)
 *  - Reset to default
 *
 * Contrast guards (design "Where contrast checks are applied"):
 *  - When --accent-text falls back to --text (adjustForAA couldn't make the
 *    accent readable as link text in this mode), show a ContrastWarning.
 *  - When a bg/surface tint drops --text below AA 4.5 against the tinted
 *    bg/surface, warn and offer one-click discard-tint (keep the base).
 *
 * Hex validation: /^#([0-9a-fA-F]{6})$/ — invalid manual entry is rejected and
 * the previous value is kept.
 */
import { useState } from 'react';
import { useTheme } from '../context/ThemeProvider';
import { resolveActiveMode } from '../lib/theme';
import {
  AA_NORMAL,
  DEFAULT_ACCENT,
  basePalette,
  contrastRatio,
  isHex,
  resolveAccentText,
  type ThemeMode,
} from '../lib/theme-core';
import { ContrastWarning } from './ContrastWarning';

const ACCENT_PRESETS = ['#FFB547', '#4C9AFF', '#36B37E', '#F0666B', '#B37FEB'];
const TINT_PRESETS = ['#0E1726', '#15223A', '#F5F7FB', '#FFFFFF'];

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

interface AppearancePanelProps {
  onClose: () => void;
}

export function AppearancePanel({ onClose }: AppearancePanelProps) {
  const { prefs, setPrefs, reset } = useTheme();

  // Separate draft for the manual hex field so an in-progress "#ab" doesn't
  // clobber the committed accent until it validates.
  const [accentDraft, setAccentDraft] = useState(prefs.accent);
  const [accentHexError, setAccentHexError] = useState(false);

  const mode = resolveActiveMode(prefs);
  const base = basePalette(mode);
  const bg = prefs.bgTint && isHex(prefs.bgTint) ? prefs.bgTint : base.bg;
  const surface =
    prefs.surfaceTint && isHex(prefs.surfaceTint) ? prefs.surfaceTint : base.surface;

  // Guard 1: did --accent-text have to fall back to --text?
  const accentText = resolveAccentText(prefs.accent, bg, surface, base.text, mode);
  const accentFellBack = accentText === base.text;

  // Guard 2: does any active tint drop --text below AA?
  const textOnBg = contrastRatio(base.text, bg);
  const textOnSurface = contrastRatio(base.text, surface);
  const tintActive = Boolean(prefs.bgTint || prefs.surfaceTint);
  const tintBreaksText =
    tintActive && (textOnBg < AA_NORMAL || textOnSurface < AA_NORMAL);

  function commitAccent(value: string) {
    if (!isHex(value)) {
      setAccentHexError(true);
      return;
    }
    setAccentHexError(false);
    setAccentDraft(value);
    setPrefs({ accent: value });
  }

  function handleReset() {
    reset();
    setAccentDraft(DEFAULT_ACCENT);
    setAccentHexError(false);
  }

  const titleId = 'appearance-title';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="card"
      style={dialogStyle}
    >
      <h2 id={titleId} style={{ marginTop: 0 }}>
        Appearance
      </h2>

      {/* Mode */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Mode</legend>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {MODE_OPTIONS.map((opt) => {
            const selected = prefs.mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setPrefs({ mode: opt.value })}
                style={selected ? segmentActiveStyle : segmentStyle}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Accent */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Accent color</legend>
        <div style={swatchRowStyle}>
          {ACCENT_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`Accent ${hex}`}
              aria-pressed={prefs.accent.toUpperCase() === hex.toUpperCase()}
              onClick={() => commitAccent(hex)}
              style={{
                ...swatchStyle,
                background: hex,
                outline:
                  prefs.accent.toUpperCase() === hex.toUpperCase()
                    ? '2px solid var(--text)'
                    : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
        <div style={pickerRowStyle}>
          <input
            type="color"
            aria-label="Accent color picker"
            value={isHex(prefs.accent) ? prefs.accent : DEFAULT_ACCENT}
            onChange={(e) => commitAccent(e.target.value)}
            style={colorInputStyle}
          />
          <input
            type="text"
            aria-label="Accent hex"
            value={accentDraft}
            spellCheck={false}
            onChange={(e) => setAccentDraft(e.target.value)}
            onBlur={(e) => commitAccent(e.target.value.trim())}
            style={hexInputStyle}
          />
        </div>
        {accentHexError && (
          <p role="alert" style={hintStyle}>
            Enter a 6-digit hex like #FFB547.
          </p>
        )}
        {accentFellBack && (
          <ContrastWarning>
            This accent isn&apos;t readable as link text in {mode} mode; links use
            the default text color.
          </ContrastWarning>
        )}
      </fieldset>

      {/* Tints */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Background &amp; surface tint (optional)</legend>

        <TintControl
          label="Background"
          value={prefs.bgTint}
          onPick={(hex) => setPrefs({ bgTint: hex })}
          onClear={() => setPrefs({ bgTint: undefined })}
        />
        <TintControl
          label="Surface"
          value={prefs.surfaceTint}
          onPick={(hex) => setPrefs({ surfaceTint: hex })}
          onClear={() => setPrefs({ surfaceTint: undefined })}
        />

        {tintBreaksText && (
          <ContrastWarning
            action={{
              label: 'Discard tint',
              onClick: () =>
                setPrefs({ bgTint: undefined, surfaceTint: undefined }),
            }}
          >
            This tint makes text hard to read in {mode} mode. Discard it to keep
            the readable base.
          </ContrastWarning>
        )}
      </fieldset>

      <div style={footerStyle}>
        <button type="button" onClick={handleReset} style={secondaryButtonStyle}>
          Reset to default
        </button>
        <button type="button" onClick={onClose} style={accentButtonStyle}>
          Done
        </button>
      </div>
    </div>
  );
}

interface TintControlProps {
  label: string;
  value: string | undefined;
  onPick: (hex: string) => void;
  onClear: () => void;
}

function TintControl({ label, value, onPick, onClear }: TintControlProps) {
  return (
    <div style={tintRowStyle}>
      <span style={{ minWidth: '5.5rem' }}>{label}</span>
      <div style={swatchRowStyle}>
        {TINT_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`${label} tint ${hex}`}
            aria-pressed={(value ?? '').toUpperCase() === hex.toUpperCase()}
            onClick={() => onPick(hex)}
            style={{
              ...swatchStyle,
              background: hex,
              outline:
                (value ?? '').toUpperCase() === hex.toUpperCase()
                  ? '2px solid var(--text)'
                  : '1px solid var(--border)',
            }}
          />
        ))}
      </div>
      <input
        type="color"
        aria-label={`${label} tint picker`}
        value={value && isHex(value) ? value : '#000000'}
        onChange={(e) => onPick(e.target.value)}
        style={colorInputStyle}
      />
      <button
        type="button"
        onClick={onClear}
        disabled={!value}
        style={clearButtonStyle}
      >
        Clear
      </button>
    </div>
  );
}

const dialogStyle: React.CSSProperties = {
  padding: '1.5rem',
  maxWidth: '28rem',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
};

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  padding: '0.75rem',
  margin: '0 0 1rem',
};

const legendStyle: React.CSSProperties = {
  padding: '0 0.375rem',
  fontWeight: 500,
};

const segmentStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.5rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  fontWeight: 500,
};

const segmentActiveStyle: React.CSSProperties = {
  ...segmentStyle,
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
};

const swatchRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.375rem',
};

const swatchStyle: React.CSSProperties = {
  width: '1.75rem',
  height: '1.75rem',
  padding: 0,
  borderRadius: 'calc(var(--radius) - 6px)',
  border: 'none',
};

const pickerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.5rem',
};

const colorInputStyle: React.CSSProperties = {
  width: '2.5rem',
  height: '2rem',
  padding: 0,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
};

const hexInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.5rem',
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 6px)',
  font: 'inherit',
};

const hintStyle: React.CSSProperties = {
  margin: '0.375rem 0 0',
  color: 'var(--danger)',
  fontSize: '0.8125rem',
};

const tintRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.5rem',
  marginBottom: '0.5rem',
};

const clearButtonStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 8px)',
  fontWeight: 500,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
};

const accentButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: '1px solid var(--accent)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(var(--radius) - 4px)',
  fontWeight: 500,
};
