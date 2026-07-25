import React from 'react';
import { HelpCircle, RefreshCw, Terminal, ArrowRight, Check, X, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { InteractiveMatching } from './InteractiveMatching';
import { InteractiveBlank } from './InteractiveBlank';
import { globalMarkdownComponents } from '../utils/markdownComponents'; // wait I need to create this

