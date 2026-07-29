import React, { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';

export default function Toast({ message, type = 'error', onClose, duration = 5000 }) {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />,
    success: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
  };

  const borderColors = {
    error: 'border-red-500/30 bg-red-950/40 text-red-200 shadow-red-950/10',
    success: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200 shadow-emerald-950/10',
    info: 'border-blue-500/30 bg-blue-950/40 text-blue-200 shadow-blue-950/10',
  };

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-slide-in ${borderColors[type]}`}>
      {icons[type]}
      <p className="text-sm font-medium mr-2 max-w-xs">{message}</p>
      <button
        onClick={onClose}
        className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
