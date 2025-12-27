import { generateReply } from "./llm";
import prisma from "./db";

export async function updateConversationSummary(id: string) {
    const messages = await prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { timestamp: "asc" },
        select: { sender: true, text: true }
    });

    if (!messages.length) return;

    const textHistory = messages.map(m => `${m.sender}: ${m.text}`).join("\n");

    const summaryPrompt = `
Summarize this chat in max 2 lines and generate a short user-friendly title.
Return STRICT JSON ONLY:

{
 "title": "short title",
 "summary": "2 line summary"
}
`;

    const result = await generateReply([], `${summaryPrompt}\n${textHistory}`);

    try {
        const parsed = JSON.parse(result);

        await prisma.conversation.update({
            where: { id },
            data: {
                title: parsed.title || "Chat",
                summary: parsed.summary || null
            }
        });
    } catch {
        return;
    }
}
