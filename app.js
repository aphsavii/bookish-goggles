import { startLiveDataHandler } from "./functions/liveDataHandler.js";
import global from "./data/global.js";
import { preloadIntradayVolumeProfiles } from "./functions/helpers/preloadIntradayVolumeProfiles.js";
export const startApp = async () => {
  try {
    console.log("[App] Starting application...");
    console.log("[App] Environment check:");
    console.log(`[App] NEO_SOCKET_TOKEN exists: ${!!process.env.NEO_SOCKET_TOKEN}`);
    console.log(`[App] NEO_SOCKET_SID exists: ${!!process.env.NEO_SOCKET_SID}`);
    console.log(`[App] NEO_SOCKET_URL: ${process.env.NEO_SOCKET_URL}`);
    
    await global.setGlobalData();
    const intradayVolumeProfiles = await preloadIntradayVolumeProfiles(global.watchlist);
    global.setIntradayVolumeProfiles(intradayVolumeProfiles);
    startLiveDataHandler(global.watchlist);
  } catch (error) {
    console.error("[App] Fatal error:", error.message);
    console.error("[App] Error stack:", error.stack);
  }
};
