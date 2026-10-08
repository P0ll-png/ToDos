import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { order, select, from } = vi.hoisted(() => {
  const order = vi.fn();
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { order, select, from };
});

vi.mock('../lib/supabase', () => ({
  supabase: { from },
}));

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock('../context/SessionProvider', () => ({
  useSession: () => useSessionMock(),
}));

import { AdminPanel } from './AdminPanel';

const SELF_ID = 'self-id';
const OTHER_ID = 'other-id';

describe('AdminPanel', () => {
  beforeEach(() => {
    from.mockClear();
    select.mockClear();
    order.mockReset();
    order.mockResolvedValue({
      data: [
        { id: SELF_ID, name: 'Alice', role: 'officer' },
        { id: OTHER_ID, name: 'Bob', role: 'officer' },
      ],
      error: null,
    });
    useSessionMock.mockReturnValue({
      profile: { id: SELF_ID, name: 'Alice', email: 'a@b.com', role: 'officer' },
      role: 'officer',
      isOfficer: true,
      session: {},
      refreshProfile: vi.fn(),
    });
  });

  it('disables the demote control on the current user own row only', async () => {
    render(<AdminPanel onClose={() => {}} />);

    // Wait for the member list to load.
    await screen.findByText('Alice');
    const demoteButtons = screen.getAllByRole('button', { name: 'Demote' });
    expect(demoteButtons).toHaveLength(2);

    // Self row (Alice) demote is disabled with a self-demote tooltip.
    const [aliceBtn, bobBtn] = demoteButtons;
    expect(aliceBtn).toBeDisabled();
    expect(aliceBtn).toHaveAttribute('title', "You can't demote yourself");
    // Another officer (Bob) can be demoted.
    expect(bobBtn).toBeEnabled();
  });

  it('exposes only name and role, never email', async () => {
    render(<AdminPanel onClose={() => {}} />);
    await screen.findByText('Alice');
    expect(screen.queryByText('a@b.com')).not.toBeInTheDocument();
    // The select is scoped to id/name/role.
    expect(select).toHaveBeenCalledWith('id, name, role');
  });
});
