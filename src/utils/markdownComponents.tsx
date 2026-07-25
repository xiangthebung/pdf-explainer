import React from "react";
import { Copy, Terminal } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { Mermaid } from "../components/Mermaid";
import { SvgRenderer } from "../components/SvgRenderer";

export const globalMarkdownComponents: any = {
  h1: ({ node, ...props }: any) => <h1 className="text-xl font-bold font-display text-slate-100 mt-6 mb-3 border-b border-slate-800/60 pb-2" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="text-lg font-bold font-display text-slate-100 mt-5 mb-2.5 text-indigo-400" {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="text-base font-bold font-display text-slate-200 mt-4 mb-2" {...props} />,
  p: ({ node, ...props }: any) => <p className="mb-2 leading-relaxed text-slate-300 last:mb-0" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-3 space-y-1.5 text-slate-300 marker:text-indigo-500" {...props} />,
  ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1.5 text-slate-300 marker:text-indigo-500" {...props} />,
  li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="font-bold text-slate-200" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="border-l-2 border-indigo-500/50 bg-indigo-500/5 pl-4 py-2 my-4 rounded-r-xl italic text-slate-400" {...props} />
  ),
  a: ({ node, ...props }: any) => <a className="text-indigo-400 hover:text-indigo-300 underline decoration-indigo-500/30 underline-offset-2" {...props} />,
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const codeContent = String(children).replace(/\n$/, "");

    if (match?.[1] === "svg" || (match?.[1] === "xml" && codeContent.includes("<svg"))) {
      return <SvgRenderer code={codeContent} />;
    }
    if (!inline && match && match[1] === "mermaid") {
      return (
        <div className="my-6 rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-900/50 w-full shadow-lg">
          <div className="bg-slate-900/90 px-4 py-2 text-[11px] font-mono text-slate-300 flex items-center gap-2 border-b border-slate-800/80 uppercase tracking-widest font-semibold">
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            Diagram
          </div>
          <div className="p-6 overflow-x-auto custom-scrollbar flex items-center justify-center min-h-[260px] w-full bg-slate-950/40">
            <Mermaid chart={codeContent} />
          </div>
        </div>
      );
    }
    
    if (!inline) {
      return (
        <div className="my-4 rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950/80 relative group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => navigator.clipboard.writeText(codeContent)}
              className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/80 hover:bg-slate-700"
              title="Copy to clipboard"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="bg-slate-900 px-3 py-1.5 text-[10px] font-mono text-slate-400 flex items-center gap-1.5 border-b border-slate-800/80">
            <Terminal className="h-3 w-3" />
            {match?.[1] || "code"}
          </div>
          <pre className="p-4 overflow-x-auto custom-scrollbar text-[11px] leading-relaxed font-mono">
            <code className="text-slate-300" {...props}>{children}</code>
          </pre>
        </div>
      );
    }

    return (
      <code className="bg-slate-800/60 text-indigo-300 px-1.5 py-0.5 rounded-md text-[0.9em] font-mono border border-slate-700/50" {...props}>
        {children}
      </code>
    );
  }
};

/**
 * Robustly pre-processes Markdown strings containing LaTeX formulas to avoid KaTeX/remark-math crashes.
 * Resolves bracketed and parenthesized math environments, double backslash formatting, escaped currencies,
 * and automatically wraps un-delimited LaTeX macros in math mode ($ ... $).
 */
export function preprocessMarkdown(content: string): string {
  if (!content) return "";
  let processed = String(content);

  // 1. Unescape double-escaped newlines/tabs if stringified
  processed = processed.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  // 2. Normalize block math delimiters: \[ ... \] -> $$ ... $$
  processed = processed.replace(/(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]/g, (_, math) => {
    return `\n$$\n${math.trim()}\n$$\n`;
  });

  // 3. Normalize inline math delimiters: \( ... \) -> $ ... $
  processed = processed.replace(/(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 4. Fix multiple backslashes before LaTeX macros (e.g. \\approx -> \approx, \\text -> \text)
  const latexCommandRegex = /\\{2,}(frac|begin|end|text|sqrt|sum|prod|int|alpha|beta|gamma|delta|epsilon|theta|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|sin|cos|tan|log|ln|exp|lim|infty|partial|nabla|times|div|pm|mp|le|ge|ne|approx|over|left|right|mathbf|mathrm|mathit|mathsf|mathtt|cdot|vec|hat|tilde|quad|qquad|overline|underbrace|overbrace|binom|bmatrix|pmatrix|vmatrix|aligned|cases|hline|hspace|vspace)/g;
  processed = processed.replace(latexCommandRegex, (_, macro) => {
    return `\\${macro}`;
  });

  // 5. Handle currency vs inline math dollar signs ($100 -> \$100 when not part of math)
  processed = processed.replace(/(?<!\\)\$(\s*\d+(?:\.\d+)?)(?![^\$\n]*\$)/g, (_, amount) => {
    return `\\$${amount}`;
  });

  // 6. Auto-wrap un-delimited LaTeX expressions outside $...$ or $$...$$
  processed = autoWrapLatex(processed);

  return processed;
}

/**
 * Auto-detects un-delimited LaTeX macros (e.g. \approx, \text{...}, \Delta) outside math blocks
 * and wraps them in inline math delimiters ($...$) so KaTeX renders them seamlessly.
 */
function autoWrapLatex(text: string): string {
  if (!text) return "";

  // Split by existing math blocks ($$ ... $$ or $ ... $)
  const mathBlockPattern = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
  const parts = text.split(mathBlockPattern);

  return parts
    .map((part, index) => {
      // Odd indices are existing $...$ or $$...$$ blocks - preserve untouched
      if (index % 2 === 1) return part;

      if (!part.includes("\\")) return part;

      // Check if this segment contains common LaTeX macros
      const macroPattern = /\\(approx|text|frac|sqrt|Delta|times|mu|alpha|beta|gamma|theta|lambda|pi|rho|sigma|tau|phi|chi|psi|omega|Gamma|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|cdot|pm|mp|le|ge|ne|mathbf|mathrm|mathit|mathsf|mathtt|vec|hat|tilde|quad|qquad|overline|underbrace|overbrace|binom|bmatrix|pmatrix|vmatrix|aligned|cases|sum|int|partial|nabla|over|left|right)\b/;

      if (!macroPattern.test(part)) return part;

      // Wrap segments that contain LaTeX macros
      return part.replace(
        /(?:[a-zA-Z0-9_\-\+\=\(\)\[\]\/\*\,\s\.\^\:\;\&]*?\\[a-zA-Z]+(?:\{[^\}]*\}|\([^\)]*\)|\[[^\]]*\]|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|[a-zA-Z0-9_\-\+\=\(\)\[\]\/\*\,\s\.\^\:\;\&])*)*/g,
        (match) => {
          if (!match || !match.includes("\\")) return match;

          const hasMacro = /\\(approx|text|frac|sqrt|Delta|times|mu|alpha|beta|gamma|theta|lambda|pi|rho|sigma|tau|phi|chi|psi|omega|Gamma|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|cdot|pm|mp|le|ge|ne|mathbf|mathrm|mathit|mathsf|mathtt|vec|hat|tilde|quad|qquad|overline|underbrace|overbrace|binom|bmatrix|pmatrix|vmatrix|aligned|cases|sum|int|partial|nabla|over|left|right)\b/.test(match);
          if (!hasMacro) return match;

          const trimmed = match.trim();
          if (!trimmed) return match;

          let cleanMatch = trimmed;
          let endingPunct = "";
          if (/[.,;!?]$/.test(cleanMatch) && !cleanMatch.endsWith("}")) {
            endingPunct = cleanMatch.slice(-1);
            cleanMatch = cleanMatch.slice(0, -1).trim();
          }

          if (cleanMatch.includes("\\")) {
            return `$${cleanMatch}$${endingPunct}`;
          }
          return match;
        }
      );
    })
    .join("");
}

interface SafeMarkdownProps {
  children: string;
  [key: string]: any;
}

/**
 * Custom React component that wraps ReactMarkdown with LaTeX preprocessing logic.
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ children, ...props }) => {
  const preprocessed = preprocessMarkdown(children || "");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={globalMarkdownComponents}
      {...props}
    >
      {preprocessed}
    </ReactMarkdown>
  );
};
