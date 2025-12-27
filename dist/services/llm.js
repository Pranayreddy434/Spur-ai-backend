"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReply = generateReply;
exports.generateStreamingReply = generateStreamingReply;
const generative_ai_1 = require("@google/generative-ai");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
const FAQ_KNOWLEDGE = `
Store Information:
- Name: Spur E-commerce Store
- Shipping Policy: Domestic 3–5 days, International 7–14 days
- Returns: 30-day return policy
- Refund: 5–7 business days
- Support: Mon–Fri 9AM–6PM EST
`;
const FAQ_RESPONSES = {
    "shipping": "Our shipping policy: Domestic takes 3–5 days, and International takes 7–14 days. We ship via premium carriers to ensure safety.",
    "return": "We offer a 30-day return policy. If you're not satisfied, you can return the product within 30 days of receipt for a full refund.",
    "refund": "Refunds are processed within 5–7 business days once we receive the returned item.",
    "contact": "You can contact our support team Mon–Fri 9AM–6PM EST at support@spurstore.com.",
    "hours": "Our support hours are Mon–Fri 9AM–6PM EST. We are closed on weekends and major holidays."
};
function checkSmartFAQ(message) {
    const msg = message.toLowerCase();
    for (const [key, response] of Object.entries(FAQ_RESPONSES)) {
        if (msg.includes(key))
            return response;
    }
    return null;
}
function checkSafety(message) {
    const badWords = ["jailbreak", "ignore previous instructions", "system prompt", "profanity1", "profanity2"]; // Example filters
    const msg = message.toLowerCase();
    return !badWords.some(word => msg.includes(word));
}
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const xai = new openai_1.default({
    apiKey: process.env.XAI_API_KEY || "",
    baseURL: "https://api.x.ai/v1",
});
async function generateReply(history, userMessage) {
    if (!checkSafety(userMessage)) {
        return "I'm sorry, but I can't assist with that request as it violates our safety policies.";
    }
    const faqResponse = checkSmartFAQ(userMessage);
    if (faqResponse)
        return faqResponse;
    const provider = process.env.LLM_PROVIDER || "gemini";
    const optimizedHistory = history.slice(-15);
    try {
        if (provider === "gemini") {
            try {
                return await generateGeminiReply(optimizedHistory, userMessage, "gemini-3-pro-preview");
            }
            catch (flashErr) {
                console.warn("Flash failed. Trying Pro...");
                return await generateGeminiReply(optimizedHistory, userMessage, "gemini-2.5-flash");
            }
        }
        return await generateGrokReply(optimizedHistory, userMessage);
    }
    catch (err) {
        console.error("LLM FAILED:", err);
        return "Sorry, I’m unable to answer right now. Please try again.";
    }
}
async function* generateStreamingReply(history, userMessage, file) {
    if (!checkSafety(userMessage)) {
        yield "I'm sorry, but I can't assist with that request as it violates our safety policies.";
        return;
    }
    const faqResponse = checkSmartFAQ(userMessage);
    if (faqResponse) {
        yield faqResponse;
        return;
    }
    const provider = process.env.LLM_PROVIDER || "gemini";
    const optimizedHistory = history.slice(-15);
    if (provider === "gemini") {
        yield* generateGeminiStream(optimizedHistory, userMessage, file);
    }
    else {
        yield* generateGrokStream(optimizedHistory, userMessage);
    }
}
// ---------------- GEMINI ----------------
async function generateGeminiReply(history, userMessage, modelName) {
    const model = genAI.getGenerativeModel({ model: modelName });
    const chat = model.startChat({
        history: history.map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
        })),
    });
    const systemInstruction = `
You are Spur Store Support. Be helpful, short and clear.
Use this knowledge if needed:
${FAQ_KNOWLEDGE}
If unsure, say a human will assist. Do not hallucinate policies.
`;
    const result = await chat.sendMessage(`${systemInstruction}\n\nUser: ${userMessage}`);
    const response = await result.response;
    let text = response?.text?.() || "";
    if (!text || typeof text !== "string")
        text = "I’m here! How can I help you?";
    return text.trim();
}
// ---------------- GROK ----------------
async function generateGrokReply(history, userMessage) {
    const messages = [
        {
            role: "system",
            content: `You are Spur Store Support. Be helpful, short and clear.
${FAQ_KNOWLEDGE}`,
        },
        ...history.map(h => ({
            role: h.role,
            content: h.content,
        })),
        { role: "user", content: userMessage },
    ];
    const response = await xai.chat.completions.create({
        model: "grok-beta",
        messages,
    });
    let reply = response?.choices?.[0]?.message?.content;
    if (Array.isArray(reply)) {
        reply = reply.map(p => p?.text || p).join("\n");
    }
    if (!reply || typeof reply !== "string")
        reply = "I’m here! How can I help you?";
    return reply.trim();
}
// ---------------- STREAMING HELPERS ----------------
async function* generateGeminiStream(history, userMessage, file) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const chat = model.startChat({
        history: history.map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
        })),
    });
    const systemInstruction = `You are Spur Store Support. Be helpful, short and clear.\nUse this knowledge if needed:\n${FAQ_KNOWLEDGE}`;
    let prompt = [`${systemInstruction}\n\nUser: ${userMessage}`];
    if (file && file.mimetype.startsWith("image/")) {
        const fileData = fs_1.default.readFileSync(file.path);
        prompt.push({
            inlineData: {
                data: fileData.toString("base64"),
                mimeType: file.mimetype,
            },
        });
    }
    const result = await chat.sendMessageStream(prompt);
    for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text)
            yield text;
    }
}
async function* generateGrokStream(history, userMessage) {
    const messages = [
        { role: "system", content: `You are Spur Store Support. Be helpful, short and clear.\n${FAQ_KNOWLEDGE}` },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: userMessage },
    ];
    const stream = await xai.chat.completions.create({
        model: "grok-beta",
        messages,
        stream: true,
    });
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content)
            yield content;
    }
}
