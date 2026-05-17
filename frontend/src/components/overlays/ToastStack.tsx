import { useHistoryStore } from '@/state/historyStore';

/**
 * Fixed bottom-right stack of toasts. Each toast auto-dismisses after the
 * `durationMs` set in `historyStore.toast()` (default 4s). Clicking a toast
 * dismisses it immediately.
 */
export function ToastStack() {
  const toasts = useHistoryStore((s) => s.toasts);
  const dismiss = useHistoryStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-3.5 right-3.5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className="min-w-[260px] max-w-[360px] cursor-pointer rounded-md border border-line border-l-4 border-l-accent bg-surface-2 px-3.5 py-2.5 text-xs text-text-1 shadow-xl"
          style={{ animation: 'var(--animate-cc-toast-in)' }}
        >
          <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
            {t.who} <span className="font-normal text-text-3">· just now</span>
          </div>
          <div className="text-[11.5px] text-text-2">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
