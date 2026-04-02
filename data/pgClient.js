import pg from "pg";
import fs from "fs";
import path from "path";

const { Client } = pg;
const rawConnectionString = process.env.DATABASE_URL;
const caCertificate = fs.readFileSync(path.join(process.cwd(), "data", "ca.pem"), "utf8");

if (!rawConnectionString) {
  throw new Error("Missing DATABASE_URL in environment");
}

const connectionUrl = new URL(rawConnectionString);
connectionUrl.search = "";

export const client = new Client({
  connectionString: connectionUrl.toString(),
  ssl: {
    rejectUnauthorized: true,
    ca: caCertificate
  }
});

export async function connectToDatabase() {
  try {
    await client.connect();
    const result = await client.query("select current_database() as database_name, now() as server_time");
    console.log("Postgres connected:", result.rows[0]);
  } catch (error) {
    console.error("Postgres connection failed:", error.message);
  } finally {
    await client.end().catch(() => { });
  }

}
