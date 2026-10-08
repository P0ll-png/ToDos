import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ThemePrefs } from '../lib/theme-core';

const { setPrefsMock, resetMock, useThemeMock } = vi.hoisted(() => ({
  setPrefsMock: vi.fn(),
  resetMock: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock('../context/ThemeProvider', () => ({
  useTheme: () => useThemeMock(),
}));

import { AppearancePanel } from './AppearancePanel';

function mockTheme(prefs: ThemePrefs) {
  useThemeMock.mockReturnValue({
    prefs,
    setPrefs: setPrefsMock,
    reset: resetMock,
  });
}

describe('AppearancePanel', () => {
  beforeEach(() => {
    setPrefsMock.mockReset();
    resetMock.mockReset();
    useThemeMock.mockReset();
  });

  it('exposes mode, accent, tint, and reset controls as real buttons/inputs', () => {
    mockTheme({ mode: 'system', accent: '#FFB547' });
    render(<AppearancePanel onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByLabelText('Accent color picker')).toBeInTheDocument();
    expect(screen.getByLabelText('Accent hex')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset to default' }),
    ).toBeInTheDocument();
  });

  it('changes mode via the segmented control', () => {
    mockTheme({ mode: 'system', accent: '#FFB547' });
    render(<AppearancePanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(setPrefsMock).toHaveBeenCalledWith({ mode: 'dark' });
  });

  it('commits a valid accent hex and rejects an invalid one', () => {
    mockTheme({ mode: 'dark', accent: '#FFB547' });
    render(<AppearancePanel onClose={() => {}} />);
    const hex = screen.getByLabelText('Accent hex');

    fireEvent.change(hex, { target: { value: '#112233' } });
    fireEvent.blur(hex, { target: { value: '#112233' } });
    expect(setPrefsMock).toHaveBeenCalledWith({ accent: '#112233' });

    setPrefsMock.mockClear();
    fireEvent.change(hex, { target: { value: 'nope' } });
    fireEvent.blur(hex, { target: { value: 'nope' } });
    expect(setPrefsMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('6-digit hex');
  });

  it('calls reset when "Reset to default" is clicked', () => {
    mockTheme({ mode: 'light', accent: '#112233', bgTint: '#101010' });
    render(<AppearancePanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('warns and offers discard-tint when a tint breaks text contrast', () => {
    // Dark-mode text is light (#E8EDF5); a near-white surface tint drops it
    // below AA, so the warning + discard action must appear.
    mockTheme({ mode: 'dark', accent: '#FFB547', surfaceTint: '#FFFFFF' });
    render(<AppearancePanel onClose={() => {}} />);
    const discard = screen.getByRole('button', { name: 'Discard tint' });
    expect(discard).toBeInTheDocument();
    fireEvent.click(discard);
    expect(setPrefsMock).toHaveBeenCalledWith({
      bgTint: undefined,
      surfaceTint: undefined,
    });
  });

  it('warns when the accent is not readable as link text (fallback to --text)', () => {
    // White accent in dark mode on the navy base cannot be made AA as text ->
    // --accent-text falls back to --text and the panel shows the warning.
    mockTheme({ mode: 'dark', accent: '#FFFFFF', bgTint: '#FFFFFF', surfaceTint: '#FFFFFF' });
    render(<AppearancePanel onClose={() => {}} />);
    expect(screen.getByText(/isn't readable as link text/i)).toBeInTheDocument();
  });
});
