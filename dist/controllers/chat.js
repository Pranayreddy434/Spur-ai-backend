"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversation = exports.exportConversation = exports.searchMessages = exports.getChatHistory = exports.listConversations = exports.handleStreamingChatMessage = exports.handleChatMessage = void 0;
const db_1 = __importDefault(require("../services/db"));
const llm_1 = require("../services/llm");
const server_1 = require("../server");
const summary_1 = require("../services/summary");
// ---------------- NORMAL CHAT ----------------
const handleChatMessage = async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Message is required." });
    }
    if (message.length > 2000) {
        return res.status(400).json({ error: "Message too long." });
    }
    try {
        let conversation = sessionId &&
            (await db_1.default.conversation.findUnique({
                where: { id: sessionId },
                include: { messages: { orderBy: { timestamp: "asc" } } }
            }));
        if (!conversation) {
            conversation = await db_1.default.conversation.create({
                data: { title: "New Chat" },
                include: { messages: true }
            });
        }
        const history = conversation.messages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
        }));
        await db_1.default.message.create({
            data: {
                conversationId: conversation.id,
                sender: "user",
                text: message
            }
        });
        const reply = await (0, llm_1.generateReply)(history, message);
        await db_1.default.message.create({
            data: {
                conversationId: conversation.id,
                sender: "ai",
                text: reply
            }
        });
        await (0, summary_1.updateConversationSummary)(conversation.id);
        res.json({ reply, sessionId: conversation.id });
    }
    catch (err) {
        server_1.logger.error(err);
        res.status(500).json({ error: "Internal error" });
    }
};
exports.handleChatMessage = handleChatMessage;
// ---------------- STREAMING ----------------
const handleStreamingChatMessage = async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message || message.trim() === "") {
        res.status(400).json({ error: "Message required" });
        return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    try {
        let conversation = sessionId &&
            (await db_1.default.conversation.findUnique({
                where: { id: sessionId },
                include: { messages: { orderBy: { timestamp: "asc" } } }
            }));
        if (!conversation) {
            conversation = await db_1.default.conversation.create({
                data: { title: "New Chat" },
                include: { messages: true }
            });
        }
        res.write(`data: ${JSON.stringify({ sessionId: conversation.id })}\n\n`);
        const history = conversation.messages.map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
        }));
        await db_1.default.message.create({
            data: { conversationId: conversation.id, sender: "user", text: message }
        });
        // ---------------- RAG CONTEXT ----------------
        const { searchKB } = await Promise.resolve().then(() => __importStar(require("../services/kb")));
        const kbContext = await searchKB(message);
        const augmentedMessage = kbContext.length > 0
            ? `Context from Knowledge Base:\n${kbContext.join("\n")}\n\nUser Question: ${message}`
            : message;
        // Emit typing indicator
        res.write(`data: ${JSON.stringify({ type: "typing", status: true })}\n\n`);
        const stream = (0, llm_1.generateStreamingReply)(history, augmentedMessage);
        let fullReply = "";
        for await (const chunk of stream) {
            fullReply += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: "typing", status: false })}\n\n`);
        await db_1.default.message.create({
            data: { conversationId: conversation.id, sender: "ai", text: fullReply }
        });
        await (0, summary_1.updateConversationSummary)(conversation.id);
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
    catch (err) {
        server_1.logger.error(err);
        res.write(`data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`);
        res.end();
    }
};
exports.handleStreamingChatMessage = handleStreamingChatMessage;
// ---------------- OTHER ROUTES ----------------
const listConversations = async (_, res) => {
    const convos = await db_1.default.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, summary: true, updatedAt: true }
    });
    res.json({ conversations: convos });
};
exports.listConversations = listConversations;
const getChatHistory = async (req, res) => {
    const conversation = await db_1.default.conversation.findUnique({
        where: { id: req.params.sessionId },
        include: { messages: { orderBy: { timestamp: "asc" } } }
    });
    if (!conversation)
        return res.status(404).json({ error: "Not found" });
    res.json({ sessionId: conversation.id, messages: conversation.messages });
};
exports.getChatHistory = getChatHistory;
// ---------------- SEARCH (SQLite friendly) ----------------
const searchMessages = async (req, res) => {
    const q = req.params.q;
    const messages = await db_1.default.message.findMany({
        where: {
            text: {
                contains: q
            }
        },
        include: { conversation: true }
    });
    res.json(messages);
};
exports.searchMessages = searchMessages;
// ---------------- EXPORT ----------------
const exportConversation = async (req, res) => {
    const conversation = await db_1.default.conversation.findUnique({
        where: { id: req.params.id },
        include: { messages: true }
    });
    res.json(conversation);
};
exports.exportConversation = exportConversation;
const deleteConversation = async (req, res) => {
    await db_1.default.message.deleteMany({ where: { conversationId: req.params.sessionId } });
    await db_1.default.conversation.delete({ where: { id: req.params.sessionId } });
    res.json({ success: true });
};
exports.deleteConversation = deleteConversation;
