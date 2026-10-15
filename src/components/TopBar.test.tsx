import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// AccountControls (composed inside TopBar) reaches for supabase; stub it so the
// bar renders without a configured client.
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

const { useNavMock } = vi.hoisted(() => ({ useNavMock: vi.fn() }));
vi.mock('../context/NavProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/NavProvider')>();
  return { ...actual, useNav: () => useNavMock() };
});

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

const { useAbsencePendingCountMock } = vi.hoisted(() => ({
  useAbsencePendingCountMock: vi.fn(),
}));
vi.mock('../data/useAbsencePendingCount', () => ({
  useAbsencePendingCount: (enabled: boolean) =>
    useAbsencePendingCountMock(enabled),
}));

import { TopBar } from './TopBar';

const member = {
  session: null,
  profile: null,
  role: null,
  isOfficer: false,
  refreshProfile: vi.fn(),
};

const officer = {
  session: {},
  profile: { id: 'x', name: 'Al', email: 'a@b.com', role: 'officer' },
  role: 'officer',
  isOfficer: true,
  refreshProfile: vi.fn(),
};

describe('TopBar', () => {
  beforeEach(() => {
    useNavMock.mockReset();
    useSessionMock.mockReset();
    useAbsencePendingCountMock.mockReset();
    useNavMock.mockReturnValue({ page: 'board', setPage: vi.fn() });
    useSessionMock.mockReturnValue(member);
    useAbsencePendingCountMock.mockReturnValue({ count: 0, refetch: vi.fn() });
  });

  it('renders the nav tabs as buttons', () => {
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Board' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Absences' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reviewers' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Announcements' }),
    ).toBeInTheDocument();
  });

  it('marks the active tab with aria-current="page"', () => {
    useNavMock.mockReturnValue({ page: 'absences', setPage: vi.fn() });
    render(<TopBar />);
    expect(screen.getByRole('button', { name: 'Absences' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Board' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('exposes the primary navigation landmark', () => {
    render(<TopBar />);
    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
  });

  it('shows the Absences pending badge for an officer with a positive count', () => {
    useSessionMock.mockReturnValue(officer);
    useAbsencePendingCountMock.mockReturnValue({ count: 3, refetch: vi.fn() });
    render(<TopBar />);
    expect(screen.getByLabelText('3 pending')).toBeInTheDocument();
  });

  it('hides the badge for a member', () => {
    useSessionMock.mockReturnValue(member);
    useAbsencePendingCountMock.mockReturnValue({ count: 3, refetch: vi.fn() });
    render(<TopBar />);
    expect(screen.queryByLabelText('3 pending')).not.toBeInTheDocument();
  });

  it('hides the badge for an officer when the count is zero', () => {
    useSessionMock.mockReturnValue(officer);
    useAbsencePendingCountMock.mockReturnValue({ count: 0, refetch: vi.fn() });
    render(<TopBar />);
    expect(screen.queryByLabelText('0 pending')).not.toBeInTheDocument();
  });

  it('renders AccountControls exactly once', () => {
    render(<TopBar />);
    expect(
      screen.getAllByRole('button', { name: 'Appearance settings' }),
    ).toHaveLength(1);
  });
});
