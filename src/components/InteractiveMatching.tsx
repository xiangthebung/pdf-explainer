import React, { useState, useEffect } from "react";
import { Sparkles, Check, AlertCircle } from "lucide-react";
import { SafeMarkdown } from "../utils/markdownComponents";
import { extractMatchingPairs } from "../utils/puzzleUtils";

interface MatchingPair {
  concept: string;
  definition: string;
}

interface InteractiveMatchingProps {
  pairs: MatchingPair[];
  onComplete: () => void;
  isCompleted: boolean;
  title?: string;
}

interface ShuffledItem {
  id: string;
  text: string;
  originalIndex: number;
}

export function InteractiveMatching({ pairs: rawPairs, onComplete, isCompleted, title }: InteractiveMatchingProps) {
  const [concepts, setConcepts] = useState<ShuffledItem[]>([]);
  const [definitions, setDefinitions] = useState<ShuffledItem[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<ShuffledItem | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<ShuffledItem | null>(null);
  const [matches, setMatches] = useState<{ [conceptId: string]: string }>({}); // conceptId -> definitionId
  const [wrongMatch, setWrongMatch] = useState<{ conceptId: string; definitionId: string } | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Auto-extract valid pairs if rawPairs is empty or malformed
  const activePairs = React.useMemo(() => extractMatchingPairs({ pairs: rawPairs, title }), [rawPairs, title]);

  // Initialize and shuffle
  useEffect(() => {
    if (!activePairs || activePairs.length === 0) return;

    const initializedConcepts = activePairs.map((pair, idx) => ({
      id: `c-${idx}`,
      text: pair.concept,
      originalIndex: idx,
    }));

    const initializedDefinitions = activePairs.map((pair, idx) => ({
      id: `d-${idx}`,
      text: pair.definition,
      originalIndex: idx,
    }));

    // Shuffle arrays
    const shuffledC = [...initializedConcepts].sort(() => Math.random() - 0.5);
    const shuffledD = [...initializedDefinitions].sort(() => Math.random() - 0.5);

    setConcepts(shuffledC);
    setDefinitions(shuffledD);
    setSelectedConcept(null);
    setSelectedDefinition(null);
    setMatches({});
    setWrongMatch(null);
    setAttempts(0);
  }, [JSON.stringify(rawPairs)]);

  const checkMatch = (c: ShuffledItem, d: ShuffledItem) => {
    if (c.originalIndex === d.originalIndex) {
      // Correct match!
      const newMatches = { ...matches, [c.id]: d.id };
      setMatches(newMatches);
      setSelectedConcept(null);
      setSelectedDefinition(null);

      // Check if all matched
      if (Object.keys(newMatches).length === activePairs.length) {
        onComplete();
      }
    } else {
      // Wrong match
      setWrongMatch({ conceptId: c.id, definitionId: d.id });
      setAttempts((prev) => prev + 1);
      
      // Flash red and reset selection
      setTimeout(() => {
        setWrongMatch((current) => {
          // Only clear if we're still showing this exact wrong match
          if (current?.conceptId === c.id && current?.definitionId === d.id) {
             setSelectedConcept(null);
             setSelectedDefinition(null);
             return null;
          }
          return current;
        });
      }, 1000);
    }
  };

  const handleSelectConcept = (c: ShuffledItem) => {
    if (wrongMatch) return;
    setSelectedConcept(c);
    if (selectedDefinition) {
      checkMatch(c, selectedDefinition);
    }
  };

  const handleSelectDefinition = (d: ShuffledItem) => {
    if (wrongMatch) return;
    setSelectedDefinition(d);
    if (selectedConcept) {
      checkMatch(selectedConcept, d);
    }
  };

  const isAllMatched = Object.keys(matches).length === activePairs.length && activePairs.length > 0;

  return (
    <div className="space-y-4">
      {/* Game info */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles className="h-3.5 w-3.5 text-sky-400" />
          Match the concept with the correct definition
        </span>
        <div className="flex items-center gap-3">
          <span>Attempts: <strong>{attempts}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Concepts Column */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 pl-1">Concepts</div>
          {concepts.map((c) => {
            const isMatched = matches[c.id] !== undefined;
            const isSelected = selectedConcept?.id === c.id;
            const isWrong = wrongMatch?.conceptId === c.id;

            let cardClass = "bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700";
            if (isMatched) {
              cardClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 opacity-60";
            } else if (isWrong) {
              cardClass = "bg-rose-500/15 border-rose-500/40 text-rose-300 animate-shake";
            } else if (isSelected) {
              cardClass = "bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30";
            }

            return (
              <button
                key={c.id}
                disabled={isMatched || isCompleted || !!wrongMatch}
                onClick={() => handleSelectConcept(c)}
                className={`w-full text-left p-3 rounded-xl border text-xs leading-relaxed transition-all duration-200 cursor-pointer flex items-center justify-between ${cardClass}`}
              >
                <div className="flex-1 font-semibold">
                  <SafeMarkdown 
                    components={{ p: ({children}) => <span className="inline">{children}</span> }}
                  >
                    {c.text}
                  </SafeMarkdown>
                </div>
                {isMatched && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>

        {/* Definitions Column */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 pl-1">Definitions</div>
          {definitions.map((d) => {
            // Find if this definition is matched to any concept
            const isMatched = Object.values(matches).includes(d.id);
            const isSelected = selectedDefinition?.id === d.id;
            const isWrong = wrongMatch?.definitionId === d.id;

            let cardClass = "bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700";
            if (isMatched) {
              cardClass = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 opacity-60";
            } else if (isWrong) {
              cardClass = "bg-rose-500/15 border-rose-500/40 text-rose-300 animate-shake";
            } else if (isSelected) {
              cardClass = "bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30";
            }

            return (
              <button
                key={d.id}
                disabled={isMatched || isCompleted || !!wrongMatch}
                onClick={() => handleSelectDefinition(d)}
                className={`w-full text-left p-3 rounded-xl border text-xs leading-relaxed transition-all duration-200 cursor-pointer flex items-center justify-between ${cardClass}`}
              >
                <div className="flex-1">
                  <SafeMarkdown 
                    components={{ p: ({children}) => <span className="inline">{children}</span> }}
                  >
                    {d.text}
                  </SafeMarkdown>
                </div>
                {isMatched && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      </div>

      {isAllMatched && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-xs text-emerald-300 animate-fade-in">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>Great job! You successfully matched all concepts with <strong>{attempts}</strong> incorrect attempts!</span>
        </div>
      )}
    </div>
  );
}

