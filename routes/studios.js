const router = require("express").Router();
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken } = require("../middleware/auth");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = (id) => ObjectId.isValid(id);

router.get("/", async (req, res) => {
  const { category, search, sort } = req.query;
  const query = {};
  if (category && category !== "all") query.category = category;
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [{ title: rx }, { location: rx }];
  }
  let sortObj = { createdAt: -1 };
  if (sort === "price-asc") sortObj = { hourlyRate: 1 };
  if (sort === "price-desc") sortObj = { hourlyRate: -1 };
  if (sort === "rating") sortObj = { rating: -1 };

  const studios = (await getDb()).collection("studios");
  res.json(await studios.find(query).sort(sortObj).toArray());
});

router.get("/featured", async (req, res) => {
  const studios = (await getDb()).collection("studios");
  res.json(await studios.find().sort({ rating: -1, createdAt: -1 }).limit(6).toArray());
});

router.get("/mine", verifyToken, async (req, res) => {
  const studios = (await getDb()).collection("studios");
  res.json(
    await studios.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray()
  );
});

router.get("/:id", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid studio id" });
  const db = await getDb();
  const studio = await db.collection("studios").findOne({ _id: new ObjectId(req.params.id) });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  const reviews = await db
    .collection("reviews")
    .find({ studioId: req.params.id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ ...studio, reviews });
});

// WRITE_ROUTES_HERE

module.exports = router;