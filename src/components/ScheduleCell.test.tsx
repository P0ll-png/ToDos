import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleCell } from './ScheduleCell';
import type { Subject } from '../lib/types';

const subject: Subject = {
  id: 'math',
  name: 'Mathematics',
  room: 'Room 204',
  color: null,
};

describe('ScheduleCell', () => {
  it('renders a real <button> that is focusable', () => {
    render(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected={false}
        onSelect={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /Mathematics/ });
    expect(btn.tagName).toBe('BUTTON');
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('shows the ringed pending dot only when the subject has pending tasks', () => {
    const { rerender } = render(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByTestId('pending-dot')).not.toBeInTheDocument();

    rerender(
      <ScheduleCell
        subject={subject}
        pending
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('pending-dot')).toBeInTheDocument();
  });

  it('calls onSelect with the subject id when clicked', () => {
    const onSelect = vi.fn();
    render(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected={false}
        onSelect={onSelect}
      />,
    );
    screen.getByRole('button', { name: /Mathematics/ }).click();
    expect(onSelect).toHaveBeenCalledWith('math');
  });

  it('reflects selection via aria-pressed', () => {
    const { rerender } = render(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Mathematics/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    rerender(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Mathematics/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('carries the non-color pending cue: an aria-hidden dot plus sr-only text', () => {
    render(
      <ScheduleCell
        subject={subject}
        pending
        selected={false}
        onSelect={() => {}}
      />,
    );
    // The dot is decorative — it must not be announced on its own.
    expect(screen.getByTestId('pending-dot')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // A text alternative conveys "pending" without relying on color.
    expect(screen.getByText(/has pending tasks/i)).toBeInTheDocument();
  });

  it('shows the upcoming-assessment marker only when assessment is set', () => {
    const { rerender } = render(
      <ScheduleCell
        subject={subject}
        pending={false}
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByTestId('assessment-badge')).not.toBeInTheDocument();

    rerender(
      <ScheduleCell
        subject={subject}
        pending={false}
        assessment
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('assessment-badge')).toBeInTheDocument();
  });

  it('the assessment marker is distinct from the pending dot: decorative shape + its own sr-only label', () => {
    render(
      <ScheduleCell
        subject={subject}
        pending={false}
        assessment
        selected={false}
        onSelect={() => {}}
      />,
    );
    // The marker is decorative (its own shape/icon), not announced on its own...
    expect(screen.getByTestId('assessment-badge')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    // ...and it reads differently from the pending glow.
    expect(screen.getByText(/assessment within 7 days/i)).toBeInTheDocument();
    // With assessment but no pending, the pending dot/text must NOT appear.
    expect(screen.queryByTestId('pending-dot')).not.toBeInTheDocument();
    expect(screen.queryByText(/has pending tasks/i)).not.toBeInTheDocument();
  });
});
