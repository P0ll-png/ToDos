import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { signInWithPassword, signUp, signInWithOAuth } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword, signUp, signInWithOAuth },
  },
}));

import { AuthDialog } from './AuthDialog';

describe('AuthDialog', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signUp.mockReset();
    signInWithOAuth.mockReset();
  });

  it('renders real <button> elements for submit and Google', () => {
    render(<AuthDialog onClose={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Sign in' });
    const google = screen.getByRole('button', { name: /Google/ });
    expect(submit.tagName).toBe('BUTTON');
    expect(google.tagName).toBe('BUTTON');
  });

  it('shows an inline error when sign-in fails', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });
    render(<AuthDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secretpw' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid login credentials');
  });

  it('invokes Google OAuth when the Google button is clicked', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    render(<AuthDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Google/ }));
    await waitFor(() =>
      expect(signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      ),
    );
  });
});
