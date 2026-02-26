export type ActionToastKind = 'success' | 'error' | 'info';

export type ActionToastPayload = {
  message: string;
  kind?: ActionToastKind;
  durationMs?: number;
};

const ACTION_TOAST_EVENT = 'memorial:action-toast';

export function emitActionToast(payload: ActionToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ActionToastPayload>(ACTION_TOAST_EVENT, { detail: payload }));
}

export function subscribeActionToast(listener: (payload: ActionToastPayload) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ActionToastPayload>;
    if (!customEvent.detail?.message) return;
    listener(customEvent.detail);
  };

  window.addEventListener(ACTION_TOAST_EVENT, handler);
  return () => {
    window.removeEventListener(ACTION_TOAST_EVENT, handler);
  };
}
