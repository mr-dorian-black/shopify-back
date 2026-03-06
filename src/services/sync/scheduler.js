import pLimit from "p-limit";
import { buildProductInput } from "../../utils/product-builder.js";
import { getKinguinProducts, getProductDetails } from "../kinguin/products.js";
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
      created: 0,
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
    console.log(`📝 Using handle-based upsert (no products fetch needed)\n`);

    const limit = pLimit(this.concurrency);
    const updates = [];
    const MAX_UPDATES_PER_BATCH = this.batchSize * 100; // Prevent memory leak

    // If platforms is null, process all platforms (no filter)
    // Otherwise, iterate through specific platforms
    if (this.platforms === null) {
      console.log(`\n📦 Processing all platforms (no filter)`);
      await this.processPlatformBatch(
        null,
        limit,
        updates,
        MAX_UPDATES_PER_BATCH,
      );
    } else {
      for (const platform of this.platforms) {
        console.log(`\n📦 Processing platform: ${platform}`);
        await this.processPlatformBatch(
          platform,
          limit,
          updates,
          MAX_UPDATES_PER_BATCH,
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
      const result = await this.applyBulkUpdates(updates);
      if (result) {
        this.stats.created += result.created;
        this.stats.updated += result.updated;
      }
    } else {
      console.log(`\n✅ No updates needed in this batch`);
    }

    this.stats.lastSync = new Date();
    this.printStats();
  }

  async processPlatformBatch(platform, limit, updates, maxUpdates) {
    let pagesProcessed = 0;
    let shouldResetPage = false;

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
          shouldResetPage = true;
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
            console.log(`📦 Will upsert: ${product.name} (SKU: ${sku})`);

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

        if (data.results.length < 100) {
          console.log(`⚠️ Last page reached, resetting to page 1`);
          this.currentPage = 1;
          this.stats.cycles++;
          shouldResetPage = true;
          break;
        }
      } catch (error) {
        console.error(`❌ Error fetching page ${currentPage}:`, error.message);
        this.stats.errors++;
        break;
      }
    }

    // Only add pagesProcessed if we didn't reset to page 1
    if (!shouldResetPage) {
      this.currentPage += pagesProcessed;
    }
  }

  async applyBulkUpdates(products) {
    if (!products || products.length === 0) {
      console.log("⚠️ No products to update");
      return;
    }

    try {
      console.log(`📝 Preparing ${products.length} mutations...`);

      // Build mutations with variables (handle-based upsert)
      const mutations = products
        .map((product) => {
          try {
            const input = buildProductInput(product);

            return {
              query: `
                mutation($input: ProductSetInput!) {
                  productSet(input: $input) {
                    product {
                      id
                      title
                      handle
                      status
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
              isCreate: !input.id, // Track if this is create or update
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
        `🚀 Executing ${mutations.length} mutations (handle-based upsert)...`,
      );

      // Execute mutations in batches to avoid rate limits
      const batchSize = 10;
      let successCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < mutations.length; i += batchSize) {
        const batch = mutations.slice(i, i + batchSize);

        // Add delay between batches to avoid rate limits (except first batch)
        if (i > 0) {
          console.log(`⏳ Waiting 1s before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const results = await Promise.allSettled(
          batch.map(async ({ query, variables, productName, isCreate }) => {
            try {
              const response = await shopifyGraphQL.post("", {
                query,
                variables,
              });

              // Check for THROTTLED error - retry with backoff
              if (
                response.data?.errors?.some(
                  (e) => e.extensions?.code === "THROTTLED",
                )
              ) {
                console.warn(
                  `⚠️ ${productName}: Rate limited, waiting 3s and retrying...`,
                );
                await new Promise((resolve) => setTimeout(resolve, 3000));

                // Retry once after delay
                const retryResponse = await shopifyGraphQL.post("", {
                  query,
                  variables,
                });

                // Check again if still throttled
                if (
                  retryResponse.data?.errors?.some(
                    (e) => e.extensions?.code === "THROTTLED",
                  )
                ) {
                  console.error(
                    `❌ ${productName}: Still throttled after retry`,
                  );
                  errorCount++;
                  return { success: false, error: "Rate limit exceeded" };
                }

                // Use retry response
                response.data = retryResponse.data;
              }

              // Log response structure for debugging
              if (!response.data?.data?.productSet) {
                console.error(
                  `❌ ${productName}: Unexpected response structure`,
                );
                console.error(
                  `   Response:`,
                  JSON.stringify(response.data, null, 2),
                );
                errorCount++;
                return {
                  success: false,
                  error: "Invalid response structure",
                };
              }

              const result = response.data.data?.productSet;

              if (result?.userErrors?.length > 0) {
                // Check if error is "handle already in use"
                const handleError = result.userErrors.find((e) =>
                  e.message?.includes("already in use"),
                );

                if (handleError) {
                  // Product exists - need to find its ID and retry
                  console.warn(
                    `⚠️ ${productName}: Handle exists, fetching ID to update...`,
                  );

                  try {
                    // Extract handle and SKU
                    const handle = variables.input.handle;
                    const sku =
                      variables.input.variants?.[0]?.sku ||
                      handle.replace("kinguin-", "");

                    // Try finding by handle first (more reliable)
                    const findByHandleQuery = `
                      query {
                        products(first: 1, query: "handle:${handle}") {
                          edges {
                            node {
                              id
                              handle
                            }
                          }
                        }
                      }
                    `;

                    const findResponse = await shopifyGraphQL.post("", {
                      query: findByHandleQuery,
                    });
                    let existingId =
                      findResponse.data.data?.products?.edges?.[0]?.node?.id;

                    // If not found by handle, try by SKU
                    if (!existingId) {
                      console.log(`  Trying SKU search: ${sku}`);
                      const findBySKUQuery = `
                        query {
                          products(first: 1, query: "sku:${sku}") {
                            edges {
                              node {
                                id
                                handle
                              }
                            }
                          }
                        }
                      `;

                      const skuResponse = await shopifyGraphQL.post("", {
                        query: findBySKUQuery,
                      });
                      existingId =
                        skuResponse.data.data?.products?.edges?.[0]?.node?.id;
                    }

                    if (existingId) {
                      // Retry with ID
                      console.log(`🔄 Retrying with ID: ${existingId}`);
                      const retryVariables = {
                        ...variables,
                        input: { ...variables.input, id: existingId },
                      };

                      const retryResponse = await shopifyGraphQL.post("", {
                        query,
                        variables: retryVariables,
                      });

                      const retryResult = retryResponse.data.data?.productSet;

                      if (retryResult?.userErrors?.length > 0) {
                        console.error(
                          `❌ Retry failed for ${productName}:`,
                          retryResult.userErrors,
                        );
                        errorCount++;
                        return {
                          success: false,
                          errors: retryResult.userErrors,
                        };
                      }

                      successCount++;
                      updatedCount++; // Retry means it was an update
                      console.log(`✅ ${productName} (updated)`);
                      return { success: true, product: retryResult?.product };
                    } else {
                      // Product not found by handle or SKU
                      console.error(
                        `❌ ${productName}: Product not found in Shopify (handle: ${handle}, sku: ${sku})`,
                      );
                      errorCount++;
                      return {
                        success: false,
                        error: "Product not found for update",
                      };
                    }
                  } catch (retryError) {
                    console.error(
                      `❌ Failed to retry ${productName}:`,
                      retryError.message,
                    );
                    errorCount++;
                    return { success: false, error: retryError.message };
                  }
                }

                // Other errors
                console.error(
                  `❌ GraphQL errors for ${productName}:`,
                  result.userErrors,
                );
                errorCount++;
                return { success: false, errors: result.userErrors };
              }

              // Success - but verify product was actually created/updated
              const productId = result?.product?.id;

              if (!productId) {
                console.error(
                  `❌ ${productName}: No product ID returned (might not be created)`,
                );
                console.error(
                  `   Full response:`,
                  JSON.stringify(result, null, 2),
                );
                errorCount++;
                return { success: false, error: "No product ID in response" };
              }

              successCount++;
              if (isCreate) {
                createdCount++;
                const status = result.product?.status || "UNKNOWN";
                console.log(
                  `✅ ${productName} (created) - ID: ${productId}, Status: ${status}`,
                );
              } else {
                updatedCount++;
                const status = result.product?.status || "UNKNOWN";
                console.log(
                  `✅ ${productName} (updated) - ID: ${productId}, Status: ${status}`,
                );
              }

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
        `✅ Updates completed: ${successCount} successful (🆕 ${createdCount} created, ♻️ ${updatedCount} updated), ${errorCount} failed`,
      );

      return { created: createdCount, updated: updatedCount };
    } catch (error) {
      console.error("❌ Failed to apply bulk updates:", error.message);
      throw error;
    }
  }

  printStats() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Sync Statistics:`);
    console.log(`   Total processed: ${this.stats.totalProcessed}`);
    console.log(`   Created: ${this.stats.created}`);
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
