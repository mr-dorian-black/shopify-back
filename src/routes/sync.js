import express from "express";
import fs from "fs";
import { getKinguinProducts } from "../services/kinguin/products.js";
import { buildProductInput } from "../utils/product-builder.js";
import { getAllProductsMap } from "../services/shopify/products.js";
import {
  writeJSONL,
  stagedUpload,
  uploadFile,
  runBulk,
  pollBulkOperation,
} from "../services/shopify/bulk.js";
import SyncScheduler from "../services/sync/scheduler.js";

const router = express.Router();

const PAGES_PER_BATCH = 2; // Reduced from 3 to prevent upload timeouts

// Global scheduler instance
let scheduler = null;

router.post("/full", async (req, res) => {
  res.json({ ok: true, message: "Sync started in background" });

  const platforms = req.body?.platforms || "all";

  try {
    await fullSync(platforms);
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
  }
});

// Start auto-sync scheduler
router.post("/auto/start", (req, res) => {
  try {
    if (scheduler && scheduler.isRunning) {
      return res.json({
        ok: false,
        message: "Scheduler already running",
      });
    }

    const platforms = req.body?.platforms || "all";
    const options = {
      platforms: platforms,
      batchSize: req.body?.batchSize || 10, // 10 pages
      intervalMinutes: req.body?.intervalMinutes || 30,
      concurrency: req.body?.concurrency || 8,
    };

    scheduler = new SyncScheduler(options);
    scheduler.start();

    res.json({
      ok: true,
      message: "Auto-sync scheduler started",
      settings: {
        ...options,
        platforms: platforms === "all" ? "all" : platforms,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

// Stop auto-sync scheduler
router.post("/auto/stop", (req, res) => {
  try {
    if (!scheduler || !scheduler.isRunning) {
      return res.json({
        ok: false,
        message: "Scheduler not running",
      });
    }

    scheduler.stop();

    res.json({
      ok: true,
      message: "Auto-sync scheduler stopped",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

// Get scheduler status
router.get("/auto/status", (req, res) => {
  try {
    if (!scheduler) {
      return res.json({
        ok: true,
        running: false,
        message: "Scheduler not initialized",
      });
    }

    const stats = scheduler.getStats();

    res.json({
      ok: true,
      running: scheduler.isRunning,
      stats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

// Manual sync batch (for testing)
router.post("/auto/run-now", async (req, res) => {
  try {
    if (!scheduler) {
      const platforms = req.body?.platforms || "all";
      scheduler = new SyncScheduler({
        platforms: platforms,
        batchSize: req.body?.batchSize || 10,
        intervalMinutes: req.body?.intervalMinutes || 10,
        concurrency: req.body?.concurrency || 8,
      });
    }

    res.json({
      ok: true,
      message: "Manual sync started in background",
    });

    // Run in background
    scheduler.runSyncBatch().catch((error) => {
      console.error("❌ Manual sync failed:", error.message);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
});

async function fullSync(platforms = "all") {
  console.log("🚀 FULL SYNC START");

  // Если platforms === 'all' или не передан, то не фильтруем по платформе
  const shouldFilterByPlatform =
    Array.isArray(platforms) && platforms.length > 0;

  if (shouldFilterByPlatform) {
    console.log("Platforms:", platforms);

    for (const platform of platforms) {
      console.log(`\n📦 Processing platform: ${platform}`);
      await syncPlatform(platform);
    }
  } else {
    console.log("Processing all platforms without filter");
    await syncPlatform(null); // null означает без фильтра по платформе
  }

  console.log("\n✅ FULL SYNC DONE");
}

async function syncPlatform(platform) {
  // Fetch existing products map for bulk operations (avoids "handle already in use" errors)
  console.log(`📋 Fetching existing products from Shopify...`);
  const existingProductsMap = await getAllProductsMap();
  console.log(
    `📋 Found ${existingProductsMap.size} existing products in Shopify\n`,
  );

  let batchNumber = 1;
  let startPage = 1;

  while (true) {
    console.log(
      `\n🔄 BATCH ${batchNumber} (pages ${startPage} to ${startPage + PAGES_PER_BATCH - 1})`,
    );

    const productsToSync = [];
    let pagesProcessed = 0;
    let hasMorePages = true;

    while (pagesProcessed < PAGES_PER_BATCH && hasMorePages) {
      const currentPage = startPage + pagesProcessed;

      try {
        const params = { page: currentPage };
        if (platform) {
          params.platform = platform;
        }

        const data = await getKinguinProducts(params);

        if (!data.results || data.results.length === 0) {
          console.log(`⚠️ No products on page ${currentPage}, stopping batch`);
          hasMorePages = false;
          break;
        }

        console.log(`📄 Page ${currentPage}: ${data.results.length} products`);

        productsToSync.push(...data.results);
        pagesProcessed++;

        if (data.results.length < 100) {
          console.log(`⚠️ Last page reached at page ${currentPage}`);
          hasMorePages = false;
          break;
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        hasMorePages = false;
        break;
      }
    }

    if (productsToSync.length === 0) {
      console.log(`✅ No more products to sync`);
      break;
    }

    console.log(
      `\n📝 Preparing ${productsToSync.length} products for bulk upload...`,
    );

    try {
      const rows = productsToSync
        .map((product) => {
          try {
            // Get SKU for lookup
            const sku = String(product.productId || product.kinguinId);
            const existingProduct = existingProductsMap.get(sku);

            if (existingProduct) {
              console.log(
                `♻️  Will update: ${product.name} (${existingProduct.id})`,
              );
            } else {
              console.log(`🆕 Will create: ${product.name} (SKU: ${sku})`);
            }

            return {
              input: buildProductInput(product, existingProduct?.id || null),
            };
          } catch (error) {
            console.error(
              `❌ Failed to build product ${product.productId}:`,
              error.message,
            );
            return null;
          }
        })
        .filter(Boolean);

      if (rows.length === 0) {
        console.error(`❌ No valid products to upload in batch ${batchNumber}`);
        break;
      }

      // Count creates vs updates
      const updateCount = rows.filter((r) => r.input.id).length;
      const createCount = rows.length - updateCount;

      console.log(
        `✅ Built ${rows.length} valid product inputs (${productsToSync.length - rows.length} skipped)`,
      );
      console.log(
        `   🆕 ${createCount} new products, ♻️  ${updateCount} updates`,
      );

      const jsonlFile = `batch_${platform || "all"}_${batchNumber}.jsonl`;
      await writeJSONL(jsonlFile, rows);

      console.log(`📤 Staged upload ${jsonlFile}...`);
      const target = await stagedUpload(jsonlFile);

      console.log(`📤 Upload file ${jsonlFile}...`);
      const stagedPath = await uploadFile(target, jsonlFile);

      console.log(`🚀 Starting bulk operation...`);
      const mutation = `mutation call($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            title
            status
          }
          userErrors {
            field
            message
          }
        }
      }`;

      const bulkId = await runBulk(mutation, stagedPath);

      console.log(`⏳ Polling bulk operation...`);
      const result = await pollBulkOperation(bulkId);

      console.log(`\n📊 Batch ${batchNumber} Results:`);
      console.log(
        `✅ Products created: ${result.analysis?.productsCreated || 0}`,
      );
      console.log(
        `♻️  Products updated: ${result.analysis?.productsUpdated || 0}`,
      );
      console.log(`❌ Errors: ${result.analysis?.errors?.length || 0}`);

      // Cleanup
      try {
        fs.unlinkSync(jsonlFile);
        console.log(`🗑️  Cleaned up ${jsonlFile}`);
      } catch (cleanupError) {
        console.warn(
          `⚠️ Failed to cleanup ${jsonlFile}:`,
          cleanupError.message,
        );
      }
    } catch (error) {
      console.error(`❌ Batch ${batchNumber} failed:`, error.message);
      // Continue to next batch instead of stopping entirely
    }

    if (!hasMorePages) {
      console.log(`✅ Completed all pages`);
      break;
    }

    startPage += pagesProcessed;
    batchNumber++;
  }
}

export default router;
