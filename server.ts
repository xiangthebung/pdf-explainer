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
const apiKey = process.env.GEMINI_API_KEY;
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

    // Determine the API key to use
    const activeApiKey = customApiKey ? customApiKey.trim() : process.env.GEMINI_API_KEY;
    if (!activeApiKey) {
       res.status(400).json({ 
        error: "No Gemini API Key is available. Please enter your custom Gemini API key in the setup panel or configure GEMINI_API_KEY on the server." 
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
    const modelToUse = selectedModel || "gemini-3.5-flash";

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
    const activeEnd = Number(endSlide) || 15;

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
We want to generate comprehensive, engaging, and highly structured explanations starting from slide ${activeStart} up to slide ${activeEnd} (inclusive, 1-indexed).

${trackPrompt}

CRITICAL DIRECTIVES FOR DYNAMIC PLANNING AND OUTLINE DEPTH (YOU CONTROL THE SCOPE):
1. DENSE VS. SPARSE CONTENT BATCHING:
   - You determine how many slides to process in this run. If the slides are extremely dense, technical, or contain complex formulas/code, you can choose to stop earlier than the requested end slide (e.g., stop at slide 8 instead of 15) to maintain deep conceptual quality. Return the actual final slide number you processed in the "endSlide" property of the output JSON.
   - If the slides are simple transitions, repetitive, or sparse, feel free to cover the entire requested range (up to ${activeEnd}).
2. FILTER UNIMPORTANT SLIDES:
   - If a slide is a title page, a section divider, blank, or has no educational value, DO NOT generate a lengthy summary. You can completely omit it from the "explanations" array, or provide a single-line simple note. If you omit it, the user interface will automatically identify it as a transition page and guide the student forward.
3. CONTEXT-AWARE COMPARISONS:
   - If consecutive slides are almost identical (e.g. showing one new list item added or small increments), you should focus your explanation ONLY on the changes/additions on the second slide, keeping it brief and connected.
4. NO EMOJIS:
   - Do NOT use emojis anywhere in your explanations or titles. Colors and styled borders are configured in our user interface based on plain text prefixes.
5. INFORMAL, FUN & ENGAGING TUTORING STYLE:
   - Speak like an incredibly bright, witty, and clever classmate explaining concepts over pizza. Keep it conversational, not dry or overly academic.
   - Use these plain text prefixes at the start of paragraphs to highlight key insights (do NOT include emojis in them):
     - "Brain Hack:" or "Mnemonic:" for memory anchors and retention hooks.
     - "Exam Alert:" or "Common Trap:" for crucial points where students often slip up on exams.
     - "Metaphor:" or "Analogy:" for ultra-simplified real-world parallels.
     - "Real-world:" for concrete practical applications.

FORMAT ALL MATH FORMULAS:
- Use clean, plain unicode or standard ASCII (superscript x², subscripts x_i, basic fractions like a/b, or letters like delta, theta, lambda).
- Do NOT write raw LaTeX tags or blocks (such as \\begin{equation}, \\frac, \\sum, \\int). Keep everything clean and readable in standard Markdown.

JSON SCHEMA & RESPONSE FORMATTING:
- Produce a valid JSON response according to the schema.
- Write actual newline characters (or normal JSON \\n escapes) in the JSON response to separate paragraphs.
- Ensure "endSlide" reflects the actual last slide number processed in this run.

Additional user request to merge into this style: ${customInstructions || "None provided"}
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
              description: "An array of slide explanations that you chose to generate. Only include entries for slides that actually have educational value. Skip blank, title, or transition slides.",
              items: {
                type: Type.OBJECT,
                properties: {
                  slideNumber: {
                    type: Type.INTEGER,
                    description: "The exact 1-indexed slide number in the PDF.",
                  },
                  explanation: {
                    type: Type.STRING,
                    description: "The comprehensive detailed explanation in rich Markdown format.",
                  }
                },
                required: [
                  "slideNumber",
                  "explanation",
                ],
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
    const activeApiKey = customApiKey ? customApiKey.trim() : process.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      res.status(400).json({ 
        error: "No Gemini API Key is available. Please enter your custom Gemini API key." 
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
    const subchatModel = selectedModel || "gemini-3.5-flash";

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
