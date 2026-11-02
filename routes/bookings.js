const router = require("express").Router();
const { ObjectId } = require("mongodb");
const { getDb } = require("../db");
const { verifyToken } = require("../middleware/auth");

const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function findConflict(bookings, { studioId, date, startTime, endTime }, excludeId) {
  const q = {
    studioId,
    date,
    status: "Confirmed",
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  if (excludeId) q._id = { $ne: excludeId };
  return bookings.findOne(q);
}

router.post("/", verifyToken, async (req, res) => {
  const { studioId, date, startTime, endTime } = req.body;
  if (!studioId || !date || !startTime || !endTime || !ObjectId.isValid(studioId)) {
    return res.status(400).json({ message: "Studio, date, start time and end time are required" });
  }
  if (toMin(endTime) <= toMin(startTime)) {
    return res.status(400).json({ message: "End time must be after start time" });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    return res.status(400).json({ message: "You cannot book a date in the past" });
  }

  const db = await getDb();
  const studio = await db.collection("studios").findOne({ _id: new ObjectId(studioId) });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  if (studio.ownerEmail === req.user.email) {
    return res.status(400).json({ message: "You cannot book your own studio" });
  }

  const bookings = db.collection("bookings");
  const conflict = await findConflict(bookings, { studioId, date, startTime, endTime });
  if (conflict) {
    return res.status(409).json({
      message: `This slot is already booked (${conflict.startTime} - ${conflict.endTime}). Please choose another time.`,
    });
  }

  const hours = (toMin(endTime) - toMin(startTime)) / 60;
  const doc = {
    studioId,
    studioTitle: studio.title,
    studioImage: studio.image,
    studioLocation: studio.location,
    studioOwnerEmail: studio.ownerEmail,
    userEmail: req.user.email,
    userName: req.user.name,
    date,
    startTime,
    endTime,
    hours,
    hourlyRate: studio.hourlyRate,
    securityDeposit: studio.securityDeposit,
    totalPrice: hours * studio.hourlyRate,
    status: "Pending",
    createdAt: new Date(),
  };
  const result = await bookings.insertOne(doc);
  res.status(201).json({ insertedId: result.insertedId });
});

router.get("/mine", verifyToken, async (req, res) => {
  const bookings = (await getDb()).collection("bookings");
  res.json(await bookings.find({ userEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

router.get("/requests", verifyToken, async (req, res) => {
  const bookings = (await getDb()).collection("bookings");
  res.json(
    await bookings.find({ studioOwnerEmail: req.user.email }).sort({ createdAt: -1 }).toArray()
  );
});

router.patch("/:id/cancel", verifyToken, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const bookings = (await getDb()).collection("bookings");
  const b = await bookings.findOne({ _id: new ObjectId(req.params.id) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.userEmail !== req.user.email) {
    return res.status(403).json({ message: "Not your booking" });
  }
  if (b.status !== "Pending") {
    return res.status(400).json({ message: "Only pending bookings can be cancelled" });
  }
  await bookings.updateOne({ _id: b._id }, { $set: { status: "Cancelled" } });
  res.json({ message: "Booking cancelled" });
});

router.patch("/:id/confirm", verifyToken, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const bookings = (await getDb()).collection("bookings");
  const b = await bookings.findOne({ _id: new ObjectId(req.params.id) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.studioOwnerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the host can confirm this booking" });
  }
  if (b.status !== "Pending") {
    return res.status(400).json({ message: "Only pending bookings can be confirmed" });
  }
  const conflict = await findConflict(bookings, b, b._id);
  if (conflict) {
    return res.status(409).json({ message: "Another confirmed booking already overlaps this slot" });
  }
  await bookings.updateOne({ _id: b._id }, { $set: { status: "Confirmed" } });
  res.json({ message: "Booking confirmed" });
});

router.patch("/:id/complete", verifyToken, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const bookings = (await getDb()).collection("bookings");
  const b = await bookings.findOne({ _id: new ObjectId(req.params.id) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.studioOwnerEmail !== req.user.email) {
    return res.status(403).json({ message: "Only the host can complete this booking" });
  }
  if (b.status !== "Confirmed") {
    return res.status(400).json({ message: "Only confirmed bookings can be completed" });
  }
  await bookings.updateOne({ _id: b._id }, { $set: { status: "Completed" } });
  res.json({ message: "Booking completed" });
});

module.exports = router;