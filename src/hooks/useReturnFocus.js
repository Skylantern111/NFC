import { useCallback, useRef } from 'react';

// Last element focused outside any dialog or menu. Radix restores focus on
// close only when the dialog has its own Trigger; ours open from state, and
// often from a ⋯ menu item that is gone by then — so focus fell to <body>
// (UI_UX_IMPROVEMENT_ROUND2.md B11 keyboard pass).
let lastOutsideFocus = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLElement && !el.closest('[role=dialog],[role=alertdialog],[role=menu],[role=listbox]')) {
        lastOutsideFocus = el;
      }
    },
    true
  );
}

// For a Radix Dialog/Sheet Content: remembers the opener when it opens and
// returns focus there on close, unless the caller's own onCloseAutoFocus
// already handled it (event.defaultPrevented).
export function useReturnFocus(onOpenAutoFocus, onCloseAutoFocus) {
  const opener = useRef(null);
  const handleOpen = useCallback(
    (e) => {
      opener.current = lastOutsideFocus;
      onOpenAutoFocus?.(e);
    },
    [onOpenAutoFocus]
  );
  const handleClose = useCallback(
    (e) => {
      onCloseAutoFocus?.(e);
      if (e.defaultPrevented) return;
      const el = opener.current;
      if (el?.isConnected && el.offsetParent !== null) {
        e.preventDefault();
        el.focus();
      }
    },
    [onCloseAutoFocus]
  );
  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose };
}
