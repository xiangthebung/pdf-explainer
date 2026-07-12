import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Upload,
  BookOpen,
  Play,
  MessageSquare,
  FileText,
  AlertTriangle,
  Lightbulb,
  Send,
  Bot,
  User,
  Minimize2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import PDFViewer from "./components/PDFViewer";
import { ExplanationResponse, QuizQuestion } from "./types";
import { DEMO_PDF_BASE64, DEMO_EXPLANATION } from "./components/DemoData";

const getChildrenText = (children: React.ReactNode): string => {
  if (!children) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map(getChildrenText).join("");
  }
  if (typeof children === "object" && children !== null && "props" in children) {
    return getChildrenText((children as any).props.children);
  }
  return "";
};

export default function App() {
  // Main states
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>("");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [slideExplanations, setSlideExplanations] = useState<{ [slideNumber: number]: string }>({});
  const [processedSlides, setProcessedSlides] = useState<{ [slideNumber: number]: boolean }>({});

  // AI Configuration Settings
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("slidesage_custom_api_key") || "";
  });
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const [customModelId, setCustomModelId] = useState<string>(() => {
    return localStorage.getItem("slidesage_custom_model_id") || "gemini-3.5-flash";
  });
  const [selectedTrack, setSelectedTrack] = useState<string>("auto");
  const [showTuner, setShowTuner] = useState<boolean>(false);

  // Sane progress and minimalist chat collapse states
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [showChat, setShowChat] = useState<boolean>(false);

  // Subchat / Slide Chat state
  const [subchatMessages, setSubchatMessages] = useState<{ [pageNumber: number]: { role: "user" | "model"; text: string }[] }>({});
  const [currentSubchatInput, setCurrentSubchatInput] = useState<string>("");
  const [isSubchatSending, setIsSubchatSending] = useState<boolean>(false);
  const [subchatError, setSubchatError] = useState<string | null>(null);
  const [subchatModel, setSubchatModel] = useState<string>("gemini-2.5-flash");
  const [showQuiz, setShowQuiz] = useState<{ [slideNumber: number]: boolean }>({});

  // Floating panel drag/resize state
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 460, height: 580 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [posStart, setPosStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sizeStart, setSizeStart] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [panelMinimized, setPanelMinimized] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"notes" | "chat">("notes");
  const [hasDragged, setHasDragged] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Position initialized nicely on screen
  useEffect(() => {
    if ((explanation || isAnalyzing) && panelPos.x === -1) {
      const defaultWidth = Math.min(window.innerWidth - 48, 460);
      const defaultHeight = Math.min(window.innerHeight - 120, 580);
      const defaultX = window.innerWidth - defaultWidth - 24;
      const defaultY = 72; // Below standard top layout
      setPanelSize({ width: defaultWidth, height: defaultHeight });
      setPanelPos({ x: defaultX, y: defaultY });
    }
  }, [explanation, isAnalyzing, panelPos.x]);

  // Keep within viewport boundaries when size changes or screen resizes
  useEffect(() => {
    const handleResize = () => {
      setPanelPos((prev) => {
        if (prev.x === -1) return prev;
        const x = Math.max(12, Math.min(prev.x, window.innerWidth - panelSize.width - 12));
        const y = Math.max(12, Math.min(prev.y, window.innerHeight - panelSize.height - 12));
        return { x, y };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [panelSize]);

  // Handle document drag state
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          setHasDragged(true);
        }

        const newX = Math.max(0, Math.min(posStart.x + dx, window.innerWidth - (panelMinimized ? 150 : panelSize.width)));
        const newY = Math.max(0, Math.min(posStart.y + dy, window.innerHeight - (panelMinimized ? 40 : 50)));
        
        setPanelPos({ x: newX, y: newY });
      } else if (isResizing) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        const newWidth = Math.max(320, Math.min(sizeStart.width + dx, window.innerWidth - panelPos.x - 12));
        const newHeight = Math.max(220, Math.min(sizeStart.height + dy, window.innerHeight - panelPos.y - 12));
        
        setPanelSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, posStart, sizeStart, panelPos, panelSize, panelMinimized]);

  // Auto scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [subchatMessages, activeTab]);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setHasDragged(false);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPosStart({ x: panelPos.x, y: panelPos.y });
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setSizeStart({ width: panelSize.width, height: panelSize.height });
    e.preventDefault();
    e.stopPropagation();
  };

  // Sync API Key to LocalStorage
  useEffect(() => {
    localStorage.setItem("slidesage_custom_api_key", customApiKey);
  }, [customApiKey]);

  // Sync Custom Model ID to LocalStorage
  useEffect(() => {
    localStorage.setItem("slidesage_custom_model_id", customModelId);
  }, [customModelId]);

  // Interaction states
  const [currentPdfPage, setCurrentPdfPage] = useState<number>(1);
  const [totalPdfPages, setTotalPdfPages] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Loading messages to cycle through during analysis (completely clean and professional)
  const loadingMessages = [
    "Analyzing document layout and hierarchy...",
    "Extracting core concepts and structural data...",
    "Synthesizing high-level lecture notes...",
    "Developing educational analogies and metaphors...",
    "Formulating contextual real-world examples...",
    "Mapping note sections to corresponding slides..."
  ];

  // Cycle loading messages during analysis
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 3000);
    } else {
      setLoadingMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Sane progress estimation timer
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isAnalyzing) {
      setAnalysisProgress(0);
      const startTime = Date.now();
      const duration = 15000; // 15 seconds estimate
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const percent = Math.min((elapsed / duration) * 100, 95); // cap at 95% until complete
        setAnalysisProgress(Math.round(percent));
      }, 150);
    } else {
      setAnalysisProgress(100);
    }
    return () => clearInterval(intervalId);
  }, [isAnalyzing]);

  // Read file and convert to base64 helper
  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF file. Other formats are not supported.");
      return;
    }
    setError(null);
    setPdfName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Extract raw base64 string without prefix
      const base64Data = result.split(",")[1];
      setPdfBase64(base64Data);
      setExplanation(null); // Reset previous explanation
      setSlideExplanations({}); // Reset previous explanations
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Submit base64 PDF and prompts to server-side Gemini endpoint for a specific slide range
  const handleGenerateNotesForRange = async (start: number, _end?: number) => {
    if (!pdfBase64) return;

    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/explain-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfData: pdfBase64,
          customInstructions,
          customApiKey: customApiKey || undefined,
          selectedModel: selectedModel === "custom" ? customModelId : selectedModel,
          selectedTrack,
          startSlide: start,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "An error occurred while generating explanations.");
      }

      setExplanation(data);
      
      // Merge new explanations into our dictionary
      const updated = { ...slideExplanations };
      if (data.explanations && Array.isArray(data.explanations)) {
        data.explanations.forEach((item: any) => {
          updated[item.slideNumber] = item.explanation;
        });
      }
      setSlideExplanations(updated);

      // Track all slide numbers from data.startSlide to data.endSlide as processed
      const updatedProcessed = { ...processedSlides };
      const actualStart = data.startSlide || start;
      const actualEnd = data.endSlide || end;
      for (let i = actualStart; i <= actualEnd; i++) {
        updatedProcessed[i] = true;
      }
      setProcessedSlides(updatedProcessed);

      if (data.totalSlides) {
        setTotalPdfPages(data.totalSlides);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while talking to Gemini. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateNotes = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerateNotesForRange(1);
  };

  // Auto pre-load the fully configured Machine Learning demo
  const handleLoadDemo = () => {
    setError(null);
    setPdfBase64(DEMO_PDF_BASE64);
    setPdfName("neural_networks_intro.pdf");
    setExplanation(DEMO_EXPLANATION);
    
    const demoMap: { [num: number]: string } = {};
    const processedMap: { [num: number]: boolean } = {};
    DEMO_EXPLANATION.explanations.forEach((item) => {
      demoMap[item.slideNumber] = item.explanation;
      processedMap[item.slideNumber] = true;
    });
    // For demo, treat pages 1 to 5 as fully processed
    for (let i = 1; i <= 5; i++) {
      processedMap[i] = true;
    }
    setSlideExplanations(demoMap);
    setProcessedSlides(processedMap);
    setTotalPdfPages(DEMO_EXPLANATION.totalSlides || 5);
    setCurrentPdfPage(1);
  };

  // Reset entire application state
  const handleReset = () => {
    setPdfBase64(null);
    setPdfName("");
    setCustomInstructions("");
    setExplanation(null);
    setSlideExplanations({});
    setProcessedSlides({});
    setError(null);
    setCurrentPdfPage(1);
    setSubchatMessages({});
    setCurrentSubchatInput("");
    setSubchatError(null);
    setPanelPos({ x: -1, y: -1 });
    setPanelMinimized(false);
    setActiveTab("notes");
  };

  // Submit slide-specific follow-up question
  const handleSendSubchatMessage = async (customText?: string) => {
    const textToSend = (customText || currentSubchatInput).trim();
    if (!textToSend) return;

    const slideNum = currentPdfPage;
    const slideExplanation = slideExplanations[slideNum] || "";
    const previousMessages = subchatMessages[slideNum] || [];
    const updatedMessages = [...previousMessages, { role: "user" as const, text: textToSend }];

    setSubchatMessages((prev) => ({
      ...prev,
      [slideNum]: updatedMessages,
    }));
    setCurrentSubchatInput("");
    setIsSubchatSending(true);
    setSubchatError(null);

    try {
      const response = await fetch("/api/subchat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideExplanation,
          slideNumber: slideNum,
          chatHistory: previousMessages,
          newMessage: textToSend,
          customApiKey: customApiKey || undefined,
          selectedModel: subchatModel,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch response from Slide Assistant.");
      }

      setSubchatMessages((prev) => ({
        ...prev,
        [slideNum]: [...updatedMessages, { role: "model" as const, text: data.reply }],
      }));
    } catch (err: any) {
      console.error(err);
      setSubchatError(err.message || "An error occurred during communication.");
    } finally {
      setIsSubchatSending(false);
    }
  };

  // Jump slide directly when user clicks target slide tags
  const handleJumpToSlide = (slideNum: number) => {
    if (slideNum >= 1 && slideNum <= totalPdfPages) {
      setCurrentPdfPage(slideNum);
    }
  };

  const SECTION_MARKERS = [
    { key: "Memory Hook", label: "Memory Hook", className: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400" },
    { key: "Exam Alert", label: "Exam Alert", className: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
    { key: "Intuition", label: "Intuition", className: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
    { key: "Real-World", label: "Real-World Example", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  ];

  const stripMarkerPrefix = (text: string, marker: string): string => {
    const stripped = text.slice(marker.length).replace(/^[:\s]+/, "");
    return stripped;
  };

  const renderNotesParagraph = (children: React.ReactNode) => {
    const text = getChildrenText(children);
    for (const marker of SECTION_MARKERS) {
      if (text.startsWith(marker.key)) {
        const content = stripMarkerPrefix(text, marker.key);
        return (
          <div className={`border ${marker.className} p-4 rounded-2xl my-4 text-xs md:text-sm shadow-xl relative overflow-hidden backdrop-blur-sm`}>
            <div className="absolute top-0 right-0 w-20 h-20 opacity-5 rounded-full -mr-8 -mt-8 pointer-events-none bg-current" />
            <span className={`font-bold flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2 font-display ${marker.className.split(" ").find(c => c.startsWith("text-"))}`}>
              {marker.label}
            </span>
            <div className="text-slate-200 leading-relaxed font-sans">{content}</div>
          </div>
        );
      }
    }
    return <p className="text-slate-300 text-xs md:text-sm leading-relaxed mb-3.5">{children}</p>;
  };



  return (
    <div className={`w-full flex flex-col bg-slate-950 font-sans text-slate-200 antialiased ${(explanation || isAnalyzing) ? "h-screen overflow-hidden" : "min-h-screen overflow-y-auto"}`}>
      {/* Main Workspace Frame */}
      <main className={`flex-1 flex flex-col bg-slate-950 ${(explanation || isAnalyzing) ? "overflow-hidden" : "p-4 md:p-8"}`}>
        {(!explanation && !isAnalyzing) ? (
          /* Welcome and File Upload Screen */
          <div className="w-full max-w-2xl mx-auto py-4 md:py-12 space-y-8 animate-fade-in">
            <div className="text-center space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
                Workspace Setup
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Turn Dense Slides into Clear Explanations
              </h2>
              <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Our AI companion parses your slide deck and drafts exactly 10 pages of beautifully structured notes filled with motivation, intuition metaphors, and deep explanations.
              </p>
            </div>

            <form onSubmit={handleGenerateNotes} className="space-y-6">
              {/* Drag and Drop Container */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                id="drag-drop-box"
                className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center transition-all relative flex flex-col items-center justify-center min-h-[220px] ${
                  dragActive
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 hover:border-slate-700 bg-slate-900/20"
                } ${pdfBase64 ? "cursor-default" : "cursor-pointer"}`}
              >
                {pdfBase64 ? (
                  <div className="flex flex-col items-center justify-center space-y-4 p-4 animate-fade-in">
                    <div className="bg-emerald-500/10 p-4 rounded-full border border-emerald-500/20">
                      <FileText className="h-8 w-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
                        {pdfName}
                      </p>
                      <p className="text-xs text-emerald-500 mt-1 font-semibold flex items-center justify-center gap-1">
                        ● Slide deck loaded and ready
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors underline font-medium mt-1 cursor-pointer"
                    >
                      Choose another slide deck
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id="pdf-upload-input"
                    />
                    
                    <div className="bg-slate-900/60 p-4 rounded-full mb-4 border border-slate-800">
                      <Upload className="h-7 w-7 text-indigo-400" />
                    </div>
                    
                    <p className="text-sm font-semibold text-slate-200 mb-1">
                      Drag and drop your lecture slide PDF here
                    </p>
                    <p className="text-xs text-slate-500 mb-4">
                      or click to browse local files (Supports up to 50MB)
                    </p>
                  </>
                )}
              </div>

              {/* AI Settings & Learning Tracks Panel */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-6 text-left">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      AI Settings & Learning Style
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Customize Tutor</span>
                </div>

                {/* API Credentials & Model Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="custom-api-key" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Custom Gemini API Key (Optional)
                    </label>
                    <input
                      id="custom-api-key"
                      type="password"
                      placeholder="Enter custom key... (uses server key if blank)"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600"
                    />
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      Stored locally in your browser. Leave blank to run automatically under our free server key.
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="selected-model" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Select Model
                    </label>
                    <select
                      id="selected-model"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 cursor-pointer"
                    >
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (Default - High Speed & High-Quality Analytical Explanations)</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (Flagship High-Thinking & Deep Reasoning)</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Lightweight & Speedy)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Performance Legacy)</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast Legacy)</option>
                      <option value="custom">-- Custom Model ID (Use Any Model) --</option>
                    </select>
                    {selectedModel === "custom" && (
                      <div className="space-y-1 mt-1.5 animate-fade-in">
                        <input
                          type="text"
                          placeholder="e.g. gemini-3.5-flash"
                          value={customModelId}
                          onChange={(e) => setCustomModelId(e.target.value)}
                          className="w-full text-xs bg-slate-950 border border-indigo-500 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 font-mono placeholder:text-slate-600"
                        />
                        <span className="text-[9px] text-indigo-400 block leading-tight">
                          Enter any official Gemini model identifier (e.g. <code>gemini-3.5-flash</code> or <code>gemini-1.5-pro</code>).
                        </span>
                      </div>
                    )}
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      We default to Gemini 3.5 Flash because it generates superior, high-speed, intuitive first-principles explanations.
                    </span>
                  </div>
                </div>

                {/* Learning Strategy / Track Selector */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Step 1: Choose Your Core Lecture Explanation Strategy
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Auto-Detect */}
                    <button
                      type="button"
                      onClick={() => setSelectedTrack("auto")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        selectedTrack === "auto"
                          ? "bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500/30"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Sparkles className="h-4 w-4 text-indigo-400" />
                          <span>Class-Adaptive Auto</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Classifies your PDF and switches styling automatically. Great fallback.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 mt-1">Subject-Adaptive</span>
                    </button>

                    {/* STEM & Logic */}
                    <button
                      type="button"
                      onClick={() => setSelectedTrack("logic")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        selectedTrack === "logic"
                          ? "bg-emerald-600/10 border-emerald-500 ring-1 ring-emerald-500/30"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Lightbulb className="h-4 w-4 text-emerald-400" />
                          <span>STEM & First-Principles</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Focuses on "why" motivations, derivation walkthroughs, failures, and beginner analogies.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mt-1">Understanding & Derivation</span>
                    </button>

                    {/* Absurd Stories */}
                    <button
                      type="button"
                      onClick={() => setSelectedTrack("non-logic")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        selectedTrack === "non-logic"
                          ? "bg-purple-600/10 border-purple-500 ring-1 ring-purple-500/30"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <BookOpen className="h-4 w-4 text-purple-400" />
                          <span>Absurd Stories & Mnemonics</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Uses vivid, wacky anecdotes and memory hacks. Weaves relationships to past slide items.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 mt-1">Maximum Brain Recall</span>
                    </button>

                    {/* Cram Mode */}
                    <button
                      type="button"
                      onClick={() => setSelectedTrack("cram")}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        selectedTrack === "cram"
                          ? "bg-amber-600/10 border-amber-500 ring-1 ring-amber-500/30"
                          : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <FileText className="h-4 w-4 text-amber-400" />
                          <span>High-Velocity Cram Mode</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          No fluff. Synthesizes key formulas, critical bullet summaries, cheat sheets, and exam facts.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mt-1">Rapid Exam Prep</span>
                    </button>
                  </div>
                </div>

                {/* Advanced Custom Guidelines - Nested clearly as a combined addon */}
                <div className="space-y-2 border-t border-slate-800/80 pt-4">
                  <label htmlFor="custom-instructions" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                    Step 2: Add-On Custom Style Hints (Merged with active strategy)
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    This text acts as an add-on. For example, if you chose <strong>STEM & First-Principles</strong> above and type <em>"Focus on math equations"</em> here, the AI will prioritize mathematical formulas using intuitive analogies.
                  </p>
                  <textarea
                    id="custom-instructions"
                    placeholder="e.g., 'Focus heavily on the mathematical equations', 'Explain concepts using cooking metaphors', 'Explain to a total beginner', 'Summarize key theorems'"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full text-xs md:text-sm bg-slate-950 border border-slate-800 rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Generate & Demo Button Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={!pdfBase64 || isAnalyzing}
                  id="generate-notes-btn"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/30 disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Mapped Lecture Notes
                </button>

                {!pdfBase64 && (
                  <button
                    type="button"
                    onClick={handleLoadDemo}
                    id="load-demo-btn"
                    className="sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold transition-colors text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 text-slate-400 fill-current" />
                    Load Demo Lecture
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden w-full h-full bg-slate-950 flex flex-col">
            {/* 1. Full-Screen Interactive Slides Canvas Background */}
            <div className="absolute inset-0 w-full h-full select-none z-0">
              <PDFViewer
                pdfBase64={pdfBase64}
                currentPage={currentPdfPage}
                onPageChange={setCurrentPdfPage}
                onTotalPages={setTotalPdfPages}
                onReset={handleReset}
              />
            </div>

            {/* 2. Overlays - Initial Loaded Setup Prompt */}
            {!explanation && !isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm z-20 p-4">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 p-8 rounded-2xl max-w-sm w-full shadow-2xl animate-fade-in text-center space-y-6">
                  <div className="bg-indigo-500/10 p-4 rounded-full w-14 h-14 mx-auto border border-indigo-500/20 flex items-center justify-center animate-pulse">
                    <Sparkles className="h-6 w-6 text-indigo-400" />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">
                      PDF Slides Loaded Successfully
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Click the button below to generate deep-reasoning explanations for slides 1 to 15.
                    </p>
                  </div>

                  <form onSubmit={handleGenerateNotes} className="w-full space-y-4">
                    <button
                      type="submit"
                      id="study-slides-btn"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="h-4 w-4" />
                      Explain Slides 1 - 15
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* 3. Overlays - Analyzing Loader & Progress Bar */}
            {isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm z-30 p-4">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 p-8 rounded-2xl max-w-md w-full shadow-2xl animate-fade-in text-center space-y-6">
                  <div className="relative mx-auto w-14 h-14">
                    <div className="h-14 w-14 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
                    <Sparkles className="h-5 w-5 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Analyzing Lecture Slides
                    </h3>
                    <p className="text-xs text-slate-400">
                      Generating beautiful slide explanations
                    </p>
                  </div>

                  {/* High Fidelity Minimalist Progress Bar */}
                  <div className="w-full space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>{loadingMessages[loadingMessageIndex]}</span>
                      <span className="text-indigo-400 font-bold">{analysisProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-normal bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 w-full">
                    Our AI parses each slide's code, math, and diagrams to draft high-fidelity, intuitive explanations.
                  </p>
                </div>
              </div>
            )}

            {/* 4. Overlays - Draggable, Resizable Glassmorphic Explanation Panel */}
            {explanation && !isAnalyzing && (
              panelMinimized ? (
                /* Minimized state floating bubble */
                <div
                  style={{
                    position: "absolute",
                    left: panelPos.x !== -1 ? `${panelPos.x}px` : "auto",
                    right: panelPos.x === -1 ? "24px" : "auto",
                    top: panelPos.y !== -1 ? `${panelPos.y}px` : "72px",
                    zIndex: 40,
                  }}
                  className="flex items-center gap-2 bg-indigo-600/90 hover:bg-indigo-500/95 backdrop-blur-md border border-indigo-400/40 px-4 py-2.5 rounded-full shadow-2xl cursor-grab active:cursor-grabbing select-none text-white font-semibold text-xs transition-all duration-150 animate-fade-in"
                  onMouseDown={handleDragMouseDown}
                  onClick={() => {
                    if (!hasDragged) {
                      setPanelMinimized(false);
                    }
                  }}
                  title="Drag to reposition, click to expand notes"
                >
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  <span>Slide {currentPdfPage} Notes • Expand</span>
                </div>
              ) : (
                /* Full Resizable/Draggable Glassmorphism Panel */
                <div
                  style={{
                    position: "absolute",
                    left: panelPos.x !== -1 ? `${panelPos.x}px` : "auto",
                    right: panelPos.x === -1 ? "24px" : "auto",
                    top: panelPos.y !== -1 ? `${panelPos.y}px` : "72px",
                    width: `${panelSize.width}px`,
                    height: `${panelSize.height}px`,
                    zIndex: 40,
                  }}
                  className="bg-slate-950/40 hover:bg-slate-950/45 focus-within:bg-slate-950/45 backdrop-blur-md border border-slate-800/40 shadow-2xl rounded-2xl flex flex-col overflow-hidden select-none animate-fade-in text-left transition-colors duration-200"
                >
                  {/* Draggable Header Bar */}
                  <div
                    onMouseDown={handleDragMouseDown}
                    className="h-14 bg-slate-950/40 border-b border-slate-800/40 px-4 flex items-center justify-between select-none shrink-0 cursor-grab active:cursor-grabbing"
                    title="Drag header to reposition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold font-mono">
                        Slide {currentPdfPage}
                      </span>
                    </div>

                    {/* Navigation tabs inside header */}
                    <div 
                      className="flex bg-slate-950 border border-slate-800/80 p-0.5 rounded-lg text-[10px] font-bold" 
                      onClick={(e) => e.stopPropagation()} // Stop propagation so clicking tabs doesn't drag
                    >
                      <button
                        type="button"
                        onClick={() => setActiveTab("notes")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeTab === "notes" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <BookOpen className="h-3 w-3" />
                        Notes
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("chat")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeTab === "chat" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Ask AI
                      </button>
                    </div>

                    {/* Header Action Controls */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setPanelMinimized(true)}
                        className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title="Minimize explanation window"
                      >
                        <Minimize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Panel Content Scroll Area */}
                  <div className="flex-1 overflow-hidden relative flex flex-col bg-transparent">
                    {activeTab === "notes" ? (
                      (() => {
                        const currentExplanationText = slideExplanations[currentPdfPage];
                        const isProcessed = processedSlides[currentPdfPage];

                        // Find dynamic batch starting point
                        let currentBatchStart = currentPdfPage;
                        while (currentBatchStart > 1 && !processedSlides[currentBatchStart - 1]) {
                          currentBatchStart--;
                        }

                        // Find the first unprocessed page starting from currentPdfPage + 1
                        let nextBatchStart = -1;
                        for (let i = currentPdfPage + 1; i <= (totalPdfPages || 0); i++) {
                          if (!processedSlides[i]) {
                            nextBatchStart = i;
                            break;
                          }
                        }
                        if (currentExplanationText) {
                          const cleanExplanationText = currentExplanationText.replace(/\\n/g, "\n");
                          return (
                            <div className="p-5 md:p-6 overflow-y-auto flex-1 custom-scrollbar">
                              <div className="text-sm leading-relaxed text-slate-300 pb-8">
                                <ReactMarkdown
                                  components={{
                                    h1: ({ children }) => (
                                      <h1 className="text-base md:text-lg font-display font-bold text-indigo-300 border-b border-indigo-500/20 pb-1.5 mb-3.5 mt-5 first:mt-0 flex items-center gap-1.5">
                                        <span className="w-1 h-3.5 bg-indigo-500 rounded-full" />
                                        {children}
                                      </h1>
                                    ),
                                    h2: ({ children }) => (
                                      <h2 className="text-sm md:text-base font-display font-bold text-sky-400 mt-4 mb-2.5 flex items-center gap-1">
                                        <span className="w-1 h-3 bg-sky-400 rounded-full opacity-60" />
                                        {children}
                                      </h2>
                                    ),
                                    h3: ({ children }) => (
                                      <h3 className="text-xs md:text-sm font-display font-semibold text-emerald-400 mt-3 mb-2">
                                        {children}
                                      </h3>
                                    ),
                                    p: ({ children }) => renderNotesParagraph(children),
                                    ul: ({ children }) => <ul className="space-y-2.5 my-3.5 pl-0.5">{children}</ul>,
                                    ol: ({ children }) => <ol className="space-y-2.5 my-3.5 pl-4 list-decimal text-slate-300 text-xs md:text-sm">{children}</ol>,
                                    li: ({ children }) => (
                                      <li className="flex items-start gap-2 text-xs md:text-sm text-slate-300">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 shadow-sm" />
                                        <span className="flex-1">{children}</span>
                                      </li>
                                    ),
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-4 border-indigo-500 bg-indigo-500/5 px-4 py-3 rounded-r-xl my-4 italic text-slate-300 text-xs md:text-sm">
                                        {children}
                                      </blockquote>
                                    ),
                                    code: ({ node, className, children, ...props }: any) => {
                                      const match = /language-(\w+)/.exec(className || "");
                                      return match ? (
                                        <pre className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl my-4 overflow-x-auto text-[11px] font-mono text-indigo-300">
                                          <code className={className} {...props}>
                                            {children}
                                          </code>
                                        </pre>
                                      ) : (
                                        <code className="bg-slate-950 border border-slate-800/80 px-1.5 py-0.5 rounded text-[11px] font-mono text-pink-400" {...props}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    strong: ({ children }) => <strong className="font-bold text-white bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800/50">{children}</strong>,
                                  }}
                                >
                                  {cleanExplanationText}
                                </ReactMarkdown>
                              </div>

                              {/* Quiz Questions */}
                              {(() => {
                                const currentSlideData = explanation?.explanations?.find(e => e.slideNumber === currentPdfPage);
                                const quiz = currentSlideData?.quizQuestions;
                                if (!quiz || quiz.length === 0) return null;
                                const isOpen = showQuiz[currentPdfPage];
                                return (
                                  <div className="mt-6 border-t border-slate-800/60 pt-5">
                                    <button
                                      onClick={() => setShowQuiz(prev => ({ ...prev, [currentPdfPage]: !isOpen }))}
                                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors cursor-pointer w-full"
                                    >
                                      <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
                                      Quiz Questions ({quiz.length})
                                      {isOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                                    </button>
                                    {isOpen && (
                                      <div className="mt-3 space-y-4 animate-fade-in">
                                        {quiz.map((q, qi) => (
                                          <div key={qi} className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 space-y-3">
                                            <p className="text-xs font-semibold text-sky-300">{qi + 1}. {q.question}</p>
                                            <div className="space-y-2">
                                              {q.options.map((opt, oi) => {
                                                const letter = ["A","B","C","D"][oi];
                                                const isCorrect = oi === q.correctIndex;
                                                return (
                                                  <div key={oi} className={`flex items-start gap-2 text-[11px] p-2 rounded-xl ${isCorrect ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "text-slate-400 border border-transparent"}`}>
                                                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5 ${isCorrect ? "bg-emerald-500/30 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{letter}</span>
                                                    <span>{opt}{isCorrect && " ✓"}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            <p className="text-[10px] text-slate-500 italic border-t border-slate-800/60 pt-2">{q.explanation}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Bottom interactive navigation footer inside note */}
                              <div className="mt-6 pt-5 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-500 font-mono">
                                <span>Slide {currentPdfPage} of {totalPdfPages || "?"}</span>
                                
                                {nextBatchStart !== -1 && (
                                  <button
                                    onClick={() => handleGenerateNotesForRange(nextBatchStart, nextBatchStart)}
                                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
                                  >
                                    <Sparkles className="h-3 w-3 animate-pulse" />
                                    Continue from Slide {nextBatchStart}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        } else if (isProcessed) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xs mx-auto space-y-4 my-auto h-full">
                              <div className="bg-slate-800/20 p-3.5 rounded-full border border-slate-700/20">
                                <BookOpen className="h-6 w-6 text-slate-400" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-white">
                                  Title or Transition Slide
                                </p>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                  The AI processed this slide and noted it as a title or transition page. Navigate to the next slide for content.
                                </p>
                              </div>
                              
                              {nextBatchStart !== -1 && (
                                <button
                                  onClick={() => handleGenerateNotesForRange(nextBatchStart, nextBatchStart)}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-[10px] shadow-lg shadow-indigo-600/25 transition-colors cursor-pointer w-full"
                                >
                                  Continue from Slide {nextBatchStart}
                                </button>
                              )}
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xs mx-auto space-y-4 my-auto h-full">
                              <div className="bg-indigo-500/10 p-3.5 rounded-full border border-indigo-500/20">
                                <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-white">
                                  Slide {currentPdfPage} is not explained yet
                                </p>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                  Generating explanations in compact, AI-sized slide batches keeps quality deep and token usage fast.
                                </p>
                              </div>
                              <button
                                onClick={() => handleGenerateNotesForRange(currentBatchStart, currentBatchStart)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-[10px] shadow-lg shadow-indigo-600/25 transition-colors cursor-pointer w-full"
                              >
                                Explain from Slide {currentBatchStart}
                              </button>
                            </div>
                          );
                        }
                      })()
                    ) : (
                      /* Tab 2: Ask AI Chat Walkthrough */
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Model selector for chat */}
                        <div className="px-3 pt-3 pb-0 flex items-center gap-2 border-b border-slate-800/40 pb-2.5 shrink-0">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold shrink-0">Tutor Model</span>
                          <select
                            value={subchatModel}
                            onChange={(e) => setSubchatModel(e.target.value)}
                            className="flex-1 text-[10px] bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300 cursor-pointer"
                          >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                          </select>
                        </div>
                        {/* Message scroll list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                          {/* Welcome message */}
                          <div className="flex gap-2.5 items-start max-w-[85%] self-start animate-fade-in">
                            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                              <Bot className="h-4 w-4 text-indigo-400" />
                            </div>
                            <div className="bg-slate-800/40 border border-slate-700/30 text-slate-200 rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs leading-relaxed shadow-sm">
                              Hey! I am your AI slide-specific tutor. Ask me any follow-up questions about the concepts, formulas, or story analogies shown on Slide {currentPdfPage}!
                            </div>
                          </div>

                          {/* Message List */}
                          {(subchatMessages[currentPdfPage] || []).map((msg, idx) => {
                            const isUser = msg.role === "user";
                            return (
                              <div
                                key={idx}
                                className={`flex gap-2.5 items-start max-w-[85%] ${
                                  isUser ? "self-end flex-row-reverse ml-auto" : "self-start"
                                } animate-fade-in`}
                              >
                                <div
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                    isUser
                                      ? "bg-indigo-600 text-white"
                                      : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
                                  }`}
                                >
                                  {isUser ? (
                                    <User className="h-3.5 w-3.5" />
                                  ) : (
                                    <Bot className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <div
                                  className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                                    isUser
                                      ? "bg-indigo-600 text-white rounded-tr-none"
                                      : "bg-slate-800/50 border border-slate-700/30 text-slate-100 rounded-tl-none"
                                  }`}
                                >
                                  {isUser ? msg.text : (
                                    <ReactMarkdown
                                      components={{
                                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                        strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                                        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                                        li: ({ children }) => <li>{children}</li>,
                                        code: ({ children, className }: any) => {
                                          const isBlock = /language-/.test(className || "");
                                          return isBlock
                                            ? <pre className="bg-slate-950 border border-slate-800 p-2 rounded-lg my-2 overflow-x-auto text-[10px] font-mono text-indigo-300"><code>{children}</code></pre>
                                            : <code className="bg-slate-950 px-1 py-0.5 rounded text-[10px] font-mono text-pink-400">{children}</code>;
                                        },
                                        h1: ({ children }) => <p className="font-bold text-white mb-1">{children}</p>,
                                        h2: ({ children }) => <p className="font-bold text-sky-300 mb-1">{children}</p>,
                                        h3: ({ children }) => <p className="font-semibold text-emerald-300 mb-1">{children}</p>,
                                        blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-400 pl-2 italic text-slate-300 my-1">{children}</blockquote>,
                                      }}
                                    >{msg.text}</ReactMarkdown>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {isSubchatSending && (
                            <div className="flex gap-2.5 items-start max-w-[85%] self-start animate-fade-in">
                              <div className="w-7 h-7 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                <Bot className="h-4 w-4 text-indigo-400 animate-pulse" />
                              </div>
                              <div className="bg-slate-800/40 border border-slate-700/30 text-slate-400 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs flex items-center gap-1.5 italic font-medium">
                                <span className="flex gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </span>
                                Tutor is thinking...
                              </div>
                            </div>
                          )}

                          {subchatError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] leading-normal flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <p className="flex-1">{subchatError}</p>
                            </div>
                          )}

                          <div ref={chatEndRef} />
                        </div>

                        {/* Input form */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSendSubchatMessage();
                          }}
                          className="p-3 border-t border-slate-800/60 bg-slate-950/50 flex gap-2 items-center flex-shrink-0"
                        >
                          <input
                            type="text"
                            placeholder={`Ask about Slide ${currentPdfPage}...`}
                            value={currentSubchatInput}
                            onChange={(e) => setCurrentSubchatInput(e.target.value)}
                            disabled={isSubchatSending}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600 font-sans"
                          />
                          <button
                            type="submit"
                            disabled={isSubchatSending || !currentSubchatInput.trim()}
                            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white cursor-pointer"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Corner diagonal resize handle (Only shown in expanded state) */}
                  <div
                    onMouseDown={handleResizeMouseDown}
                    className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 select-none text-slate-500 hover:text-slate-300 z-10"
                    title="Drag to resize panel"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-60">
                      <path d="M10,0 L0,10 M10,3 L3,10 M10,6 L6,10" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
