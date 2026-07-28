/**
 * SVG sanitiser.
 *
 * Both model-authored SVG and Mermaid's rendered output end up injected into the
 * DOM, so both go through here first. This is an allowlist: unknown elements and
 * attributes are dropped rather than inspected, which fails closed.
 *
 * Blocked by construction: scripts, event handlers, `foreignObject` (arbitrary
 * HTML), external references (no `http(s):`/`data:` in `href`, `src` or CSS
 * `url()`), and anything that could navigate or fetch.
 */

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'title',
  'desc',
  'style',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'marker',
  'clippath',
  'mask',
  'pattern',
  'lineargradient',
  'radialgradient',
  'stop',
  'filter',
  'feblend',
  'fecolormatrix',
  'fecomposite',
  'fedropshadow',
  'feflood',
  'fegaussianblur',
  'femerge',
  'femergenode',
  'feoffset',
  'switch',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'style',
  'transform',
  'transform-origin',
  'viewbox',
  'preserveaspectratio',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'width',
  'height',
  'd',
  'points',
  'pathlength',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'stroke-miterlimit',
  'opacity',
  'color',
  'vector-effect',
  'shape-rendering',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'text-decoration',
  'white-space',
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerwidth',
  'markerheight',
  'markerunits',
  'refx',
  'refy',
  'orient',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'patternunits',
  'patterncontenttunits',
  'clip-path',
  'clip-rule',
  'clippathunits',
  'mask',
  'maskunits',
  'filter',
  'in',
  'in2',
  'result',
  'stddeviation',
  'values',
  'mode',
  'operator',
  'flood-color',
  'flood-opacity',
  'type',
  'xmlns',
  'aria-label',
  'aria-hidden',
  'role',
  'href',
  'xlink:href',
]);

/** Only same-document fragment references survive. */
function isSafeReference(value: string): boolean {
  return value.trim().startsWith('#');
}

function sanitizeStyleValue(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes('url(') || lowered.includes('expression') || lowered.includes('javascript:')) return '';
  if (lowered.includes('@import') || lowered.includes('position:fixed')) return '';
  return value;
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\((?:[^)]*)\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
    .replace(/javascript:/gi, '')
    .replace(/<\/?\s*style/gi, '');
}

function scrub(element: Element, depth = 0): boolean {
  const tag = element.tagName.toLowerCase();
  if (!ALLOWED_ELEMENTS.has(tag) || depth > 40) {
    element.remove();
    return false;
  }

  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;

    // Event handlers and namespaced oddities go first, before the allowlist.
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name.includes(':') && name !== 'xlink:href' && !name.startsWith('xmlns')) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name.startsWith('xmlns')) continue;
    if (!ALLOWED_ATTRIBUTES.has(name)) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      if (!isSafeReference(value)) element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'style') {
      const safe = sanitizeStyleValue(value);
      if (safe) element.setAttribute('style', safe);
      else element.removeAttribute('style');
      continue;
    }
    if (/javascript:|data:text\/html/i.test(value)) element.removeAttribute(attribute.name);
  }

  if (tag === 'style') {
    element.textContent = sanitizeCss(element.textContent ?? '');
    return true;
  }

  for (const child of [...element.children]) scrub(child, depth + 1);
  return true;
}

export interface SanitizedSvg {
  markup: string;
  /** True when the source declared a viewBox we could keep. */
  hasViewBox: boolean;
}

/**
 * Returns render-safe SVG markup, or null when the input is not usable SVG.
 * The root element is always made responsive: no pixel width/height, viewBox
 * preserved (or synthesised) so it scales inside any panel.
 */
export function sanitizeSvg(input: string): SanitizedSvg | null {
  const trimmed = input
    .trim()
    .replace(/^```(?:svg|xml|html)?\s*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  if (!/<svg[\s>]/i.test(trimmed)) return null;

  const start = trimmed.search(/<svg[\s>]/i);
  const end = trimmed.toLowerCase().lastIndexOf('</svg>');
  const source = end === -1 ? trimmed.slice(start) : trimmed.slice(start, end + 6);

  let root: SVGSVGElement | null = null;
  try {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.getElementsByTagName('parsererror').length === 0) {
      root = parsed.documentElement as unknown as SVGSVGElement;
    }
  } catch {
    root = null;
  }

  if (!root || root.tagName.toLowerCase() !== 'svg') {
    // Malformed XML is common; the HTML parser is far more forgiving.
    const host = document.createElement('div');
    host.innerHTML = source;
    const found = host.querySelector('svg');
    if (!found) return null;
    root = found as SVGSVGElement;
  }

  if (!scrub(root)) return null;

  const width = Number.parseFloat(root.getAttribute('width') ?? '');
  const height = Number.parseFloat(root.getAttribute('height') ?? '');
  let hasViewBox = Boolean(root.getAttribute('viewBox'));
  if (!hasViewBox && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    hasViewBox = true;
  }
  root.removeAttribute('width');
  root.removeAttribute('height');
  if (!root.getAttribute('preserveAspectRatio')) root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.setAttribute('role', 'img');

  const markup = root.outerHTML;
  if (!markup || markup.length > 400_000) return null;
  return { markup, hasViewBox };
}
