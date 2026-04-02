import express from 'express';
import { startApp } from './app.js';
import { startLiveDataHandler } from "./liveDataHandler.js";
import { getScriptMaster } from './functions/getScripMaster.js';
import { connectToDatabase } from './data/pgClient.js';
const app = express();
const PORT = 3000;

app.listen(PORT, () => {
    console.log("Server is running on port: " + PORT);
    startApp().catch((error) => {
        console.error("App startup failed:", error.message);
    });

    connectToDatabase();

    getScriptMaster();

    try {
        startLiveDataHandler();
    } catch (error) {
        console.error("Socket setup failed:", error.message);
    }
});
