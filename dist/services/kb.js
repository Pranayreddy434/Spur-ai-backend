"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchKB = exports.addToKB = void 0;
exports.cosineSimilarity = cosineSimilarity;
const openai_1 = require("@langchain/openai");
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
// In-memory Knowledge Base (should be moved to a vector DB or Prisma in a real app)
let knowledgeBase = [];
const embeddings = new openai_1.OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
});
const addToKB = async (content) => {
    try {
        const embedding = await embeddings.embedQuery(content);
        knowledgeBase.push({ content, embedding });
        server_1.logger.info("Added content to Knowledge Base");
    }
    catch (error) {
        server_1.logger.error("Failed to add to KB:", error);
    }
};
exports.addToKB = addToKB;
const searchKB = async (query, limit = 3) => {
    try {
        const queryEmbedding = await embeddings.embedQuery(query);
        const results = knowledgeBase
            .map((item) => ({
            content: item.content,
            score: cosineSimilarity(queryEmbedding, item.embedding),
        }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        return results.filter(r => r.score > 0.7).map(r => r.content);
    }
    catch (error) {
        server_1.logger.error("KB Search failed:", error);
        return [];
    }
};
exports.searchKB = searchKB;
