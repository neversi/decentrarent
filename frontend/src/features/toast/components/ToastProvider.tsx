import { useToastStore, type ToastVariant } from '../store';

const variantStyles: Record<ToastVariant, { borderColor: string; icon: string; iconColor: string }> = {
  success: { borderColor: '#3DD68C', icon: '\u2713', iconColor: '#3DD68C' },
  error: { borderColor: '#FF4D6A', icon: '\u2715', iconColor: '#FF4D6A' },
  info: { borderColor: '#E07840', icon: '\u25CF', iconColor: '#E07840' },
  onchain: { borderColor: '#9945FF', icon: '\u25C6', iconColor: '#9945FF' },
};

export function ToastProvider() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => {
        const variant = variantStyles[toast.variant];
        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            style={{
              padding: '14px 16px',
              background: '#141416',
              borderRadius: 10,
              borderLeft: `3px solid ${variant.borderColor}`,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              animation: 'toastSlideIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: variant.iconColor, fontSize: 16 }}>{variant.icon}</span>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{toast.title}</div>
                {toast.message && (
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{toast.message}</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
