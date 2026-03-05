import pLimit from "p-limit";
import { buildProductInput } from "../../utils/product-builder.js";
import { getKinguinProducts, getProductDetails } from "../kinguin/products.js";
import { checkKinguinPrice, checkKinguinStock } from "../kinguin/validation.js";
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

    const limit = pLimit(this.concurrency);
    const updates = [];

    // If platforms is null, process all platforms (no filter)
    // Otherwise, iterate through specific platforms
    if (this.platforms === null) {
      console.log(`\n📦 Processing all platforms (no filter)`);
      await this.processPlatformBatch(null, limit, updates);
    } else {
      for (const platform of this.platforms) {
        console.log(`\n📦 Processing platform: ${platform}`);
        await this.processPlatformBatch(platform, limit, updates);
      }
    }

    // Apply updates if any
    if (updates.length > 0) {
      console.log(`\n📝 Applying ${updates.length} updates...`);
      await this.applyBulkUpdates(updates);
      this.stats.updated += updates.length;
    } else {
      console.log(`\n✅ No updates needed in this batch`);
    }

    this.stats.lastSync = new Date();
    this.printStats();
  }

  async processPlatformBatch(platform, limit, updates) {
    let pagesProcessed = 0;

    while (pagesProcessed < this.batchSize) {
      const currentPage = this.currentPage + pagesProcessed;

      try {
        const params = { page: currentPage };
        if (platform) {
          params.platform = platform;
        }

        const data = await getKinguinProducts(params);

        if (!data.products || data.products.length === 0) {
          console.log(
            `⚠️ No products on page ${currentPage}, resetting to page 1`,
          );
          this.currentPage = 1;
          this.stats.cycles++;
          break;
        }

        console.log(`📄 Page ${currentPage}: ${data.products.length} products`);

        // Fetch details for all products concurrently
        const promises = data.products.map((p) =>
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

        // Check and update each product
        for (const product of validDetails) {
          try {
            const updateNeeded = await this.checkProductNeedsUpdate(product);

            if (updateNeeded) {
              updates.push(product);
              console.log(`🔄 Update needed: ${product.name}`);
            } else {
              console.log(`✅ Up to date: ${product.name}`);
            }

            this.stats.totalProcessed++;
          } catch (error) {
            console.error(`❌ Error checking ${product.name}:`, error.message);
            this.stats.errors++;
          }
        }

        pagesProcessed++;

        if (!data.hasMore || data.products.length < 100) {
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

  async checkProductNeedsUpdate(kinguinProduct) {
    try {
      // Get Shopify product by SKU
      const query = `
        query {
          products(first: 1, query: "sku:${kinguinProduct.productId}") {
            edges {
              node {
                id
                title
                variants(first: 1) {
                  edges {
                    node {
                      id
                      price
                      inventoryQuantity
                    }
                  }
                }
                status
              }
            }
          }
        }
      `;

      const response = await shopifyGraphQL.post("", { query });
      const products = response.data.data.products.edges;

      if (products.length === 0) {
        // Product doesn't exist in Shopify, needs to be created
        console.log(`🆕 New product: ${kinguinProduct.name}`);
        return true;
      }

      const shopifyProduct = products[0].node;
      const shopifyVariant = shopifyProduct.variants.edges[0]?.node;

      if (!shopifyVariant) {
        return true;
      }

      // Check stock
      const stock = await checkKinguinStock(kinguinProduct.productId);

      if (!stock.inStock && shopifyProduct.status === "ACTIVE") {
        console.log(`📉 Out of stock: ${kinguinProduct.name}`);
        return true;
      }

      if (stock.inStock && shopifyProduct.status !== "ACTIVE") {
        console.log(`📈 Back in stock: ${kinguinProduct.name}`);
        return true;
      }

      // Check price
      const priceInfo = await checkKinguinPrice(kinguinProduct.productId);

      if (priceInfo) {
        const shopifyPrice = parseFloat(shopifyVariant.price);
        const kinguinPrice = parseFloat(priceInfo.price);
        const priceDiff = Math.abs(shopifyPrice - kinguinPrice);
        const priceMargin = kinguinPrice * 0.05; // 5% margin

        if (priceDiff > priceMargin) {
          console.log(
            `💰 Price changed: ${kinguinProduct.name} (${shopifyPrice} → ${kinguinPrice})`,
          );
          return true;
        }
      }

      // Check title
      if (shopifyProduct.title !== kinguinProduct.name) {
        console.log(`📝 Title changed: ${kinguinProduct.name}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(
        `❌ Error checking product ${kinguinProduct.productId}:`,
        error.message,
      );
      return false;
    }
  }

  async applyBulkUpdates(products) {
    try {
      const mutations = products.map((product) => {
        const input = buildProductInput(product);

        return `
          mutation {
            productSet(input: ${JSON.stringify(input)}) {
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
        `;
      });

      // Execute mutations in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < mutations.length; i += batchSize) {
        const batch = mutations.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (mutation) => {
            try {
              const response = await shopifyGraphQL.post("", {
                query: mutation,
              });

              if (response.data.data?.productSet?.userErrors?.length) {
                console.error(
                  "❌ Update error:",
                  response.data.data.productSet.userErrors,
                );
              }
            } catch (error) {
              console.error("❌ Mutation failed:", error.message);
            }
          }),
        );

        // Rate limit protection
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`✅ Applied ${products.length} updates`);
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
