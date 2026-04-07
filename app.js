import { startLiveDataHandler } from "./functions/liveDataHandler.js";
import global from "./data/global.js";
export const startApp = async () => {
  try {
    await global.setGlobalData();
     startLiveDataHandler(global.watchlist);
  } catch (error) {
    console.error("Socket setup failed:", error.message);
  }
};
