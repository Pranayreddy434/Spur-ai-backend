"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRealtime = setupRealtime;
const socket_io_1 = require("socket.io");
const server_1 = require("./server");
const redis_1 = __importDefault(require("./services/redis"));
function setupRealtime(server) {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    io.on("connection", async (socket) => {
        server_1.logger.info(`User connected: ${socket.id}`);
        // Track online users in Redis
        await redis_1.default.sadd("online_users", socket.id);
        const count = await redis_1.default.scard("online_users");
        io.emit("online_count", count);
        socket.on("disconnect", async () => {
            server_1.logger.info(`User disconnected: ${socket.id}`);
            await redis_1.default.srem("online_users", socket.id);
            const newCount = await redis_1.default.scard("online_users");
            io.emit("online_count", newCount);
        });
    });
    return io;
}
