import type { WSContext } from "hono/ws";
import { redis, redisSubscriber } from "../redis.js";
import type { ServerMessage } from "./protocol.js";

const socketsByChannel = new Map<string, Set<WSContext>>();
const channelsBySocket = new Map<WSContext, Set<string>>();

redisSubscriber.on("message", (channel, message) => {
  const sockets = socketsByChannel.get(channel);
  if (!sockets) return;
  for (const socket of sockets) {
    socket.send(message);
  }
});

export async function subscribeSocket(socket: WSContext, channel: string) {
  let sockets = socketsByChannel.get(channel);
  if (!sockets) {
    sockets = new Set();
    socketsByChannel.set(channel, sockets);
    await redisSubscriber.subscribe(channel);
  }
  sockets.add(socket);

  const channels = channelsBySocket.get(socket) ?? new Set<string>();
  channels.add(channel);
  channelsBySocket.set(socket, channels);

  const snapshot = await redis.get(`live:${channel}`);
  if (snapshot) {
    const cached = JSON.parse(snapshot) as { data?: unknown };
    send(socket, { type: "snapshot", channel, data: cached.data ?? cached });
  }
}

export async function unsubscribeSocket(socket: WSContext, channel: string) {
  const sockets = socketsByChannel.get(channel);
  sockets?.delete(socket);
  channelsBySocket.get(socket)?.delete(channel);
  if (sockets?.size === 0) {
    socketsByChannel.delete(channel);
    await redisSubscriber.unsubscribe(channel);
  }
}

export async function removeSocket(socket: WSContext) {
  const channels = [...(channelsBySocket.get(socket) ?? [])];
  await Promise.all(channels.map((channel) => unsubscribeSocket(socket, channel)));
  channelsBySocket.delete(socket);
}

export function send(socket: WSContext, message: ServerMessage) {
  socket.send(JSON.stringify(message));
}
