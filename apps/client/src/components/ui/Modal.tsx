import type { ReactNode } from 'react';

interface ModalProps {
  title?: string;
  children: ReactNode;
  onClose?: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 min-w-64 max-w-md shadow-xl">
        {title && (
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
                ×
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
