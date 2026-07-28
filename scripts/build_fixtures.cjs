/**
 * Generates the representative decks used to validate the viewer, the text
 * layer, search and the study panels:
 *
 *   normal-text.pdf     ordinary bullet slides
 *   dense-math.pdf      formula-heavy slides, incl. escaped LaTeX in the text
 *   code-diagrams.pdf   code listings and an architecture figure
 *   long-deck.pdf       120 slides, for the filmstrip, search and progress
 *   no-text-layer.pdf   vector-only slides, to exercise the "no text" paths
 *
 * Run with: npm run fixtures
 */
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const OUT_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const SIZE = [960, 540];
const INK = '#1d1d1f';
const MUTED = '#6b6b74';
const ACCENT = '#0b6fd6';

function createDoc() {
  const doc = new PDFDocument({ size: SIZE, margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}

function slideFrame(doc, index, total, kicker) {
  doc.addPage();
  doc.rect(0, 0, SIZE[0], SIZE[1]).fill('#ffffff');
  doc.rect(0, 0, SIZE[0], 6).fill(ACCENT);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(kicker, 56, 34);
  doc.fillColor(MUTED).fontSize(10).text(`${index} / ${total}`, SIZE[0] - 120, 34, { width: 64, align: 'right' });
}

function title(doc, text) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(30).text(text, 56, 68, { width: SIZE[0] - 112 });
}

function bullets(doc, items, top = 150) {
  let y = top;
  for (const item of items) {
    doc.circle(64, y + 7, 3).fill(ACCENT);
    doc.fillColor(INK).font('Helvetica').fontSize(15).text(item, 82, y, { width: SIZE[0] - 160 });
    y = doc.y + 14;
  }
}

function mono(doc, lines, top = 150) {
  doc.roundedRect(56, top - 14, SIZE[0] - 112, lines.length * 19 + 28, 10).fill('#f4f4f7');
  let y = top;
  for (const line of lines) {
    doc.fillColor('#24243a').font('Courier').fontSize(12.5).text(line, 74, y);
    y += 19;
  }
}

async function writeNormalText() {
  const { doc, done } = createDoc();
  const slides = [
    {
      title: 'Cell Signalling: An Overview',
      bullets: [
        'Cells communicate through chemical messengers that bind specific receptors.',
        'Signal transduction converts an external cue into an internal response.',
        'Amplification means one ligand can trigger thousands of downstream events.',
        'Termination matters as much as activation: signals must switch off.',
      ],
    },
    {
      title: 'Four Families of Receptor',
      bullets: [
        'G-protein coupled receptors: seven transmembrane passes, slow and versatile.',
        'Receptor tyrosine kinases: dimerise on binding, then autophosphorylate.',
        'Ion channel receptors: fastest response, measured in milliseconds.',
        'Nuclear receptors: lipophilic ligands act directly on transcription.',
      ],
    },
    {
      title: 'Second Messengers',
      bullets: [
        'cAMP is produced by adenylyl cyclase and activates protein kinase A.',
        'Calcium is stored in the endoplasmic reticulum and released by IP3.',
        'Diacylglycerol stays in the membrane and recruits protein kinase C.',
        'Each messenger has a dedicated clearance route, which sets signal duration.',
      ],
    },
    { title: 'Break', bullets: ['Five minutes. Then: feedback loops.'] },
    {
      title: 'Feedback and Robustness',
      bullets: [
        'Negative feedback stabilises output against fluctuating input.',
        'Positive feedback creates switches: once tripped, the state persists.',
        'Cross-talk lets two pathways share components, at the cost of specificity.',
        'Disease often follows from feedback that cannot switch off.',
      ],
    },
    {
      title: 'Summary',
      bullets: [
        'Receptor family determines speed; second messenger determines reach.',
        'Amplification and termination together define the shape of a response.',
        'Read chapter 15 before the seminar.',
      ],
    },
  ];

  slides.forEach((slide, index) => {
    slideFrame(doc, index + 1, slides.length, 'BIOL 214 · Cell signalling');
    title(doc, slide.title);
    bullets(doc, slide.bullets);
  });

  doc.end();
  fs.writeFileSync(path.join(OUT_DIR, 'normal-text.pdf'), await done);
}

async function writeDenseMath() {
  const { doc, done } = createDoc();
  const slides = [
    {
      title: 'Fourier Series',
      lines: [
        'f(x) = a_0 / 2 + sum_{n=1}^{infty} [ a_n cos(n x) + b_n sin(n x) ]',
        'a_n = (1 / pi) integral_{-pi}^{pi} f(x) cos(n x) dx',
        'b_n = (1 / pi) integral_{-pi}^{pi} f(x) sin(n x) dx',
        'Parseval: (1 / pi) integral |f|^2 = a_0^2 / 2 + sum (a_n^2 + b_n^2)',
      ],
      note: 'Convergence is pointwise where f is continuous, in L2 everywhere.',
    },
    {
      title: 'Matrix Form of Least Squares',
      lines: [
        'minimise || A x - b ||_2^2  over x in R^n',
        'normal equations:  A^T A x = A^T b',
        'x_hat = (A^T A)^{-1} A^T b   when A has full column rank',
        'projection matrix:  P = A (A^T A)^{-1} A^T,  P^2 = P = P^T',
      ],
      note: 'Escaped LaTeX in the source: \\\\frac{1}{2}, \\\\begin{bmatrix} 1 & 0 \\\\\\\\ 0 & 1 \\\\end{bmatrix}',
    },
    {
      title: 'Time Dilation',
      lines: [
        'special relativity:   dt_SR = - v^2 / (2 c^2) per unit time',
        'general relativity:   dt_GR = + G M / (r c^2) per unit time',
        'net for a MEO satellite: +38 microseconds per day',
        'positional drift:  c * 38e-6 s = 11.4 km per day',
      ],
      note: 'A 1 ns timing error is 30 cm of range error. Currency check: $1,200 per receiver.',
    },
    {
      title: 'Eigen-decomposition',
      lines: [
        'A v = lambda v,   det(A - lambda I) = 0',
        'A = Q Lambda Q^{-1}   for diagonalisable A',
        'symmetric A: Q orthogonal, Lambda real',
        'spectral radius rho(A) = max |lambda_i| governs stability',
      ],
      note: 'Worked example territory: pick a 2x2 and derive both eigenvalues.',
    },
  ];

  slides.forEach((slide, index) => {
    slideFrame(doc, index + 1, slides.length, 'MATH 301 · Methods');
    title(doc, slide.title);
    mono(doc, slide.lines, 156);
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(13).text(slide.note, 56, 420, { width: SIZE[0] - 112 });
  });

  doc.end();
  fs.writeFileSync(path.join(OUT_DIR, 'dense-math.pdf'), await done);
}

async function writeCodeAndDiagrams() {
  const { doc, done } = createDoc();

  slideFrame(doc, 1, 4, 'CS 245 · Concurrency');
  title(doc, 'A Worker Pool in Python');
  mono(doc, [
    'from concurrent.futures import ThreadPoolExecutor',
    '',
    'def fetch(url: str) -> bytes:',
    '    with urlopen(url, timeout=5) as response:',
    '        return response.read()',
    '',
    'with ThreadPoolExecutor(max_workers=8) as pool:',
    '    for body in pool.map(fetch, urls):   # order preserved',
    '        process(body)',
  ]);
  doc.fillColor(MUTED).fontSize(13).font('Helvetica').text('The pool bounds concurrency; the map call bounds memory.', 56, 430);

  slideFrame(doc, 2, 4, 'CS 245 · Concurrency');
  title(doc, 'Deadlock, in Four Lines');
  mono(doc, [
    'thread A: lock(m1); lock(m2);   // holds m1, wants m2',
    'thread B: lock(m2); lock(m1);   // holds m2, wants m1',
    '',
    'fix: impose a global lock order, or use try_lock with backoff',
  ]);
  doc.fillColor(MUTED).fontSize(13).font('Helvetica').text('Coffman conditions: mutual exclusion, hold and wait, no preemption, circular wait.', 56, 400, { width: 780 });

  slideFrame(doc, 3, 4, 'CS 245 · Concurrency');
  title(doc, 'Request Pipeline');
  const boxes = [
    ['Client', 90],
    ['Load balancer', 270],
    ['Worker pool', 470],
    ['Datastore', 680],
  ];
  boxes.forEach(([label, x], index) => {
    doc.roundedRect(x, 250, 160, 66, 12).fill('#eef4ff');
    doc.roundedRect(x, 250, 160, 66, 12).lineWidth(1.2).stroke(ACCENT);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(String(label), x + 12, 275, { width: 136, align: 'center' });
    if (index < boxes.length - 1) {
      const from = x + 160;
      const to = boxes[index + 1][1];
      doc.moveTo(from + 6, 283).lineTo(to - 6, 283).lineWidth(1.2).stroke(MUTED);
      doc.moveTo(to - 12, 278).lineTo(to - 6, 283).lineTo(to - 12, 288).stroke(MUTED);
    }
  });
  doc.fillColor(MUTED).font('Helvetica').fontSize(12).text('Back pressure propagates right to left.', 90, 350);

  slideFrame(doc, 4, 4, 'CS 245 · Concurrency');
  title(doc, 'Summary');
  bullets(doc, [
    'Bound concurrency explicitly; unbounded queues hide failure.',
    'Order your locks, or avoid holding two at once.',
    'Measure tail latency, not the mean.',
  ]);

  doc.end();
  fs.writeFileSync(path.join(OUT_DIR, 'code-diagrams.pdf'), await done);
}

async function writeLongDeck() {
  const { doc, done } = createDoc();
  const total = 120;
  for (let index = 1; index <= total; index += 1) {
    slideFrame(doc, index, total, 'HIST 118 · The long nineteenth century');
    if (index % 20 === 1) {
      title(doc, `Part ${Math.ceil(index / 20)}: ${['Revolution', 'Industry', 'Empire', 'Nationalism', 'War', 'Aftermath'][Math.floor(index / 20)]}`);
      doc.fillColor(MUTED).font('Helvetica').fontSize(15).text('Section divider — no content to explain here.', 56, 160);
    } else {
      title(doc, `Topic ${index}: ${['Causes', 'Consequences', 'Sources', 'Historiography'][index % 4]}`);
      bullets(doc, [
        `Key date ${1800 + (index % 100)}: a turning point that reshaped the debate.`,
        'Primary source: a pamphlet, read against the grain.',
        'Counter-argument: the revisionist reading, and where it overreaches.',
      ]);
      // A findable needle for search tests, placed on one slide only.
      if (index === 87) {
        doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(14).text('Keyword for search validation: telegraphy', 56, 420);
      }
    }
  }
  doc.end();
  fs.writeFileSync(path.join(OUT_DIR, 'long-deck.pdf'), await done);
}

async function writeNoTextLayer() {
  const { doc, done } = createDoc();
  for (let index = 1; index <= 3; index += 1) {
    doc.addPage();
    doc.rect(0, 0, SIZE[0], SIZE[1]).fill('#ffffff');
    doc.rect(0, 0, SIZE[0], 6).fill(ACCENT);
    // Vector-only content: a chart-like figure with no glyphs at all.
    for (let bar = 0; bar < 7; bar += 1) {
      const height = 40 + ((bar * 37 + index * 23) % 220);
      doc.rect(120 + bar * 100, 440 - height, 58, height).fill(bar % 2 ? ACCENT : '#9dc4f0');
    }
    doc.moveTo(96, 448).lineTo(864, 448).lineWidth(1.5).stroke(MUTED);
    doc.circle(480, 130, 46).lineWidth(2).stroke(ACCENT);
  }
  doc.end();
  fs.writeFileSync(path.join(OUT_DIR, 'no-text-layer.pdf'), await done);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await writeNormalText();
  await writeDenseMath();
  await writeCodeAndDiagrams();
  await writeLongDeck();
  await writeNoTextLayer();
  for (const file of fs.readdirSync(OUT_DIR).sort()) {
    const { size } = fs.statSync(path.join(OUT_DIR, file));
    console.log(`${file.padEnd(22)} ${(size / 1024).toFixed(0)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
