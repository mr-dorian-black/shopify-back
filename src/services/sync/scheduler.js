import pLimit from "p-limit";
import { buildProductInput } from "../../utils/product-builder.js";
import { getKinguinProducts, getProductDetails } from "../kinguin/products.js";
import { getAllProductsMap } from "../shopify/products.js";
import { shopifyGraphQL } from "../../config/axios.js";

class SyncScheduler {
  constructor(options = {}) {
    this.isRunning = false;
    this.currentPage = 1;
    this.totalPages = null;
    // Handle "all" platforms or array of specific platforms
    const platforms = options.platforms || "all";
    this.platforms = platforms === "all" ? null : platforms;
    this.batchSize = options.batchSize || 10; // 10 pages = ~1000 products
    this.intervalMinutes = options.intervalMinutes || 30;
    this.concurrency = options.concurrency || 8;
    this.stats = {
      totalProcessed: 0,
      updated: 0,
      errors: 0,
      lastSync: null,
      cycles: 0,
    };
  }

  start() {
    if (this.isRunning) {
      console.log("⚠️ Scheduler already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Starting auto-sync scheduler");
    console.log(`📊 Settings:`);
    console.log(
      `   - Platforms: ${this.platforms ? this.platforms.join(", ") : "ALL"}`,
    );
    console.log(
      `   - Batch size: ${this.batchSize} pages (~${this.batchSize * 100} products)`,
    );
    console.log(`   - Interval: ${this.intervalMinutes} minutes`);
    console.log(`   - Concurrency: ${this.concurrency}`);

    this.scheduleNextSync();
  }

  stop() {
    this.isRunning = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    console.log("⏹️ Scheduler stopped");
  }

  scheduleNextSync() {
    if (!this.isRunning) return;

    const delayMs = this.intervalMinutes * 60 * 1000;

    this.timeout = setTimeout(async () => {
      try {
        await this.runSyncBatch();
      } catch (error) {
        console.error("❌ Sync batch failed:", error.message);
        this.stats.errors++;
      }

      this.scheduleNextSync();
    }, delayMs);

    const nextSyncTime = new Date(Date.now() + delayMs);
    console.log(`⏰ Next sync at: ${nextSyncTime.toLocaleString()}`);
  }

  async runSyncBatch() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 Starting sync batch #${this.stats.cycles + 1}`);
    console.log(`📍 Current page: ${this.currentPage}`);
    console.log(`${"=".repeat(60)}\n`);

    // Fetch existing products map once at the start
    console.log(`📋 Fetching existing products from Shopify...`);
    const existingProductsMap = await getAllProductsMap();
    console.log(
      `📋 Found ${existingProductsMap.size} existing products in Shopify\n`,
    );

    const limit = pLimit(this.concurrency);
    const updates = [];
    const MAX_UPDATES_PER_BATCH = 100; // Prevent memory leak

    // If platforms is null, process all platforms (no filter)
    // Otherwise, iterate through specific platforms
    if (this.platforms === null) {
      console.log(`\n📦 Processing all platforms (no filter)`);
      await this.processPlatformBatch(
        null,
        limit,
        updates,
        MAX_UPDATES_PER_BATCH,
        existingProductsMap,
      );
    } else {
      for (const platform of this.platforms) {
        console.log(`\n📦 Processing platform: ${platform}`);
        await this.processPlatformBatch(
          platform,
          limit,
          updates,
          MAX_UPDATES_PER_BATCH,
          existingProductsMap,
        );

        // Stop if we've reached the batch limit
        if (updates.length >= MAX_UPDATES_PER_BATCH) {
          console.log(
            `⚠️ Reached batch limit of ${MAX_UPDATES_PER_BATCH} updates`,
          );
          break;
        }
      }
    }

    // Apply updates if any
    if (updates.length > 0) {
      console.log(`\n📝 Applying ${updates.length} updates...`);
      await this.applyBulkUpdates(updates, existingProductsMap);
      this.stats.updated += updates.length;
    } else {
      console.log(`\n✅ No updates needed in this batch`);
    }

    this.stats.lastSync = new Date();
    this.printStats();
  }

  async processPlatformBatch(
    platform,
    limit,
    updates,
    maxUpdates,
    existingProductsMap,
  ) {
    let pagesProcessed = 0;

    while (pagesProcessed < this.batchSize) {
      // Stop if we've reached the max updates limit
      if (updates.length >= maxUpdates) {
        console.log(
          `⚠️ Reached max updates limit (${maxUpdates}), stopping batch`,
        );
        break;
      }

      const currentPage = this.currentPage + pagesProcessed;

      try {
        const params = { page: currentPage };
        if (platform) {
          params.platform = platform;
        }

        const data = await getKinguinProducts(params);

        if (!data.results || data.results.length === 0) {
          console.log(
            `⚠️ No products on page ${currentPage}, resetting to page 1`,
          );
          this.currentPage = 1;
          this.stats.cycles++;
          break;
        }

        console.log(`📄 Page ${currentPage}: ${data.results.length} products`);

        // Fetch details for all products concurrently
        const promises = data.results.map((p) =>
          limit(async () => {
            try {
              const details = await getProductDetails(p.productId);
              return details;
            } catch (err) {
              console.error(
                `❌ Failed to fetch details for ${p.productId}:`,
                err.message,
              );
              return null;
            }
          }),
        );

        const results = await Promise.all(promises);
        const validDetails = results.filter(Boolean);

        // Add all valid products to updates array
        for (const product of validDetails) {
          try {
            const sku = product.productId || product.kinguinId;
            const existingProduct = existingProductsMap.get(sku);

            if (existingProduct) {
              console.log(`♻️ Will update: ${product.name} (SKU: ${sku})`);
            } else {
              console.log(`🆕 Will create: ${product.name} (SKU: ${sku})`);
            }

            updates.push(product);
            this.stats.totalProcessed++;
          } catch (error) {
            console.error(
              `❌ Error processing ${product.name}:`,
              error.message,
            );
            this.stats.errors++;
          }
        }

        pagesProcessed++;

        if (!data.hasMore || data.results.length < 100) {
          console.log(`⚠️ Last page reached, resetting to page 1`);
          this.currentPage = 1;
          this.stats.cycles++;
          break;
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        this.stats.errors++;
        break;
      }
    }

    this.currentPage += pagesProcessed;
  }

  async applyBulkUpdates(products, existingProductsMap) {
    if (!products || products.length === 0) {
      console.log("⚠️ No products to update");
      return;
    }

    try {
      console.log(`📝 Preparing ${products.length} mutations...`);

      let newCount = 0;
      let updateCount = 0;

      // Build mutations with variables
      const mutations = products
        .map((product) => {
          try {
            const sku = product.productId || product.kinguinId;
            const existingProduct = existingProductsMap.get(sku);
            const existingProductId = existingProduct?.id || null;

            if (existingProductId) {
              updateCount++;
            } else {
              newCount++;
            }

            const input = buildProductInput(product, existingProductId);

            return {
              query: `
                mutation($input: ProductSetInput!) {
                  productSet(input: $input) {
                    product {
                      id
                      title
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `,
              variables: { input },
              productName: product.name,
            };
          } catch (error) {
            console.error(
              `❌ Failed to build input for ${product.name}:`,
              error.message,
            );
            return null;
          }
        })
        .filter(Boolean);

      if (mutations.length === 0) {
        console.error("❌ No valid mutations to execute");
        return;
      }

      console.log(
        `🚀 Executing ${mutations.length} mutations (🆕 ${newCount} new, ♻️ ${updateCount} updates)...`,
      );

      // Execute mutations in batches to avoid rate limits
      const batchSize = 10;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < mutations.length; i += batchSize) {
        const batch = mutations.slice(i, i + batchSize);

        const results = await Promise.allSettled(
          batch.map(async ({ query, variables, productName }) => {
            try {
              const response = await shopifyGraphQL.post("", {
                query,
                variables,
              });

              const result = response.data.data?.productSet;

              if (result?.userErrors?.length > 0) {
                console.error(
                  `❌ GraphQL errors for ${productName}:`,
                  result.userErrors,
                );
                errorCount++;
                return { success: false, errors: result.userErrors };
              }

              successCount++;
              console.log(`✅ ${productName}`);
              return { success: true, product: result?.product };
            } catch (error) {
              console.error(
                `❌ Mutation failed for ${productName}:`,
                error.message,
              );
              errorCount++;
              return { success: false, error: error.message };
            }
          }),
        );

        // Log batch results
        const failed = results.filter(
          (r) => r.status === "rejected" || !r.value?.success,
        );
        if (failed.length > 0) {
          console.warn(
            `⚠️ Batch ${Math.floor(i / batchSize) + 1}: ${failed.length} failed`,
          );
        }

        // Rate limit protection
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(
        `✅ Updates completed: ${successCount} successful, ${errorCount} failed`,
      );
    } catch (error) {
      console.error("❌ Failed to apply bulk updates:", error.message);
      throw error;
    }
  }

  printStats() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Sync Statistics:`);
    console.log(`   Total processed: ${this.stats.totalProcessed}`);
    console.log(`   Updated: ${this.stats.updated}`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log(`   Cycles completed: ${this.stats.cycles}`);
    console.log(
      `   Last sync: ${this.stats.lastSync?.toLocaleString() || "Never"}`,
    );
    console.log(`   Current page: ${this.currentPage}`);
    console.log(`${"=".repeat(60)}\n`);
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      currentPage: this.currentPage,
    };
  }
}

export default SyncScheduler;
