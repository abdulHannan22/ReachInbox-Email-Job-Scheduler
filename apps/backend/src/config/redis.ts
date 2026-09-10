import "dotenv/config";
import Redis from "ioredis";

const redisHost = process.env.REDIS_HOST || "localhost";
const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

function createRedisConnection() {
  return new Redis({
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
  });
}

// BullMQ requires separate (blocking vs non-blocking) connections for
// Queue and Worker. Sharing one instance causes "blocking connection"
// errors and interferes with rate-limit commands.
export const connection = createRedisConnection();
export const workerConnection = createRedisConnection();

