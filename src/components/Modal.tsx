/**
 * Modal — the shared accessible overlay used by every dialog (Auth, Admin,
 * Appearance, Add task). It owns the a11y contract so each dialog body only has
 * to supply role="dialog" aria-modal aria-labelledby on its own card:
 *
 *  - renders the scrim with the --scrim token (no hardcoded color);
 *  - closes on Escape;
 *  - closes on a backdrop (scrim) click, but not on clicks inside the dialog;
 *  - traps Tab/Shift+Tab focus within the dialog while open;
 *  - moves focus into the dialog on open and restores it to the previously
 *    focused element on close.
 *
 * The focus trap queries the scrim's focusable descendants on each Tab, so it
 * stays correct as dialog content changes (e.g. an error message appears). The
 * scrim is also the keydown root (events bubble up from the dialog body).
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ children, onClose }: ModalProps) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const focusablesIn = useCallback((root: HTMLElement): HTMLElement[] => {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  }, []);

  // Move focus into the dialog on open; restore it to the opener on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const scrim = scrimRef.current;
    if (scrim) {
      const focusables = focusablesIn(scrim);
      (focusables[0] ?? scrim).focus();
    }
    return () => {
      const prev = previouslyFocused.current;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [focusablesIn]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const scrim = scrimRef.current;
    if (!scrim) return;
    const focusables = focusablesIn(scrim);
    if (focusables.length === 0) {
      e.preventDefault();
      scrim.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === scrim) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={scrimRef}
      className="modal-scrim"
      // -1 so the scrim can hold focus only as a fallback (when a dialog has no
      // focusable children yet); it is never in the Tab order itself.
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        // Close only on a genuine backdrop click, not a drag ending outside.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
