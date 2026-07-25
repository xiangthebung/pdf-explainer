import React, { useState, useEffect } from "react";
import { Check, Eye } from "lucide-react";
import { SafeMarkdown } from "../utils/markdownComponents";

interface InteractiveBlankProps {
  sentenceBefore: string;
  blankWord: string;
  sentenceAfter: string;
  onComplete: () => void;
  isCompleted: boolean;
}

export function InteractiveBlank({
  sentenceBefore,
  blankWord,
  sentenceAfter,
  onComplete,
  isCompleted,
}: InteractiveBlankProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [sentenceBefore, blankWord, sentenceAfter]);

  const handleReveal = () => {
    setRevealed(true);
    onComplete();
  };

  // Auto-sanitize blankWord if empty or whitespace
  let displayBlank = (blankWord || "").trim();
  let displayBefore = sentenceBefore || "";
  let displayAfter = sentenceAfter || "";

  // Strip brackets or trailing punctuation if present in blankWord
  displayBlank = displayBlank.replace(/^["'\[\(\s]+|["'\]\)\s\.]+$|^\s*blank\s*$/gi, "");

  if (!displayBlank) {
    const match = displayBefore.match(/(?:___+|\[(.*?)\]|\((.*?)\))/);
    if (match) {
      displayBlank = (match[1] || match[2] || "").trim();
      displayBefore = displayBefore.replace(/(?:___+|\[.*?\]|\(.*?\))/, "").trim();
    }
  }

  if (!displayBlank) {
    displayBlank = "key concept";
  }

  // Clean trailing empty brackets like [   ] from displayBefore
  displayBefore = displayBefore.replace(/\[\s*\]$/, "").trim();

  const MarkdownSpan = ({ children }: any) => <span className="inline">{children}</span>;

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/30 p-4 rounded-xl border border-slate-800/80 flex flex-wrap items-center gap-y-2">
        <span className="inline">
          <SafeMarkdown components={{ p: MarkdownSpan }}>
            {displayBefore}
          </SafeMarkdown>
        </span>
        
        <span className="inline-flex items-center mx-2">
          {revealed || isCompleted ? (
            <span className="px-3 py-1 text-xs rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-mono font-bold">
              <SafeMarkdown components={{ p: MarkdownSpan }}>{displayBlank}</SafeMarkdown>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleReveal}
              className="px-3 py-1 text-xs rounded-lg border bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 font-mono focus:outline-none transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Eye className="h-3 w-3" /> Click to reveal
            </button>
          )}
        </span>

        <span className="inline">
          <SafeMarkdown components={{ p: MarkdownSpan }}>
            {displayAfter}
          </SafeMarkdown>
        </span>
      </div>

      {(revealed || isCompleted) && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium animate-fade-in">
          <Check className="h-4 w-4 bg-emerald-500/10 p-0.5 rounded-full" />
          <span>Revealed! The blank word is <strong className="ml-1 text-emerald-300 font-bold underline"><SafeMarkdown components={{ p: MarkdownSpan }}>{displayBlank}</SafeMarkdown></strong>.</span>
        </div>
      )}
    </div>
  );
}
