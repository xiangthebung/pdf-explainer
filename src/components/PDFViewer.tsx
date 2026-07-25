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
  const [scale, setScale] = useState<number>(1.0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [inputPage, setInputPage] = useState<string>(currentPage.toString());
  const renderTaskRef = useRef<any>(null);
  const pageCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  // Sync inputPage when currentPage changes from outside
  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);
  
  // Clear cache when scale changes
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [scale]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputPage(e.target.value);
  };

  const commitPageChange = () => {
    const parsed = parseInt(inputPage, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      onPageChange(parsed);
    } else {
      setInputPage(currentPage.toString());
    }
  };

  const handlePageInputBlur = () => {
    commitPageChange();
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitPageChange();
      e.currentTarget.blur();
    }
  };

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

    const isRenderingRef = useRef(false);
  const pendingRenderRef = useRef(false);

  // Render PDF page to canvas
  const renderPage = async (pageNumber: number = currentPage, targetCanvas?: HTMLCanvasElement) => {
    if (!pdfDoc || currentPage < 1 || currentPage > totalPages) return;
    
    // If using the main canvas, check cache
    if (!targetCanvas && pageCacheRef.current.has(pageNumber)) {
       const cachedCanvas = pageCacheRef.current.get(pageNumber)!;
       const canvas = canvasRef.current;
       if (canvas) {
           canvas.width = cachedCanvas.width;
           canvas.height = cachedCanvas.height;
           canvas.style.width = `${cachedCanvas.width / (window.devicePixelRatio || 1)}px`;
           canvas.style.height = `${cachedCanvas.height / (window.devicePixelRatio || 1)}px`;
           const context = canvas.getContext("2d");
           if (context) {
               context.drawImage(cachedCanvas, 0, 0);
               return;
           }
       }
    }

    if (!targetCanvas && !canvasRef.current) return;
    
    // Only manage rendering state if rendering to main canvas
    if (!targetCanvas) {
      if (isRenderingRef.current) {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch(e){}
        }
        pendingRenderRef.current = true;
        return;
      }
      isRenderingRef.current = true;
    }

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const containerWidth = containerRef.current?.clientWidth || 800;
      const containerHeight = containerRef.current?.clientHeight || 600;

      // Fit to screen calculation
      const margin = 32;
      const targetWidth = Math.max(containerWidth - margin, 100);
      const targetHeight = Math.max(containerHeight - margin, 100);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scaleX = targetWidth / unscaledViewport.width;
      const scaleY = targetHeight / unscaledViewport.height;
      const fitScale = Math.min(scaleX, scaleY);
      const computedScale = fitScale * scale;
      const viewport = page.getViewport({ scale: computedScale });

      const dpr = window.devicePixelRatio || 1;
      
      // Render to offscreen canvas
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = viewport.width * dpr;
      offscreenCanvas.height = viewport.height * dpr;
      const offscreenContext = offscreenCanvas.getContext('2d');
      if (!offscreenContext) {
        if (!targetCanvas) isRenderingRef.current = false;
        return;
      }
      offscreenContext.scale(dpr, dpr);

      const renderContext = {
        canvasContext: offscreenContext,
        viewport: viewport,
      } as any;

      const renderTask = page.render(renderContext);
      if (!targetCanvas) renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (!targetCanvas) renderTaskRef.current = null;

      // Store in cache
      pageCacheRef.current.set(pageNumber, offscreenCanvas);

      // If rendering to main canvas, update it
      if (!targetCanvas) {
        const canvas = canvasRef.current;
        if (!canvas) {
          isRenderingRef.current = false;
          return;
        }
        const context = canvas.getContext("2d");
        if (!context) {
          isRenderingRef.current = false;
          return;
        }

        canvas.width = offscreenCanvas.width;
        canvas.height = offscreenCanvas.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        
        context.drawImage(offscreenCanvas, 0, 0);
      }

    } catch (err: any) {
      if (err.name !== "RenderingCancelledException") {
        console.error("Error rendering page:", err);
      }
    } finally {
      if (!targetCanvas) {
        isRenderingRef.current = false;
        if (pendingRenderRef.current) {
          pendingRenderRef.current = false;
          renderPage();
        }
      }
    }
  };

  // Render whenever document, page, scale, or window size changes
  useEffect(() => {
    renderPage();

    // Pre-render neighbors
    if (pdfDoc) {
        [currentPage - 1, currentPage + 1].forEach(pageNumber => {
            if (pageNumber >= 1 && pageNumber <= totalPages && !pageCacheRef.current.has(pageNumber)) {
                renderPage(pageNumber, document.createElement('canvas'));
            }
        });
    }
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
    setScale(1.0);
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
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={inputPage}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="w-10 text-center bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[11px] font-semibold text-white focus:outline-none focus:border-indigo-500 font-sans"
            title="Type slide number and press Enter to skip"
          />
          <span className="text-[11px] text-slate-400 select-none font-sans font-medium pr-1.5">
            / {totalPages}
          </span>
        </div>
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
            <div className="relative inline-block shadow-2xl border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
              <canvas ref={canvasRef} className="block bg-slate-950" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
