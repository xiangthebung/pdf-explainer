import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Set high body limit for base64 encoded PDFs
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize GoogleGenAI server-side
const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// PDF explanation endpoint
app.post("/api/explain-pdf", async (req, res) => {
  try {
    const { pdfData, customInstructions, customApiKey, selectedModel, selectedTrack, startSlide, endSlide } = req.body;

    if (!pdfData) {
       res.status(400).json({ error: "Missing PDF file data." });
       return;
    }

    // Require user-provided API key — no server-side fallback
    const activeApiKey = customApiKey ? customApiKey.trim() : null;
    if (!activeApiKey) {
      res.status(400).json({
        error: "A Gemini API key is required. Enter yours in the settings panel."
      });
      return;
    }

    // Initialize custom or fallback client dynamically
    const client = new GoogleGenAI({
      apiKey: activeApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Default model is gemini-3.5-flash for high-speed, intuitive explanations
    const modelToUse = selectedModel || "gemini-2.5-flash-exp";

    // Standardize incoming base64 payload for Gemini API
    const base64Data = pdfData.includes(";base64,")
      ? pdfData.split(";base64,")[1]
      : pdfData;

    const pdfPart = {
      inlineData: {
        data: base64Data,
        mimeType: "application/pdf",
      },
    };

    const activeStart = Number(startSlide) || 1;

    let trackPrompt = "";
    if (selectedTrack === "logic") {
      trackPrompt = `
You must use the **FIRST-PRINCIPLES & INTUITION (STEM/Logic)** teaching style:
- Absolutely prioritize deep conceptual UNDERSTANDING. Never perform rote summarization or simple memory-based memorization.
- Focus heavily on "dumbing the material down" so it is understandable to a complete beginner.
- For every core concept: clearly explain the motivation of WHY we do things this way and not another way. Explain what happens if we try to do it another way and why it would fail.
- Explain how the reader would derive this solution or concept themselves step-by-step.
- Present simple examples and real-world scenarios that use this concept/solution before moving to abstract generalization.
- Set detectedClassType to 'logic'.
`;
    } else if (selectedTrack === "non-logic") {
      trackPrompt = `
You must use the **ABSURD STORIES & MNEMONICS (Memory/Association)** teaching style:
- Focus on memory and brain retention: provide brain/memory hacks, mnemonics, visualization hooks, and mental models to help ingrain definitions, concepts, and names permanently.
- Create highly engaging, vivid, and even absurd/exaggerated stories to attach to the concepts to drill them in.
- Set detectedClassType to 'non-logic'.
`;
    } else if (selectedTrack === "cram") {
      trackPrompt = `
You must use the **HIGH-VELOCITY CRAM MODE** teaching style:
- Synthesize all materials into high-density exam-prep cheat sheets.
- Focus strictly on high-impact takeaways, essential facts, formula reference grids, and bulleted recaps.
- Set detectedClassType to 'logic'.
`;
    } else {
      // Auto-detect mode
      trackPrompt = `
Step 1: CLASSIFY the lecture material. Determine if it is:
- A "logic" class (e.g., Math, Computer Science, Physics, Logic, Quantitative Disciplines, Engineering, Statistics).
- Or a "non-logic" class (e.g., Psychology, History, Literature, Biology, Medicine, Sociology, Social Sciences, Humanities).

Step 2: ADAPT the teaching style based on this classification:

For "logic" classes (Math/Computer Science/Physics etc.):
- Absolutely prioritize deep conceptual UNDERSTANDING. Never perform rote summarization. Focus heavily on "dumbing the material down" so it's understandable to a complete beginner.
- Use first-principles metaphors, logical analogies, or intuitive models.
- Set detectedClassType to 'logic'.

For "non-logic" classes (Psychology/History etc.):
- Focus on providing engaging stories, brain/memory hacks, mnemonics, and mental models to help ingrain definitions, concepts, and names permanently.
- Set detectedClassType to 'non-logic'.
`;
    }

    const userPrompt = `
Analyze this PDF of lecture slides/documents.
Generate comprehensive, engaging, and highly structured explanations STARTING from slide ${activeStart}.

${trackPrompt}

CRITICAL DIRECTIVES — READ CAREFULLY:

1. YOU DECIDE HOW MANY SLIDES TO PROCESS:
   - Start at slide ${activeStart} and process as many slides as you can while maintaining deep quality.
   - If slides are dense (complex math, code, theory), process fewer slides (e.g., 5-8) but go deep on each.
   - If slides are simple or sparse, process more (e.g., 12-18).
   - Set "endSlide" in your output to the ACTUAL last slide number you processed. The UI uses this to determine the next batch start.
   - Never artificially pad or rush. Quality over quantity.

2. EVERY SLIDE GETS AN ENTRY — but calibrate length:
   - Title pages, section dividers, blank slides: include a very short entry (1-2 sentences max) noting what this slide is.
   - Content-rich slides: provide full deep explanation.
   - This way the UI always has something to show, and students are never left confused.

3. CONTEXT-AWARE COMPARISONS:
   - If consecutive slides build on each other (e.g. adding one bullet each time), explain ONLY the new addition concisely and reference the previous slide.

4. NO EMOJIS anywhere in explanations or titles.

5. INFORMAL, FUN & ENGAGING TUTORING STYLE:
   - Speak like a brilliant, witty classmate explaining over pizza. Conversational, never dry.
   - Use these SECTION MARKERS at the start of a paragraph — write ONLY the marker keyword, no colon after it, just start the content on the next line or after a space. The UI renders these as styled cards automatically:
     - "Memory Hook" — for mnemonics, memory tricks, vivid associations
     - "Exam Alert" — for common exam mistakes, traps, gotchas
     - "Intuition" — for simplified metaphors, analogies, real-world parallels
     - "Real-World" — for concrete practical applications
   - Example: A paragraph starting with "Memory Hook Remember that gradient descent is like..." will render as a styled Memory Hook card.
   - IMPORTANT: Do NOT repeat the section name inside the paragraph text after the marker. Write the content directly after the marker keyword.

6. QUIZ QUESTIONS:
   - For each content-rich slide, include 2-3 multiple choice questions in the quizQuestions array.
   - Questions should test genuine understanding, not trivial recall.
   - Each question: one correct answer and 3 plausible wrong answers.
   - For title/transition slides, quizQuestions can be an empty array.

FORMAT ALL MATH FORMULAS:
- Use clean unicode or ASCII (x², x_i, a/b, delta, theta, lambda).
- NO raw LaTeX (no \\begin{equation}, \\frac, \\sum, \\int).

JSON RESPONSE:
- Valid JSON per the schema.
- Use \\n for newlines within string values.
- "endSlide" = actual last slide YOU processed.

Additional user instructions: ${customInstructions || "None"}
`;

    const response = await client.models.generateContent({
      model: modelToUse,
      contents: [
        pdfPart,
        { text: userPrompt }
      ],
      config: {
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
                  explanation: {
                    type: Type.STRING,
                    description: "The comprehensive detailed explanation in rich Markdown format. For title/transition slides, a brief 1-2 sentence note is fine.",
                  },
                  quizQuestions: {
                    type: Type.ARRAY,
                    description: "2-3 multiple choice quiz questions for this slide. Empty array for title/transition slides.",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: {
                          type: Type.STRING,
                          description: "The quiz question.",
                        },
                        options: {
                          type: Type.ARRAY,
                          description: "Exactly 4 answer options (A, B, C, D).",
                          items: { type: Type.STRING },
                        },
                        correctIndex: {
                          type: Type.INTEGER,
                          description: "0-based index of the correct answer in options.",
                        },
                        explanation: {
                          type: Type.STRING,
                          description: "Brief explanation of why the correct answer is right.",
                        },
                      },
                      required: ["question", "options", "correctIndex", "explanation"],
                    },
                  },
                },
                required: ["slideNumber", "explanation", "quizQuestions"],
              },
            },
          },
          required: ["startSlide", "endSlide", "totalSlides", "detectedClassType", "detectedClassTypeExplanation", "explanations"],
        },
      },
    });

    const textResponse = response.text;
    if (!textResponse) {
      throw new Error("Empty response from Gemini API.");
    }

    const parsedData = JSON.parse(textResponse.trim());
    res.json(parsedData);
  } catch (error: any) {
    console.error("Error in explain-pdf endpoint:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred while analyzing the PDF.",
    });
  }
});

// Cost-optimized Subchat API endpoint for answering note/slide specific questions
app.post("/api/subchat", async (req, res) => {
  try {
    const { slideExplanation, slideNumber, chatHistory, newMessage, customApiKey, selectedModel } = req.body;

    if (!newMessage) {
      res.status(400).json({ error: "Missing new message." });
      return;
    }

    // Determine API Key
    const activeApiKey = customApiKey ? customApiKey.trim() : null;
    if (!activeApiKey) {
      res.status(400).json({
        error: "A Gemini API key is required. Enter yours in the settings panel."
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

    // Default to the fast, cheaper model (gemini-3.5-flash) to save user credits/tokens
    const subchatModel = selectedModel || "gemini-2.5-flash-exp";

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
`;

    // Map chatHistory to Gemini API chats history structure
    const chatHistoryMapped = (chatHistory || []).map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text || "" }]
    }));

    const chat = client.chats.create({
      model: subchatModel,
      config: {
        systemInstruction: contextPrompt,
      },
      history: chatHistoryMapped
    });

    const response = await chat.sendMessage({
      message: newMessage
    });

    const replyText = response.text || "Sorry, I was unable to generate an answer.";
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
