import { pino } from "pino";
import PinoPretty from "pino-pretty";

export const logger = pino(
  {
    level: process.env.NODE_ENV === "development" ? "trace" : "info",
  },
  PinoPretty.default()
);
