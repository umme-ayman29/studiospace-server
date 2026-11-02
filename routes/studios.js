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

router.post("/", verifyToken, async (req, res) => {
  const b = req.body;
  if (!b.title || !b.category || !b.hourlyRate || !b.location || !b.image || !b.overview) {
    return res.status(400).json({ message: "Please fill in all required fields" });
  }
  const doc = {
    title: b.title,
    category: b.category,
    hourlyRate: Number(b.hourlyRate),
    securityDeposit: Number(b.securityDeposit) || 0,
    maxCapacity: Number(b.maxCapacity) || 1,
    location: b.location,
    image: b.image,
    images: Array.isArray(b.images) && b.images.length ? b.images : [b.image],
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    overview: b.overview,
    ownerEmail: req.user.email,
    ownerName: req.user.name,
    rating: 0,
    reviewCount: 0,
    createdAt: new Date(),
  };
  const studios = (await getDb()).collection("studios");
  const result = await studios.insertOne(doc);
  res.status(201).json({ insertedId: result.insertedId });
});

router.patch("/:id", verifyToken, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid studio id" });
  const studios = (await getDb()).collection("studios");
  const studio = await studios.findOne({ _id: new ObjectId(req.params.id) });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only edit your own studios" });
  }
  const b = req.body;
  const update = {
    title: b.title,
    category: b.category,
    hourlyRate: Number(b.hourlyRate),
    securityDeposit: Number(b.securityDeposit) || 0,
    maxCapacity: Number(b.maxCapacity) || 1,
    location: b.location,
    image: b.image,
    images: Array.isArray(b.images) && b.images.length ? b.images : [b.image],
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    overview: b.overview,
    updatedAt: new Date(),
  };
  await studios.updateOne({ _id: studio._id }, { $set: update });
  res.json({ message: "Studio updated" });
});

router.delete("/:id", verifyToken, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid studio id" });
  const studios = (await getDb()).collection("studios");
  const studio = await studios.findOne({ _id: new ObjectId(req.params.id) });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  if (studio.ownerEmail !== req.user.email) {
    return res.status(403).json({ message: "You can only delete your own studios" });
  }
  await studios.deleteOne({ _id: studio._id });
  res.json({ message: "Studio deleted" });
});

router.post("/:id/reviews", verifyToken, async (req, res) => {
  const { rating, comment } = req.body;
  const r = Number(rating);
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid studio id" });
  if (!r || r < 1 || r > 5 || !comment) {
    return res.status(400).json({ message: "Rating (1-5) and comment are required" });
  }
  const db = await getDb();
  const studio = await db.collection("studios").findOne({ _id: new ObjectId(req.params.id) });
  if (!studio) return res.status(404).json({ message: "Studio not found" });

  await db.collection("reviews").insertOne({
    studioId: req.params.id,
    userEmail: req.user.email,
    userName: req.user.name,
    rating: r,
    comment,
    createdAt: new Date(),
  });
  const stats = await db
    .collection("reviews")
    .aggregate([
      { $match: { studioId: req.params.id } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ])
    .toArray();
  await db.collection("studios").updateOne(
    { _id: studio._id },
    { $set: { rating: Number(stats[0].avg.toFixed(1)), reviewCount: stats[0].count } }
  );
  res.status(201).json({ message: "Review added" });
});

module.exports = router;