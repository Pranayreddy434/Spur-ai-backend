import { Router } from "express";
import {
    handleChatMessage,
    handleStreamingChatMessage,
    getChatHistory,
    listConversations,
    searchMessages,
    exportConversation,
    deleteConversation
} from "../controllers/chat";
import { upload } from "../services/upload";

const router = Router();

router.post("/message", handleChatMessage);
router.post("/stream", upload.single("file"), handleStreamingChatMessage);
router.get("/history/:sessionId", getChatHistory);
router.get("/conversations", listConversations);
router.get("/search/:q", searchMessages);
router.get("/export/:id", exportConversation);
router.delete("/conversation/:sessionId", deleteConversation);

export default router;
