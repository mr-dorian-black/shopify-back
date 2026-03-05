import express from "express";
import syncRoutes from "./sync.js";
import productsRoutes from "./products.js";
import webhooksRoutes from "./webhooks.js";
import { getCurrentToken } from "../services/shopify/auth.js";
import { createMetafieldDefinitions } from "../utils/create-metafields.js";

const router = express.Router();

router.get("/token", (req, res) => {
  const token = getCurrentToken();
  res.json({ token });
});

router.use("/sync", syncRoutes);
router.use("/products", productsRoutes);
router.use("/webhooks", webhooksRoutes);

router.post("/metafields/init", async (req, res) => {
  try {
    await createMetafieldDefinitions();
    res.json({ ok: true, message: "Metafield definitions created" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
