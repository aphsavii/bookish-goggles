import pg from "pg";

const { Client } = pg;
const rawConnectionString = process.env.DATABASE_URL;
const caCertificate = process.env.DATABASE_CERT;

if (!rawConnectionString) {
  throw new Error("Missing DATABASE_URL in environment");
}

const connectionUrl = new URL(rawConnectionString);
connectionUrl.search = "";

const client = new Client({
  connectionString: connectionUrl.toString(),
  ssl: {
    rejectUnauthorized: true,
    ca: caCertificate
  }
});

try {
  await client.connect();
  const result = await client.query("select current_database() as database_name, now() as server_time");
  console.log("Postgres connected:", result.rows[0]);
} catch (error) {
  console.error("Postgres connection failed:", error.message);
} finally {
  await client.end().catch(() => {});
}
