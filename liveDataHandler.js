import { createLiveFeedClient } from "./socketConnection.js";

const liveFeedClient = createLiveFeedClient();

liveFeedClient.on("open", () => {
  console.log("Connected to Live Feed");
});

liveFeedClient.on("message", (data) => {
  console.log("Socket message:", data);
});

liveFeedClient.on("error", (error) => {
  console.error("Socket error event:", error);
});

liveFeedClient.on("close", (event) => {
  console.warn(`Socket closed: code=${event.code}, reason=${event.reason || "none"}`);
});

export function startLiveDataHandler() {
  liveFeedClient.connect();
  const payload = liveFeedClient.subscribe("mws", "nse_cm|11536", 1);
  // console.log("Queued subscription:", payload);
  return liveFeedClient;
}

export { liveFeedClient };
