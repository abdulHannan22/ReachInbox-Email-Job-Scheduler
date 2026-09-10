import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { emailQueue } from "../queue/emailQueue";
import { indexEmail } from "../services/elasticsearch";

export const scheduleEmails = async (req: Request, res: Response) => {
  try {
    const { userId, senderEmail, emails, subject, body, startTime, hourlyLimit, delayMs } = req.body;

    if (!userId || !senderEmail || !emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: "Missing required fields: userId, senderEmail, emails[]" });
    }
    if (!subject || !body) {
      return res.status(400).json({ error: "Missing required fields: subject, body" });
    }

    // Frontend sends user email address as userId, but Prisma User.id is a uuid.
    // Resolve-or-create the User row first so FK constraints on
    // SenderConfig.userId / EmailJob.userId never fail.
    const user = await prisma.user.upsert({
      where: { email: String(senderEmail) },
      update: {},
      create: { email: String(senderEmail) },
    });
    const resolvedUserId: string = user.id;

    const safeHourlyLimit = Number(hourlyLimit) > 0 ? Number(hourlyLimit) : 200;
    const safeDelayMs = Number(delayMs) >= 0 ? Number(delayMs) : 2000;
    const startTimestamp = startTime ? new Date(startTime).getTime() : Date.now();
    if (Number.isNaN(startTimestamp)) {
      return res.status(400).json({ error: "Invalid startTime" });
    }

    // Upsert sender
    let sender = await prisma.senderConfig.findFirst({
      where: { userId: resolvedUserId, email: senderEmail }
    });

    if (!sender) {
      sender = await prisma.senderConfig.create({
        data: { userId: resolvedUserId, email: senderEmail, hourlyLimit: safeHourlyLimit, delayMs: safeDelayMs }
      });
    } else {
      sender = await prisma.senderConfig.update({
        where: { id: sender.id },
        data: { hourlyLimit: safeHourlyLimit, delayMs: safeDelayMs }
      });
    }

    // Save to DB and enqueue
    const jobs = [];
    let currentDelay = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const scheduledFor = new Date(startTimestamp + currentDelay);

      const emailJob = await prisma.emailJob.create({
        data: {
          userId: resolvedUserId,
          senderId: sender.id,
          toEmail: email,
          subject,
          body,
          scheduledFor
        }
      });

      // Also index in ES as scheduled
      await indexEmail({
        id: emailJob.id,
        userId: resolvedUserId,
        senderId: sender.id,
        toEmail: email,
        subject,
        body,
        status: "scheduled",
        scheduledFor
      });

      const delayAmount = Math.max(0, scheduledFor.getTime() - Date.now());

      const bullJob = await emailQueue.add("send-email", {
        emailJobId: emailJob.id,
        toEmail: email,
        subject,
        body,
        senderId: sender.id,
        userId: resolvedUserId,
        delayMs: sender.delayMs,
        hourlyLimit: sender.hourlyLimit
      }, {
        delay: delayAmount,
        jobId: emailJob.id // Ensure no duplicates
      });

      await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { bullJobId: bullJob.id }
      });

      jobs.push(emailJob);
      currentDelay += sender.delayMs; // Base delay calculation
    }

    return res.status(200).json({ message: "Emails scheduled successfully", count: jobs.length });
  } catch (error: any) {
    console.error("Error scheduling emails:", error);
    return res.status(500).json({ error: error.message });
  }
};

const resolveUserId = async (rawUserId: unknown): Promise<string | null> => {
  if (!rawUserId) return null;
  const raw = String(rawUserId);
  const byId = await prisma.user.findUnique({ where: { id: raw } }).catch(() => null);
  if (byId) return byId.id;
  const byEmail = await prisma.user.findUnique({ where: { email: raw } }).catch(() => null);
  if (byEmail) return byEmail.id;
  const sender = await prisma.senderConfig.findFirst({ where: { email: raw } }).catch(() => null);
  if (sender) return sender.userId;
  return null;
};

export const getScheduledEmails = async (req: Request, res: Response) => {
  const { userId, query } = req.query;
  // Implementation using ES or DB
  // Because ES is required, we can use searchEmails service (which I will add there)
  // But for now just query DB for simplicity if no query, else ES
  try {
    const resolved = await resolveUserId(userId);
    if (!resolved) return res.json([]);
    const jobs = await prisma.emailJob.findMany({
      where: { userId: resolved, status: "scheduled" },
      orderBy: { scheduledFor: "asc" }
    });
    return res.json(jobs);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch scheduled emails" });
  }
};

export const getSentEmails = async (req: Request, res: Response) => {
  const { userId, query } = req.query;
  try {
    const resolved = await resolveUserId(userId);
    if (!resolved) return res.json([]);
    const jobs = await prisma.emailJob.findMany({
      where: { userId: resolved, status: "sent" },
      orderBy: { scheduledFor: "desc" }
    });
    return res.json(jobs);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch sent emails" });
  }
};
