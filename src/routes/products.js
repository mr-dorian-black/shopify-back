import express from "express";
import {
  checkProducts,
  getProductsCount,
} from "../services/shopify/products.js";
import { validateOrderItem } from "../services/kinguin/validation.js";

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

// Validate cart items before checkout
router.post("/validate-cart", async (req, res) => {
  try {
    const items = req.body.line_items || req.body.items; // Support different payload structures

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        ok: false,
        error: "Items array is required",
      });
    }

    console.log(`\n🛒 Validating cart with ${items.length} item(s)...`);

    // Validate all items concurrently
    const validationPromises = items.map(async (item) => {
      try {
        // Item should have: name, sku, price, quantity
        if (!item.sku || !item.price) {
          return {
            valid: false,
            item: item.name || "Unknown",
            reason: "Missing SKU or price",
          };
        }

        const validation = await validateOrderItem(
          {
            name: item.name || item.title || `Product ${item.sku}`,
            sku: item.sku,
            quantity: item.quantity || 1,
          },
          item.price,
        );

        return validation;
      } catch (error) {
        console.error(`❌ Validation error for ${item.sku}:`, error.message);
        return {
          valid: false,
          item: item.name || item.sku,
          reason: `Validation failed: ${error.message}`,
        };
      }
    });

    const results = await Promise.all(validationPromises);
    const invalidItems = results.filter((r) => !r.valid);
    const allValid = invalidItems.length === 0;

    console.log(
      `📊 Validation results: ${results.length - invalidItems.length}/${results.length} valid`,
    );

    if (!allValid) {
      invalidItems.forEach((item) => {
        console.log(`❌ ${item.item}: ${item.reason}`);
      });
    }

    // Categorize errors for better handling
    const outOfStock = invalidItems.filter((i) => i.reason?.includes("stock"));
    const priceMismatch = invalidItems.filter((i) =>
      i.reason?.includes("Price mismatch"),
    );
    const otherErrors = invalidItems.filter(
      (i) =>
        !i.reason?.includes("stock") && !i.reason?.includes("Price mismatch"),
    );

    // Generate recommended actions
    const recommendations = [];

    if (outOfStock.length > 0) {
      recommendations.push({
        severity: "error",
        action: "remove_items",
        message: `${outOfStock.length} item(s) are out of stock and must be removed from cart`,
        items: outOfStock.map((i) => i.item),
      });
    }

    if (priceMismatch.length > 0) {
      recommendations.push({
        severity: "warning",
        action: "update_prices",
        message: `${priceMismatch.length} item(s) have price changes. Please review updated prices.`,
        items: priceMismatch.map((i) => ({
          name: i.item,
          oldPrice: i.shopifyPrice,
          newPrice: i.kinguinPrice,
        })),
      });
    }

    if (otherErrors.length > 0) {
      recommendations.push({
        severity: "error",
        action: "review_items",
        message: `${otherErrors.length} item(s) need review`,
        items: otherErrors.map((i) => i.item),
      });
    }

    res.json({
      ok: true,
      valid: allValid,
      canProceedToCheckout: allValid,
      items: results,
      summary: {
        total: results.length,
        valid: results.length - invalidItems.length,
        invalid: invalidItems.length,
        outOfStock: outOfStock.length,
        priceMismatch: priceMismatch.length,
      },
      errors: invalidItems,
      recommendations,
    });
  } catch (error) {
    console.error("❌ Cart validation error:", error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

export default router;
