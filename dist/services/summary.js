"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConversationSummary = updateConversationSummary;
const llm_1 = require("./llm");
const db_1 = __importDefault(require("./db"));
async function updateConversationSummary(id) {
    const messages = await db_1.default.message.findMany({
        where: { conversationId: id },
        orderBy: { timestamp: "asc" },
        select: { sender: true, text: true }
    });
    if (!messages.length)
        return;
    const textHistory = messages.map(m => `${m.sender}: ${m.text}`).join("\n");
    const summaryPrompt = `
Summarize this chat in max 2 lines and generate a short user-friendly title.
Return STRICT JSON ONLY:

{
 "title": "short title",
 "summary": "2 line summary"
}
`;
    const result = await (0, llm_1.generateReply)([], `${summaryPrompt}\n${textHistory}`);
    try {
        const parsed = JSON.parse(result);
        await db_1.default.conversation.update({
            where: { id },
            data: {
                title: parsed.title || "Chat",
                summary: parsed.summary || null
            }
        });
    }
    catch {
        return;
    }
}
