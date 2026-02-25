import "dotenv/config";
import express from "express";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const app = express();
app.use(express.json());

// ================= ENV =================

const {
  KINGUIN_API_KEY,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_SECRET_KEY,
  SHOPIFY_STORE,
  SHOPIFY_LOCATION_ID,
} = process.env;

// ================= TOKEN =================

let SHOPIFY_ADMIN_TOKEN = null;

async function getAdminToken() {
  const res = await axios.post(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
    null,
    {
      params: {
        grant_type: "client_credentials",
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_SECRET_KEY,
      },
    },
  );

  SHOPIFY_ADMIN_TOKEN = res.data.access_token;
  console.log("SHOPIFY_ADMIN_TOKEN", SHOPIFY_ADMIN_TOKEN);
  return SHOPIFY_ADMIN_TOKEN;
}

// ================= CLIENTS =================

const kinguin = axios.create({
  baseURL: "https://gateway.kinguin.net/esa/api",
  headers: { "X-Api-Key": KINGUIN_API_KEY },
});

const shopifyGraphQL = axios.create({
  baseURL: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/graphql.json`,
  headers: { "Content-Type": "application/json" },
});

shopifyGraphQL.interceptors.request.use(async (config) => {
  if (!SHOPIFY_ADMIN_TOKEN) await getAdminToken();
  config.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;
  return config;
});

// Response interceptor для обработки 401 ошибок
shopifyGraphQL.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Проверяем 401 и что это не повторный запрос
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      console.log("⚠️ 401 detected, refreshing token...");

      try {
        // Обновляем токен
        await getAdminToken();

        // Обновляем заголовок в оригинальном запросе
        originalRequest.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;

        // Повторяем запрос с новым токеном
        return shopifyGraphQL(originalRequest);
      } catch (refreshError) {
        console.error("❌ Failed to refresh token:", refreshError);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ================= KINGUIN =================

// Универсальная выборка по платформам (Steam по умолчанию через совместимую обёртку)
async function getKinguinProducts({ platform, page = 1 } = {}) {
  const params = { page, limit: 100 };
  if (platform) params.platform = platform;
  const res = await kinguin.get("/v1/products", { params });
  return res.data;
}

async function getProductDetails(id) {
  const res = await kinguin.get(`/v2/products/${id}`);
  return res.data;
}

// ================= BULK HELPERS =================

async function writeJSONL(file, rows) {
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(file);
    stream.on("error", reject);
    stream.on("finish", resolve);
    rows.forEach((r) => stream.write(JSON.stringify(r) + "\n"));
    stream.end();
  });
}

async function stagedUpload(filename) {
  const query = `
  mutation {
    stagedUploadsCreate(input: [{
      resource: BULK_MUTATION_VARIABLES,
      filename: "${filename}",
      mimeType: "text/jsonl",
      httpMethod: POST
    }]) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
    }
  }`;

  const res = await shopifyGraphQL.post("", { query });
  return res.data.data.stagedUploadsCreate.stagedTargets[0];
}

async function uploadFile(target, file) {
  const form = new FormData();
  target.parameters.forEach((p) => form.append(p.name, p.value));
  form.append("file", fs.createReadStream(file));

  await axios.post(target.url, form, { headers: form.getHeaders() });

  return target.parameters.find((p) => p.name === "key").value;
}

async function runBulk(mutation, path) {
  const query = `
  mutation {
    bulkOperationRunMutation(
      mutation: """${mutation}""",
      stagedUploadPath: "${path}"
    ) {
      bulkOperation { 
        id 
        status 
        errorCode
      }
      userErrors { 
        field
        message 
      }
    }
  }`;

  const res = await shopifyGraphQL.post("", { query });
  const result = res.data.data.bulkOperationRunMutation;

  if (result.userErrors?.length) {
    console.error(
      "❌ User errors:",
      JSON.stringify(result.userErrors, null, 2),
    );
    throw new Error(
      `Bulk operation errors: ${JSON.stringify(result.userErrors)}`,
    );
  }

  console.log("🚀 Bulk operation started:", result.bulkOperation.id);
  console.log("Initial status:", result.bulkOperation.status);

  return result.bulkOperation.id;
}

async function pollBulkOperation(
  operationId,
  { timeoutMs = 30 * 60 * 1000, intervalMs = 10000 } = {},
) {
  const query = `
  query {
    node(id: "${operationId}") {
      ... on BulkOperation {
        status
        errorCode
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  }`;

  const started = Date.now();

  while (true) {
    const res = await shopifyGraphQL.post("", { query });
    const op = res.data.data.node;

    console.log("📊 Bulk status:", op.status);

    if (op.errorCode) {
      console.error("❌ Error code:", op.errorCode);
    }

    if (op.status === "COMPLETED") {
      console.log("✅ Completed!");

      // Анализируем результаты
      const analysis = await downloadAndAnalyzeBulkResult(op.url);

      return { url: op.url, analysis };
    }

    if (op.status === "FAILED" || op.status === "CANCELED") {
      console.error("❌ Operation failed!");
      console.error("Error code:", op.errorCode);
      console.error("Partial data URL:", op.partialDataUrl);

      // Попытаемся проанализировать частичные результаты
      if (op.partialDataUrl) {
        await downloadAndAnalyzeBulkResult(op.partialDataUrl);
      }

      throw new Error(`Bulk failed: ${op.status}, errorCode: ${op.errorCode}`);
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error("Bulk polling timeout");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ================= DOWNLOAD AND ANALYZE RESULTS =================

async function downloadAndAnalyzeBulkResult(url) {
  if (!url) {
    console.log("⚠️ No result URL provided");
    return null;
  }

  try {
    console.log("📥 Downloading bulk operation results...");
    const response = await axios.get(url);
    const lines = response.data.split("\n").filter((line) => line.trim());

    console.log(`\n📊 BULK OPERATION RESULTS (${lines.length} lines):\n`);

    const successes = [];
    const errors = [];
    const productsCreated = [];
    const productsUpdated = [];

    for (const line of lines) {
      try {
        const result = JSON.parse(line);

        // Check for errors in productSet response
        if (result.userErrors && result.userErrors.length > 0) {
          errors.push(result);
          console.log("❌ USER ERROR:");
          console.log(`  Product: ${result.product?.title || "Unknown"}`);
          console.log(
            `  Errors: ${JSON.stringify(result.userErrors, null, 2)}`,
          );
        }
        // Check for successful product operation
        else if (result.product && result.product.id) {
          // productSet returns __parentId when updating existing products
          // and creates new id when creating new products
          const isUpdate = result.__parentId !== undefined;

          if (isUpdate) {
            productsUpdated.push(result.product);
            console.log(
              `♻️  Updated: ${result.product.title} (${result.product.id})`,
            );
          } else {
            productsCreated.push(result.product);
            console.log(
              `✅ Created: ${result.product.title} (${result.product.id})`,
            );
          }

          successes.push(result);
        }
        // Fallback for other structures
        else {
          successes.push(result);
        }
      } catch (e) {
        console.error("Failed to parse line:", line);
        console.error("Parse error:", e.message);
      }
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Total successes: ${successes.length}`);
    console.log(`🆕 Products created: ${productsCreated.length}`);
    console.log(`♻️  Products updated: ${productsUpdated.length}`);
    console.log(`❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log("\n🔍 Error summary:");
      errors.slice(0, 5).forEach((err, idx) => {
        console.log(`\nError ${idx + 1}:`);
        console.log(JSON.stringify(err, null, 2));
      });
      if (errors.length > 5) {
        console.log(`\n... and ${errors.length - 5} more errors`);
      }
    }

    return {
      successes,
      errors,
      total: lines.length,
      productsCreated: productsCreated.length,
      productsUpdated: productsUpdated.length,
      errorDetails: errors,
      createdProducts: productsCreated,
      updatedProducts: productsUpdated,
    };
  } catch (error) {
    console.error("❌ Failed to download/analyze results:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return null;
  }
}

// ================= BUILD PRODUCT =================

// Извлекаем платформу из деталей товара
function extractPlatform(d) {
  const list = Array.isArray(d.platforms) ? d.platforms.filter(Boolean) : [];
  return (
    d.platform ||
    d.drm ||
    d?.activation?.platform ||
    (list.length ? list[0] : null) ||
    "Unknown"
  );
}

function buildProductInput(d) {
  // Convert images to files format for ProductSetInput
  const files = [];
  if (d.images?.cover?.url) {
    files.push({
      originalSource: d.images.cover.url,
      alt: d.name,
      contentType: "IMAGE",
    });
  }
  if (d.images?.screenshots) {
    d.images.screenshots.forEach((screenshot) => {
      files.push({
        originalSource: screenshot.url,
        alt: d.name,
        contentType: "IMAGE",
      });
    });
  }

  const platformName = extractPlatform(d);
  const platforms =
    Array.isArray(d.platforms) && d.platforms.length
      ? d.platforms.filter(Boolean)
      : platformName
        ? [platformName]
        : [];

  // Метаданные для фильтров
  const metafields = [
    {
      namespace: "kinguin",
      key: "product_id",
      type: "single_line_text_field",
      value: String(d.productId),
    },
    {
      namespace: "kinguin",
      key: "platform",
      type: "single_line_text_field",
      value: platformName,
    },
    platforms.length
      ? {
          namespace: "kinguin",
          key: "platforms",
          type: "list.single_line_text_field",
          value: JSON.stringify(platforms),
        }
      : null,
    d.genres?.length
      ? {
          namespace: "kinguin",
          key: "genres",
          type: "list.single_line_text_field",
          value: JSON.stringify(d.genres),
        }
      : null,
    d.tags?.length
      ? {
          namespace: "kinguin",
          key: "tags",
          type: "list.single_line_text_field",
          value: JSON.stringify(d.tags),
        }
      : null,
    {
      namespace: "kinguin",
      key: "is_dlc",
      type: "boolean",
      value: String(Boolean(d.isDLC)),
    },
    {
      namespace: "kinguin",
      key: "is_preorder",
      type: "boolean",
      value: String(Boolean(d.isPreorder)),
    },
    d.releaseDate
      ? {
          namespace: "kinguin",
          key: "release_date",
          type: "date",
          value: String(d.releaseDate).slice(0, 10),
        }
      : null,
  ].filter(Boolean);

  return {
    title: d.name,
    descriptionHtml: d.description || "No description available.",
    handle: `kinguin-${String(d.productId).toLowerCase()}`,
    vendor: platformName,
    productType: "Game",
    tags: [
      platformName,
      ...(d.genres || []),
      ...(d.tags || []),
      d.isPreorder ? "Preorder" : null,
      d.isDLC ? "DLC" : null,
    ].filter(Boolean),
    status: "ACTIVE",
    metafields,
    files,
    productOptions: [
      {
        name: "Title",
        position: 1,
        values: [
          {
            name: "Default Title",
          },
        ],
      },
    ],
    variants: [
      {
        price: String(d.price),
        sku: String(d.productId),
        optionValues: [
          {
            optionName: "Title",
            name: "Default Title",
          },
        ],
        inventoryPolicy: "CONTINUE",
        inventoryQuantities: [
          {
            name: "available",
            quantity: 999,
            locationId: SHOPIFY_LOCATION_ID,
          },
        ],
      },
    ],
  };
}

// ================= FULL SYNC =================

const BATCH_SIZE = 10000; // Maximum products per batch
const PAGES_PER_BATCH = 100; // 100 pages × 100 products = 10,000 max

async function fullSync(platforms = ["Steam"]) {
  console.log("🚀 FULL SYNC START");
  console.log("Platforms:", platforms);

  const CONCURRENCY = 8;

  for (const platform of platforms) {
    console.log(`\n➡️ Syncing platform: ${platform}`);
    let page = 1;
    let batchNumber = 1;

    while (true) {
      const batch = [];
      const startPage = page;
      const endPage = page + PAGES_PER_BATCH - 1;

      console.log(
        `\n📦 BATCH ${batchNumber}: Processing pages ${startPage}-${endPage}`,
      );

      // Process up to 100 pages for this batch
      let pagesProcessed = 0;

      while (pagesProcessed < PAGES_PER_BATCH) {
        console.log(`📄 Fetching page: ${page}`);

        try {
          const { results } = await getKinguinProducts({ platform, page });

          if (!results?.length) {
            console.log(`✅ No more results for ${platform}`);
            break;
          }

          console.log(`Found ${results.length} products on page ${page}`);

          for (let i = 0; i < results.length; i += CONCURRENCY) {
            const slice = results.slice(i, i + CONCURRENCY);
            const details = await Promise.all(
              slice.map((item) =>
                getProductDetails(item.productId).catch((err) => {
                  console.error(
                    `❌ Failed to get details for ${item.productId}:`,
                    err.message,
                  );
                  return null;
                }),
              ),
            );

            for (const d of details) {
              if (!d) continue;

              try {
                const productInput = buildProductInput(d);
                batch.push({ input: productInput });
                console.log(`✅ Prepared: ${d.name}`);
              } catch (err) {
                console.error(
                  `❌ Failed to build product for ${d.name}:`,
                  err.message,
                );
              }
            }
          }

          page++;
          pagesProcessed++;

          // Stop if we reached the batch limit
          if (batch.length >= BATCH_SIZE) {
            console.log(`⚠️ Batch size limit reached (${BATCH_SIZE} products)`);
            break;
          }
        } catch (err) {
          console.error(`❌ Error fetching page ${page}:`, err.message);
          break;
        }
      }

      console.log(
        `\n📦 Batch ${batchNumber} prepared: ${batch.length} products`,
      );

      if (batch.length === 0) {
        console.log(`✅ No more products to sync for ${platform}`);
        break;
      }

      // Process this batch
      const filename = `bulk-${platform}-batch${batchNumber}-${Date.now()}.jsonl`;
      console.log(`💾 Writing JSONL file: ${filename}`);
      await writeJSONL(filename, batch);

      console.log("📤 Creating staged upload...");
      const target = await stagedUpload(filename);

      console.log("📤 Uploading file to Shopify...");
      const path = await uploadFile(target, filename);
      console.log(`✅ File uploaded: ${path}`);

      console.log("🚀 Starting bulk operation...");

      const operationId = await runBulk(
        `mutation call($input: ProductSetInput!) {
          productSet(input: $input) {
            product {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }`,
        path,
      );

      console.log("⏳ Polling bulk operation...");
      await pollBulkOperation(operationId);

      fs.unlinkSync(filename);
      console.log(`✅ Batch ${batchNumber} completed!`);

      batchNumber++;

      // If we got less than the batch size, we've reached the end
      if (batch.length < BATCH_SIZE && pagesProcessed < PAGES_PER_BATCH) {
        console.log(`✅ All products synced for ${platform}`);
        break;
      }
    }
  }

  console.log("✅ FULL SYNC DONE");
}

// ================= API =================

app.get("/token", (req, res) => {
  if (!SHOPIFY_ADMIN_TOKEN) {
    return res.status(404).json({
      ok: false,
      error: "Token not initialized yet",
    });
  }
  res.json({
    ok: true,
    token: SHOPIFY_ADMIN_TOKEN,
    expiresNote: "Token is automatically refreshed on 401 errors",
  });
});

app.post("/sync/full", async (req, res) => {
  try {
    // platforms можно передать как массив или строку с запятыми
    const raw = req.body?.platforms ?? req.query?.platforms;
    const platforms = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : ["Steam"];

    await fullSync(platforms);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/products/check", async (req, res) => {
  try {
    const query = `
      query {
        products(first: 10, query: "vendor:Steam OR vendor:Unknown") {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              createdAt
              variants(first: 1) {
                edges {
                  node {
                    id
                    sku
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await shopifyGraphQL.post("", { query });

    if (response.data.errors) {
      return res.status(500).json({
        ok: false,
        errors: response.data.errors,
      });
    }

    const products = response.data.data.products.edges.map((e) => e.node);

    res.json({
      ok: true,
      count: products.length,
      hasMore: response.data.data.products.pageInfo.hasNextPage,
      products,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      ok: false,
      error: e?.message || String(e),
      details: e.response?.data,
    });
  }
});

app.get("/products/count", async (req, res) => {
  try {
    const query = `
      query {
        productsCount {
          count
        }
      }
    `;

    const response = await shopifyGraphQL.post("", { query });

    if (response.data.errors) {
      return res.status(500).json({
        ok: false,
        errors: response.data.errors,
      });
    }

    res.json({
      ok: true,
      totalProducts: response.data.data.productsCount.count,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
});

app.listen(3000, () => console.log("🔥 Sync running :3000"));
getAdminToken();
