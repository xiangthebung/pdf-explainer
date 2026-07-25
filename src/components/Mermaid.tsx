import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    background: "#020617", // slate-950
    primaryColor: "#312e81", // indigo-900
    primaryBorderColor: "#6366f1", // indigo-500
    primaryTextColor: "#f8fafc", // slate-50
    lineColor: "#64748b", // slate-500
    textColor: "#f1f5f9", // slate-100
    edgeLabelBackground: "#0f172a",
    clusterBkg: "#0f172a", // slate-900
    clusterBorder: "#334155", // slate-700
    defaultLinkColor: "#818cf8", // indigo-400
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  }
});

interface MermaidProps {
  chart: string;
}

function sanitizeMermaidChart(chart: string): string {
  if (!chart) return "";
  let clean = chart.trim();

  // Fix database shape node labels: ID[(label)] -> ID[("label")]
  clean = clean.replace(/([a-zA-Z0-9_\-]+)\[\((?!\")([^\"]*?)\)\]/g, '$1[("$2")]');
  // Fix stadium shape node labels: ID([label]) -> ID(["label"])
  clean = clean.replace(/([a-zA-Z0-9_\-]+)\(\[(?!\")([^\"]*?)\]\)/g, '$1(["$2"])');
  // Fix square bracket node labels: ID[label] -> ID["label"]
  clean = clean.replace(/([a-zA-Z0-9_\-]+)\[(?!\")([^\"]*?)\]/g, (match, id, text) => {
    if (text.startsWith("(") && text.endsWith(")")) return match;
    return `${id}["${text}"]`;
  });

  return clean;
}

export function Mermaid({ chart }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !chart) return;
    
    // Generate a unique ID to prevent overlapping rendering issues
    const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
    
    const renderChart = async () => {
      try {
        setError(null);
        const cleanChart = sanitizeMermaidChart(chart);
        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanChart);
        
        // Strip inline fixed max-width constraints so the diagram scales up to fill the container
        const fluidSvg = renderedSvg
          .replace(/max-width:\s*[^;"]+;?/gi, "max-width: 100%; width: 100%;")
          .replace(/<svg\s+/i, '<svg style="width: 100%; height: auto; max-width: 100%;" ');
          
        setSvg(fluidSvg);
      } catch (err: any) {
        console.error("Mermaid diagram rendering failed:", err);
        setError("Unable to render Mermaid diagram. Please verify syntax.");
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="p-3 bg-rose-950/25 border border-rose-900/30 rounded-xl text-rose-400 text-xs font-mono whitespace-pre-wrap my-4">
        <span className="font-bold text-rose-300 block mb-1">Diagram Render Error:</span>
        {error}
        <pre className="mt-2 text-[10px] text-rose-500/80 p-2 bg-slate-950 rounded-lg">{chart}</pre>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="mermaid-container w-full flex justify-center items-center my-2 p-5 bg-slate-950/80 border border-slate-800/80 rounded-2xl overflow-x-auto custom-scrollbar shadow-inner min-h-[220px]"
      dangerouslySetInnerHTML={{ __html: svg || '<div class="text-[10px] text-slate-500 animate-pulse py-2">Generating visual diagram...</div>' }}
    />
  );
}
