import React, { useEffect, useState } from "react";

interface SvgRendererProps {
  code: string;
}

export function SvgRenderer({ code }: SvgRendererProps) {
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setError(null);
      let svg = code.trim();
      
      // Remove markdown code block wrapping if present
      if (svg.startsWith("```")) {
        svg = svg.replace(/^```(?:svg|xml)?\n/, "").replace(/\n```$/, "");
      }
      
      // Basic check to see if we have valid SVG tags
      if (!svg.includes("<svg") || !svg.includes("</svg>")) {
        // If not, let's wrap it if it looks like pure SVG elements
        if (svg.includes("<path") || svg.includes("<circle") || svg.includes("<rect")) {
          svg = `<svg viewBox="0 0 400 300" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" class="text-indigo-400">${svg}</svg>`;
        } else {
          throw new Error("Invalid SVG structure");
        }
      }

      // Let's make sure the SVG behaves responsively by applying common classes and ensuring viewBox exists
      if (svg.includes("<svg") && !svg.includes("viewBox")) {
        // Try to inject a standard viewBox if width/height exist
        const widthMatch = /width="(\d+)"/.exec(svg);
        const heightMatch = /height="(\d+)"/.exec(svg);
        if (widthMatch && heightMatch) {
          const w = widthMatch[1];
          const h = heightMatch[1];
          svg = svg.replace("<svg", `<svg viewBox="0 0 ${w} ${h}"`);
        } else {
          svg = svg.replace("<svg", `<svg viewBox="0 0 500 300"`);
        }
      }

      // Force style classes on the SVG for dark-mode compatibility and proper scaling
      svg = svg.replace("<svg", '<svg class="max-w-full h-auto text-indigo-400" style="max-height: 380px; display: block; margin: 0 auto;"');

      setSvgContent(svg);
    } catch (err: any) {
      console.error("SVG rendering error:", err);
      setError("Unable to render the vector SVG diagram.");
    }
  }, [code]);

  if (error) {
    return (
      <div className="p-3 bg-rose-950/25 border border-rose-900/30 rounded-xl text-rose-400 text-xs font-mono my-4">
        <span className="font-bold text-rose-300 block mb-1">Vector Render Error:</span>
        {error}
      </div>
    );
  }

  return (
    <div 
      className="flex justify-center items-center my-4 p-5 bg-slate-950/50 border border-slate-800/50 rounded-2xl overflow-x-auto custom-scrollbar shadow-inner"
      dangerouslySetInnerHTML={{ __html: svgContent || '<div class="text-[10px] text-slate-500 animate-pulse py-2">Rendering vector graphic...</div>' }}
    />
  );
}
