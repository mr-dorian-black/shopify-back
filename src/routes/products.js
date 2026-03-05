import express from "express";
import {
  checkProducts,
  getProductsCount,
} from "../services/shopify/products.js";

const router = express.Router();

router.get("/check", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await checkProducts(limit);

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

router.get("/count", async (req, res) => {
  try {
    const count = await getProductsCount();

    res.json({
      ok: true,
      count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

export default router;
