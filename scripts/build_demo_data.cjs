const fs = require('fs');

const pdfB64 = fs.readFileSync('generated_pdf_b64.txt', 'utf8').trim();

const demoDataTsContent = `import { ExplanationResponse } from "../types";

export const DEMO_PDF_BASE64 = "${pdfB64}";

export const DEMO_EXPLANATION: ExplanationResponse = {
  startSlide: 1,
  endSlide: 12,
  totalSlides: 12,
  detectedClassType: "logic",
  detectedClassTypeExplanation: "Adapted with first-principles intuition, interactive visual diagrams, step-by-step mathematical breakdowns, and interactive exercises for Large Language Models & Transformers.",
  explanations: [
    {
      slideNumber: 1,
      blocks: [
        {
          type: "markdown",
          content: "### How Large Language Models Think: The Paradigm Shift\\n\\n**From Hardcoded Logic to Probabilistic Prediction**\\nFor decades, Natural Language Processing (NLP) relied on hand-crafted grammar rules, dictionary lookups, and rigid regular expressions. These systems broke down whenever language was informal, ambiguous, or poetic.\\n\\nLarge Language Models (LLMs) completely replace hand-written rules with **probabilistic next-token prediction**. Given a sequence of preceding words $W_{1}, W_{2}, ..., W_{t-1}$, the model calculates a probability distribution over its entire vocabulary to predict the most statistically likely next token $W_t$:\\n\\n$$\\\\mathcal{P}(W_t \\\\mid W_1, W_2, ..., W_{t-1}) = \\\\text{Softmax}\\\\left( \\\\mathbf{z}_t \\\\right)$$\\n\\n**Visualizing the Paradigm Shift**\\nHere is a flowchart contrasting classical rule engines with the transformer prediction engine:"
        },
        {
          type: "markdown",
          content: "\`\`\`mermaid\\ngraph TD\\n    subgraph Classical Rule-Based NLP\\n        A[Input Sentence] --> B[Rule Engine / Parsers]\\n        B --> C[Rigid If-Else Logic]\\n        C --> D[Fragile Output]\\n    end\\n    subgraph Transformer Prediction Engine\\n        E[Input Context Tokens] --> F[High-Dim Embedding]\\n        F --> G[Self-Attention & Deep Layers]\\n        G --> H[Probability Distribution over 100k Tokens]\\n        H --> I[Fluent, Context-Aware Next Token]\\n    end\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Think of traditional code as a rigid railway train—it can only run on tracks that an engineer explicitly laid down beforehand. A Transformer model is more like an experienced navigator: it looks at where you are, reads the terrain of past context, and dynamically predicts the best next step forward."
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "Classical NLP = Recipe Book (if you miss an ingredient, it fails).\\nLLM Transformer = Executive Chef (understands flavors and adapts dynamically)."
        }
      ],
      quizQuestions: [
        {
          question: "How does a Transformer model handle language generation differently than classical rule-based NLP?",
          options: [
            "By executing explicit if/else nested statements written by human linguists",
            "By predicting the probability distribution of the next token based on learned context parameters",
            "By looking up exact sentences in a static database of previously recorded text",
            "By compiling English directly into machine code instructions"
          ],
          correctIndex: 1,
          explanation: "Transformers convert input context into continuous representations and compute a probability distribution across vocabulary tokens to predict what comes next."
        }
      ],
      matchingGames: [
        {
          concept: "Rule-Based NLP",
          definition: "Rigid system relying on manual grammar trees and explicit conditional statements."
        },
        {
          concept: "Next-Token Prediction",
          definition: "Probabilistic mechanism estimating $P(W_t \\\\mid W_{<t})$ across a massive vocabulary."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Rather than following rigid grammar rules, modern LLMs operate as probabilistic",
          blankWord: "next-token",
          sentenceAfter: "prediction engines trained on vast empirical text datasets."
        }
      ]
    },
    {
      slideNumber: 2,
      blocks: [
        {
          type: "markdown",
          content: "### Tokenization: Breaking Text into Atomic Subwords\\n\\n**The Input Representation Challenge**\\nNeural networks cannot process raw characters or strings directly—they only operate on vectors of numbers. However, mapping every full word in the dictionary to an integer ID creates a massive, uncontrolled vocabulary that fails when encountering typos or compound words.\\n\\nModern LLMs use **Byte-Pair Encoding (BPE)** to segment text into optimal subword units. High-frequency words (e.g., \`the\`, \`apple\`) remain intact as single tokens, while rare or complex words are split into subword pieces (e.g., \`unbelievable\` $\\\\rightarrow$ \`un\` + \`believ\` + \`able\`).\\n\\n**Tokenizer Code Example**\\nHere is how tokenization translates raw text into numerical Token IDs:"
        },
        {
          type: "markdown",
          content: "\`\`\`python\\n# Example Byte-Pair Encoding Tokenization\\nraw_text = 'Transformers are unbelievable!'\\ntokens = ['Transformer', 's', ' ARE', ' un', 'believ', 'able', '!']\\ntoken_ids = [38521, 298, 4821, 612, 18923, 1204, 29991]\\n\\nprint(f'Token count: {len(token_ids)}')\\n# Output: Token count: 7\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "Why Subwords? With a fixed vocabulary size of ~100,000 subwords, BPE can represent **100% of any input text in any language** without ever hitting an 'out-of-vocabulary' error."
        }
      ],
      quizQuestions: [
        {
          question: "Why do modern LLMs use Byte-Pair Encoding (BPE) subwords instead of whole-word dictionaries?",
          options: [
            "Whole-word dictionaries make memory usage zero",
            "Subwords allow the model to represent any word or unknown term with a fixed vocabulary size",
            "Subwords force all text to be converted into 8-bit ASCII characters only",
            "BPE removes the need for neural network weights"
          ],
          correctIndex: 1,
          explanation: "BPE balances efficiency and coverage: common words stay whole while rare words are broken into recognizable subword pieces, preventing out-of-vocabulary errors."
        }
      ],
      matchingGames: [
        {
          concept: "Token ID",
          definition: "A unique integer assigned to every subword in the model's vocabulary dictionary."
        },
        {
          concept: "Byte-Pair Encoding (BPE)",
          definition: "An algorithm that iteratively merges frequent character pairs to form subwords."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "The process of splitting raw text strings into numerical integer chunks is called",
          blankWord: "tokenization",
          sentenceAfter: ", which serves as the entry point for all neural language processing."
        }
      ]
    },
    {
      slideNumber: 3,
      blocks: [
        {
          type: "markdown",
          content: "### Vector Embeddings: The Geometry of Meaning\\n\\n**Mapping Integers to Continuous Vector Space**\\nOnce text is tokenized into integer IDs (e.g. \`38521\`), the model converts each ID into a high-dimensional continuous vector $E_i \\\\in \\\\mathbb{R}^{d_{model}}$ (where $d_{model}$ is typically 4,096 or 8,192 dimensions).\\n\\nIn this embedding space, **geometric closeness equals semantic similarity**. Words used in similar contexts cluster together. Furthermore, vector arithmetic preserves conceptual relationships:\\n\\n$$\\\\mathbf{v}_{King} - \\\\mathbf{v}_{Man} + \\\\mathbf{v}_{Woman} \\\\approx \\\\mathbf{v}_{Queen}$$\\n\\n**Visualizing Embedding Dimensions**\\nHere is a vector spatial representation showing semantic clusters in 2D projection:"
        },
        {
          type: "markdown",
          content: "\`\`\`svg\\n<svg viewBox='0 0 500 280' xmlns='http://www.w3.org/2000/svg'>\\n  <rect width='500' height='280' fill='#090d16' rx='12'/>\\n  <!-- Cluster 1: Royalty -->\\n  <circle cx='120' cy='90' r='6' fill='#818cf8'/>\\n  <text x='132' y='94' fill='#c7d2fe' font-size='12' font-family='sans-serif'>King [0.82, 0.41, ...]</text>\\n  <circle cx='190' cy='80' r='6' fill='#818cf8'/>\\n  <text x='202' y='84' fill='#c7d2fe' font-size='12' font-family='sans-serif'>Queen [0.85, 0.44, ...]</text>\\n  <path d='M120 90 L190 80' stroke='#6366f1' stroke-width='2' stroke-dasharray='4'/>\\n  <text x='140' y='75' fill='#818cf8' font-size='10'>+ Gender Vector</text>\\n  <!-- Cluster 2: Tech -->\\n  <circle cx='340' cy='200' r='6' fill='#34d399'/>\\n  <text x='352' y='204' fill='#a7f3d0' font-size='12' font-family='sans-serif'>Server [0.12, 0.95, ...]</text>\\n  <circle cx='390' cy='220' r='6' fill='#34d399'/>\\n  <text x='402' y='224' fill='#a7f3d0' font-size='12' font-family='sans-serif'>Database [0.15, 0.92, ...]</text>\\n  <!-- Distance arrow -->\\n  <path d='M190 80 L340 200' stroke='#475569' stroke-width='1.5' stroke-dasharray='2'/>\\n  <text x='230' y='150' fill='#94a3b8' font-size='10'>Cosine Distance = High (Unrelated)</text>\\n</svg>\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Real-World Example",
          content: "Spotify uses vector embeddings to represent songs. If you like a song, Spotify finds other songs whose audio-feature vectors are mathematically closest in cosine distance."
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Imagine a 4,000-dimensional celestial map where every word is a star. 'Apple' and 'Banana' sit on the fruit constellation, while 'Python' and 'Java' sit in the programming galaxy."
        }
      ],
      quizQuestions: [
        {
          question: "What mathematical property characterizes a well-trained word embedding space?",
          options: [
            "All vectors are forced to have a magnitude of exactly zero",
            "Semantically similar tokens have small angular distances (high cosine similarity)",
            "The distance between any two random words is always identical",
            "Every word is assigned a single 1-bit boolean flag"
          ],
          correctIndex: 1,
          explanation: "High cosine similarity indicates that two vectors point in nearly the same direction in high-dimensional space, reflecting shared semantic meaning."
        }
      ],
      matchingGames: [
        {
          concept: "High-Dimensional Vector",
          definition: "An array of floating-point numbers (e.g. 4096 dimensions) encoding word attributes."
        },
        {
          concept: "Cosine Similarity",
          definition: "Metric measuring the cosine of the angle between two embedding vectors."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "In an embedding space, words with similar contextual meanings are positioned close together in",
          blankWord: "geometric",
          sentenceAfter: "distance."
        }
      ]
    },
    {
      slideNumber: 4,
      blocks: [
        {
          type: "markdown",
          content: "### Positional Encoding: Preserving Word Order in Parallel\\n\\n**The Parallelism Dilemma**\\nUnlike Recurrent Neural Networks (RNNs) which read text one word at a time from left to right, Transformers process **all tokens in a sequence simultaneously**. This allows massive GPU parallelization!\\n\\nHowever, because the self-attention operation is order-invariant (permutation symmetric), the model would treat \`'Dog bites Man'\` and \`'Man bites Dog'\` as completely identical without position information.\\n\\nTo fix this, **Positional Encodings** are added directly to the input embeddings using sine and cosine waves of varying frequencies:\\n\\n$$PE_{(pos, 2i)} = \\\\sin\\\\left(\\\\frac{pos}{10000^{2i/d_{model}}}\\\\right), \\\\quad PE_{(pos, 2i+1)} = \\\\cos\\\\left(\\\\frac{pos}{10000^{2i/d_{model}}}\\\\right)$$\\n\\n**Combined Representation:**\\n$$\\\\mathbf{x}_{i} = \\\\mathbf{e}_{token} + \\\\mathbf{e}_{position}$$"
        },
        {
          type: "callout",
          calloutType: "Architecture Walkthrough",
          content: "Think of positional encodings as subtle watermarks added to each vector. Even if you shuffle the pages of a book, the page number printed at the bottom tells you exactly where each sentence belongs."
        }
      ],
      exampleProblem: {
        problem: "Calculate the first dimension ($i=0$) of the positional encoding $PE_{(pos, 0)}$ for a token at position $pos = 3$, given $d_{model} = 512$.",
        steps: [
          "Identify the formula for even dimensions: $PE_{(pos, 2i)} = \\\\sin\\\\left(\\\\frac{pos}{10000^{2i/d_{model}}}\\\\right)$.",
          "Substitute $pos = 3$, $i = 0$, and $d_{model} = 512$: $PE_{(3, 0)} = \\\\sin\\\\left(\\\\frac{3}{10000^{0/512}}\\\\right)$.",
          "Simplify the denominator: $10000^0 = 1$, so the expression inside sine becomes $\\\\frac{3}{1} = 3$ radians.",
          "Compute $\\\\sin(3 \\\\text{ rad}) \\\\approx 0.1411$."
        ],
        finalAnswer: "PE_{(3, 0)} = \\sin(3) \\approx 0.1411"
      },
      quizQuestions: [
        {
          question: "Why are positional encodings necessary in Transformer models?",
          options: [
            "Because Transformers process all tokens in parallel and lack an innate sense of sequence order",
            "To compress the 4096-dimensional embeddings down to 1 dimension",
            "To prevent the model from learning grammar",
            "To turn numbers into raw text"
          ],
          correctIndex: 0,
          explanation: "Since attention treats all tokens as a set without inherent order, positional encodings inject position signals so word order is preserved."
        }
      ],
      matchingGames: [
        {
          concept: "Parallel Processing",
          definition: "Simultaneous computation across all sequence tokens enabled by Transformers."
        },
        {
          concept: "Sinusoidal Encoding",
          definition: "Deterministic trigonometric wave pattern used to encode relative positions."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Positional encodings are added directly to the token",
          blankWord: "embeddings",
          sentenceAfter: "so the network retains sequence ordering during parallel processing."
        }
      ]
    },
    {
      slideNumber: 5,
      blocks: [
        {
          type: "markdown",
          content: "### The Self-Attention Mechanism: Q, K, and V\\n\\n**The Heart of the Transformer**\\nSelf-attention allows every token in a sentence to dynamically query and pay attention to every other token. This allows words to resolve context-dependent meanings (e.g. knowing \`'it'\` refers to \`'the animal'\` rather than \`'the street'\`).\\n\\nEach token vector $\\\\mathbf{x}_i$ is multiplied by three learned projection matrices to create three vectors:\\n*   **Query ($Q$):** What information am I searching for?\\n*   **Key ($K$):** What topics or tags do I contain?\\n*   **Value ($V$):** What content do I pass along if selected?\\n\\n**The Scaled Dot-Product Attention Equation:**\\n$$\\\\text{Attention}(Q, K, V) = \\\\text{Softmax}\\\\left(\\\\frac{Q K^T}{\\\\sqrt{d_k}}\\\\right) V$$\\n\\n**Attention Execution Pipeline**"
        },
        {
          type: "markdown",
          content: "\`\`\`mermaid\\ngraph LR\\n    Q[\\\"Query Matrix Q\\\"] --> Dot[\\\"Dot Product Q x K^T\\\"]\\n    K[\\\"Key Matrix K\\\"] --> Dot\\n    Dot --> Scale[\\\"Scale by 1 / sqrt(d_k)\\\"]\\n    Scale --> Softmax[\\\"Softmax Row Probabilities\\\"]\\n    Softmax --> Weight[\\\"Attention Weights Matrix\\\"]\\n    Weight --> ValueMult[\\\"Multiply by Value Matrix V\\\"]\\n    V[\\\"Value Matrix V\\\"] --> ValueMult\\n    ValueMult --> Output[\\\"Context-Aware Output Matrix\\\"]\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "The Cocktail Party Analogy: Imagine being at a loud party. Your brain selectively shines a mental 'flashlight' on the person talking to you (high attention weight), while dimming down ambient chatter (low attention weight)."
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "Q = Google Search Bar Query\\nK = Web Page Title / Tags\\nV = Web Page Article Content"
        }
      ],
      quizQuestions: [
        {
          question: "What is the purpose of dividing $QK^T$ by $\\\\sqrt{d_k}$ in the scaled dot-product attention formula?",
          options: [
            "To prevent the dot products from growing excessively large, which would cause Softmax gradients to vanish",
            "To convert the matrix into complex numbers",
            "To force all attention weights to be negative",
            "To reduce the number of tokens in the prompt"
          ],
          correctIndex: 0,
          explanation: "For large dimensions $d_k$, dot products grow large in magnitude, pushing Softmax into regions with extremely tiny gradients. Scaling by $\\\\sqrt{d_k}$ maintains stable gradient flow."
        }
      ],
      matchingGames: [
        {
          concept: "Query (Q)",
          definition: "Vector representing what information the current token is seeking."
        },
        {
          concept: "Key (K)",
          definition: "Vector representing the index/tags that other tokens can match against."
        },
        {
          concept: "Value (V)",
          definition: "Vector holding the actual content representation passed forward when selected."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "The dot product of Query and Key determines the attention score, which is scaled and passed through a",
          blankWord: "softmax",
          sentenceAfter: "function to produce normalized weights summing to 1."
        }
      ]
    },
    {
      slideNumber: 6,
      blocks: [
        {
          type: "markdown",
          content: "### Multi-Head Attention: Parallel Relationship Channels\\n\\n**Why One Attention Head Isn't Enough**\\nA single attention head can only focus on one dominant relationship at a time (e.g., matching a verb to its direct object). However, language requires tracking multiple relationships simultaneously!\\n\\n**Multi-Head Attention** splits the model's total embedding dimension $d_{model}$ into $h$ smaller, parallel attention heads (e.g. $h = 32$ heads of size $d_k = 128$):\\n\\n$$\\\\text{head}_i = \\\\text{Attention}(Q W_i^Q, K W_i^K, V W_i^V)$$\\n$$\\\\text{MultiHead}(Q, K, V) = \\\\text{Concat}(\\\\text{head}_1, \\\\text{head}_2, ..., \\\\text{head}_h) W^O$$\\n\\n**Parallel Head Architecture Visualizer:**"
        },
        {
          type: "markdown",
          content: "\`\`\`svg\\n<svg viewBox='0 0 500 240' xmlns='http://www.w3.org/2000/svg'>\\n  <rect width='500' height='240' fill='#090d16' rx='12'/>\\n  <!-- Input -->\\n  <rect x='30' y='90' width='80' height='60' fill='#1e293b' stroke='#475569' rx='8'/>\\n  <text x='70' y='125' fill='#f8fafc' font-size='12' text-anchor='middle' font-family='sans-serif'>Input X</text>\\n  <!-- Heads -->\\n  <path d='M110 120 L160 60' stroke='#6366f1' stroke-width='1.5'/>\\n  <path d='M110 120 L160 120' stroke='#ec4899' stroke-width='1.5'/>\\n  <path d='M110 120 L160 180' stroke='#10b981' stroke-width='1.5'/>\\n  \\n  <rect x='160' y='40' width='100' height='40' fill='#312e81' stroke='#6366f1' rx='6'/>\\n  <text x='210' y='64' fill='#c7d2fe' font-size='11' text-anchor='middle' font-family='sans-serif'>Head 1 (Grammar)</text>\\n  \\n  <rect x='160' y='100' width='100' height='40' fill='#831843' stroke='#ec4899' rx='6'/>\\n  <text x='210' y='124' fill='#fbcfe8' font-size='11' text-anchor='middle' font-family='sans-serif'>Head 2 (Pronouns)</text>\\n  \\n  <rect x='160' y='160' width='100' height='40' fill='#064e3b' stroke='#10b981' rx='6'/>\\n  <text x='210' y='184' fill='#a7f3d0' font-size='11' text-anchor='middle' font-family='sans-serif'>Head 3 (Entities)</text>\\n  \\n  <!-- Concat -->\\n  <path d='M260 60 L310 120' stroke='#6366f1' stroke-width='1.5'/>\\n  <path d='M260 120 L310 120' stroke='#ec4899' stroke-width='1.5'/>\\n  <path d='M260 180 L310 120' stroke='#10b981' stroke-width='1.5'/>\\n  \\n  <rect x='310' y='90' width='150' height='60' fill='#1e1b4b' stroke='#818cf8' rx='8'/>\\n  <text x='385' y='118' fill='#e0e7ff' font-size='11' text-anchor='middle' font-family='sans-serif'>Concat & Linear W_O</text>\\n  <text x='385' y='136' fill='#a5b4fc' font-size='9' text-anchor='middle' font-family='sans-serif'>Rich Multi-Aspect Output</text>\\n</svg>\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "Different heads specialize! While Head 1 tracks subject-verb agreement, Head 12 tracks pronoun references ('it' -> 'laptop'), and Head 24 tracks adjective modifiers ('red' -> 'car')."
        }
      ],
      quizQuestions: [
        {
          question: "What is the key advantage of Multi-Head Attention over single-head attention?",
          options: [
            "It allows the model to jointly attend to information from different representation subspaces at different positions",
            "It reduces the total number of floating-point operations to zero",
            "It eliminates the need for GPU hardware",
            "It forces the model to generate one word per minute"
          ],
          correctIndex: 0,
          explanation: "Multi-Head Attention gives the network multiple independent representation channels to track different linguistic relationships simultaneously."
        }
      ],
      matchingGames: [
        {
          concept: "Attention Head",
          definition: "An independent attention subspace evaluating specific relationship patterns."
        },
        {
          concept: "Linear Projection $W^O$",
          definition: "Final matrix combining concatenated multi-head outputs back into $d_{model}$ dimensions."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Multi-Head Attention outputs from all parallel heads are",
          blankWord: "concatenated",
          sentenceAfter: "and multiplied by a final projection weight matrix."
        }
      ]
    },
    {
      slideNumber: 7,
      blocks: [
        {
          type: "markdown",
          content: "### Transformer Blocks & Residual Skip Connections\\n\\n**Deep Layer Architecture**\\nA full Transformer is constructed by stacking dozens of identical **Transformer Blocks** (e.g. GPT-4 uses ~120 stacked layers). Each block contains two main sub-layers:\\n1.  **Multi-Head Self-Attention**\\n2.  **Feed-Forward Neural Network (FFN)** (usually a 2-layer dense network with SwiGLU activation)\\n\\nCrucially, each sub-layer is wrapped with a **Residual Skip Connection** and **Layer Normalization**:\\n\\n$$\\\\mathbf{x}_{out} = \\\\text{LayerNorm}\\\\left( \\\\mathbf{x}_{in} + \\\\text{SubLayer}(\\\\mathbf{x}_{in}) \\\\right)$$\\n\\n**Complete Transformer Block Diagram:**"
        },
        {
          type: "markdown",
          content: "\`\`\`mermaid\\ngraph TD\\n    In[Input Vector x] --> MHA[Multi-Head Attention]\\n    In --> Add1[Residual Add + LayerNorm]\\n    MHA --> Add1\\n    Add1 --> FFN[Feed-Forward Network SwiGLU]\\n    Add1 --> Add2[Residual Add + LayerNorm]\\n    FFN --> Add2\\n    Add2 --> Out[Output Vector to Next Block]\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Architecture Walkthrough",
          content: "Why Skip Connections? Residual connections ($x + f(x)$) create an uninterrupted gradient highway. This prevents gradients from vanishing or exploding, enabling models to grow to 100+ layers deep."
        }
      ],
      exampleProblem: {
        problem: "Suppose an input vector has components $\\\\mathbf{x}_{in} = [2.0, 4.0]$ and the sub-layer produces $\\\\text{SubLayer}(\\\\mathbf{x}_{in}) = [-0.5, 1.5]$. Compute the residual sum vector before normalization.",
        steps: [
          "Apply the residual addition formula: $\\\\mathbf{x}_{res} = \\\\mathbf{x}_{in} + \\\\text{SubLayer}(\\\\mathbf{x}_{in})$.",
          "Substitute element-wise values: $\\\\mathbf{x}_{res} = [2.0 + (-0.5), 4.0 + 1.5]$.",
          "Calculate final vector components: $[1.5, 5.5]$."
        ],
        finalAnswer: "\\\\mathbf{x}_{res} = [1.5, 5.5]"
      },
      quizQuestions: [
        {
          question: "What problem do Residual Skip Connections ($x + f(x)$) solve in deep Transformer architectures?",
          options: [
            "They prevent vanishing gradients during backpropagation, allowing training across dozens of layers",
            "They double the vocabulary size automatically",
            "They eliminate the need for matrix multiplication",
            "They stop the user from asking hard questions"
          ],
          correctIndex: 0,
          explanation: "Residual connections allow gradient signals to flow directly through the network during backpropagation without passing solely through non-linear matrix multiplications."
        }
      ],
      matchingGames: [
        {
          concept: "Residual Highway",
          definition: "Direct additive connection $x + f(x)$ preserving gradient stability across deep layers."
        },
        {
          concept: "Feed-Forward Network (FFN)",
          definition: "Dense point-wise sub-layer processing individual token representations independently."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "In a Transformer layer, Layer Normalization stabilizes activation distribution alongside",
          blankWord: "residual",
          sentenceAfter: "skip connections."
        }
      ]
    },
    {
      slideNumber: 8,
      blocks: [
        {
          type: "markdown",
          content: "### Generation Mechanics & Temperature Sampling\\n\\n**Converting Logits to Words**\\nAfter passing through all Transformer layers, the final vector is projected onto the vocabulary dimension to produce unnormalized scores called **logits** $\\\\mathbf{z}$.\\n\\nTo select the next token, logits are divided by a **Temperature ($T$)** parameter before applying Softmax:\\n\\n$$\\\\mathcal{P}(w_i) = \\\\frac{\\\\exp(z_i / T)}{\\\\sum_j \\\\exp(z_j / T)}$$\\n\\n**Sampling Strategies Comparison:**\\n\\n| Parameter | Low Value (e.g. $T = 0.2$) | High Value (e.g. $T = 0.9$) |\\n| :--- | :--- | :--- |\\n| **Behavior** | Deterministic, Focused, Precise | Creative, Diverse, Surprising |\\n| **Use Case** | Math, Code, Fact Extraction | Creative Writing, Brainstorming |\\n| **Risk** | Repetitive loops | Hallucinations / Gibberish |\\n\\n**Top-K and Top-P (Nucleus) Filtering:**\\n*   **Top-K:** Restricts candidate choices to the $K$ highest-probability tokens.\\n*   **Top-P (Nucleus):** Dynamically selects the smallest set of tokens whose cumulative probability exceeds $P$ (e.g. $P = 0.9$)."
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "Temperature is the model's 'creativity dial'. At T=0, the model acts like an unyielding accountant taking the single safest choice. At T=1.0, it acts like a bohemian poet willing to take surprising risks."
        }
      ],
      quizQuestions: [
        {
          question: "What happens to text generation when you set Temperature $T \\\\rightarrow 0$ (Greedy Decoding)?",
          options: [
            "The output becomes completely random and unpredictable",
            "The model always deterministically selects the single token with the highest probability",
            "The model refuses to generate any text at all",
            "The token probabilities become evenly distributed among all 100,000 words"
          ],
          correctIndex: 1,
          explanation: "As Temperature approaches 0, the highest logit dominates the probability distribution, making the output strictly deterministic."
        }
      ],
      matchingGames: [
        {
          concept: "Temperature ($T$)",
          definition: "Scaling parameter controlling randomness and variance in Softmax probability outputs."
        },
        {
          concept: "Top-P (Nucleus) Sampling",
          definition: "Dynamic cutoff selecting candidate tokens reaching a cumulative probability threshold."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "To prevent low-probability tail tokens from being selected, nucleus sampling truncates choices at a cumulative probability threshold called",
          blankWord: "Top-P",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 9,
      blocks: [
        {
          type: "markdown",
          content: "### Pre-Training vs. RLHF Alignment\\n\\n**The 3-Stage Training Pipeline**\\nA raw base LLM trained solely on internet text is simply an autocomplete engine—it will complete prompt text, but won't behave like a helpful assistant. Transforming a raw model into ChatGPT requires three distinct stages:"
        },
        {
          type: "markdown",
          content: "\`\`\`mermaid\\ngraph TD\\n    Stage1[Stage 1: Pre-Training\\nTrillions of tokens\\nLearns world knowledge & grammar] --> Stage2[Stage 2: Supervised Fine-Tuning SFT\\nThousands of curated Q&A pairs\\nLearns assistant conversational tone]\\n    Stage2 --> Stage3[Stage 3: RLHF / DPO Alignment\\nHuman preference rankings\\nAligns helpfulness, honesty & safety]\\n    Stage3 --> Final[Deployment-Ready AI Assistant]\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Key Concept",
          content: "Pre-training creates the encyclopedia of knowledge; SFT teaches the model table manners; RLHF ensures it remains safe, helpful, and non-toxic."
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "Pre-Training = Reading the library.\\nSFT = Attending customer service school.\\nRLHF = Performance reviews based on customer feedback."
        }
      ],
      quizQuestions: [
        {
          question: "What is the primary objective of Reinforcement Learning from Human Feedback (RLHF)?",
          options: [
            "To teach the model how to parse raw HTML files from scratch",
            "To align model outputs with human preferences for helpfulness, accuracy, and safety",
            "To increase the GPU memory speed",
            "To delete all pre-training weights from disk"
          ],
          correctIndex: 1,
          explanation: "RLHF fine-tunes model behavior using reward signals derived from human preferences, curbing toxic or unhelpful generations."
        }
      ],
      matchingGames: [
        {
          concept: "Supervised Fine-Tuning (SFT)",
          definition: "Training on curated prompt-response pairs to establish assistant behavior."
        },
        {
          concept: "Reward Model",
          definition: "Neural network trained to predict human preference scores for candidate answers."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "During pre-training, the model learns world facts through self-supervised next-word prediction on trillions of text",
          blankWord: "tokens",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 10,
      blocks: [
        {
          type: "markdown",
          content: "### Context Windows & KV-Cache Memory Limits\\n\\n**The Quadratic Bottleneck**\\nStandard self-attention requires every token to compute dot products against every other token. For a sequence length of $N$, attention memory and compute scale **quadratically: $\\\\mathcal{O}(N^2)$**.\\n\\n**KV-Caching Optimization:**\\nDuring auto-regressive decoding, recomputing Key ($K$) and Value ($V$) vectors for past prompt tokens on every generated word is extremely wasteful. **KV-Caching** stores previous $K$ and $V$ matrices in GPU VRAM so only the single newest token needs to be computed!\\n\\n**KV-Cache VRAM Formula:**\\n$$\\\\text{VRAM}_{KV} = 2 \\\\times \\\\text{Layers} \\\\times \\\\text{Heads} \\\\times \\\\text{HeadDim} \\\\times \\\\text{SeqLen} \\\\times \\\\text{BytesPerParam}$$\\n\\nModern innovations like **FlashAttention** (kernel IO fusion) and **RoPE** (Rotary Position Embeddings) enable context windows to scale from 4k tokens to over 2 Million tokens."
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "KV-Caching is like keeping your notes open beside you while writing an essay. Instead of re-reading the entire textbook for every single sentence you write, you simply consult your cached notes."
        }
      ],
      exampleProblem: {
        problem: "Calculate the KV-Cache memory requirement (in Megabytes) for a model with 32 layers, 32 attention heads, head dimension 128, sequence length 4,096 tokens, using 16-bit float precision (2 bytes per value).",
        steps: [
          "Identify KV-Cache formula: $\\\\text{Bytes} = 2 \\\\times \\\\text{Layers} \\\\times \\\\text{Heads} \\\\times \\\\text{HeadDim} \\\\times \\\\text{SeqLen} \\\\times \\\\text{BytesPerParam}$.",
          "Substitute parameters: $2 \\\\times 32 \\\\times 32 \\\\times 128 \\\\times 4096 \\\\times 2$.",
          "Multiply terms: $2 \\\\times 32 = 64$; $64 \\\\times 32 = 2048$; $2048 \\\\times 128 = 262,144$; $262,144 \\\\times 4096 = 1,073,741,824$; $1,073,741,824 \\\\times 2 = 2,147,483,648$ Bytes.",
          "Convert Bytes to Megabytes ($1 \\\\text{ MB} = 1,048,576 \\\\text{ Bytes}$): $\\\\frac{2,147,483,648}{1,048,576} = 2048 \\\\text{ MB} = 2.0 \\\\text{ GB}$."
        ],
        finalAnswer: "\\\\text{KV-Cache Memory} = 2,048 \\\\text{ MB} (2.0 \\\\text{ GB})"
      },
      quizQuestions: [
        {
          question: "What is the computational complexity scaling of standard vanilla Self-Attention with respect to sequence length $N$?",
          options: [
            "O(N) - Linear",
            "O(N^2) - Quadratic",
            "O(log N) - Logarithmic",
            "O(1) - Constant"
          ],
          correctIndex: 1,
          explanation: "Because every token compares against every other token in an $N \\\\times N$ matrix, naive attention scales quadratically $O(N^2)$ with sequence length."
        }
      ],
      matchingGames: [
        {
          concept: "KV-Cache",
          definition: "Memory storage holding previously calculated Key/Value vectors in VRAM."
        },
        {
          concept: "FlashAttention",
          definition: "GPU hardware IO optimization computing exact attention without writing $N \\\\times N$ matrix to HBM."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "Without KV-Caching, auto-regressive text generation would require recomputing past token representations at an exponential cost of",
          blankWord: "quadratic",
          sentenceAfter: "time complexity."
        }
      ]
    },
    {
      slideNumber: 11,
      blocks: [
        {
          type: "markdown",
          content: "### Grounding, Tool Use & RAG\\n\\n**Overcoming Hallucinations**\\nBecause LLMs are probabilistic language completion engines rather than relational databases, they can state false facts with extreme confidence—a phenomenon known as **hallucination**.\\n\\nTo guarantee factual accuracy in production systems, LLMs are connected to external ground truth sources via **Retrieval-Augmented Generation (RAG)** and **Function Calling / Tool Use**.\\n\\n**RAG System Architecture Flowchart:**"
        },
        {
          type: "markdown",
          content: "\`\`\`mermaid\\ngraph LR\\n    User[User Question] --> Embed[Query Embedding]\\n    Embed --> VectorDB[(Vector DB / RAG)]\\n    VectorDB --> Search[Retrieve Top Relevant Excerpts]\\n    Search --> Prompt[Augmented System Prompt]\\n    User --> Prompt\\n    Prompt --> LLM[Grounded LLM Output]\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Real-World Example",
          content: "Enterprise Support Bots: Instead of relying on the LLM's internal memory for company policies, RAG fetches exact policy paragraphs from internal PDFs and feeds them into the prompt before generating an answer."
        }
      ],
      quizQuestions: [
        {
          question: "How does Retrieval-Augmented Generation (RAG) reduce LLM hallucinations?",
          options: [
            "By retrieving relevant factual document chunks from an external database and injecting them directly into the context window",
            "By retraining the entire model weights from scratch every time a user asks a question",
            "By restricting the model to 1-word outputs",
            "By disabling the transformer's attention mechanism"
          ],
          correctIndex: 0,
          explanation: "RAG grounds the model by supplying retrieved ground-truth document snippets directly in the input prompt."
        }
      ],
      matchingGames: [
        {
          concept: "Retrieval-Augmented Generation (RAG)",
          definition: "Pattern fetching relevant documents to augment the prompt with factual context."
        },
        {
          concept: "Function Calling",
          definition: "Structured output format enabling LLMs to invoke external APIs and databases."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "When an LLM generates plausible-sounding but factually incorrect information, this error is termed a",
          blankWord: "hallucination",
          sentenceAfter: "."
        }
      ]
    },
    {
      slideNumber: 12,
      blocks: [
        {
          type: "markdown",
          content: "### Summary: The Complete Transformer Pipeline\\n\\n**Mastering the Architecture**\\nYou now possess a complete first-principles understanding of how modern AI models operate from raw prompt text to final intelligent answer!\\n\\n**The End-to-End Pipeline Summary:**"
        },
        {
          type: "markdown",
          content: "\`\`\`svg\\n<svg viewBox='0 0 500 220' xmlns='http://www.w3.org/2000/svg'>\\n  <rect width='500' height='220' fill='#090d16' rx='12'/>\\n  <!-- Flow Nodes -->\\n  <rect x='20' y='85' width='70' height='50' fill='#1e293b' stroke='#475569' rx='6'/>\\n  <text x='55' y='110' fill='#f8fafc' font-size='10' text-anchor='middle' font-family='sans-serif'>Raw Prompt</text>\\n  <text x='55' y='122' fill='#94a3b8' font-size='8' text-anchor='middle' font-family='sans-serif'>'Explain AI'</text>\\n  \\n  <path d='M90 110 L115 110' stroke='#6366f1' stroke-width='1.5'/>\\n  \\n  <rect x='115' y='85' width='70' height='50' fill='#312e81' stroke='#6366f1' rx='6'/>\\n  <text x='150' y='108' fill='#c7d2fe' font-size='10' text-anchor='middle' font-family='sans-serif'>Tokenizer</text>\\n  <text x='150' y='122' fill='#a5b4fc' font-size='8' text-anchor='middle' font-family='sans-serif'>[3852, 412]</text>\\n  \\n  <path d='M185 110 L210 110' stroke='#6366f1' stroke-width='1.5'/>\\n  \\n  <rect x='210' y='85' width='80' height='50' fill='#065f46' stroke='#10b981' rx='6'/>\\n  <text x='250' y='108' fill='#a7f3d0' font-size='10' text-anchor='middle' font-family='sans-serif'>Embed + Pos</text>\\n  <text x='250' y='122' fill='#6ee7b7' font-size='8' text-anchor='middle' font-family='sans-serif'>4096-D Vectors</text>\\n  \\n  <path d='M290 110 L315 110' stroke='#10b981' stroke-width='1.5'/>\\n  \\n  <rect x='315' y='75' width='80' height='70' fill='#831843' stroke='#f43f5e' rx='6'/>\\n  <text x='355' y='102' fill='#fecdd3' font-size='10' text-anchor='middle' font-family='sans-serif'>N Blocks</text>\\n  <text x='355' y='116' fill='#fda4af' font-size='8' text-anchor='middle' font-family='sans-serif'>Self-Attention</text>\\n  <text x='355' y='128' fill='#fda4af' font-size='8' text-anchor='middle' font-family='sans-serif'>& FFN Layers</text>\\n  \\n  <path d='M395 110 L420 110' stroke='#f43f5e' stroke-width='1.5'/>\\n  \\n  <rect x='420' y='85' width='65' height='50' fill='#1e1b4b' stroke='#818cf8' rx='6'/>\\n  <text x='452' y='108' fill='#e0e7ff' font-size='10' text-anchor='middle' font-family='sans-serif'>Logits</text>\\n  <text x='452' y='122' fill='#c7d2fe' font-size='8' text-anchor='middle' font-family='sans-serif'>Next Token</text>\\n</svg>\\n\`\`\`"
        },
        {
          type: "callout",
          calloutType: "Intuition",
          content: "By transforming dense lecture slides into step-by-step intuition, interactive exercises, and practice problems, SlideSage turns intimidating computer science concepts into active, lasting knowledge!"
        },
        {
          type: "callout",
          calloutType: "Memory Hook",
          content: "SlideSage: Experience the power of interactive AI learning on every single slide!"
        }
      ],
      quizQuestions: [
        {
          question: "Which sequence correctly reflects the complete path of text through an LLM?",
          options: [
            "Raw Text -> Tokenizer -> Embeddings + Positional Encoding -> N Transformer Blocks -> Softmax Logits -> Next Token",
            "Raw Text -> Softmax -> Tokenizer -> Embedding -> Output",
            "Embeddings -> Raw Text -> Positional Encoding -> Tokenizer",
            "Tokenizer -> Softmax -> Residual Highway -> Raw Text"
          ],
          correctIndex: 0,
          explanation: "Input text is tokenized into IDs, embedded with positional encodings, transformed through N attention/FFN blocks, and mapped to token probabilities via Softmax."
        }
      ],
      matchingGames: [
        {
          concept: "Embedding + Position",
          definition: "Initial vector representation capturing semantic coordinates and sequence position."
        },
        {
          concept: "Transformer Blocks",
          definition: "Stacked attention and feed-forward layers refining contextual representations."
        }
      ],
      fillInBlanks: [
        {
          sentenceBefore: "SlideSage empowers users to master complex topics by converting raw slide decks into interactive",
          blankWord: "explanations",
          sentenceAfter: "and practice exercises."
        }
      ]
    }
  ]
};
`;

fs.writeFileSync('src/components/DemoData.ts', demoDataTsContent);
console.log('Successfully created src/components/DemoData.ts with all 12 slides!');
