"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const url = process.env.DATABASE_URL || "file:./dev.db";
const adapter = new adapter_better_sqlite3_1.PrismaBetterSqlite3({
    url,
});
const prisma = new client_1.PrismaClient({ adapter });
exports.default = prisma;
