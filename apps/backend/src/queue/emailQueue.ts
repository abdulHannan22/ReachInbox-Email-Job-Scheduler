import { Queue, Worker, Job, DelayedError } from "bullmq";
import { connection, workerConnection } from "../config/redis";
import { prisma } from "../config/prisma";
import { sendEmail } from "../services/emailService";
import { indexEmail } from "../services/elasticsearch";

export const emailQueue = new Queue("emailQueue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

const notifySlack = async (userId: string, senderId: string, limit: number) => {
  try {
    const tenant = await prisma.tenantSetting.findUnique({ where: { userId } });
    if (tenant?.slackWebhookUrl) {
      const axios = (await import("axios")).default;
      await axios.post(tenant.slackWebhookUrl, {
        text: `Rate limit reached for sender ${senderId}. Hourly limit: ${limit}`,
      });
    }
  } catch (err) {
    console.error("Slack notification failed", err);
  }
};

export const emailWorker = new Worker(
  "emailQueue",
  async (job: Job) => {
    const { emailJobId, toEmail, subject, body, senderId, userId, delayMs, hourlyLimit } = job.data;
    const safeDelayMs = Number(delayMs) || 2000;
    const safeHourlyLimit = Number(hourlyLimit) || 200;

    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    const hourKey = `rate_limit:${senderId}:${currentHour.getTime()}`;

    // Increment redis counter
    const count = await connection.incr(hourKey);
    if (count === 1) {
      await connection.expire(hourKey, 3600);
    }

    if (count > safeHourlyLimit) {
      // Undo this increment: job is NOT sent, so it must not consume quota.
      await connection.decr(hourKey);
      const nextHour = new Date(currentHour);
      nextHour.setHours(nextHour.getHours() + 1);
      const delayAmount = Math.max(1000, nextHour.getTime() - Date.now());

      console.log(`Rate limit reached for sender ${senderId}. Delaying job ${job.id} by ${delayAmount}ms`);

      if (count === safeHourlyLimit + 1) {
        await notifySlack(userId, senderId, safeHourlyLimit);
      }

      // Reschedule natively: move to delayed and signal the worker to stop
      // processing without counting this as an attempt or a failure.
      await job.moveToDelayed(Date.now() + delayAmount, job.token);
      throw new DelayedError("DELAYED_DUE_TO_RATE_LIMIT");
    }

    const lastSendKey = `last_send:${senderId}`;
    const lastSend = await connection.get(lastSendKey);
    const now = Date.now();
    if (lastSend && now - parseInt(lastSend) < safeDelayMs) {
      await connection.decr(hourKey);
      const waitTime = safeDelayMs - (now - parseInt(lastSend));
      await job.moveToDelayed(now + Math.max(100, waitTime), job.token);
      throw new DelayedError("DELAYED_DUE_TO_MIN_DELAY");
    }

    await connection.set(lastSendKey, Date.now().toString());

    // Send email
    try {
      await sendEmail(toEmail, subject, body);

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: "sent", updatedAt: new Date() }
      });

      await indexEmail({
        id: emailJobId,
        userId,
        senderId,
        toEmail,
        subject,
        body,
        status: "sent",
        scheduledFor: new Date()
      });
    } catch (err: any) {
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: "failed", error: err?.message ?? "Unknown error", updatedAt: new Date() }
      });
      throw err;
    }
  },
  {
    connection: workerConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10)
  }
);

emailWorker.on("failed", (job, err) => {
  if (err instanceof DelayedError || err?.name === "DelayedError") {
    // Not a real failure: the job was moved back to delayed and will be retried.
    return;
  }
  console.error(`Job ${job?.id} failed with error ${err?.message}`);
});

emailWorker.on("error", (err) => {
  console.error("Email worker error:", err);
});
