const { MongoClient } = require("mongodb");

let dbPromise;

function getDb() {
  if (!dbPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    dbPromise = client
      .connect()
      .then(() => client.db("studiospace"))
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

module.exports = { getDb };