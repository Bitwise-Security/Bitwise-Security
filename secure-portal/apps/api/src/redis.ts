import { Redis } from "ioredis";
import { getConfig } from "./config.js";

let redis: Redis | undefined;

export function getRedis(): Redis {
  redis ??= new Redis(getConfig().REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  return redis;
}

export function closeRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = undefined;
  }
  return Promise.resolve();
}
