import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb() {
  if (db) return db;
  const uri = process.env.MONGODB_URI || "";
  const name = process.env.MONGODB_DB || "persona";
  if (!uri) throw new Error("MONGODB_URI missing");
  if (!client) client = new MongoClient(uri);
  if (!db) {
    await client.connect();
    db = client.db(name);
  }
  return db;
}

export async function closeDb() {
  if (client) await client.close();
  client = null;
  db = null;
}
