import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RefreshCw, Upload } from "lucide-react";

// Set worker source to unpkg matching the version installed
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  pdfBase64: string | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  onTotalPages: (total: number) => void;
  onReset: () => void;
}

export default function PDFViewer({
  pdfBase64,
  currentPage,
  onPageChange,
  onTotalPages,
  onReset,
}: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(0.95);
  const [totalPages, setTotalPages] = useState<number>(0);
  const renderTaskRef = useRef<any>(null);

  // Load PDF document
  useEffect(() => {
    if (!pdfBase64) {
      setPdfDoc(null);
      setTotalPages(0);
      return;
    }

    const loadPDF = async () => {
      setLoading(true);
      setError(null);
      try {
        // Convert base64 to binary array
        const binaryString = atob(pdfBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjs.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        onTotalPages(doc.numPages);
        onPageChange(1); // Reset to first page
      } catch (err: any) {
        console.error("Error loading PDF:", err);
        setError("Failed to load and render PDF. Please verify it is a valid, uncorrupted file.");
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [pdfBase64]);

  // Render PDF page to canvas
  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current || currentPage < 1 || currentPage > totalPages) return;

    try {
      // Cancel previous render if any is running to prevent flickering
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      // Get optimal viewport size based on container width
      const containerWidth = containerRef.current?.clientWidth || 600;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const computedScale = (containerWidth / unscaledViewport.width) * scale;
      
      const viewport = page.getViewport({ scale: computedScale });

      // Handle high DPI screens for crisp text
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(dpr, dpr);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;
    } catch (err: any) {
      if (err.name !== "RenderingCancelledException") {
        console.error("Error rendering page:", err);
      }
    }
  };

  // Render whenever document, page, scale, or window size changes
  useEffect(() => {
    renderPage();
  }, [pdfDoc, currentPage, scale]);

  // Set up resize observer to keep canvas responsive
  useEffect(() => {
    if (!containerRef.current) return;

    let timeoutId: NodeJS.Timeout;
    const observer = new ResizeObserver(() => {
      // Debounce resize updates for performance
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        renderPage();
      }, 100);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [pdfDoc, currentPage, scale]);

  const handlePrevPage = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.1, 2.5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.1, 0.7));
  };

  const handleResetZoom = () => {
    setScale(0.95);
  };

  // Set up keyboard navigation with Arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in form inputs/textareas to prevent conflict
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, totalPages, loading]);

  if (!pdfBase64) {
    return (
      <div id="pdf-placeholder" className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/10 p-12 text-center">
        <Maximize2 className="h-12 w-12 text-slate-600 mb-4 animate-pulse" />
        <p className="text-sm text-slate-400 max-w-sm font-sans leading-relaxed">
          Upload a PDF slide deck to begin. Once loaded, the slides will render here with interactive AI notes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative group">
      {/* Absolute Side Arrow Overlays */}
      {currentPage > 1 && (
        <button
          onClick={handlePrevPage}
          disabled={loading}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/40 hover:bg-slate-900/85 text-slate-400 hover:text-white border border-slate-800/40 hover:border-slate-700 backdrop-blur-sm transition-all shadow-2xl hover:scale-110 cursor-pointer disabled:opacity-20 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Previous Slide"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {currentPage < totalPages && (
        <button
          onClick={handleNextPage}
          disabled={loading}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-slate-900/40 hover:bg-slate-900/85 text-slate-400 hover:text-white border border-slate-800/40 hover:border-slate-700 backdrop-blur-sm transition-all shadow-2xl hover:scale-110 cursor-pointer disabled:opacity-20 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="Next Slide"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Integrated Floating Controls on top of the PDF */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-full z-10 shadow-2xl transition-all hover:bg-slate-900/95">
        <button
          onClick={onReset}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Upload New Slide Deck"
        >
          <Upload className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5" />

        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1 || loading}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-300 disabled:opacity-20 transition-colors cursor-pointer"
          title="Previous Slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[11px] font-semibold text-slate-300 select-none px-1.5 font-sans min-w-[50px] text-center">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages || loading}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-300 disabled:opacity-20 transition-colors cursor-pointer"
          title="Next Slide"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        <button
          onClick={handleZoomOut}
          disabled={loading}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleResetZoom}
          disabled={loading}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
          title="Reset Zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          disabled={loading}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        id="pdf-canvas-container"
        className="flex-1 overflow-auto p-4 relative select-none bg-slate-950/40 custom-scrollbar flex"
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20">
            <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin mb-2" />
            <span className="text-xs text-slate-400">Loading document...</span>
          </div>
        ) : error ? (
          <div className="text-center p-8 max-w-md self-center m-auto">
            <p className="text-sm font-semibold text-red-400 mb-2">Error Loading PDF</p>
            <p className="text-xs text-slate-400">{error}</p>
          </div>
        ) : (
          <div className="min-w-full min-h-full flex items-center justify-center p-1 m-auto">
            <div className="relative inline-block shadow-2xl border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
