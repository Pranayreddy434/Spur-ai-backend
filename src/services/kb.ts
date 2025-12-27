import { OpenAIEmbeddings } from "@langchain/openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../server";

// Simple cosine similarity search
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
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

interface KBItem {
    content: string;
    embedding: number[];
}

// In-memory Knowledge Base
let knowledgeBase: KBItem[] = [];

// Interface for Embeddings
interface Embedder {
    embedQuery(text: string): Promise<number[]>;
}

// Gemini Embedder Wrapper
class GeminiEmbedder implements Embedder {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
    }

    async embedQuery(text: string): Promise<number[]> {
        const result = await this.model.embedContent(text);
        return result.embedding.values;
    }
}

let embedderInstance: Embedder | null = null;

const getEmbedder = (): Embedder | null => {
    if (embedderInstance) return embedderInstance;

    // 1. Try OpenAI
    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey && !openAIKey.includes('****') && openAIKey.length > 20) {
        try {
            embedderInstance = new OpenAIEmbeddings({ openAIApiKey: openAIKey });
            logger.info("Using OpenAI for Knowledge Base embeddings");
            return embedderInstance;
        } catch (e) {
            logger.warn("Failed to initialize OpenAI embeddings");
        }
    }

    // 2. Try Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.length > 10) {
        try {
            embedderInstance = new GeminiEmbedder(geminiKey);
            logger.info("Using Gemini for Knowledge Base embeddings");
            return embedderInstance;
        } catch (e) {
            logger.warn("Failed to initialize Gemini embeddings");
        }
    }

    return null;
};

export const addToKB = async (content: string) => {
    try {
        const embedder = getEmbedder();
        if (!embedder) {
            // logger.warn("Skipping KB add: No valid API key (OpenAI or Gemini) found");
            return;
        }
        const embedding = await embedder.embedQuery(content);
        knowledgeBase.push({ content, embedding });
        logger.info("Added content to Knowledge Base");
    } catch (error) {
        logger.warn("Failed to add to KB: " + (error as any).message);
    }
};

export const searchKB = async (query: string, limit: number = 3) => {
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
    } catch (error) {
        logger.warn("KB Search failed: " + (error as any).message);
        return [];
    }
};
