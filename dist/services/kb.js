"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKB = exports.addToKB = void 0;
exports.cosineSimilarity = cosineSimilarity;
const openai_1 = require("@langchain/openai");
const generative_ai_1 = require("@google/generative-ai");
const server_1 = require("../server");
// Simple cosine similarity search
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let mA = 0;
    let mB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        mA += vecA[i] * vecA[i];
        mB += vecB[i] * vecB[i];
    }
    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);
    return dotProduct / (mA * mB);
}
// In-memory Knowledge Base
let knowledgeBase = [];
// Gemini Embedder Wrapper
class GeminiEmbedder {
    constructor(apiKey) {
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
    }
    async embedQuery(text) {
        const result = await this.model.embedContent(text);
        return result.embedding.values;
    }
}
let embedderInstance = null;
const getEmbedder = () => {
    if (embedderInstance)
        return embedderInstance;
    // 1. Try OpenAI
    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey && !openAIKey.includes('****') && openAIKey.length > 20) {
        try {
            embedderInstance = new openai_1.OpenAIEmbeddings({ openAIApiKey: openAIKey });
            server_1.logger.info("Using OpenAI for Knowledge Base embeddings");
            return embedderInstance;
        }
        catch (e) {
            server_1.logger.warn("Failed to initialize OpenAI embeddings");
        }
    }
    // 2. Try Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.length > 10) {
        try {
            embedderInstance = new GeminiEmbedder(geminiKey);
            server_1.logger.info("Using Gemini for Knowledge Base embeddings");
            return embedderInstance;
        }
        catch (e) {
            server_1.logger.warn("Failed to initialize Gemini embeddings");
        }
    }
    return null;
};
const addToKB = async (content) => {
    try {
        const embedder = getEmbedder();
        if (!embedder) {
            // logger.warn("Skipping KB add: No valid API key (OpenAI or Gemini) found");
            return;
        }
        const embedding = await embedder.embedQuery(content);
        knowledgeBase.push({ content, embedding });
        server_1.logger.info("Added content to Knowledge Base");
    }
    catch (error) {
        server_1.logger.warn("Failed to add to KB: " + error.message);
    }
};
exports.addToKB = addToKB;
const searchKB = async (query, limit = 3) => {
    try {
        const embedder = getEmbedder();
        if (!embedder) {
            return [];
        }
        const queryEmbedding = await embedder.embedQuery(query);
        const results = knowledgeBase
            .map((item) => ({
            content: item.content,
            score: cosineSimilarity(queryEmbedding, item.embedding),
        }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        return results.filter(r => r.score > 0.6).map(r => r.content);
    }
    catch (error) {
        server_1.logger.warn("KB Search failed: " + error.message);
        return [];
    }
};
exports.searchKB = searchKB;
