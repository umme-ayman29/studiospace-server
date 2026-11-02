require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { getDb } = require("./db");

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    await getDb();
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.get("/", (req, res) => res.json({ ok: true, name: "StudioSpace API" }));
app.use("/auth", require("./routes/auth"));
app.use("/studios", require("./routes/studios"));
// ROUTES_HERE

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 5000, () =>
    console.log("Server running on port", process.env.PORT || 5000)
  );
}

module.exports = app;