"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const winston_1 = __importDefault(require("winston"));
const http_1 = __importDefault(require("http"));
const chat_1 = __importDefault(require("./routes/chat"));
const rateLimiter_1 = require("./middleware/rateLimiter");
const realtime_1 = require("./realtime");
dotenv_1.default.config();
// Logger configuration
exports.logger = winston_1.default.createLogger({
    level: "info",
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({ filename: "logs/error.log", level: "error" }),
        new winston_1.default.transports.File({ filename: "logs/combined.log" }),
    ],
});
if (process.env.NODE_ENV !== "production") {
    exports.logger.add(new winston_1.default.transports.Console({
        format: winston_1.default.format.simple(),
    }));
}
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = process.env.PORT || 3001;
// Setup Socket.io
(0, realtime_1.setupRealtime)(server);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
// Apply Redis Rate Limiting
app.use(rateLimiter_1.rateLimiter);
// Routes
app.use("/chat", chat_1.default);
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
