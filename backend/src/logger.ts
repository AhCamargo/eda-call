import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

const LOG_DIR = process.env.LOG_DIR || "/edacall-logs";

const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    return stack ? `${base}\n${stack}` : base;
  }),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format,
  transports: [
    // Console sempre ativo
    new winston.transports.Console({ format }),

    // Arquivo rotativo: novo arquivo por dia, mantém 30 dias
    new (winston.transports as any).DailyRotateFile({
      dirname: LOG_DIR,
      filename: "edacall-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      maxSize: "50m",
      zippedArchive: true,
    }),

    // Arquivo separado só para erros
    new (winston.transports as any).DailyRotateFile({
      dirname: LOG_DIR,
      filename: "edacall-error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "30d",
      maxSize: "20m",
      zippedArchive: true,
    }),
  ],
});

export default logger;
