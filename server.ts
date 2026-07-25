import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "50mb" }));


app.get("/api/config", (req, res) => {
  res.json({
    hasServerKey: !!process.env.GEMINI_API_KEY,
    requireUserKey: !process.env.GEMINI_API_KEY
  });
});

app.post("/api/explain-pdf", async (req, res) => {
  try {
    const {
      startSlide,
      endSlide,
      totalPdfPages,
      customInstructions,
      customApiKey,
      selectedModel,
      pdfData,
      pdfBase64,
      selectedTrack
    } = req.body;

    const parsedStart = parseInt(startSlide, 10) || 1;
    const parsedTotal = parseInt(totalPdfPages, 10) || parsedStart + 10;
    let parsedEnd = parseInt(endSlide, 10);
    if (!parsedEnd || isNaN(parsedEnd)) {
      parsedEnd = parsedTotal;
    }

    const pdf = pdfBase64 || pdfData;
    if (!pdf) return res.status(400).json({ error: 'Missing pdfBase64' });
    const fileParts = [{ inlineData: { data: pdf.split(',')[1] || pdf, mimeType: 'application/pdf' } }];

    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "No API key provided. Please configure one." });
    }

    const client = new GoogleGenAI({ apiKey });

    

    let modelsToTry: string[] = [];
    if (selectedModel) {
      if (selectedModel === "gemini-flash-lite-latest") {
        modelsToTry.push("gemini-3.1-flash-lite");
      } else {
        modelsToTry.push(selectedModel);
      }
    } else {
      modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
    }
    
    // Always append standard robust fallbacks to prevent failures if selected model is unavailable
    const explanationFallbacks = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
    for (const fb of explanationFallbacks) {
      if (!modelsToTry.includes(fb)) {
        modelsToTry.push(fb);
      }
    }
    const contextPrompt = `
You are a brilliant, engaging, and highly intelligent AI TA/Tutor reading a university lecture slide deck (provided as a PDF).
Your task is to thoroughly analyze the provided slide images and text (if any) and generate comprehensive, beautiful, highly engaging explanations for each slide.

The user is requesting slide explanations starting from slide ${parsedStart}. The total number of slides is ${parsedTotal}.

DYNAMIC CONTENT-DENSITY BATCHING REQUIREMENT:
- You MUST analyze the visual and text content starting from slide ${parsedStart} to dynamically determine the optimal number of slides to explain in this single batch response based on complexity and information density. Do NOT use a fixed slide count limit.
- If the slides starting from slide ${parsedStart} contain highly dense, complex, or technical information (such as complex formulas, mathematical derivations, code snippets, algorithms, or dense engineering/architectural diagrams):
  * Process fewer slides in this batch.
  * Focus on producing deep, comprehensive, and highly thorough explanations.
  * Provide extensive interactive learning materials (multiple quizzes, matching games, fill-in-the-blank exercises, and detailed step-by-step practice problems).
- If the slides starting from slide ${parsedStart} are less dense, contain simple bullet points, are introductory/transition pages, or contain high-level overview material:
  * Process significantly more slides in this batch (potentially many slides if they are low density or light on complex STEM elements).
  * Provide concise, clear, and highly focused explanations for each of those slides to keep learning momentum high.
- You have complete freedom to decide exactly how many slides to process. There is no artificial upper limit. You must process at least 1 slide (slide ${parsedStart} itself) and must not exceed the total slides limit (${parsedTotal}).
- Return the actual, highest slide number you successfully processed in this run inside the "endSlide" JSON response parameter. The next run will start at endSlide + 1.

Mode context: ${selectedTrack}
- "standard": Normal detailed tutoring.
- "cram": The user is cramming for an exam. Make the explanations extremely concise, focused entirely on key concepts. Differentiate similar terms.
- "explain-like-im-5": Simplify everything using basic analogies.

PEDAGOGICAL DIRECTIVES:
1. TRACK DETECTION: Determine if this lecture leans towards "logic" (Math, Physics, CS algorithms, Engineering) or "non-logic" (History, Biology, Psychology, Business).
2. TONE: Engaging, slightly witty, supportive.
3. YOUTUBE LINKS: If a new concept is extremely complex and cannot just be explained through words, include a markdown link to a YouTube video search (e.g. [Watch explanation on YouTube](https://www.youtube.com/results?search_query=concept+name)).
4. NO EMOJIS anywhere in explanations or titles.
5. INFORMAL, FUN & ENGAGING TUTORING STYLE & ORGANIZATION:
   - Use bullet points and short paragraphs. Add line breaks to clearly separate distinct ideas.
   - USE SPECIAL CALLOUT BLOCKS: Use the JSON 'blocks' array to structure your explanation. Use block type "callout" with the appropriate calloutType ("Memory Hook", "Key Concept", "Intuition", "Real-World Example", "Architecture Walkthrough") to emphasize key pedagogical points.
   - Use block type "markdown" for all other standard textual explanations.

6. INTERACTIVE LEARNING (QUIZZES, MATCHING, FILL-IN-THE-BLANK):
   - Quizzes: Generate as many multiple-choice questions as needed (do NOT limit to 2). If there are many concepts to differentiate, create more questions. ALWAYS put the correct answer as the FIRST option (index 0). DO NOT prepend letters (like A), B), C)) to the options. Just provide the raw text.
   - Matching Games: If there are similar concepts with different definitions (e.g. brain parts, significant figures), generate matching games to drill the differences.
   - Fill-in-the-blank: Add fill-in-the-blank exercises where appropriate.
   - For Cram Mode: Exclusively focus on differentiating concepts with quizzes, matching games, and fill-in-the-blanks. Keep textual explanations brutally concise.

7. RECALL VS CALCULATION (QUIZ VS EXAMPLE PROBLEM):
   - For logic/math slides, generate a step-by-step "exampleProblem" instead of quizzes.

FORMAT ALL MATH FORMULAS, DIAGRAMS, AND VECTOR GRAPHICS:
- Use standard LaTeX math notation. Wrap block math in $$ ... $$ and inline math in $ ... $.
- DO NOT write raw LaTeX like \\begin{pmatrix} ... \\end{pmatrix} without wrapping it in $$ ... $$.
- CURRENCY DOLLAR SIGNS: To write normal currency symbols (like \\$1.00), you MUST escape them with a backslash like \\$1.00.
- For flowcharts, use Mermaid wrapped in \`\`\`mermaid blocks. DO NOT use + or mathematical operators directly inside node connections in mermaid (e.g. avoid A + B -- C, use A & B -- C or separate lines). ALWAYS wrap node text labels containing parentheses, math operators, or slashes in double quotes like Node["Label with (text) or 1/x"].
- FOR ADVANCED VECTOR GRAPHICS: Draw clean, inline SVG code wrapped in \`\`\`svg blocks. Ensure it contains proper XML/SVG tags and viewBox. Do not output raw HTML comments or SVG lines outside a code block.

JSON RESPONSE:
- Valid JSON per the schema.
- Use \n for newlines within string values.
- "endSlide" = actual last slide YOU processed.

Additional user instructions: ${customInstructions || "None"}
`;

    let response;
    let lastError: any = null;

    for (const modelToUse of modelsToTry) {
      try {
        console.log(`[explain-pdf] Attempting content generation with model: ${modelToUse}`);
        response = await client.models.generateContent({
          model: modelToUse,
          contents: [
            ...fileParts,
            { text: `Please explain slides starting from ${startSlide}.` }
          ],
          config: {
            systemInstruction: contextPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                startSlide: {
                  type: Type.INTEGER,
                  description: "The start slide number requested.",
                },
                endSlide: {
                  type: Type.INTEGER,
                  description: "The actual last slide number in the PDF that you finished processing in this run. It can be less than the requested endSlide if the content was dense and you chose to stop early.",
                },
                totalSlides: {
                  type: Type.INTEGER,
                  description: "The total number of slides/pages in the uploaded PDF.",
                },
                detectedClassType: {
                  type: Type.STRING,
                  description: "The classification of the lecture material. Must be exactly 'logic' or 'non-logic'.",
                },
                detectedClassTypeExplanation: {
                  type: Type.STRING,
                  description: "A concise sentence explaining the detected/chosen track and how the teaching style was adapted.",
                },
                explanations: {
                  type: Type.ARRAY,
                  description: "An array of slide explanations — one entry per slide from startSlide to endSlide. Every slide gets an entry, even title/transition slides (use a short note for those).",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      slideNumber: {
                        type: Type.INTEGER,
                        description: "The exact 1-indexed slide number in the PDF.",
                      },
                      blocks: {
                        type: Type.ARRAY,
                        description: "The comprehensive detailed explanation broken down into blocks. Use 'markdown' for general text and 'callout' for special pedagogical emphasis. For title/transition slides, a single short markdown block is fine.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            type: { type: Type.STRING, description: "Must be 'markdown' or 'callout'" },
                            content: { type: Type.STRING, description: "The content of the block in Markdown." },
                            calloutType: { type: Type.STRING, description: "Required if type is 'callout'. Allowed values: 'Memory Hook', 'Key Concept', 'Intuition', 'Real-World Example', 'Architecture Walkthrough'" }
                          },
                          required: ["type", "content"]
                        }
                      },
                      quizQuestions: {
                        type: Type.ARRAY,
                        description: "Multiple choice quiz questions for this slide. Generate as many as needed.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctIndex: { type: Type.INTEGER },
                            explanation: { type: Type.STRING },
                          },
                          required: ["question", "options", "correctIndex", "explanation"],
                        },
                      },
                      matchingGames: {
                        type: Type.ARRAY,
                        description: "List of terms and definitions for matching games to drill down differences.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            concept: { type: Type.STRING },
                            definition: { type: Type.STRING }
                          },
                          required: ["concept", "definition"],
                        }
                      },
                      fillInBlanks: {
                        type: Type.ARRAY,
                        description: "Sentences with a key word to fill in.",
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            sentenceBefore: { type: Type.STRING, description: "Text before the blank" },
                            blankWord: { type: Type.STRING, description: "The word to guess" },
                            sentenceAfter: { type: Type.STRING, description: "Text after the blank" }
                          },
                          required: ["sentenceBefore", "blankWord", "sentenceAfter"],
                        }
                      },
                      exampleProblem: {
                        type: Type.OBJECT,
                        description: "An interactive step-by-step math, calculation, vector, algebra, or implementation practice problem. ONLY provide this if the slide contains calculations, mathematical concepts, formulas, algorithms, or matrices.",
                        properties: {
                          problem: {
                            type: Type.STRING,
                            description: "The mathematical or technical problem statement. Use standard LaTeX math.",
                          },
                          steps: {
                            type: Type.ARRAY,
                            description: "An array of 3-5 solution steps, walking through the derivation or calculation process step-by-step with LaTeX and thorough explanations.",
                            items: { type: Type.STRING },
                          },
                          finalAnswer: {
                            type: Type.STRING,
                            description: "The short, clean final answer to the problem.",
                          },
                        },
                        required: ["problem", "steps", "finalAnswer"],
                      },
                    },
                    required: ["slideNumber", "blocks", "quizQuestions"],
                  },
                },
              },
              required: ["startSlide", "endSlide", "totalSlides", "detectedClassType", "detectedClassTypeExplanation", "explanations"],
            },
          },
        });
        console.log(`[explain-pdf] Content generation succeeded with model: ${modelToUse}`);
        break;
      } catch (err: any) {
        console.warn(`[explain-pdf] Content generation failed with model ${modelToUse}:`, err.message || err);
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error("All models failed to generate content.");
    }

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from Gemini API.");
    }

    const parsedData = JSON.parse(textResponse.trim());

    // Post-process to physically shuffle quiz options to eliminate LLM bias
    if (parsedData.explanations && Array.isArray(parsedData.explanations)) {
      parsedData.explanations.forEach((exp: any) => {
        if (exp.quizQuestions && Array.isArray(exp.quizQuestions)) {
          exp.quizQuestions.forEach((q: any) => {
            if (q.options && q.options.length > 0 && typeof q.correctIndex === 'number') {
              const optionsWithIndex = q.options.map((opt: string, idx: number) => ({
                text: opt,
                isCorrect: idx === q.correctIndex
              }));
              
              // Fisher-Yates shuffle
              for (let i = optionsWithIndex.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
              }
              
              q.options = optionsWithIndex.map((o: any) => o.text);
              q.correctIndex = optionsWithIndex.findIndex((o: any) => o.isCorrect);
            }
          });
        }
      });
    }

    res.json(parsedData);
  } catch (error: any) {
    console.error("Error in explain-pdf endpoint:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred while analyzing the PDF.",
    });
  }
});

// Cost-optimized Subchat API endpoint for answering note/slide specific questions

app.post("/api/generate-final-quiz", async (req, res) => {
  const startTime = Date.now();
  console.log("[generate-final-quiz] Request received.");
  try {
    const { pdfData, pdfBase64, customApiKey, selectedModel } = req.body;
    
    console.log(`[generate-final-quiz] Params: selectedModel=${selectedModel}`);

    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[generate-final-quiz] Error: No Gemini API Key configured.");
      return res.status(400).json({ error: "Gemini API key is missing. Please configure your API key." });
    }

    const client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const pdf = pdfBase64 || pdfData;
    if (!pdf) {
      console.error("[generate-final-quiz] Error: PDF data is missing.");
      return res.status(400).json({ error: "Missing PDF lecture material. Please upload a PDF slide deck first." });
    }

    const contents = [{
      inlineData: {
        data: pdf.split(',')[1] || pdf,
        mimeType: "application/pdf"
      }
    }];
    console.log(`[generate-final-quiz] Loaded PDF binary (length: ${pdf.length}).`);

    // Set up model fallback list prioritizing Flash Lite as requested by user
    const modelsToTry: string[] = [];
    
    // If selected model is Flash Lite, put it first.
    if (selectedModel === "gemini-flash-lite-latest") {
      modelsToTry.push("gemini-3.1-flash-lite");
    } else if (selectedModel && selectedModel.trim()) {
      modelsToTry.push(selectedModel);
    }

    const standardFallbacks = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview"
    ];

    for (const m of standardFallbacks) {
      if (!modelsToTry.includes(m)) {
        modelsToTry.push(m);
      }
    }
    console.log(`[generate-final-quiz] Will attempt models in order: ${JSON.stringify(modelsToTry)}`);

    const { existingPuzzles } = req.body;
    const isFillGaps = existingPuzzles && existingPuzzles.length > 0;

    let contextPrompt = `
You are an expert AI professor and pedagogy designer. Your task is to generate a comprehensive suite of high-quality interactive review puzzles and games based on the provided lecture materials.
To make the review highly engaging, you MUST generate three different types of puzzles:
1. "quiz" - Standard multiple-choice quiz questions.
2. "matching" - A matching game where terms/concepts are matched with their definitions.
3. "blank" - Fill-in-the-blank sentences where a key term is replaced by a blank space.

Generate MC questions, fill in the blank, and matching questions that thoroughly cover all key slides, terms, and topics of the lecture material.
`;

    if (isFillGaps) {
      contextPrompt += `
The following questions have ALREADY been generated:
${JSON.stringify(existingPuzzles, null, 2)}

Look at the lecture slides and the questions already generated above, and generate MORE questions to fill in any gaps or missing topics that haven't been covered yet.
`;
    }

    contextPrompt += `
IMPORTANT constraints for each puzzle based on its "type":
- "sourceSlideNumber": The specific slide number (integer) from which this concept/term was extracted.
- For type "quiz":
  * "question": The question string.
  * "options": Array of 4 option strings. ALWAYS put the correct answer as the FIRST option (index 0). Do not prepend letters like A), B).
  * "correctIndex": MUST be 0.
  * "explanation": A helpful explanation of the correct answer.
- For type "matching":
  * "title": A short title for this specific matching game (e.g. "Match Key Defense Mechanisms"). Do NOT embed the concept pairs here. Keep it short.
  * "pairs": A clean array of 3 to 5 objects, where each object has a "concept" and its matching "definition". DO NOT write pairs as a JSON string inside the title field. Keep them as distinct structured elements in the "pairs" array.
- For type "blank":
  * "sentenceBefore": The text of the sentence leading up to the blank word. Ensure this contains actual context from the slide.
  * "blankWord": The exact single word or short phrase that is the key concept and has been removed.
  * "sentenceAfter": The text of the sentence continuing after the blank word. Make sure the sentence is complete when combined.
`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        puzzles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { 
                type: Type.STRING, 
                description: "Type of interactive puzzle. Must be 'quiz', 'matching', or 'blank'." 
              },
              sourceSlideNumber: { 
                type: Type.INTEGER,
                description: "The 1-indexed slide number from which this puzzle was created."
              },
              
              // MC Quiz fields
              question: { 
                type: Type.STRING,
                description: "The question text. Required only if type is 'quiz'."
              },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "The multiple choice options. Required only if type is 'quiz'. Correct answer must be index 0."
              },
              correctIndex: { 
                type: Type.INTEGER,
                description: "The index of the correct answer in options (must be 0). Required only if type is 'quiz'."
              },
              explanation: { 
                type: Type.STRING,
                description: "Pedagogical explanation of the correct answer."
              },
              
              // Matching fields
              title: { 
                type: Type.STRING,
                description: "Title or task instruction of the matching game, e.g., 'Match the architectural components with their roles'. Required only if type is 'matching'."
              },
              pairs: {
                type: Type.ARRAY,
                description: "Array of concept-definition pairs to match. Required only if type is 'matching'.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    concept: { 
                      type: Type.STRING,
                      description: "The key term or concept to match."
                    },
                    definition: { 
                      type: Type.STRING,
                      description: "The definition, role, or description that matches the concept."
                    }
                  },
                  required: ["concept", "definition"]
                }
              },
              
              // Fill-in-blank fields
              sentenceBefore: { 
                type: Type.STRING,
                description: "The text of the sentence before the blank word. Required only if type is 'blank'."
              },
              blankWord: { 
                type: Type.STRING,
                description: "The exact key term/word that belongs in the blank space. Required only if type is 'blank'."
              },
              sentenceAfter: { 
                type: Type.STRING,
                description: "The text of the sentence after the blank word. Required only if type is 'blank'."
              }
            },
            required: ["type", "sourceSlideNumber"]
          }
        }
      },
      required: ["puzzles"]
    };

    let responseText = "";
    let lastErr = null;

    for (const m of modelsToTry) {
      const modelStartTime = Date.now();
      console.log(`[generate-final-quiz] Trying model: ${m}...`);
      try {
        const response = await client.models.generateContent({
          model: m,
          contents: [...contents, { text: "Generate the interactive review puzzles." }],
          config: {
            systemInstruction: contextPrompt,
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.2
          }
        });
        
        responseText = response.text;
        const duration = Date.now() - modelStartTime;
        console.log(`[generate-final-quiz] Model ${m} succeeded in ${duration}ms! Response length: ${responseText?.length || 0}`);
        break;
      } catch (err: any) {
        const duration = Date.now() - modelStartTime;
        console.error(`[generate-final-quiz] Model ${m} failed in ${duration}ms. Error:`, err.message || err);
        lastErr = err;
      }
    }

    if (!responseText) {
      console.error("[generate-final-quiz] All model attempts failed.", lastErr);
      throw lastErr || new Error("All models failed to generate review puzzles.");
    }

    let parsed;
    try {
      let cleanText = responseText.trim();
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.substring(7);
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.substring(3);
      }
      if (cleanText.endsWith("```")) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }
      parsed = JSON.parse(cleanText.trim());
    } catch (parseErr: any) {
      console.error("[generate-final-quiz] JSON Parse Error. Raw text:", responseText);
      throw new Error("Failed to parse the generated puzzles. Please try again.");
    }

    const puzzlesList = parsed.puzzles || [];
    console.log(`[generate-final-quiz] Successfully parsed ${puzzlesList.length} puzzles.`);

    // Post-process "quiz" questions to shuffle options to eliminate bias
    puzzlesList.forEach((q: any) => {
      if (q.type === "quiz" && q.options && q.options.length > 0 && typeof q.correctIndex === "number") {
        const optionsWithIndex = q.options.map((opt: string, idx: number) => ({
          text: opt,
          isCorrect: idx === q.correctIndex
        }));
        
        // Fisher-Yates shuffle
        for (let i = optionsWithIndex.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
        }
        
        q.options = optionsWithIndex.map((o: any) => o.text);
        q.correctIndex = optionsWithIndex.findIndex((o: any) => o.isCorrect);
      }
    });

    const totalTime = Date.now() - startTime;
    console.log(`[generate-final-quiz] Done! Total request duration: ${totalTime}ms.`);
    return res.json({ puzzles: puzzlesList });
  } catch (error: any) {
    console.error("[generate-final-quiz] Critical Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate final quiz." });
  }
});

app.post("/api/subchat", async (req, res) => {
  try {
    const { slideExplanation, slideNumber, chatHistory, newMessage, customApiKey, selectedModel, pdfBase64 } = req.body;

    if (!newMessage) {
      res.status(400).json({ error: "Missing new message." });
      return;
    }

    // Determine API Key and handle public restriction flag
    const requireUserKey = process.env.REQUIRE_USER_API_KEY === "true";
    const activeApiKey = (customApiKey && customApiKey.trim()) || (!requireUserKey ? process.env.GEMINI_API_KEY : null) || null;
    
    if (!activeApiKey) {
      if (requireUserKey && !customApiKey) {
        res.status(400).json({
          error: "This public instance requires you to provide your own Gemini API key. Please configure it in the settings panel."
        });
        return;
      }
      res.status(400).json({
        error: "A Gemini API key is required. Please enter your API key in the settings panel to continue."
      });
      return;
    }

    const client = new GoogleGenAI({
      apiKey: activeApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Default to fast, approved models with fallbacks to save user credits/tokens
    const fallbackSequence = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview"
    ];

    const modelsToTry: string[] = [];
    if (selectedModel && selectedModel.trim()) {
      if (selectedModel === "gemini-flash-lite-latest") {
        modelsToTry.push("gemini-3.1-flash-lite");
      } else {
        modelsToTry.push(selectedModel);
      }
      for (const m of fallbackSequence) {
        if (m !== selectedModel && m !== "gemini-3.1-flash-lite") {
          modelsToTry.push(m);
        }
      }
    } else {
      modelsToTry.push(...fallbackSequence);
    }

    // Build model context
    const contextPrompt = `
You are an expert, friendly AI lecture assistant.
You are helping a student understand a specific slide explanation generated from their slides.

Here is the current study note page details for context:
- Slide Number: ${slideNumber || "unknown"}

Detailed Lecture Explanation Context:
"""
${slideExplanation || ""}
"""

Your goal:
- Answer the student's question accurately, concisely, and with educational warmth.
- If the student is asking about math, code, or derivation, walk them through the derivation step-by-step.
- If they are asking about terminology, help them anchor it with mnemonics.
- Use clear Markdown for headers, bullet points, list bolding, and formulas/code where applicable.
- CURRENCY DOLLAR SIGNS: Escape normal currency (like \\$1.00, \\$20) with a backslash so they are not parsed as math equations.
- VECTOR DRAWINGS: If they ask you to plot a mathematical curve (like a quadratic y = x^2), show a vector diagram, or visualize geometry, draw it in beautiful SVG wrapped in a \`\`\`svg ... \`\`\` block! Our application renders this SVG natively and dynamically.
`;

    // Map chatHistory to Gemini API chats history structure
    let hasInsertedPdf = false;
    const chatHistoryMapped = (chatHistory || []).map((msg: any, index: number) => {
      const parts = [{ text: msg.text || "" }];
      
      // Inject PDF context into the first user message of the history if available
      if (pdfBase64 && msg.role === "user" && !hasInsertedPdf) {
        hasInsertedPdf = true;
        parts.unshift({
          inlineData: {
            data: pdfBase64,
            mimeType: "application/pdf"
          }
        } as any);
        parts.push({
          text: `\n\n(Context: The attached PDF contains the slides. Focus specifically on slide ${slideNumber || "unknown"} for this discussion.)`
        } as any);
      }
      
      return {
        role: msg.role === "user" ? "user" : "model",
        parts: parts
      };
    });
    
    // If no history exists, and we have a pdfBase64, we will send it with the newMessage.
    let newMessageParts: any = [{ text: newMessage }];
    if (pdfBase64 && !hasInsertedPdf) {
      newMessageParts.unshift({
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf"
        }
      });
      newMessageParts.push({
        text: `\n\n(Context: The attached PDF contains the slides. Focus specifically on slide ${slideNumber || "unknown"} for this discussion.)`
      });
    }

    let responseText = "";
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[subchat] Attempting chat with model: ${modelName}`);
        
        const result = await client.models.generateContent({
          model: modelName,
          contents: [...chatHistoryMapped, { role: "user", parts: newMessageParts }],
          config: { systemInstruction: contextPrompt }
        });
        responseText = result.text;

        console.log(`[subchat] Chat succeeded with model: ${modelName}`);
        break;
      } catch (err: any) {
        console.warn(`[subchat] Chat failed with model ${modelName}:`, err.message || err);
        lastError = err;
      }
    }

    if (!responseText && lastError) {
      throw lastError;
    }

    const replyText = responseText || "Sorry, I was unable to generate an answer.";
    res.json({ reply: replyText });
  } catch (error: any) {
    console.error("Error in subchat endpoint:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred in Slide Chat.",
    });
  }
});

// Configure Vite middleware or serve static build files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
