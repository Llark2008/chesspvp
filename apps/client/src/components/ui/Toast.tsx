import { useToastStore } from '../../store/toastStore';

const typeStyles: Record<string, string> = {
  info: 'bg-gray-700 text-white',
  success: 'bg-green-700 text-white',
  error: 'bg-red-700 text-white',
  warning: 'bg-yellow-600 text-white',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-5 py-3 rounded shadow-lg text-sm font-medium pointer-events-auto cursor-pointer transition-all ${typeStyles[t.type] ?? typeStyles.info}`}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
