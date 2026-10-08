import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

import { Header } from './Header';

describe('Header officer-only controls', () => {
  beforeEach(() => {
    useSessionMock.mockReset();
  });

  it('shows the Members (admin) control for an officer', () => {
    useSessionMock.mockReturnValue({
      session: {},
      profile: { id: 'x', name: 'Al', email: 'a@b.com', role: 'officer' },
      role: 'officer',
      isOfficer: true,
      refreshProfile: vi.fn(),
    });
    render(<Header />);
    expect(
      screen.getByRole('button', { name: 'Members' }),
    ).toBeInTheDocument();
  });

  it('hides the Members control for a member', () => {
    useSessionMock.mockReturnValue({
      session: {},
      profile: { id: 'x', name: 'M', email: 'm@b.com', role: 'member' },
      role: 'member',
      isOfficer: false,
      refreshProfile: vi.fn(),
    });
    render(<Header />);
    expect(
      screen.queryByRole('button', { name: 'Members' }),
    ).not.toBeInTheDocument();
  });

  it('hides the Members control for an anonymous visitor and offers sign in', () => {
    useSessionMock.mockReturnValue({
      session: null,
      profile: null,
      role: null,
      isOfficer: false,
      refreshProfile: vi.fn(),
    });
    render(<Header />);
    expect(
      screen.queryByRole('button', { name: 'Members' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
