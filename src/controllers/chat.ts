import { Request, Response } from "express";
import prisma from "../services/db";
import { generateReply, generateStreamingReply } from "../services/llm";
import { logger } from "../server";
import { updateConversationSummary } from "../services/summary";


// ---------------- NORMAL CHAT ----------------
export const handleChatMessage = async (req: Request, res: Response) => {
    const { message, sessionId } = req.body;

    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Message is required." });
    }

    if (message.length > 2000) {
        return res.status(400).json({ error: "Message too long." });
    }

    try {
        let conversation =
            sessionId &&
            (await prisma.conversation.findUnique({
                where: { id: sessionId },
                include: { messages: { orderBy: { timestamp: "asc" } } }
            }));

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { title: "New Chat" },
                include: { messages: true }
            });
        }

        const history = conversation.messages.map((m: any) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
        }));

        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                sender: "user",
                text: message
            }
        });

        const reply = await generateReply(history, message);

        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                sender: "ai",
                text: reply
            }
        });

        await updateConversationSummary(conversation.id);

        res.json({ reply, sessionId: conversation.id });
    } catch (err) {
        logger.error(err);
        res.status(500).json({ error: "Internal error" });
    }
};


// ---------------- STREAMING ----------------
export const handleStreamingChatMessage = async (req: Request, res: Response) => {
    const { message, sessionId } = req.body;

    if (!message || message.trim() === "") {
        res.status(400).json({ error: "Message required" });
        return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
        let conversation =
            sessionId &&
            (await prisma.conversation.findUnique({
                where: { id: sessionId },
                include: { messages: { orderBy: { timestamp: "asc" } } }
            }));

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { title: "New Chat" },
                include: { messages: true }
            });
        }

        res.write(`data: ${JSON.stringify({ sessionId: conversation.id })}\n\n`);

        const history = conversation.messages.map((m: any) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
        }));

        await prisma.message.create({
            data: { conversationId: conversation.id, sender: "user", text: message }
        });

        // ---------------- RAG CONTEXT ----------------
        const { searchKB } = await import("../services/kb");
        const kbContext = await searchKB(message);
        const augmentedMessage = kbContext.length > 0
            ? `Context from Knowledge Base:\n${kbContext.join("\n")}\n\nUser Question: ${message}`
            : message;

        // Emit typing indicator
        res.write(`data: ${JSON.stringify({ type: "typing", status: true })}\n\n`);

        const stream = generateStreamingReply(history, augmentedMessage);
        let fullReply = "";

        for await (const chunk of stream) {
            fullReply += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ type: "typing", status: false })}\n\n`);

        await prisma.message.create({
            data: { conversationId: conversation.id, sender: "ai", text: fullReply }
        });

        await updateConversationSummary(conversation.id);

        res.write(`data: [DONE]\n\n`);
        res.end();
    } catch (err) {
        logger.error(err);
        res.write(`data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`);
        res.end();
    }
};


// ---------------- OTHER ROUTES ----------------
export const listConversations = async (_: any, res: Response) => {
    const convos = await prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, summary: true, updatedAt: true }
    });
    res.json({ conversations: convos });
};


export const getChatHistory = async (req: Request, res: Response) => {
    const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.sessionId },
        include: { messages: { orderBy: { timestamp: "asc" } } }
    });

    if (!conversation) return res.status(404).json({ error: "Not found" });

    res.json({ sessionId: conversation.id, messages: conversation.messages });
};


// ---------------- SEARCH (SQLite friendly) ----------------
export const searchMessages = async (req: Request, res: Response) => {
    const q = req.params.q;

    const messages = await prisma.message.findMany({
        where: {
            text: {
                contains: q
            }
        },
        include: { conversation: true }
    });

    res.json(messages);
};


// ---------------- EXPORT ----------------
export const exportConversation = async (req: Request, res: Response) => {
    const conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: { messages: true }
    });

    res.json(conversation);
};


export const deleteConversation = async (req: Request, res: Response) => {
    await prisma.message.deleteMany({ where: { conversationId: req.params.sessionId } });
    await prisma.conversation.delete({ where: { id: req.params.sessionId } });
    res.json({ success: true });
};
