import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import winston from "winston";
import http from "http";
import chatRoutes from "./routes/chat";
import { rateLimiter } from "./middleware/rateLimiter";
import { setupRealtime } from "./realtime";

dotenv.config();

// Logger configuration
export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: "logs/error.log", level: "error" }),
        new winston.transports.File({ filename: "logs/combined.log" }),
    ],
});

if (process.env.NODE_ENV !== "production") {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Setup Socket.io
setupRealtime(server);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Apply Redis Rate Limiting
app.use(rateLimiter);

// Routes
app.use("/chat", chatRoutes);

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

server.listen(PORT as number, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
