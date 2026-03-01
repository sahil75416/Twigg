import { useEffect, useState } from 'react';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

let toastListener: ((toast: Toast) => void) | null = null;

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    toastListener?.({ id: `${Date.now()}`, message, type });
}

export default function ToastContainer() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        toastListener = (toast) => {
            setToasts((prev) => [...prev, toast]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
            }, 3000);
        };
        return () => {
            toastListener = null;
        };
    }, []);

    if (!toasts.length) return null;

    const iconByType: Record<Toast['type'], string> = {
        success: 'OK',
        error: 'ERR',
        info: 'INFO',
    };

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">{iconByType[toast.type]}</span>
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
