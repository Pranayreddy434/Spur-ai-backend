import { Server } from "socket.io";
import { logger } from "./server";
import redis from "./services/redis";

export function setupRealtime(server: any) {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", async (socket) => {
        logger.info(`User connected: ${socket.id}`);

        // Track online users in Redis
        if (redis.status === 'ready') {
            await redis.sadd("online_users", socket.id);
            const count = await redis.scard("online_users");
            io.emit("online_count", count);
        }

        socket.on("disconnect", async () => {
            logger.info(`User disconnected: ${socket.id}`);
            if (redis.status === 'ready') {
                await redis.srem("online_users", socket.id);
                const newCount = await redis.scard("online_users");
                io.emit("online_count", newCount);
            }
        });
    });

    return io;
}
