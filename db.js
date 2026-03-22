import mysql from "mysql2/promise";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// ===============================
// Validate Required ENV
// ===============================
const requiredVars = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME"
];

for (const key of requiredVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

// ===============================
// SSL Configuration (Optional)
// ===============================
let sslConfig = undefined;

if (process.env.DB_SSL_CA_PATH) {
  try {
    sslConfig = {
      ca: fs.readFileSync(process.env.DB_SSL_CA_PATH)
    };
    console.log("🔐 SSL enabled for DB connection.");
  } catch (err) {
    console.error("❌ Failed to read SSL CA file:", err.message);
    process.exit(1);
  }
} else {
  console.log("⚠️  No SSL CA provided. Connecting without SSL.");
}

// ===============================
// Create Connection Pool
// ===============================
export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl: {
    rejectUnauthorized: false
  }
});

// ===============================
// Connection Test
// ===============================
(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database connected successfully!");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
})();
