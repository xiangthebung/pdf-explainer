// Utility functions to sanitize, extract, and auto-heal interactive review puzzles (matching, blanks, MCQs)

export interface MatchingPair {
  concept: string;
  definition: string;
}

export function cleanMatchingTitle(title?: string): string {
  if (!title) return "Match concepts with their definitions";
  let t = title.trim();
  const idx1 = t.indexOf('", "pairs"');
  if (idx1 !== -1) t = t.substring(0, idx1);
  const idx2 = t.indexOf('", pairs');
  if (idx2 !== -1) t = t.substring(0, idx2);
  const idx3 = t.indexOf('"pairs":');
  if (idx3 !== -1) t = t.substring(0, idx3);
  return t.replace(/^["'\s{}]+|["'\s{}]+$/g, "").trim() || "Match concepts with their definitions";
}

export function extractMatchingPairs(
  puzzle: any,
  fallbackText: string = "",
  slideNumber?: number
): MatchingPair[] {
  if (!puzzle) return getFallbackPairs(puzzle, fallbackText, slideNumber);

  // 1. Check direct pair properties
  const candidate =
    puzzle.pairs ||
    puzzle.matchingPairs ||
    puzzle.matching_pairs ||
    puzzle.concepts ||
    puzzle.matching_games ||
    puzzle.matchingGames ||
    puzzle.items ||
    puzzle.pairsList ||
    puzzle.quizPairs ||
    puzzle.matches;

  let rawList: any[] = [];

  if (Array.isArray(candidate)) {
    rawList = candidate;
  } else if (typeof candidate === "object" && candidate !== null) {
    rawList = Object.entries(candidate).map(([k, v]) => ({
      concept: k,
      definition: String(v),
    }));
  } else if (typeof candidate === "string" && candidate.trim()) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) rawList = parsed;
      else if (typeof parsed === "object" && parsed !== null) {
        rawList = Object.entries(parsed).map(([k, v]) => ({
          concept: k,
          definition: String(v),
        }));
      }
    } catch {
      // String not JSON, try splitting lines
      const lines = candidate.split("\n").filter((l) => l.trim());
      rawList = lines;
    }
  }

  // 2. Try parsing pairs embedded in title or question
  if (rawList.length === 0 && (puzzle.title || puzzle.question)) {
    const textToSearch = `${puzzle.title || ""} ${puzzle.question || ""}`;
    if (textToSearch.includes('"pairs":') || textToSearch.includes('"concepts":')) {
      try {
        let jsonStr = textToSearch.trim();
        const startIdx = jsonStr.indexOf("{");
        const endIdx = jsonStr.lastIndexOf("}");
        if (startIdx !== -1 && endIdx > startIdx) {
          jsonStr = jsonStr.substring(startIdx, endIdx + 1);
          const parsed = JSON.parse(jsonStr);
          const found = parsed.pairs || parsed.concepts || parsed.matchingPairs;
          if (Array.isArray(found)) rawList = found;
        }
      } catch (e) {
        // ignore JSON parse error
      }
    }
  }

  // 3. Normalize raw items into { concept, definition }
  const validPairs: MatchingPair[] = [];
  for (const item of rawList) {
    if (!item) continue;
    if (typeof item === "object") {
      const c =
        item.concept ||
        item.term ||
        item.key ||
        item.left ||
        item.front ||
        item.name ||
        item.item ||
        item.title ||
        "";
      const d =
        item.definition ||
        item.description ||
        item.value ||
        item.right ||
        item.back ||
        item.meaning ||
        item.details ||
        item.text ||
        item.answer ||
        "";

      if (c && d) {
        validPairs.push({ concept: String(c).trim(), definition: String(d).trim() });
      } else if (c && !d) {
        // Try splitting concept on delimiter
        const parts = String(c).split(/[:\-–—\=>]+/);
        if (parts.length >= 2) {
          validPairs.push({ concept: parts[0].trim(), definition: parts.slice(1).join(":").trim() });
        }
      }
    } else if (typeof item === "string") {
      const parts = item.split(/[:\-–—\=>]+/);
      if (parts.length >= 2) {
        validPairs.push({ concept: parts[0].trim(), definition: parts.slice(1).join(":").trim() });
      }
    }
  }

  if (validPairs.length >= 2) {
    return validPairs;
  }

  // 4. Auto-heal if no pairs found
  return getFallbackPairs(puzzle, fallbackText, slideNumber);
}

function getFallbackPairs(puzzle: any, fallbackText: string, slideNumber?: number): MatchingPair[] {
  const combined = `${puzzle?.title || ""} ${puzzle?.question || ""} ${fallbackText}`.toLowerCase();
  const slide = slideNumber || puzzle?.sourceSlideNumber || 1;

  if (combined.includes("gps") || combined.includes("constellation") || combined.includes("navstar") || slide === 1) {
    return [
      { concept: "GPS (Navstar)", definition: "United States system with 31 satellites in 6 MEO planes at 20,200 km" },
      { concept: "Galileo", definition: "European Union system with 28 satellites in 3 MEO planes at 23,222 km" },
      { concept: "BeiDou (BDS)", definition: "China constellation with 35 satellites in hybrid GEO/IGSO/MEO orbits" },
      { concept: "GLONASS", definition: "Russian Federation system with 24 satellites in 3 MEO planes at 19,100 km" },
    ];
  }

  if (combined.includes("relativ") || combined.includes("clock") || combined.includes("drift") || slide === 4) {
    return [
      { concept: "Special Relativity", definition: "High satellite speed (~14,000 km/h) causes clocks to tick 7 μs/day slower" },
      { concept: "General Relativity", definition: "Weaker gravity at 20,200 km altitude causes clocks to tick 45 μs/day faster" },
      { concept: "Net Relativistic Drift", definition: "Combined +38 μs/day offset causing ~11.4 km daily position error" },
      { concept: "Nanosecond Sensitivity", definition: "1 nanosecond timing inaccuracy equals ~30 cm distance error" },
    ];
  }

  if (combined.includes("band") || combined.includes("frequency") || combined.includes("prn") || slide === 5) {
    return [
      { concept: "L1 Band", definition: "Primary civilian carrier frequency at 1575.42 MHz" },
      { concept: "L2 Band", definition: "Secondary dual-frequency carrier at 1227.60 MHz" },
      { concept: "PRN Code", definition: "Unique Pseudo-Random Noise Gold code sequence of 1,023 chips" },
      { concept: "Code-Division Multiple Access", definition: "Allows all satellites to transmit simultaneously on the same frequency" },
    ];
  }

  if (combined.includes("disturb") || combined.includes("ionosphere") || combined.includes("troposphere") || combined.includes("multipath") || slide === 7) {
    return [
      { concept: "Ionosphere Delay", definition: "Charged particles refract and slow radio signals" },
      { concept: "Troposphere Delay", definition: "Temperature, pressure, and humidity delay signal propagation" },
      { concept: "Multipath Interference", definition: "Signals bounce off buildings or ground before reaching receiver" },
      { concept: "Satellite Clock Offset", definition: "Atomic clock variations corrected via broadcast ephemeris" },
    ];
  }

  if (combined.includes("rtk") || combined.includes("carrier") || combined.includes("phase") || combined.includes("19cm") || slide === 8) {
    return [
      { concept: "L1 Carrier Wave", definition: "19 cm wavelength signal used for millimeter-level phase tracking" },
      { concept: "Base Station", definition: "Known reference station transmitting real-time phase corrections" },
      { concept: "Integer Ambiguity", definition: "Solving the exact whole number of carrier wavelengths between satellite and receiver" },
      { concept: "1 - 2 cm Precision", definition: "Accuracy achieved by RTK carrier phase tracking over standard pseudo-range" },
    ];
  }

  // Generic topic fallback
  return [
    { concept: "Primary Signal Component", definition: "Fundamental wave or message transmitting timing data" },
    { concept: "Atmospheric Refraction", definition: "Medium-induced delay affecting propagation speed" },
    { concept: "Differential Correction", definition: "Using reference stations to cancel out common environmental errors" },
  ];
}

export function sanitizeBlankPuzzle(puzzle: any, fallbackText: string = ""): any {
  if (!puzzle) return puzzle;

  let before = (puzzle.sentenceBefore || "").trim();
  let word = (puzzle.blankWord || "").trim();
  let after = (puzzle.sentenceAfter || "").trim();

  // Remove trailing dots/brackets from word if any
  word = word.replace(/^["'\[\(\s]+|["'\]\)\s\.]+$|^\s*blank\s*$/gi, "");

  // If word is empty, try extracting from before/after
  if (!word) {
    // Check for [word] or (word) or ___ in before
    const matchBefore = before.match(/(?:___+|\[(.*?)\]|\((.*?)\))/);
    if (matchBefore) {
      word = (matchBefore[1] || matchBefore[2] || "").trim();
      before = before.replace(/(?:___+|\[.*?\]|\(.*?\))/, "").trim();
    }
  }

  if (!word) {
    const matchAfter = after.match(/(?:___+|\[(.*?)\]|\((.*?)\))/);
    if (matchAfter) {
      word = (matchAfter[1] || matchAfter[2] || "").trim();
      after = after.replace(/(?:___+|\[.*?\]|\(.*?\))/, "").trim();
    }
  }

  // If word is STILL empty, infer from sentence structure or context
  if (!word) {
    const combined = `${before} ${after} ${fallbackText}`.toLowerCase();
    if (combined.includes("rtk") || combined.includes("carrier")) {
      word = "pseudo-range code";
    } else if (combined.includes("nanosecond") || combined.includes("timing")) {
      word = "nanoseconds";
    } else if (combined.includes("relativ")) {
      word = "38 microseconds";
    } else if (combined.includes("satellite") || combined.includes("gps")) {
      word = "satellites";
    } else {
      // Pick the last word of sentenceBefore if it exists and remove it
      const words = before.split(/\s+/);
      if (words.length > 3) {
        word = words.pop()!.replace(/[\.\,\:\;]/g, "");
        before = words.join(" ");
      } else {
        word = "key concept";
      }
    }
  }

  // Clean trailing punctuation on before if it ends with "instead of the [   ]"
  before = before.replace(/\[\s*\]$/, "").trim();

  return {
    ...puzzle,
    type: "blank",
    sentenceBefore: before,
    blankWord: word,
    sentenceAfter: after,
  };
}
