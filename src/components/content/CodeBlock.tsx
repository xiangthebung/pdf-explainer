import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../../lib/utils';
import { IconButton } from '../ui/Button';

export function CodeBlock({ code, language }: { code: string; language?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <figure className="figure-frame my-4 bg-surface-2">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{language || 'code'}</span>
        <IconButton label={copied ? 'Copied' : 'Copy code'} size="sm" onClick={onCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />}
        </IconButton>
      </figcaption>
      <pre className="scroll-area overflow-x-auto px-3.5 py-3 text-[12.5px] leading-[1.65]">
        <code className="font-mono text-ink">{code}</code>
      </pre>
    </figure>
  );
}
