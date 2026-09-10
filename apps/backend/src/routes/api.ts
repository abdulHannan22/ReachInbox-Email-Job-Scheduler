import { Router } from "express";
import { scheduleEmails, getScheduledEmails, getSentEmails } from "../controllers/scheduleController";
import { searchEmails } from "../services/elasticsearch";
import { prisma } from "../config/prisma";

const router = Router();

router.post("/schedule", scheduleEmails);
router.get("/emails/scheduled", getScheduledEmails);
router.get("/emails/sent", getSentEmails);

router.get("/emails/search", async (req, res) => {
  try {
    const { userId, q, status } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    // Resolve email -> uuid (ES docs are indexed with resolved uuid).
    let resolved = String(userId);
    const byEmail = await prisma.user.findUnique({ where: { email: String(userId) } }).catch(() => null);
    if (byEmail) resolved = byEmail.id;
    const results = await searchEmails(resolved, String(q ?? ""), status as string | undefined);
    res.json(results);
  } catch (err: any) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

const resolveToUserId = async (raw: string): Promise<string> => {
  const byEmail = await prisma.user.findUnique({ where: { email: raw } }).catch(() => null);
  if (byEmail) return byEmail.id;
  const byId = await prisma.user.findUnique({ where: { id: raw } }).catch(() => null);
  if (byId) return byId.id;
  // First-time Slack connect before any schedule: create the user row so
  // tenantSetting.userId always matches the uuid used by emailQueue.notifySlack.
  const created = await prisma.user.create({ data: { email: raw.includes("@") ? raw : `${raw}@local` } });
  return created.id;
};

router.post("/slack/connect", async (req, res) => {
  try {
    const { userId, webhookUrl } = req.body;
    if (!userId || !webhookUrl) return res.status(400).json({ error: "userId and webhookUrl are required" });
    const resolved = await resolveToUserId(String(userId));
    await prisma.tenantSetting.upsert({
      where: { userId: resolved },
      update: { slackWebhookUrl: String(webhookUrl) },
      create: { userId: resolved, slackWebhookUrl: String(webhookUrl) }
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Slack connect error:", err);
    res.status(500).json({ error: "Failed to connect Slack" });
  }
});

router.post("/slack/disconnect", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const resolved = await resolveToUserId(String(userId));
    await prisma.tenantSetting.upsert({
      where: { userId: resolved },
      update: { slackWebhookUrl: null, slackToken: null },
      create: { userId: resolved },
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Slack disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect Slack" });
  }
});

export default router;
