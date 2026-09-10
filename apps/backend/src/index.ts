import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import apiRoutes from "./routes/api";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { emailQueue, emailWorker } from "./queue/emailQueue";


const app = express();

app.use(cors());
app.use(express.json());

// Health check (no DB/Redis touched until called)
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// API Routes
app.use("/api", apiRoutes);

// Bull-board setup
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Bull-board available at http://localhost:${PORT}/admin/queues`);

  // Keep worker alive — log when ready so import-time Redis
  // connection failures are visible but don't crash the API.
  emailWorker.on("ready", () => console.log("Email worker ready"));
  emailWorker.on("error", (err) => console.error("Email worker error:", err));
});
