const { MongoClient } = require("mongodb");

let db;

async function getDb() {
  if (db) return db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("studiospace");
  return db;
}

module.exports = { getDb };