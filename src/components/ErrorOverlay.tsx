import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorPopup {
  id: string;
  title: string;
  message: string;
  details?: string;
  showDetails?: boolean;
}

interface ErrorOverlayProps {
  popupErrors: ErrorPopup[];
  togglePopupDetails: (id: string) => void;
  removePopupError: (id: string) => void;
}

export function ErrorOverlay({ popupErrors, togglePopupDetails, removePopupError }: ErrorOverlayProps) {
  if (popupErrors.length === 0) return null;
  const currentError = popupErrors[popupErrors.length - 1];

  return (
    <div id="error-popup-overlay" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-rose-500/30 rounded-3xl max-w-xl w-full p-6 shadow-2xl shadow-rose-950/20 space-y-4">
        <div className="flex items-start gap-4">
          <div className="bg-rose-500/10 p-3 rounded-2xl border border-rose-500/25 shrink-0">
            <AlertTriangle className="h-6 w-6 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400/80">Background Error logged</span>
            <h3 className="text-base font-bold text-slate-100 tracking-tight mt-0.5">
              {currentError.title}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mt-2 whitespace-pre-wrap">
              {currentError.message}
            </p>

            {currentError.details && (
              <div className="mt-4">
                <button
                  onClick={() => togglePopupDetails(currentError.id)}
                  className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  {currentError.showDetails ? "Hide technical stack" : "View technical stack"}
                </button>
                {currentError.showDetails && (
                  <pre className="mt-2 bg-slate-950 p-3 rounded-xl text-[10px] font-mono text-slate-400 border border-slate-800 overflow-x-auto max-h-40 custom-scrollbar whitespace-pre-wrap">
                    {currentError.details}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          {popupErrors.length > 1 && (
            <span className="text-[10px] font-mono text-slate-500 mr-auto">
              {popupErrors.length} remaining issues pending
            </span>
          )}
          <button
            onClick={() => removePopupError(currentError.id)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-5 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            Dismiss Error
          </button>
        </div>
      </div>
    </div>
  );
}
