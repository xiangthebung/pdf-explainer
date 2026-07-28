import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PdfLoadError, closeDocument, openDocument, type PDFDocumentProxy } from '../lib/pdf';

type Status = 'loading' | 'ready' | 'error';

interface PdfValue {
  doc: PDFDocumentProxy | null;
  status: Status;
  error: string | null;
  reload: () => void;
}

const PdfContext = createContext<PdfValue | null>(null);

/**
 * Owns the pdf.js document for the current deck.
 *
 * Loading is abortable and the document is always destroyed on unmount or when
 * the deck changes — pdf.js keeps a worker and a detached ArrayBuffer alive per
 * document, so leaking one leaks tens of megabytes.
 */
export function PdfProvider({ base64, children }: { base64: string | null; children: ReactNode }): React.JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!base64) {
      setDoc(null);
      setStatus('loading');
      return;
    }

    const controller = new AbortController();
    let opened: PDFDocumentProxy | null = null;
    setStatus('loading');
    setError(null);
    setDoc(null);

    openDocument(base64, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) {
          void closeDocument(next);
          return;
        }
        opened = next;
        setDoc(next);
        setStatus('ready');
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(
          failure instanceof PdfLoadError ? failure.message : 'Could not open that PDF. It may be corrupted.',
        );
      });

    return () => {
      controller.abort();
      void closeDocument(opened);
    };
  }, [base64, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo<PdfValue>(() => ({ doc, status, error, reload }), [doc, status, error, reload]);

  return <PdfContext.Provider value={value}>{children}</PdfContext.Provider>;
}

export function usePdf(): PdfValue {
  const value = useContext(PdfContext);
  if (!value) throw new Error('usePdf must be used inside PdfProvider');
  return value;
}
