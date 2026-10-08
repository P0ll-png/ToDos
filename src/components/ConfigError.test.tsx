import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  missingConfig: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
}));

import { ConfigError } from './ConfigError';

describe('ConfigError', () => {
  it('names the missing env vars and references SETUP.md', () => {
    render(<ConfigError />);
    expect(screen.getByText('Configure Supabase')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument();
    expect(screen.getByText('SETUP.md')).toBeInTheDocument();
  });
});
