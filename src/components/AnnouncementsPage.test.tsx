import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

const { useAnnouncementsMock } = vi.hoisted(() => ({
  useAnnouncementsMock: vi.fn(),
}));
vi.mock('../data/useAnnouncements', () => ({
  useAnnouncements: () => useAnnouncementsMock(),
}));

// Mutations are not exercised here (handlers only reference them); mock the
// module so the graph stays pure.
vi.mock('../data/mutations', () => ({
  MUTATION_MESSAGES: { 'not-configured': '', denied: '', network: '' },
  addAnnouncement: vi.fn(),
  removeAnnouncement: vi.fn(),
}));

import { AnnouncementsPage } from './AnnouncementsPage';
import type { Announcement } from '../lib/types';

const announcements: Announcement[] = [
  {
    id: 'a1',
    title: 'Older notice',
    body: 'First body',
    createdBy: 'o1',
    createdAt: '2025-06-01T08:00:00+00:00',
    authorName: 'Officer One',
  },
  {
    id: 'a2',
    title: 'Newer notice',
    body: 'Second body',
    createdBy: 'o1',
    createdAt: '2025-06-05T08:00:00+00:00',
    authorName: 'Officer One',
  },
];

function sessionFor(role: 'officer' | 'member' | null) {
  return {
    session: role ? { user: { id: 'u', email: 'u@x.com' } } : null,
    profile: role ? { id: 'u', name: 'U', email: 'u@x.com', role } : null,
    role,
    isOfficer: role === 'officer',
    refreshProfile: vi.fn(),
  };
}

describe('AnnouncementsPage', () => {
  beforeEach(() => {
    useSessionMock.mockReset();
    useAnnouncementsMock.mockReset();
    useAnnouncementsMock.mockReturnValue({
      data: announcements,
      status: 'ready',
      retry: vi.fn(),
    });
  });

  it('shows the compose form and per-item delete buttons to an officer', () => {
    useSessionMock.mockReturnValue(sessionFor('officer'));
    render(<AnnouncementsPage />);

    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete announcement Older notice' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete announcement Newer notice' }),
    ).toBeInTheDocument();
  });

  it('shows a read-only list to a member (no compose, no delete)', () => {
    useSessionMock.mockReturnValue(sessionFor('member'));
    render(<AnnouncementsPage />);

    expect(screen.getByText('Older notice')).toBeInTheDocument();
    expect(screen.getByText('Newer notice')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Post' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete announcement/ }),
    ).not.toBeInTheDocument();
  });

  it('shows a read-only list to an anonymous visitor (no compose, no delete)', () => {
    useSessionMock.mockReturnValue(sessionFor(null));
    render(<AnnouncementsPage />);

    expect(screen.getByText('Older notice')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Post' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete announcement/ }),
    ).not.toBeInTheDocument();
  });

  it('renders the list newest-first regardless of input order', () => {
    useSessionMock.mockReturnValue(sessionFor('member'));
    render(<AnnouncementsPage />);

    const titles = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Newer notice', 'Older notice']);
  });
});
