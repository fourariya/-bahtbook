"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
}

/** How long the page ignores pointer input after a dialog closes itself. */
const TAP_THROUGH_GUARD_MS = 350;

/**
 * When a dialog closes right after a tap (a save, a confirm), a second tap of
 * a double tap would otherwise land on whatever sat underneath the button: on a
 * phone that is the bottom tab bar, which navigates away. A transparent layer
 * absorbs pointer input for a moment so the page cannot be activated by a tap
 * that was aimed at the dialog. Keyboard input is unaffected.
 */
function guardAgainstTapThrough() {
  const guard = document.createElement("div");
  guard.setAttribute("aria-hidden", "true");
  guard.className = "fixed inset-0 z-(--z-modal)";
  document.body.append(guard);
  window.setTimeout(() => guard.remove(), TAP_THROUGH_GUARD_MS);
}

/**
 * A native <dialog> opened with showModal(): the browser provides the focus
 * trap, Escape to close, an inert page behind it and focus return on close.
 */
export function Modal({ open, onClose, labelledBy, describedBy, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      guardAgainstTapThrough();
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog sheet"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
