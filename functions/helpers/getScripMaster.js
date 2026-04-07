import https from "https";
import fs from "fs";
import csv from "csv-parser";



function fetchScripMasterToJson(url) {
    return new Promise((resolve, reject) => {
        const result = {};

        https.get(url, (res) => {
            res
                .pipe(csv())
                .on("data", (row) => {
                    const values = Object.values(row);

                    if (values.length >= 6) {
                        const key = values[5]?.trim();   // 6th column
                        const value = values[0]?.trim(); // 1st column

                        if (key) {
                            result[key] = value;
                        }
                    }
                })
                .on("end", () => resolve(result))
                .on("error", reject);
        }).on("error", reject);
    });
}

// URL
const SCRIP_MASTER_URL = process.env.SCRIP_MASTER_URL;

export function getScriptMaster() {
    // Run
    fetchScripMasterToJson(SCRIP_MASTER_URL)
        .then((data) => {
            // Write to file
            fs.writeFileSync(
                "data/scripMaster.json",
                JSON.stringify(data, null, 2),
                "utf-8"
            );

            console.log("✅ File saved as scripMaster.json");
        })
        .catch((err) => {
            console.error("❌ Error:", err);
        });

}

