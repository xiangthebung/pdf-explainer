                                import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./components/Mermaid";
import { SvgRenderer } from "./components/SvgRenderer";
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
  Zap,
  CheckCircle2, Check, X, Info, RefreshCw,
  RotateCcw,
  ArrowRight,
  Terminal,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import PDFViewer from "./components/PDFViewer";
import { InteractiveMatching } from "./components/InteractiveMatching";
import { InteractiveBlank } from "./components/InteractiveBlank";
import { ExplanationResponse, QuizQuestion, ContentBlock } from "./types";
import { DEMO_PDF_BASE64, DEMO_EXPLANATION } from "./components/DemoData";
import { extractMatchingPairs, cleanMatchingTitle, sanitizeBlankPuzzle } from "./utils/puzzleUtils";

// Set worker source to unpkg matching the version installed
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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
const renderNotesParagraph = (children: React.ReactNode) => {
  return <p className="text-slate-300 text-xs md:text-sm leading-relaxed mb-3.5">{children}</p>;
};

import { ErrorOverlay } from "./components/ErrorOverlay";

import { globalMarkdownComponents, SafeMarkdown } from "./utils/markdownComponents";

export default function App() {
  const [serverConfig, setServerConfig] = useState<{ hasServerKey: boolean; requireUserKey: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => setServerConfig(data))
      .catch((err) => console.error("Error fetching config:", err));
  }, []);

  // Main states
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string>("");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [popupErrors, setPopupErrors] = useState<{ id: string; title: string; message: string; details?: string; showDetails?: boolean }[]>([]);

  const addPopupError = (title: string, message: string, details?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    setPopupErrors(prev => [...prev, { id, title, message, details, showDetails: false }]);
  };

  const removePopupError = (id: string) => {
    setPopupErrors(prev => prev.filter(err => err.id !== id));
  };

  const togglePopupDetails = (id: string) => {
    setPopupErrors(prev => prev.map(err => err.id === id ? { ...err, showDetails: !err.showDetails } : err));
  };
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [slideExplanations, setSlideExplanations] = useState<{ [slideNumber: number]: ContentBlock[] }>({});
  const [processedSlides, setProcessedSlides] = useState<{ [slideNumber: number]: boolean }>({});
  const [startSlideInput, setStartSlideInput] = useState<number>(1);
  const [nextBatchStartInput, setNextBatchStartInput] = useState<number>(1);
  const [isPanelHovered, setIsPanelHovered] = useState<boolean>(true);

  // Interaction states
  const [currentPdfPage, setCurrentPdfPage] = useState<number>(1);
  const [totalPdfPages, setTotalPdfPages] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // AI Configuration Settings
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("slidesage_custom_api_key") || "";
  });
  const [selectedModel, setSelectedModel] = useState<string>("gemini-flash-latest");
  const [customModelId, setCustomModelId] = useState<string>(() => {
    return localStorage.getItem("slidesage_custom_model_id") || "gemini-flash-latest";
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
  const [subchatModel, setSubchatModel] = useState<string>("gemini-flash-lite-latest");
  const [quizModel, setQuizModel] = useState<string>("gemini-flash-lite-latest");
  const [finalQuiz, setFinalQuiz] = useState<any[] | null>(null);
  const [isGeneratingFinalQuiz, setIsGeneratingFinalQuiz] = useState(false);
  const [finalQuizAnswers, setFinalQuizAnswers] = useState<{ [questionIndex: number]: number }>({});
  const [showQuiz, setShowQuiz] = useState<{ [slideNumber: number]: boolean }>({});
  const [showExampleProblem, setShowExampleProblem] = useState<{ [slideNumber: number]: boolean }>({});
  const [quizAnswers, setQuizAnswers] = useState<{ [slideNumber: number]: { [questionIndex: number]: number } }>({});
  const [matchingAnswers, setMatchingAnswers] = useState<{ [slideNumber: number]: { [gameIndex: number]: boolean } }>({});
  const [fillInAnswers, setFillInAnswers] = useState<{ [slideNumber: number]: { [blankIndex: number]: boolean } }>({});
  const [showMatching, setShowMatching] = useState<{ [slideNumber: number]: boolean }>({});
  const [showFillIn, setShowFillIn] = useState<{ [slideNumber: number]: boolean }>({});
  const notesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef<{ [slideNumber: number]: number }>({});
  const [activeTab, setActiveTab] = useState<"notes" | "chat" | "quiz">("notes");

  // Restore scroll position of notes when moving to another slide page or changing tabs
  useEffect(() => {
    if (activeTab === "notes" && notesScrollRef.current) {
      const savedScroll = scrollPositionsRef.current[currentPdfPage] || 0;
      const timer = setTimeout(() => {
        if (notesScrollRef.current) {
          notesScrollRef.current.scrollTop = savedScroll;
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [currentPdfPage, activeTab]);

  // Find the first unprocessed page starting from currentPdfPage + 1
  let recommendedNextBatchStart = -1;
  for (let i = currentPdfPage + 1; i <= (totalPdfPages || 0); i++) {
    if (!processedSlides[i]) {
      recommendedNextBatchStart = i;
      break;
    }
  }

  const currentPageIsProcessed = processedSlides[currentPdfPage];

  // Keep nextBatchStartInput in sync when recommended next batch slide or page state changes
  useEffect(() => {
    if (!currentPageIsProcessed) {
      setNextBatchStartInput(currentPdfPage);
    } else if (recommendedNextBatchStart !== -1) {
      setNextBatchStartInput(recommendedNextBatchStart);
    }
  }, [currentPdfPage, currentPageIsProcessed, recommendedNextBatchStart]);

  // Floating panel drag/resize state
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: -1, y: -1 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number }>({ width: 460, height: 580 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [posStart, setPosStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sizeStart, setSizeStart] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [panelMinimized, setPanelMinimized] = useState<boolean>(false);
  const [overallPuzzles, setOverallPuzzles] = useState<any[]>([]);
  const [totalPuzzlesNeeded, setTotalPuzzlesNeeded] = useState<number>(0);
  const [isQuizPlanning, setIsQuizPlanning] = useState<boolean>(false);
  const [isQuizGenerating, setIsQuizGenerating] = useState<boolean>(false);
  const [quizDebugLogs, setQuizDebugLogs] = useState<string[]>([]);
  const [overallQuizAnswers, setOverallQuizAnswers] = useState<{ [puzzleIndex: number]: any }>({});
  const [hasGeneratedMorePuzzles, setHasGeneratedMorePuzzles] = useState<boolean>(false);
  const [hasDragged, setHasDragged] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
          if (!hasDragged) setHasDragged(true);
        }

        const newX = Math.max(0, Math.min(posStart.x + dx, window.innerWidth - (panelMinimized ? 150 : panelSize.width)));
        const newY = Math.max(0, Math.min(posStart.y + dy, window.innerHeight - (panelMinimized ? 40 : 50)));
        
        if (panelRef.current) {
          panelRef.current.style.left = `${newX}px`;
          panelRef.current.style.top = `${newY}px`;
        }
      } else if (isResizing) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        const newWidth = Math.max(320, Math.min(sizeStart.width + dx, window.innerWidth - panelPos.x - 12));
        const newHeight = Math.max(220, Math.min(sizeStart.height + dy, window.innerHeight - panelPos.y - 12));
        
        if (panelRef.current) {
          panelRef.current.style.width = `${newWidth}px`;
          panelRef.current.style.height = `${newHeight}px`;
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
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
  }, [isDragging, isResizing, dragStart, posStart, sizeStart, panelPos, panelSize, panelMinimized, hasDragged]);

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

  // Loading messages to cycle through during analysis (completely clean and professional)
  const loadingMessages = [
    "Reading slide layout...",
    "Extracting concepts...",
    "Building lecture notes...",
    "Crafting analogies...",
    "Generating examples...",
    "Mapping notes to slides...",
    "Writing quiz questions...",
    "Finalizing explanations..."
  ];

  // Cycle loading messages during analysis
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 7000);
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
      const duration = 100000; // 100 seconds expected response time
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const percent = Math.min((elapsed / duration) * 100, 98); // cap at 98% until complete
        setAnalysisProgress(Math.round(percent));
      }, 150);
    } else {
      setAnalysisProgress(100);
    }
    return () => clearInterval(intervalId);
  }, [isAnalyzing, loadingMessages.length]);

  // Read file and convert to base64 helper
  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF file. Other formats are not supported.");
      return;
    }
    setError(null);
    setPdfName(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      // Extract raw base64 string without prefix
      const base64Data = result.split(",")[1];
      setPdfBase64(base64Data);
      setExplanation(null); // Reset previous explanation
      setSlideExplanations({}); // Reset previous explanations
      setProcessedSlides({}); // Reset processed status of slides
      setShowQuiz({}); // Reset quiz visibility states
      setShowExampleProblem({}); // Reset example problem visibility states
      setQuizAnswers({}); // Reset quiz answers
      setSubchatMessages({}); // Reset subchat message history
      setCurrentSubchatInput(""); // Reset current chat inputs
      setSubchatError(null); // Clear subchat errors
      setCurrentPdfPage(1); // Reset current PDF page to 1
      setAnalysisProgress(0); // Reset analysis progress bar
      setOverallPuzzles([]);
      setTotalPuzzlesNeeded(0);
      setHasGeneratedMorePuzzles(false);
      setIsQuizPlanning(false);
      setIsQuizGenerating(false);
      setOverallQuizAnswers({});
      scrollPositionsRef.current = {};
      
      try {
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const loadingTask = pdfjs.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        setTotalPdfPages(doc.numPages);
        setStartSlideInput(1); // Default to start from 1
      } catch (err) {
        console.error("Error reading pdf pages count:", err);
      }
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
  
  const handleGenerateFinalQuiz = async () => {
    if (!pdfBase64) return;
    setIsGeneratingFinalQuiz(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-final-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfData: pdfBase64,
          customApiKey: customApiKey || undefined,
          selectedModel: selectedModel === "custom" ? customModelId : selectedModel,
        }),
      });
      
      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "An error occurred while generating the final quiz.";
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 150)}`;
        }
        throw new Error(errorMsg);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        let snippet = text.trim().substring(0, 300);
        if (snippet.includes("<!DOCTYPE") || snippet.includes("<html") || snippet.includes("<body")) {
          const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
          const h1Match = text.match(/<h1>([\s\S]*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const h1 = h1Match ? h1Match[1].trim() : "";
          let detail = "";
          if (h1) detail = ` (Server reported: ${h1})`;
          else if (title) detail = ` (Server reported: ${title})`;
          throw new Error(`The server returned an unexpected HTML page${detail}. This may be due to a network timeout, proxy redirection, or payload size limit. Please try using a smaller PDF file or configure a custom API key.`);
        }
        throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}. Response: ${snippet}`);
      }

      const data = await response.json();
      setFinalQuiz(data.quizQuestions);
      setFinalQuizAnswers({});
    } catch (err: any) {
      addPopupError("Quiz Generation Failed", err.message || "Failed to generate final quiz.", err.stack || err.toString());
    } finally {
      setIsGeneratingFinalQuiz(false);
    }
  };

  const handleStartOverallQuiz = async () => {
    if (!pdfBase64) {
      addPopupError("No PDF Uploaded", "Please upload a lecture PDF slide deck first.");
      return;
    }
    setIsQuizPlanning(true);
    setIsQuizGenerating(true);
    setOverallPuzzles([]);
    setOverallQuizAnswers({});
    setHasGeneratedMorePuzzles(false);
    setQuizDebugLogs(["Initializing comprehensive quiz generation..."]);
    setError(null);
    try {
      setQuizDebugLogs(prev => [...prev, "Contacting AI professor to design your curriculum..."]);
      const response = await fetch("/api/generate-final-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          customApiKey: customApiKey || undefined,
          selectedModel: quizModel === "custom" ? customModelId : quizModel,
        })
      });
      
      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "Failed to generate review puzzles.";
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 150)}`;
        }
        setQuizDebugLogs(prev => [...prev, `❌ ERROR: ${errorMsg}`]);
        throw new Error(errorMsg);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        let snippet = text.trim().substring(0, 300);
        if (snippet.includes("<!DOCTYPE") || snippet.includes("<html") || snippet.includes("<body")) {
          const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
          const h1Match = text.match(/<h1>([\s\S]*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const h1 = h1Match ? h1Match[1].trim() : "";
          let detail = "";
          if (h1) detail = ` (Server reported: ${h1})`;
          else if (title) detail = ` (Server reported: ${title})`;
          throw new Error(`The server returned an unexpected HTML page${detail}. This may be due to a network timeout, proxy redirection, or payload size limit. Please try using a smaller PDF file or configure a custom API key.`);
        }
        throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}. Response: ${snippet}`);
      }

      const data = await response.json();
      const rawPuzzles = data.puzzles || [];
      const puzzles = rawPuzzles.map((p: any) => {
        if (p?.type === "blank") {
          return sanitizeBlankPuzzle(p);
        }
        if (p?.type === "matching") {
          const pairs = extractMatchingPairs(p, "", p.sourceSlideNumber);
          const cleanTitleStr = cleanMatchingTitle(p.title);
          return { ...p, pairs, title: cleanTitleStr };
        }
        return p;
      });
      setQuizDebugLogs(prev => [...prev, `✅ SUCCESS: Drafted ${puzzles.length} interactive puzzles across your slide deck.`]);
      setOverallPuzzles(puzzles);
      setTotalPuzzlesNeeded(puzzles.length);
    } catch (err: any) {
      console.error("[handleStartOverallQuiz] Error:", err);
      const errorStr = err.message || "Failed to generate the practice puzzles.";
      setQuizDebugLogs(prev => [...prev, `❌ CRITICAL FAILURE: ${errorStr}`]);
      addPopupError("Practice Puzzles Failed", errorStr, err.stack || err.toString());
    } finally {
      setIsQuizPlanning(false);
      setIsQuizGenerating(false);
    }
  };

  const handleGenerateMorePuzzles = async () => {
    if (!pdfBase64) return;
    setIsQuizGenerating(true);
    setQuizDebugLogs(prev => [...prev, "Contacting AI professor to fill in remaining gaps..."]);
    setError(null);
    try {
      const response = await fetch("/api/generate-final-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          customApiKey: customApiKey || undefined,
          selectedModel: quizModel === "custom" ? customModelId : quizModel,
          existingPuzzles: overallPuzzles
        })
      });
      
      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "Failed to generate more puzzles.";
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 150)}`;
        }
        throw new Error(errorMsg);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        let snippet = text.trim().substring(0, 300);
        if (snippet.includes("<!DOCTYPE") || snippet.includes("<html") || snippet.includes("<body")) {
          const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
          const h1Match = text.match(/<h1>([\s\S]*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const h1 = h1Match ? h1Match[1].trim() : "";
          let detail = "";
          if (h1) detail = ` (Server reported: ${h1})`;
          else if (title) detail = ` (Server reported: ${title})`;
          throw new Error(`The server returned an unexpected HTML page${detail}. This may be due to a network timeout, proxy redirection, or payload size limit. Please try using a smaller PDF file or configure a custom API key.`);
        }
        throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}. Response: ${snippet}`);
      }

      const data = await response.json();
      const rawPuzzles = data.puzzles || [];
      const puzzles = rawPuzzles.map((p: any) => {
        if (p?.type === "blank") {
          return sanitizeBlankPuzzle(p);
        }
        if (p?.type === "matching") {
          const pairs = extractMatchingPairs(p, "", p.sourceSlideNumber);
          const cleanTitleStr = cleanMatchingTitle(p.title);
          return { ...p, pairs, title: cleanTitleStr };
        }
        return p;
      });
      setQuizDebugLogs(prev => [...prev, `✅ SUCCESS: Drafted ${puzzles.length} additional puzzles to fill the gaps.`]);
      setOverallPuzzles(prev => [...prev, ...puzzles]);
      setTotalPuzzlesNeeded(prev => prev + puzzles.length);
      setHasGeneratedMorePuzzles(true);
    } catch (err: any) {
      console.error("[handleGenerateMorePuzzles] Error:", err);
      const errorStr = err.message || "Failed to generate more practice puzzles.";
      setQuizDebugLogs(prev => [...prev, `❌ CRITICAL FAILURE: ${errorStr}`]);
      addPopupError("Practice Puzzles Failed", errorStr, err.stack || err.toString());
    } finally {
      setIsQuizGenerating(false);
    }
  };

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
          endSlide: totalPdfPages,
          totalPdfPages: totalPdfPages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "An error occurred while generating explanations.";
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 150)}`;
        }
        throw new Error(errorMsg);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        let snippet = text.trim().substring(0, 300);
        if (snippet.includes("<!DOCTYPE") || snippet.includes("<html") || snippet.includes("<body")) {
          const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
          const h1Match = text.match(/<h1>([\s\S]*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const h1 = h1Match ? h1Match[1].trim() : "";
          let detail = "";
          if (h1) detail = ` (Server reported: ${h1})`;
          else if (title) detail = ` (Server reported: ${title})`;
          throw new Error(`The server returned an unexpected HTML page${detail}. This may be due to a network timeout, proxy redirection, or payload size limit. Please try using a smaller PDF file or configure a custom API key.`);
        }
        throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}. Response: ${snippet}`);
      }

      const data = await response.json();

      setExplanation(data);
      
      // Merge new explanations into our dictionary
      const updated: { [slideNumber: number]: ContentBlock[] } = { ...slideExplanations };
      if (data.explanations && Array.isArray(data.explanations)) {
        data.explanations.forEach((item: any) => {
          updated[item.slideNumber] = item.blocks;
        });
      }
      setSlideExplanations(updated);

      // Track all slide numbers from data.startSlide to data.endSlide as processed
      const updatedProcessed = { ...processedSlides };
      const actualStart = data.startSlide || start;
      const actualEnd = data.endSlide || start;
      for (let i = actualStart; i <= actualEnd; i++) {
        updatedProcessed[i] = true;
      }
      setProcessedSlides(updatedProcessed);

      if (data.totalSlides) {
        setTotalPdfPages(data.totalSlides);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Something went wrong. Please try again.";
      addPopupError("Slide Analysis Failed", msg, err.stack || err.toString());
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateNotes = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerateNotesForRange(startSlideInput);
  };

  // Auto pre-load the fully configured Machine Learning demo
  const handleLoadDemo = () => {
    setError(null);
    setPdfBase64(DEMO_PDF_BASE64);
    setPdfName("llms_and_transformers_masterclass.pdf");
    setExplanation(DEMO_EXPLANATION);
    
    const demoMap: { [num: number]: ContentBlock[] } = {};
    const processedMap: { [num: number]: boolean } = {};
    DEMO_EXPLANATION.explanations.forEach((item) => {
      demoMap[item.slideNumber] = item.blocks;
      processedMap[item.slideNumber] = true;
    });
    // For demo, treat all demo slides as fully processed
    const totalCount = DEMO_EXPLANATION.totalSlides || 12;
    for (let i = 1; i <= totalCount; i++) {
      processedMap[i] = true;
    }
    setSlideExplanations(demoMap);
    setProcessedSlides(processedMap);
    setTotalPdfPages(totalCount);
    setCurrentPdfPage(1);
    setShowQuiz({});
    setShowExampleProblem({});
    setQuizAnswers({});
    setSubchatMessages({});
    setCurrentSubchatInput("");
    setSubchatError(null);
    setOverallPuzzles([]);
    setTotalPuzzlesNeeded(0);
    setHasGeneratedMorePuzzles(false);
    setIsQuizPlanning(false);
    setIsQuizGenerating(false);
    setOverallQuizAnswers({});
    scrollPositionsRef.current = {};
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
    setTotalPdfPages(0);
    setStartSlideInput(1);
    setSubchatMessages({});
    setCurrentSubchatInput("");
    setSubchatError(null);
    setPanelPos({ x: -1, y: -1 });
    setPanelMinimized(false);
    setActiveTab("notes");
    setShowQuiz({});
    setShowExampleProblem({});
    setQuizAnswers({});
    setOverallPuzzles([]);
    setTotalPuzzlesNeeded(0);
    setHasGeneratedMorePuzzles(false);
    setIsQuizPlanning(false);
    setIsQuizGenerating(false);
    setOverallQuizAnswers({});
    scrollPositionsRef.current = {};
  };

  // Submit slide-specific follow-up question
  const handleSendSubchatMessage = async (customText?: string) => {
    const textToSend = (customText || currentSubchatInput).trim();
    if (!textToSend) return;

    const slideNum = currentPdfPage;
    const blocks = slideExplanations[slideNum] || [];
    const slideExplanation = blocks.map(b => b.content).join("\n\n");
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
          pdfBase64: pdfBase64 || undefined,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = "Failed to fetch response from Slide Assistant.";
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || errorMsg;
        } catch {
          errorMsg = `Server error (${response.status}): ${text.substring(0, 150)}`;
        }
        throw new Error(errorMsg);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        let snippet = text.trim().substring(0, 300);
        if (snippet.includes("<!DOCTYPE") || snippet.includes("<html") || snippet.includes("<body")) {
          const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/i);
          const h1Match = text.match(/<h1>([\s\S]*?)<\/h1>/i);
          const title = titleMatch ? titleMatch[1].trim() : "";
          const h1 = h1Match ? h1Match[1].trim() : "";
          let detail = "";
          if (h1) detail = ` (Server reported: ${h1})`;
          else if (title) detail = ` (Server reported: ${title})`;
          throw new Error(`The server returned an unexpected HTML page${detail}. This may be due to a network timeout, proxy redirection, or payload size limit. Please try using a smaller PDF file or configure a custom API key.`);
        }
        throw new Error(`Expected JSON response but received ${contentType || "unknown content type"}. Response: ${snippet}`);
      }

      const data = await response.json();

      setSubchatMessages((prev) => ({
        ...prev,
        [slideNum]: [...updatedMessages, { role: "model" as const, text: data.reply }],
      }));
    } catch (err: any) {
      console.error(err);
      addPopupError("Slide Tutor Error", err.message || "An error occurred during communication.", err.stack || err.toString());
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
    { key: "Memory Hook", label: "Memory Hook", textColor: "text-fuchsia-400", shadowClass: "shadow-[0_0_20px_rgba(217,70,239,0.06)] border-fuchsia-500/20" },
    { key: "Key Concept", label: "Key Concept", textColor: "text-rose-400", shadowClass: "shadow-[0_0_20px_rgba(244,63,94,0.06)] border-rose-500/20" },
    { key: "Intuition", label: "Intuition", textColor: "text-amber-400", shadowClass: "shadow-[0_0_20px_rgba(245,158,11,0.06)] border-amber-500/20" },
    { key: "Real-World", label: "Real-World Example", textColor: "text-emerald-400", shadowClass: "shadow-[0_0_20px_rgba(16,185,129,0.06)] border-emerald-500/20" },
    { key: "Architecture Walkthrough", label: "Architecture Walkthrough", textColor: "text-blue-400", shadowClass: "shadow-[0_0_20px_rgba(59,130,246,0.06)] border-blue-500/20" },
  ];

  const stripMarkerPrefix = (text: string, marker: string): string => {
    const stripped = text.slice(marker.length).replace(/^[:\s-]+/, "");
    return stripped;
  };

  
  const renderInteractiveSection = (currentSlideData: any, isCramMode: boolean) => {
    if (!currentSlideData) return null;
    const rawQuiz = currentSlideData?.quizQuestions || [];
    const matching = currentSlideData?.matchingGames || [];
    const blanks = currentSlideData?.fillInBlanks || [];

    if (rawQuiz.length === 0 && matching.length === 0 && blanks.length === 0) return null;

    const isOpen = showQuiz[currentPdfPage] !== false;
    return (
      <div className={`${isCramMode ? "mb-6 border-b border-slate-800/60 pb-5" : "mt-6 border-t border-slate-800/60 pt-5"}`}>
        <button
          onClick={() => setShowQuiz(prev => ({ ...prev, [currentPdfPage]: !isOpen }))}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors cursor-pointer w-full"
        >
          <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
          Interactive Review (${rawQuiz.length + matching.length + blanks.length} items)
          {isOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {isOpen && (
          <div className="mt-4 space-y-6 animate-fade-in">
            {/* Matching Games */}
            {matching.length > 0 && (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4.5 space-y-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">Matching Game</div>
                <div className="space-y-6">
                  {matching.map((m: any, i: number) => {
                    const resolvedPairs = extractMatchingPairs(m, "", currentPdfPage);
                    const isCompleted = matchingAnswers[currentPdfPage]?.[i] === true;
                    return (
                      <div key={i} className="space-y-3">
                        <InteractiveMatching 
                          pairs={resolvedPairs}
                          title={cleanMatchingTitle(m.title)}
                          isCompleted={isCompleted}
                          onComplete={() => setMatchingAnswers(prev => ({...prev, [currentPdfPage]: {...(prev[currentPdfPage]||{}), [i]: true}}))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Fill in Blanks */}
            {blanks.length > 0 && (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4.5 space-y-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-200 uppercase tracking-wide">Fill in the Blanks</div>
                <div className="space-y-4">
                  {blanks.map((b: any, i: number) => {
                    const cleanBlank = sanitizeBlankPuzzle(b);
                    return (
                      <InteractiveBlank 
                        key={i}
                        sentenceBefore={cleanBlank.sentenceBefore}
                        blankWord={cleanBlank.blankWord}
                        sentenceAfter={cleanBlank.sentenceAfter}
                        isCompleted={fillInAnswers[currentPdfPage]?.[i] === true}
                        onComplete={() => setFillInAnswers(prev => ({...prev, [currentPdfPage]: {...(prev[currentPdfPage]||{}), [i]: true}}))}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quizzes */}
            {rawQuiz.length > 0 && (
              <div className="space-y-4">
                {rawQuiz.map((q: any, qi: number) => {
                  const displayOptions = (q?.options || []).map((opt: string, idx: number) => ({ opt: opt || "", idx }));
                  const selectedOption = quizAnswers[currentPdfPage]?.[qi];
                  const isAnswered = selectedOption !== undefined;
                  return (
                    <div key={qi} className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4.5 space-y-4 shadow-sm">
                      <div className="flex items-start gap-2.5">
                        <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-500/20 uppercase tracking-wider shrink-0 mt-0.5">
                          Q{qi + 1}
                        </span>
                        <div className="text-xs font-semibold text-slate-200 leading-relaxed">
                          <SafeMarkdown >
                            {q?.question || ""}
                          </SafeMarkdown>
                        </div>
                      </div>
                      <div className="space-y-2 pl-9">
                        {displayOptions.map((optionObj) => {
                          const isSelected = selectedOption === optionObj.idx;
                          const isCorrect = optionObj.idx === q?.correctIndex;
                          let btnClass = "bg-slate-900 border-slate-800 hover:border-slate-600 text-slate-300";
                          if (isAnswered) {
                            if (isCorrect) btnClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
                            else if (isSelected) btnClass = "bg-rose-500/10 border-rose-500/30 text-rose-300";
                            else btnClass = "bg-slate-900 border-slate-800 text-slate-500 opacity-50";
                          }
                          return (
                            <button
                              key={optionObj.idx}
                              onClick={() => {
                                if (isAnswered) return;
                                setQuizAnswers(prev => ({
                                  ...prev,
                                  [currentPdfPage]: {
                                    ...(prev[currentPdfPage] || {}),
                                    [qi]: optionObj.idx
                                  }
                                }));
                              }}
                              disabled={isAnswered}
                              className={`w-full text-left p-3 rounded-xl border transition-all duration-200 text-xs flex items-center justify-between group cursor-pointer ${btnClass}`}
                            >
                              <div className="flex-1"><SafeMarkdown >{optionObj.opt}</SafeMarkdown></div>
                              {isAnswered && isCorrect && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                              {isAnswered && isSelected && !isCorrect && <X className="h-4 w-4 text-rose-400 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      {isAnswered && (
                        <div className="pl-9 mt-4 animate-fade-in">
                          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${selectedOption === q?.correctIndex ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-200/90" : "bg-slate-800/40 border-slate-700/50 text-slate-300"}`}>
                            <Info className={`h-4 w-4 shrink-0 mt-0.5 ${selectedOption === q?.correctIndex ? "text-emerald-400" : "text-sky-400"}`} />
                            <div className="flex-1"><SafeMarkdown >{q?.explanation || ""}</SafeMarkdown></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
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
              <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-white">
                PDF Slide Explainer
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Generate structured lecture notes, analogies, and quizzes from your slide PDFs.
              </p>
            </div>

            <form onSubmit={handleGenerateNotes} className="space-y-6">
              {/* Error display — always at the top */}
              {error && (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-xs text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}
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
                  <div className="flex flex-col items-center justify-center space-y-4 p-4 animate-fade-in w-full">
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

                    {/* Beautiful Dynamic Slider for Starting Slide Selection inside Upload Box */}
                    <div className="w-full max-w-xs md:max-w-md p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-3 mt-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400 font-medium">Start analyzing from:</span>
                        <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                          Slide {startSlideInput} {totalPdfPages > 0 ? `of ${totalPdfPages}` : ""}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-500">1</span>
                        <input
                          type="range"
                          min={1}
                          max={totalPdfPages || 100}
                          value={startSlideInput}
                          onChange={(e) => setStartSlideInput(Math.min(totalPdfPages || 100, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
                        />
                        <span className="text-[10px] font-bold text-slate-500">{totalPdfPages || 100}</span>
                      </div>
                      <span className="text-[9px] text-slate-500 block leading-tight text-center">
                        Slide {startSlideInput} and forward will be converted into structured learning tracks.
                      </span>
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
                      Gemini API Key{" "}
                      {serverConfig?.requireUserKey ? (
                        <span className="text-rose-400 font-bold">(Required)</span>
                      ) : (
                        <span className="text-slate-500">(Optional)</span>
                      )}
                    </label>
                    <input
                      id="custom-api-key"
                      type="password"
                      placeholder="AIza..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className={`w-full text-xs bg-slate-950 border rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 placeholder:text-slate-600 ${
                        serverConfig?.requireUserKey && !customApiKey.trim() ? "border-rose-500/50" : "border-slate-800"
                      }`}
                    />
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      {serverConfig?.requireUserKey ? (
                        <span className="text-rose-400/80">This public instance strictly requires you to enter your own API key.</span>
                      ) : serverConfig?.hasServerKey ? (
                        <span>The server has a global key configured; leave empty to use it, or enter yours for high-volume limits.</span>
                      ) : (
                        <span>No global key configured. Please enter your Gemini API key to proceed.</span>
                      )}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="selected-model" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Model
                    </label>
                    <select
                      id="selected-model"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200 cursor-pointer"
                    >
                      <option value="gemini-flash-lite-latest">Gemini Flash Lite (Fast & Budget-friendly)</option>
                      <option value="gemini-flash-latest">Gemini Flash (Latest)</option>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                      <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                      <option value="gemma-4-31b-it">Gemma 4 31B</option>
                      <option value="custom">Custom Model ID</option>
                    </select>
                    {selectedModel === "custom" && (
                      <div className="mt-2 space-y-1 animate-fade-in">
                        <label htmlFor="custom-model-id" className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                          Custom Model Identifier
                        </label>
                        <input
                          id="custom-model-id"
                          type="text"
                          value={customModelId}
                          onChange={(e) => setCustomModelId(e.target.value)}
                          placeholder="e.g., gemma-2-27b-it"
                          className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-200"
                        />
                      </div>
                    )}
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      Using high-speed, optimized language models tailored for deep document analysis.
                    </span>
                  </div>
                </div>

                {/* Learning Strategy / Track Selector */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Style
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
                          <span>Auto</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Detects subject type and adapts style automatically.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 mt-1">Recommended</span>
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
                          <span>STEM / Logic</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Deep "why" explanations, derivations, and beginner analogies.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mt-1">First-Principles</span>
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
                          <span>Stories & Mnemonics</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Vivid stories and memory hooks to make facts stick.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 mt-1">Memory Recall</span>
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
                          <span>Cram</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                          Dense bullet summaries, key formulas, and exam facts only.
                        </p>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mt-1">Exam Prep</span>
                    </button>
                  </div>
                </div>

                {/* Advanced Custom Guidelines - Nested clearly as a combined addon */}
                <div className="space-y-2 border-t border-slate-800/80 pt-4">
                  <label htmlFor="custom-instructions" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                    Custom Hints
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Optional add-on instructions merged with the style above.
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
                  Generate Notes
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

              {/* Error display — removed from bottom, now at top */}
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
                      Choose the slide number to start generating notes from.
                    </p>
                  </div>

                  <form onSubmit={handleGenerateNotes} className="w-full space-y-4">
                    <div className="flex items-center gap-2">
                      <label htmlFor="startSlide" className="text-xs font-semibold text-slate-300">Start from slide:</label>
                      <input 
                        id="startSlide"
                        type="number" 
                        min="1"
                        max={totalPdfPages || 999}
                        value={startSlideInput} 
                        onChange={(e) => setStartSlideInput(parseInt(e.target.value) || 1)}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white w-16 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      id="study-slides-btn"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate Notes
                    </button>
                    {error && (
                      <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-xs text-rose-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" />
                        <span>{error}</span>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}

            {/* 3. Overlays - Analyzing Loader & Progress Bar (Full screen ONLY if no prior explanation) */}
            {!explanation && isAnalyzing && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm z-30 p-4">
                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 p-8 rounded-2xl max-w-md w-full shadow-2xl animate-fade-in text-center space-y-6">
                  <div className="relative mx-auto w-14 h-14">
                    <div className="h-14 w-14 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
                    <Sparkles className="h-5 w-5 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Analyzing Slides
                    </h3>
                    <p className="text-xs text-slate-400">
                      Generating notes...
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
            {explanation && (
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
                  ref={panelRef}
                  onMouseEnter={() => setIsPanelHovered(true)}
                  onMouseLeave={() => setIsPanelHovered(false)}
                  style={{
                    position: "absolute",
                    left: panelPos.x !== -1 ? `${panelPos.x}px` : "auto",
                    right: panelPos.x === -1 ? "24px" : "auto",
                    top: panelPos.y !== -1 ? `${panelPos.y}px` : "72px",
                    width: `${panelSize.width}px`,
                    height: `${panelSize.height}px`,
                    zIndex: 40,
                  }}
                  className={`flex flex-col overflow-hidden animate-fade-in text-left rounded-2xl ${
                    isDragging || isResizing ? "transition-none" : "transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-in-out"
                  } ${
                    isPanelHovered || isDragging || isResizing
                      ? "bg-slate-950/65 backdrop-blur-md border border-slate-700/40 shadow-2xl"
                      : "bg-transparent backdrop-blur-none border border-slate-700/30 shadow-none pointer-events-auto"
                  }`}
                >
                  {/* Fading inner container for text/header */}
                  <div className={`flex flex-col h-full w-full transition-opacity duration-300 ${isPanelHovered || isDragging || isResizing ? "opacity-100" : "opacity-0"}`}>
                  {/* Draggable Header Bar */}
                  <div
                    onMouseDown={handleDragMouseDown}
                    className={`h-14 border-b px-4 flex items-center justify-between select-none shrink-0 cursor-grab active:cursor-grabbing transition-all duration-300 ${
                      isPanelHovered ? "bg-slate-950/60 border-slate-800/60" : "bg-transparent border-transparent"
                    }`}
                    title="Drag header to reposition"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono transition-all duration-300 ${
                        isPanelHovered ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-500/10 text-indigo-400"
                      }`}>
                        Slide {currentPdfPage}
                      </span>
                    </div>

                    {/* Navigation tabs inside header */}
                    <div 
                      className={`flex border p-0.5 rounded-lg text-[10px] font-bold transition-all duration-300 ${
                        isPanelHovered ? "bg-slate-950 border-slate-800/80" : "bg-transparent border-transparent"
                      }`}
                      onClick={(e) => e.stopPropagation()} // Stop propagation so clicking tabs doesn't drag
                    >
                      <button
                        type="button"
                        onClick={() => setActiveTab("notes")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeTab === "notes"
                            ? isPanelHovered ? "bg-indigo-600 text-white shadow" : "bg-indigo-600/20 text-indigo-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <BookOpen className="h-3 w-3" />
                        Notes
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("chat")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeTab === "chat"
                            ? isPanelHovered ? "bg-indigo-600 text-white shadow" : "bg-indigo-600/20 text-indigo-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Ask AI
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("quiz")}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeTab === "quiz"
                            ? isPanelHovered ? "bg-indigo-600 text-white shadow" : "bg-indigo-600/20 text-indigo-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <HelpCircle className="h-3 w-3" />
                        Overall Quiz
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
                        const blocks = slideExplanations[currentPdfPage] || [];
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
                        if (blocks.length > 0) {
                          return (
                            <div 
                              ref={notesScrollRef} 
                              onScroll={(e) => {
                                scrollPositionsRef.current[currentPdfPage] = e.currentTarget.scrollTop;
                              }}
                              className="p-5 md:p-6 overflow-y-auto flex-1 custom-scrollbar"
                            >
                              <div className="text-sm leading-relaxed text-slate-300 pb-8 space-y-4">
                                {blocks.map((block, idx) => {
                                  if (block.type === "callout") {
                                    const markerKey = block.calloutType === "Real-World Example" ? "Real-World" : block.calloutType;
                                    const marker = SECTION_MARKERS.find(m => m.key.toLowerCase() === markerKey?.toLowerCase()) || SECTION_MARKERS[0];
                                    
                                    if (block.calloutType === "Memory Hook") {
                                      return (
                                        <details
                                          key={idx}
                                          className={`border p-5 rounded-2xl my-5 text-xs md:text-sm relative overflow-hidden transition-colors duration-500 bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40 hover:border-slate-700/80 ${marker.shadowClass} group cursor-pointer`}
                                        >
                                          <summary className={`font-bold flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-display ${marker.textColor} list-none outline-none`}>
                                            <Sparkles className="h-3.5 w-3.5" />
                                            {marker.label}
                                            <span className="ml-auto bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] px-2 py-0.5 rounded-full group-open:hidden flex items-center gap-1">
                                              <ChevronDown className="h-3 w-3" /> Click to reveal
                                            </span>
                                          </summary>
                                          <div className="text-slate-200 leading-relaxed font-sans pt-3 animate-fade-in border-t border-slate-800/60 mt-3">
                                            <SafeMarkdown>
                                              {block.content}
                                            </SafeMarkdown>
                                          </div>
                                        </details>
                                      );
                                    }

                                    return (
                                      <div
                                        key={idx}
                                        className={`border p-5 rounded-2xl my-5 text-xs md:text-sm relative overflow-hidden transition-colors duration-500 bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40 hover:border-slate-700/80 ${marker.shadowClass}`}
                                      >
                                        <span className={`font-bold flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-2 font-display ${marker.textColor}`}>
                                          {marker.label}
                                        </span>
                                        <div className="text-slate-200 leading-relaxed font-sans">
                                          <SafeMarkdown>
                                            {block.content}
                                          </SafeMarkdown>
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <SafeMarkdown key={idx}>
                                        {block.content}
                                      </SafeMarkdown>
                                    );
                                  }
                                })}
                              </div>

                                {/* Quiz Questions */}
                                {(() => {
                                  const currentSlideData = explanation?.explanations?.find(e => e.slideNumber === currentPdfPage);
                                  const rawQuiz = currentSlideData?.quizQuestions;
                                  if (!rawQuiz || rawQuiz.length === 0) return null;

                                  const isOpen = showQuiz[currentPdfPage] !== false;
                                  return (
                                    <div className="mt-6 border-t border-slate-800/60 pt-5">
                                      <button
                                        onClick={() => setShowQuiz(prev => ({ ...prev, [currentPdfPage]: !isOpen }))}
                                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors cursor-pointer w-full"
                                      >
                                        <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
                                        Interactive Quiz ({rawQuiz.length})
                                        {isOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                                      </button>
                                      {isOpen && (
                                        <div className="mt-3 space-y-5 animate-fade-in">
                                          {rawQuiz.map((q, qi) => {
                                            const displayOptions = q.options.map((opt, idx) => ({ opt, idx }));
                                            const selectedOption = quizAnswers[currentPdfPage]?.[qi];
                                          const isAnswered = selectedOption !== undefined;
                                          return (
                                            <div key={qi} className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4.5 space-y-4 shadow-sm">
                                              <div className="flex items-start gap-2.5">
                                                <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-500/20 uppercase tracking-wider shrink-0 mt-0.5">
                                                  Q{qi + 1}
                                                </span>
                                                <div className="text-xs font-semibold text-slate-200 leading-relaxed">
                                                  <SafeMarkdown >
                                                    {q.question}
                                                  </SafeMarkdown>
                                                </div>
                                              </div>
                                              
                                              <div className="space-y-2">
                                                {displayOptions.map((optObj, oi) => {
                                                  const letter = ["A", "B", "C", "D"][oi];
                                                  const isSelected = selectedOption === optObj.idx;
                                                  const isCorrect = optObj.idx === q.correctIndex;
                                                  
                                                  let optionClass = "bg-slate-900/40 border border-slate-800/60 text-slate-300 hover:border-indigo-500/30 hover:bg-slate-800/20 cursor-pointer";
                                                  let letterClass = "bg-slate-800 text-slate-400";
                                                  
                                                  if (isAnswered) {
                                                    if (isCorrect) {
                                                      optionClass = "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium";
                                                      letterClass = "bg-emerald-500/30 text-emerald-200";
                                                    } else if (isSelected) {
                                                      optionClass = "bg-rose-500/10 border border-rose-500/30 text-rose-300 font-medium";
                                                      letterClass = "bg-rose-500/30 text-rose-200";
                                                    } else {
                                                      optionClass = "bg-slate-950/20 border border-slate-900/60 text-slate-500 opacity-60";
                                                      letterClass = "bg-slate-900 text-slate-600";
                                                    }
                                                  }
                                                  
                                                  return (
                                                    <button
                                                      key={oi}
                                                      disabled={isAnswered}
                                                      onClick={() => {
                                                        setQuizAnswers(prev => ({
                                                          ...prev,
                                                          [currentPdfPage]: {
                                                            ...(prev[currentPdfPage] || {}),
                                                            [qi]: optObj.idx
                                                          }
                                                        }));
                                                      }}
                                                      className={`w-full text-left flex items-start gap-3 text-xs p-3 rounded-xl transition-all ${optionClass} group`}
                                                    >
                                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 transition-colors ${letterClass}`}>
                                                        {letter}
                                                      </span>
                                                      <div className="flex-1 leading-normal pt-0.5">
                                                        <SafeMarkdown >
                                                          {optObj.opt}
                                                        </SafeMarkdown>
                                                      </div>
                                                    </button>
                                                  );
                                                })}
                                              </div>

                                              {isAnswered && (
                                                <div className="mt-3.5 p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2 animate-fade-in">
                                                  <div className="flex items-center gap-2">
                                                    {selectedOption === q.correctIndex ? (
                                                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                                        Correct Answer!
                                                      </span>
                                                    ) : (
                                                      <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                                        Incorrect
                                                      </span>
                                                    )}
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                      Correct: Option {["A", "B", "C", "D"][q.correctIndex]}
                                                    </span>
                                                  </div>
                                                  <div className="text-[11px] text-slate-300 leading-relaxed font-normal">
                                                    <SafeMarkdown >
                                                      {q.explanation}
                                                    </SafeMarkdown>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Example practice problem for Math/Calculation heavy slides */}
                              {(() => {
                                const currentSlideData = explanation?.explanations?.find(e => e.slideNumber === currentPdfPage);
                                const example = currentSlideData?.exampleProblem;
                                if (!example || !example.problem) return null;
                                const isOpen = showExampleProblem[currentPdfPage] !== false; // open by default for maximum value
                                return (
                                  <div className="mt-6 border-t border-slate-800/60 pt-5">
                                    <button
                                      type="button"
                                      onClick={() => setShowExampleProblem(prev => ({ ...prev, [currentPdfPage]: !isOpen }))}
                                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors cursor-pointer w-full"
                                    >
                                      <Zap className="h-3.5 w-3.5 text-amber-400" />
                                      Step-by-Step Practice Problem
                                      {isOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                                    </button>
                                    {isOpen && (
                                      <div className="mt-3 space-y-5 animate-fade-in text-slate-200">
                                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 shadow-sm space-y-4">
                                          {/* Problem statement */}
                                          <div className="space-y-2">
                                            <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
                                              Practice Problem
                                            </span>
                                            <div className="text-xs font-semibold text-slate-200 leading-relaxed pt-1.5">
                                              <SafeMarkdown >
                                                {example.problem}
                                              </SafeMarkdown>
                                            </div>
                                          </div>

                                          {/* Timeline solver steps */}
                                          <div className="border-t border-slate-800/60 pt-4 space-y-5 relative">
                                            <div className="absolute left-[13px] top-5 bottom-4 w-0.5 bg-slate-800" /> {/* vertical timeline connector line */}
                                            {example.steps.map((step, idx) => (
                                              <div key={idx} className="flex gap-4 relative">
                                                <div className="w-7 h-7 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0 z-10 font-mono shadow">
                                                  {idx + 1}
                                                </div>
                                                <div className="flex-1 pt-0.5 space-y-1">
                                                  <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest font-mono">
                                                    Step {idx + 1}
                                                  </span>
                                                  <div className="text-xs text-slate-300 leading-relaxed">
                                                    <SafeMarkdown >
                                                      {step}
                                                    </SafeMarkdown>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Final Answer panel */}
                                          <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex items-center gap-3">
                                            <CheckCircle2 className="h-5 w-5 text-amber-400 shrink-0" />
                                            <div>
                                              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">Final Solution</p>
                                              <div className="text-xs text-slate-100 font-semibold mt-0.5">
                                                <SafeMarkdown >
                                                  {example.finalAnswer}
                                                </SafeMarkdown>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}


                              {/* Bottom interactive navigation footer inside note */}
                              <div className="mt-6 pt-5 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-500 font-mono">
                                <span>Slide {currentPdfPage} of {totalPdfPages || "?"}</span>
                                
                              {isAnalyzing ? (
                                <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold py-2">
                                  <Sparkles className="h-4 w-4 animate-spin" />
                                  <span>Generating...</span>
                                </div>
                              ) : (
                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                  {recommendedNextBatchStart !== -1 && (
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className={`text-[9px] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer border transition-all duration-300 ${
                                          isPanelHovered ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-900 border-transparent text-slate-400"
                                        }`}
                                        title="Model for next batch"
                                      >
                                        <option value="gemini-flash-lite-latest">Flash Lite</option>
                                        <option value="gemini-flash-latest">Flash (Latest)</option>
                                        <option value="gemini-3.5-flash">3.5 Flash</option>
                                        <option value="gemini-3-flash-preview">3 Flash Preview</option>
                                        <option value="gemma-4-31b-it">Gemma 4</option>
                                        <option value="custom">Custom</option>
                                      </select>

                                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 ${
                                        isPanelHovered ? "bg-indigo-600 border-indigo-500 shadow-md shadow-indigo-600/20" : "bg-indigo-600/20 border-transparent"
                                      }`}>
                                        <button
                                          onClick={() => handleGenerateNotesForRange(recommendedNextBatchStart)}
                                          className={`font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-[10px] ${
                                            isPanelHovered ? "text-white" : "text-indigo-400"
                                          }`}
                                          title={`Continue generating from slide ${recommendedNextBatchStart}`}
                                        >
                                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                          Continue
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${
                                    isPanelHovered ? "bg-slate-950/60 border-slate-800/80" : "bg-transparent border-transparent"
                                  }`}>
                                    <button
                                      onClick={() => handleGenerateNotesForRange(currentPdfPage)}
                                      className="text-slate-400 hover:text-slate-200 font-bold flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
                                      title="Regenerate this slide and onwards"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                    </button>
                                  </div>
                                </div>
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
                              
                              {isAnalyzing ? (
                                <div className="bg-indigo-600/50 text-white font-semibold py-2 px-4 rounded-xl text-[10px] w-full flex items-center justify-center gap-2">
                                  <Sparkles className="h-3 w-3 animate-spin" /> Generating...
                                </div>
                              ) : (
                                <div className="w-full space-y-3">
                                  <button
                                    onClick={() => handleGenerateNotesForRange(currentPdfPage)}
                                    className={`p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center mx-auto ${
                                      isPanelHovered
                                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300 shadow-sm"
                                        : "bg-transparent text-slate-500"
                                    }`}
                                    title="Regenerate from this slide"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                </div>
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
                              {isAnalyzing ? (
                                <div className="bg-indigo-600/50 text-white font-semibold py-2 px-4 rounded-xl text-[10px] w-full flex items-center justify-center gap-2">
                                  <Sparkles className="h-3 w-3 animate-spin" /> Generating...
                                </div>
                              ) : (
                                <div className="w-full space-y-3">
                                  <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className={`w-full text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer border transition-all duration-300 ${
                                      isPanelHovered ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-900 border-transparent text-slate-400"
                                    }`}
                                    title="Choose AI Model"
                                  >
                                    <option value="gemini-flash-lite-latest">Gemini Flash Lite (Default)</option>
                                    <option value="gemini-flash-latest">Gemini Flash (Latest)</option>
                                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                                    <option value="gemma-4-31b-it">Gemma 4 31B</option>
                                    <option value="custom">Custom Model ID</option>
                                  </select>

                                  <button
                                    onClick={() => handleGenerateNotesForRange(currentPdfPage)}
                                    className={`font-semibold py-2 px-4 rounded-xl text-[10px] transition-all cursor-pointer w-full flex items-center justify-center gap-1.5 ${
                                      isPanelHovered
                                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25"
                                        : "bg-indigo-600/20 text-indigo-400 shadow-none"
                                    }`}
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    Explain Slide {currentPdfPage}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        }
                      })()
                    ) : activeTab === "chat" ? (
                      /* Tab 2: Ask AI Chat Walkthrough */
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Model selector for chat */}
                        <div className={`px-3 pt-3 pb-0 flex flex-col gap-2 border-b pb-2.5 shrink-0 transition-all duration-300 ${
                          isPanelHovered ? "border-slate-800/40" : "border-transparent"
                        }`}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold shrink-0">Tutor Model</span>
                            <select
                              value={subchatModel}
                              onChange={(e) => setSubchatModel(e.target.value)}
                              className={`flex-1 text-[10px] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer border transition-all duration-300 ${
                                isPanelHovered ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-transparent border-transparent text-slate-400"
                              }`}
                            >
                              <option value="gemini-flash-lite-latest">Gemini Flash Lite</option>
                              <option value="gemini-flash-latest">Gemini Flash (Latest)</option>
                              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                              <option value="gemma-4-31b-it">Gemma 4 31B</option>
                              <option value="custom">Custom Model ID</option>
                            </select>
                          </div>
                          {subchatModel === "custom" && (
                            <input
                              type="text"
                              value={customModelId}
                              onChange={(e) => setCustomModelId(e.target.value)}
                              placeholder="e.g., gemma-2-27b-it"
                              className="w-full text-[9px] bg-slate-950 border border-slate-800/80 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300 placeholder:text-slate-600 font-medium"
                            />
                          )}
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
                                    <SafeMarkdown >{msg.text}</SafeMarkdown>
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
                          className={`p-3 border-t flex gap-2 items-center flex-shrink-0 transition-all duration-300 ${
                            isPanelHovered ? "bg-slate-950/50 border-slate-800/60" : "bg-transparent border-transparent"
                          }`}
                        >
                          <input
                            type="text"
                            placeholder={`Ask about Slide ${currentPdfPage}...`}
                            value={currentSubchatInput}
                            onChange={(e) => setCurrentSubchatInput(e.target.value)}
                            disabled={isSubchatSending}
                            className={`flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 font-sans border transition-all duration-300 ${
                              isPanelHovered ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-transparent border-transparent text-slate-400"
                            }`}
                          />
                          <button
                            type="submit"
                            disabled={isSubchatSending || !currentSubchatInput.trim()}
                            className={`p-2 rounded-xl disabled:opacity-40 transition-colors text-white cursor-pointer ${
                              isPanelHovered ? "bg-indigo-600 hover:bg-indigo-500" : "bg-indigo-600/20 text-indigo-400"
                            }`}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    ) : (
                      /* Tab 3: Comprehensive Overall Quiz Tab */
                      <div className="flex-1 flex flex-col overflow-hidden">
                        {explanation && (
                          /* Model selector for quiz */
                          <div className={`px-4 pb-2.5 pt-3 flex flex-col gap-2 border-b shrink-0 transition-all duration-300 ${
                            isPanelHovered ? "border-slate-800/40" : "border-transparent"
                          }`}>
                            <div className="flex items-center gap-2 w-full">
                              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold shrink-0">Quiz Model</span>
                              <select
                                value={quizModel}
                                onChange={(e) => setQuizModel(e.target.value)}
                                className={`flex-1 text-[10px] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer border transition-all duration-300 ${
                                  isPanelHovered ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-transparent border-transparent text-slate-400"
                                }`}
                              >
                                <option value="gemini-flash-lite-latest">Gemini Flash Lite (Fast & Budget-friendly)</option>
                                <option value="gemini-flash-latest">Gemini Flash (Latest)</option>
                                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                                <option value="gemma-4-31b-it">Gemma 4 31B</option>
                                <option value="custom">Custom Model ID</option>
                              </select>
                            </div>
                            {quizModel === "custom" && (
                              <input
                                type="text"
                                value={customModelId}
                                onChange={(e) => setCustomModelId(e.target.value)}
                                placeholder="e.g., gemma-2-27b-it"
                                className="w-full text-[9px] bg-slate-950 border border-slate-800/80 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-300 placeholder:text-slate-600 font-medium"
                              />
                            )}
                          </div>
                        )}
                        {!explanation ? (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                            <HelpCircle className="h-10 w-10 text-indigo-400 opacity-60" />
                            <h4 className="font-display font-bold text-slate-200 text-sm">No Lecture Notes Found</h4>
                            <p className="text-xs text-slate-400 max-w-xs">
                              Please run the "Explain Slides" process on the home page first so we can analyze the deck before generating the comprehensive quiz.
                            </p>
                          </div>
                        ) : overallPuzzles.length === 0 && !isQuizPlanning && !isQuizGenerating ? (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 overflow-y-auto">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                              <HelpCircle className="h-6 w-6 text-indigo-400" />
                            </div>
                            <h4 className="font-display font-bold text-slate-200 text-sm">Comprehensive Practice Puzzles</h4>
                            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                              Test your knowledge with custom-designed interactive puzzles generated by <strong>{quizModel === "custom" ? customModelId : quizModel === "gemini-flash-lite-latest" ? "Gemini Flash Lite" : quizModel === "gemini-flash-latest" ? "Gemini Flash" : quizModel}</strong>. We will design standard quizzes, matching terms, and fill-in-the-blanks across the entire lecture!
                            </p>
                            
                            <button
                              type="button"
                              onClick={handleStartOverallQuiz}
                              className="mt-2 w-full max-w-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                            >
                              <Sparkles className="h-3.5 w-3.5" /> Start Lecture Review Puzzles
                            </button>
                          </div>
                        ) : isQuizPlanning || (overallPuzzles.length === 0 && isQuizGenerating) ? (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                            <div className="relative w-12 h-12 flex items-center justify-center">
                              <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin absolute" />
                              <HelpCircle className="h-4 w-4 text-indigo-300" />
                            </div>
                            <h4 className="font-display font-bold text-slate-200 text-sm">
                              {isQuizPlanning ? "Analyzing Course Concepts..." : "Designing Interactive Puzzles..."}
                            </h4>
                            <p className="text-xs text-slate-400 max-w-xs leading-relaxed animate-pulse">
                              {isQuizPlanning 
                                ? "Determining the ideal scope and number of questions to cover all slides..." 
                                : "Drafting matching pairs, MCQs, and fill-in-the-blank puzzles based on slide material..."}
                            </p>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Quiz Header & Progress */}
                            <div className="px-4.5 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between gap-4 shrink-0">
                              <div className="flex flex-col gap-1 flex-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lecture Review Progress</span>
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 bg-slate-800 rounded-full flex-1 overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                                      style={{ width: `${Math.min(100, (Object.keys(overallQuizAnswers).length / (totalPuzzlesNeeded || 1)) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-indigo-400 font-bold shrink-0">
                                    {Object.keys(overallQuizAnswers).length} / {totalPuzzlesNeeded || "?"}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {isQuizGenerating && (
                                  <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg shrink-0 animate-pulse">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    <span>Loading next...</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={handleStartOverallQuiz}
                                  className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                                  title="Regenerate all puzzles"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Puzzles List */}
                            <div className="flex-1 overflow-y-auto p-4.5 space-y-6 custom-scrollbar">
                              {overallPuzzles.map((p, pi) => {
                                return (
                                  <div key={pi} className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4.5 space-y-4 shadow-sm relative overflow-hidden">
                                    {/* Slide reference */}
                                    <button
                                      onClick={() => {
                                        setCurrentPdfPage(p.sourceSlideNumber);
                                      }}
                                      className="absolute top-0 right-0 bg-indigo-500/10 text-indigo-400 text-[9px] font-bold px-2.5 py-1 rounded-bl-xl border-b border-l border-indigo-500/20 uppercase tracking-wider hover:bg-indigo-600 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                      title={`Go to Slide ${p.sourceSlideNumber}`}
                                    >
                                      <span>Slide {p.sourceSlideNumber}</span>
                                      <ArrowRight className="h-2.5 w-2.5" />
                                    </button>

                                    {/* MCQ Type */}
                                    {p.type === "quiz" && (
                                      <div className="space-y-4">
                                        <div className="flex items-start gap-2.5">
                                          <span className="bg-indigo-500/15 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-500/25 uppercase tracking-wider shrink-0 mt-0.5">
                                            Q{pi + 1}
                                          </span>
                                          <div className="text-xs font-semibold text-slate-200 leading-relaxed pr-16">
                                            <SafeMarkdown >
                                              {p?.question || ""}
                                            </SafeMarkdown>
                                          </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                          {(p?.options || []).map((opt: string, optIdx: number) => {
                                            const isAnswered = overallQuizAnswers[pi] !== undefined;
                                            const isSelected = overallQuizAnswers[pi] === optIdx;
                                            const isCorrect = optIdx === p?.correctIndex;
                                            
                                            let btnClass = "bg-slate-900/40 border-slate-800 text-slate-300 hover:border-indigo-500/30 hover:bg-slate-800/10";
                                            if (isAnswered) {
                                              if (isCorrect) btnClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium";
                                              else if (isSelected) btnClass = "bg-rose-500/10 border-rose-500/30 text-rose-300 font-medium";
                                              else btnClass = "bg-slate-900/40 border-slate-800 text-slate-500 opacity-40";
                                            }
                                            
                                            return (
                                              <button
                                                key={optIdx}
                                                disabled={isAnswered}
                                                onClick={() => {
                                                  setOverallQuizAnswers(prev => ({ ...prev, [pi]: optIdx }));
                                                }}
                                                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 text-xs flex items-center justify-between group cursor-pointer ${btnClass}`}
                                              >
                                                <div className="flex-1">
                                                  <SafeMarkdown >{opt || ""}</SafeMarkdown>
                                                </div>
                                                {isAnswered && isCorrect && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                                                {isAnswered && isSelected && !isCorrect && <X className="h-4 w-4 text-rose-400 shrink-0" />}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        
                                        {overallQuizAnswers[pi] !== undefined && (
                                          <div className="mt-3 animate-fade-in">
                                            <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${overallQuizAnswers[pi] === p?.correctIndex ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-200/90" : "bg-slate-800/40 border-slate-700/50 text-slate-300"}`}>
                                              <Info className={`h-4 w-4 shrink-0 mt-0.5 ${overallQuizAnswers[pi] === p?.correctIndex ? "text-emerald-400" : "text-sky-400"}`} />
                                              <div className="flex-1">
                                                <SafeMarkdown >{p?.explanation || ""}</SafeMarkdown>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Matching Pairs Type */}
                                    {p?.type === "matching" && (() => {
                                      const getPairsForPuzzle = (p: any): any[] => {
                                        // Try various common field names the model might use
                                        const pairs = p?.pairs || p?.matchingPairs || p?.matching_pairs || p?.concepts || p?.matching_games || p?.matchingGames;
                                        if (pairs && Array.isArray(pairs) && pairs.length > 0) {
                                          return pairs;
                                        }
                                        if (p?.title) {
                                          try {
                                            const rawText = p.title.trim();
                                            // Handle case where JSON might be embedded in title
                                            if (rawText.includes('"pairs":') || rawText.includes('"concepts":')) {
                                              let jsonToParse = rawText;
                                              if (!jsonToParse.startsWith("{")) {
                                                jsonToParse = `{"title": "${jsonToParse}`;
                                              }
                                              if (!jsonToParse.endsWith("}")) {
                                                jsonToParse = `${jsonToParse}}`;
                                              }
                                              jsonToParse = jsonToParse.replace(/\\"/g, '"');
                                              const parsed = JSON.parse(jsonToParse);
                                              const foundPairs = parsed.pairs || parsed.concepts || parsed.matchingPairs;
                                              if (foundPairs && Array.isArray(foundPairs)) {
                                                return foundPairs;
                                              }
                                            }
                                          } catch (e) {
                                            console.error("Failed to parse pairs from title:", e);
                                          }
                                        }
                                        return [];
                                      };

                                      const getCleanTitle = (p: any): string => {
                                        if (!p?.title) return "Match concepts with their definitions";
                                        const title = p.title.trim();
                                        const idx = title.indexOf('", "pairs"');
                                        if (idx !== -1) {
                                          return title.substring(0, idx).replace(/^["'\s]+|["'\s]+$/g, "");
                                        }
                                        const idx2 = title.indexOf('", pairs');
                                        if (idx2 !== -1) {
                                          return title.substring(0, idx2).replace(/^["'\s]+|["'\s]+$/g, "");
                                        }
                                        return title.replace(/^["'\s]+|["'\s]+$/g, "");
                                      };

                                      const resolvedPairs = getPairsForPuzzle(p);
                                      const cleanTitleStr = getCleanTitle(p);
                                      const isCompleted = overallQuizAnswers[pi] === true;

                                      return (
                                        <div className="space-y-4">
                                          <div className="flex items-start gap-2.5">
                                            <span className="bg-sky-500/15 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded border border-sky-500/25 uppercase tracking-wider shrink-0 mt-0.5">
                                              MATCH
                                            </span>
                                            <div className="text-xs font-semibold text-slate-200 leading-relaxed pr-16">
                                              {cleanTitleStr}
                                            </div>
                                          </div>
                                          
                                          {resolvedPairs.length > 0 ? (
                                            <InteractiveMatching
                                              pairs={resolvedPairs}
                                              isCompleted={isCompleted}
                                              onComplete={() => {
                                                setOverallQuizAnswers((prev: any) => ({ ...prev, [pi]: true }));
                                              }}
                                            />
                                          ) : (
                                            <div className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                                              No matching concepts found for this puzzle.
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* Fill-in-the-Blank Type */}
                                    {p?.type === "blank" && (
                                      <div className="space-y-4">
                                        <div className="flex items-start gap-2.5">
                                          <span className="bg-amber-500/15 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/25 uppercase tracking-wider shrink-0 mt-0.5">
                                            BLANK
                                          </span>
                                          <div className="text-xs font-semibold text-slate-200 leading-relaxed pr-16">
                                            Fill-in-the-Blank Puzzle
                                          </div>
                                        </div>
                                        
                                        <InteractiveBlank
                                          sentenceBefore={p?.sentenceBefore || ""}
                                          blankWord={p?.blankWord || ""}
                                          sentenceAfter={p?.sentenceAfter || ""}
                                          isCompleted={overallQuizAnswers[pi] === true}
                                          onComplete={() => {
                                            setOverallQuizAnswers((prev: any) => ({ ...prev, [pi]: true }));
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              
                              {overallPuzzles.length > 0 && !hasGeneratedMorePuzzles && !isQuizGenerating && (
                                <div className="pt-4 flex justify-center">
                                  <button
                                    onClick={handleGenerateMorePuzzles}
                                    className="bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 px-6 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-2 shadow-sm"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                    Generate More Questions
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
                </div>
              )
            )}
          </div>
        )}
      </main>

      <ErrorOverlay popupErrors={popupErrors} togglePopupDetails={togglePopupDetails} removePopupError={removePopupError} />
    </div>
  );
}
