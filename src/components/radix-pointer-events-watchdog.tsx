'use client';

import * as React from 'react';

/**
 * Defensive global cleanup for Radix Dialog/AlertDialog/Popover modals.
 *
 * When two Radix overlays close in quick succession, Radix occasionally leaks
 * `body.style.pointer-events = 'none'` — the page becomes unclickable until a
 * full refresh. We can't reproduce it reliably so we run a MutationObserver
 * that fires whenever `body[style]` changes: if pointer-events is locked off
 * but no Radix dialog is actually open right now, clear it.
 *
 * The DialogContent / AlertDialogContent wrappers also block the Popover
 * "pointer-down outside" path that causes the lock in the first place — this
 * is the belt that goes with those suspenders.
 */
export function RadixPointerEventsWatchdog() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const body = document.body;

    const cleanIfStale = () => {
      if (body.style.pointerEvents !== 'none') return;
      const anyOpen = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (!anyOpen) body.style.pointerEvents = '';
    };

    const observer = new MutationObserver(() => cleanIfStale());
    observer.observe(body, { attributes: true, attributeFilter: ['style'] });
    // Cover the case where the dialog node is removed without a style mutation
    // on body (eg. unmount during a portal close race).
    observer.observe(body, { childList: true, subtree: true });

    // One-shot run at mount in case the page loaded with a stale lock from a
    // prior navigation.
    cleanIfStale();

    return () => observer.disconnect();
  }, []);

  return null;
}
