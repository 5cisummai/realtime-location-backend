const baseUrl = process.env.API_URL ?? "http://localhost:3000";
const email = `smoke-${Date.now()}@example.com`;
const password = "integration-password-123";

const signup = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Runner", email, password }),
});
if (!signup.ok) throw new Error(`Sign-up failed: ${await signup.text()}`);
const token = signup.headers.get("set-auth-token");
if (!token) throw new Error("Better Auth did not return a bearer token");

const activityId = crypto.randomUUID();
const created = await fetch(`${baseUrl}/v1/activities`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ id: activityId, sport: "run", name: "Smoke run" }),
});
if (!created.ok) throw new Error(`Activity creation failed: ${await created.text()}`);

const wsUrl = `${baseUrl.replace("http", "ws")}/v1/realtime?token=${encodeURIComponent(token)}`;

function createClient(clientName: string) {
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const received = new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`${clientName} did not receive a location event`));
    }, 10_000);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "subscribe",
          channel: `activity:${activityId}`,
          ref: clientName,
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { type: string };
      if (message.type === "ack") {
        markReady();
      } else if (message.type === "location") {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`${clientName} WebSocket failed`));
    });
  });
  return { ready, received };
}

const clients = [
  createClient("viewer-one"),
  createClient("viewer-two"),
];
await Promise.all(clients.map((client) => client.ready));

const points = await fetch(`${baseUrl}/v1/activities/${activityId}/points`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    points: [
      {
        lat: 37.7749,
        lng: -122.4194,
        recordedAt: new Date().toISOString(),
        accuracy: 5,
        speed: 3.2,
      },
    ],
  }),
});
if (!points.ok) throw new Error(`Point upload failed: ${await points.text()}`);

await Promise.all(clients.map((client) => client.received));
console.log("Two WebSocket clients received the live location event.");
