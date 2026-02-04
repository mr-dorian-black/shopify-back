import "dotenv/config";
import express from "express";
import axios from "axios";
import cron from "node-cron";
import Database from "better-sqlite3";
import fs from "fs";
import FormData from "form-data";

// ================= APP =================

const app = express();
app.use(express.json());

// ================= DATABASE =================

const db = new Database("db.sqlite");

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    kinguin_id TEXT UNIQUE,
    shopify_product_id TEXT,
    shopify_variant_id TEXT,
    last_price REAL,
    last_sync TEXT
  )
`,
).run();

// ================= API CLIENTS =================

const {
  KINGUIN_API_KEY,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_SECRET_KEY,
  SHOPIFY_STORE,
} = process.env;

// ================= SHOPIFY TOKEN MANAGEMENT =================

let SHOPIFY_ADMIN_TOKEN = null;

async function getAdminToken() {
  try {
    const response = await axios.post(
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

    SHOPIFY_ADMIN_TOKEN = response.data.access_token;
    console.log("✓ Successfully obtained Shopify admin token");
    return SHOPIFY_ADMIN_TOKEN;
  } catch (error) {
    console.error(
      "Error obtaining admin token:",
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
}

const kinguin = axios.create({
  baseURL: "https://gateway.kinguin.net/esa/api",
  headers: {
    "X-Api-Key": KINGUIN_API_KEY,
  },
});

const shopifyGraphQL = axios.create({
  baseURL: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/graphql.json`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to inject token
shopifyGraphQL.interceptors.request.use(async (config) => {
  if (!SHOPIFY_ADMIN_TOKEN) {
    await getAdminToken();
  }
  config.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;
  return config;
});

// Add response interceptor to handle 401 errors
shopifyGraphQL.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.log("⚠️ 401 error detected, refreshing token...");

      await getAdminToken();
      originalRequest.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;

      return shopifyGraphQL(originalRequest);
    }

    return Promise.reject(error);
  },
);

// ================= KINGUIN =================

async function getSteamProducts(
  page = 1,
  limit = 100,
  platform = "Steam",
  sort = "createdAt",
  order = "asc",
) {
  try {
    const res = await kinguin.get("/v1/products", {
      params: { platform, page, limit, sort, order },
    });
    return res.data;
  } catch (error) {
    console.error(
      "Error fetching Steam products:",
      error.response ? error.response.data : error.message,
    );
    throw error;
  }
}

async function getProductDetails(id) {
  const res = await kinguin.get(`/v2/products/${id}`);
  return res.data;
}

// ================= SHOPIFY BULK HELPERS =================

function writeJSONL(file, rows) {
  const stream = fs.createWriteStream(file);
  for (const r of rows) {
    stream.write(JSON.stringify(r) + "\n");
  }
  stream.end();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Rate limited, waiting ${delay}ms before retry...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
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
        userErrors { field message }
      }
    }
  `;

  const res = await shopifyGraphQL.post("", { query });
  const result = res.data.data.stagedUploadsCreate;

  if (result.userErrors?.length) {
    console.error("Staged upload errors:", result.userErrors);
    throw new Error(result.userErrors[0].message);
  }

  return result.stagedTargets[0];
}

async function uploadFile(target, file) {
  const form = new FormData();
  target.parameters.forEach((p) => form.append(p.name, p.value));
  form.append("file", fs.createReadStream(file));

  await axios.post(target.url, form, { headers: form.getHeaders() });

  // Извлекаем key из parameters
  const keyParam = target.parameters.find((p) => p.name === "key");
  return keyParam ? keyParam.value : target.resourceUrl;
}

async function runBulk(mutation, stagedUploadPath) {
  const query = `
    mutation {
      bulkOperationRunMutation(
        mutation: """${mutation}""",
        stagedUploadPath: "${stagedUploadPath}"
      ) {
        bulkOperation { id status }
        userErrors { message field }
      }
    }
  `;

  console.log(`Running bulk with staged path: ${stagedUploadPath}`);

  const res = await shopifyGraphQL.post("", { query });
  const result = res.data.data.bulkOperationRunMutation;

  if (result.userErrors?.length) {
    console.error("Bulk operation errors:", result.userErrors);
    throw new Error(result.userErrors[0].message);
  }

  return result.bulkOperation.id;
}

async function pollBulkOperation(operationId) {
  const query = `
    query {
      node(id: "${operationId}") {
        ... on BulkOperation {
          id
          status
          errorCode
          objectCount
          url
        }
      }
    }
  `;

  while (true) {
    const res = await shopifyGraphQL.post("", { query });
    const op = res.data.data.node;

    console.log(
      `Bulk operation status: ${op.status}, objects: ${op.objectCount}`,
    );

    if (op.status === "COMPLETED") {
      return op.url;
    }

    if (op.status === "FAILED" || op.status === "CANCELED") {
      throw new Error(`Bulk operation ${op.status}: ${op.errorCode}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function downloadResults(url) {
  if (!url) return [];

  const res = await axios.get(url);
  return res.data
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

// ================= FULL SYNC (CREATE) =================

async function fullSync() {
  console.log("🚀 FULL SYNC (BULK CREATE)");

  let page = 89;
  const limitDocs = 10;
  const batch = [];
  const skuMap = new Map();
  const priceMap = new Map();
  let saved = 0;

  while (true) {
    console.log("Page: ", page);
    const { results } = await getSteamProducts(page);
    if (!results?.length) break;

    for (const item of results) {
      const exists = db
        .prepare("SELECT 1 FROM products WHERE kinguin_id = ?")
        .get(item.productId);

      if (exists) continue;

      const d = await getProductDetails(item.productId);

      skuMap.set(d.productId, d.productId);
      priceMap.set(d.productId, d.price);

      // Подготавливаем изображения
      const images = [];
      if (d.images?.cover?.url) {
        images.push({ src: d.images.cover.url, position: 1 });
      }
      if (d.images?.screenshots) {
        d.images.screenshots.forEach((screenshot, index) => {
          images.push({ src: screenshot.url, position: index + 2 });
        });
      }

      batch.push({
        input: {
          title: d.name,
          descriptionHtml: d.description || "",
          vendor: "Steam",
          productType: "Game",
          tags: d.genres || [],
          status: "ACTIVE",
          published: true,
        },
        __sku: d.productId,
        __price: d.price,
        __images: images,
      });

      console.log(`  ✓ Prepared ${d.name.substring(0, 50)}...`);
      if (batch.length >= limitDocs) break;
    }

    if (batch.length >= limitDocs) break;
    page++;
  }

  if (!batch.length) {
    console.log("Nothing to create");
    return;
  }

  console.log(`Preparing ${batch.length} products...`);

  const filename = `products-${Date.now()}.jsonl`;
  writeJSONL(
    filename,
    batch.map((item) => ({ input: item.input })),
  );

  const target = await stagedUpload(filename);
  const stagedPath = await uploadFile(target, filename);

  const operationId = await runBulk(
    `
    mutation ($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          variants(first: 1) {
            edges {
              node { id sku }
            }
          }
        }
        userErrors { field message }
      }
    }
    `,
    stagedPath,
  );

  console.log(`⏳ Waiting for bulk operation ${operationId}...`);

  const resultsUrl = await pollBulkOperation(operationId);
  const results = await downloadResults(resultsUrl);

  console.log(`📥 Processing ${results.length} results...`);

  // Теперь нужно обновить варианты с SKU и ценой
  const variantUpdates = [];
  const createdProducts = [];

  for (const result of results) {
    if (result.data?.productCreate?.userErrors?.length > 0) {
      console.error(
        "Error creating product:",
        result.data.productCreate.userErrors,
      );
      continue;
    }

    const product = result.data?.productCreate?.product;
    if (product?.id) {
      const variant = product.variants?.edges?.[0]?.node;
      if (variant?.id) {
        createdProducts.push({ product, variant });
      }
    }
  }

  console.log(`✓ Created ${createdProducts.length} products`);

  // Добавляем изображения к продуктам
  console.log(`Adding images to products...`);
  for (let i = 0; i < createdProducts.length; i++) {
    const { product } = createdProducts[i];
    const batchItem = batch[i];

    if (!batchItem || !batchItem.__images?.length) continue;

    const mutation = `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id }
          mediaUserErrors { field message }
        }
      }
    `;

    const variables = {
      productId: product.id,
      media: batchItem.__images.map((img) => ({
        originalSource: img.src,
        mediaContentType: "IMAGE",
      })),
    };

    try {
      const res = await shopifyGraphQL.post("", { query: mutation, variables });

      if (!res.data || !res.data.data) {
        console.error(
          `Error adding images to product ${i + 1}: Invalid response structure`,
          res.data,
        );
        continue;
      }

      const result = res.data.data.productCreateMedia;

      if (result.mediaUserErrors?.length > 0) {
        console.error(
          `Error adding images to product ${i + 1}:`,
          result.mediaUserErrors,
        );
      } else {
        console.log(
          `✓ Added ${batchItem.__images.length} images to product ${i + 1}`,
        );
      }
    } catch (err) {
      console.error(`Failed to add images to product ${i + 1}:`, err.message);
      if (err.response?.data) {
        console.error("Response:", JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  // Обновляем варианты с SKU и ценой через REST API
  console.log(
    `Updating ${createdProducts.length} variants with SKU and price...`,
  );

  const shopifyREST = axios.create({
    baseURL: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01`,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Add interceptors for REST API as well
  shopifyREST.interceptors.request.use(async (config) => {
    if (!SHOPIFY_ADMIN_TOKEN) {
      await getAdminToken();
    }
    config.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;
    return config;
  });

  shopifyREST.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        console.log("⚠️ 401 error detected in REST API, refreshing token...");

        await getAdminToken();
        originalRequest.headers["X-Shopify-Access-Token"] = SHOPIFY_ADMIN_TOKEN;

        return shopifyREST(originalRequest);
      }

      return Promise.reject(error);
    },
  );

  for (let i = 0; i < createdProducts.length; i++) {
    const { variant } = createdProducts[i];
    const batchItem = batch[i];

    if (!batchItem) continue;

    // Извлекаем числовой ID из GID
    const variantId = variant.id.split("/").pop();

    try {
      await retryWithBackoff(async () => {
        await shopifyREST.put(`/variants/${variantId}.json`, {
          variant: {
            id: variantId,
            sku: batchItem.__sku,
            price: String(batchItem.__price),
          },
        });
      });
      console.log(
        `✓ Updated variant ${i + 1} (SKU: ${batchItem.__sku}, Price: ${batchItem.__price})`,
      );

      // Задержка между запросами (2 запроса в секунду = 500ms минимум)
      await sleep(550);
    } catch (err) {
      console.error(`Failed variant ${i + 1}:`, err.message);
      if (err.response?.data) {
        console.error("Response:", JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  // Сохраняем в БД
  for (let i = 0; i < createdProducts.length; i++) {
    const { product, variant } = createdProducts[i];
    const batchItem = batch[i];

    if (!batchItem) continue;

    const kinguinId = batchItem.__sku;
    const price = batchItem.__price;

    try {
      db.prepare(
        `
        INSERT OR REPLACE INTO products (kinguin_id, shopify_product_id, shopify_variant_id, last_price, last_sync)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(
        kinguinId,
        product.id,
        variant.id,
        price || 0,
        new Date().toISOString(),
      );

      saved++;
    } catch (err) {
      console.error(`Error saving product ${kinguinId}:`, err.message);
    }
  }

  console.log(`✅ Successfully saved ${saved} products to database`);

  fs.unlinkSync(filename);
}

// ================= PRICE SYNC (UPDATE) =================

async function priceSync() {
  console.log("💰 PRICE SYNC (BULK UPDATE)");

  const rows = db.prepare("SELECT * FROM products").all();
  const updates = [];

  for (const row of rows) {
    const d = await getProductDetails(row.kinguin_id);

    if (+d.price !== +row.last_price) {
      updates.push({
        input: {
          id: row.shopify_variant_id,
          price: String(d.price),
        },
      });

      db.prepare(
        `
        UPDATE products
        SET last_price = ?, last_sync = ?
        WHERE kinguin_id = ?
      `,
      ).run(d.price, new Date().toISOString(), row.kinguin_id);

      console.log(
        `  ✓ Price update queued for ${row.kinguin_id}: ${row.last_price} → ${d.price}`,
      );
    }
  }

  if (updates.length === 0) {
    console.log("Prices up to date");
    return;
  }

  console.log(`Preparing ${updates.length} price updates...`);

  const filename = `prices-${Date.now()}.jsonl`;
  writeJSONL(filename, updates);

  const target = await stagedUpload(filename);
  const stagedPath = await uploadFile(target, filename);

  const operationId = await runBulk(
    `
    mutation ($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant { id price }
        userErrors { field message }
      }
    }
    `,
    stagedPath,
  );

  console.log(`⏳ Waiting for price update operation ${operationId}...`);

  const resultsUrl = await pollBulkOperation(operationId);
  const results = await downloadResults(resultsUrl);

  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.data?.productVariantUpdate?.userErrors?.length > 0) {
      console.error(
        "Error updating variant:",
        result.data.productVariantUpdate.userErrors,
      );
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(
    `💸 Successfully updated ${successCount} prices (${errorCount} errors)`,
  );

  fs.unlinkSync(filename);
}

// ================= CRON =================

// Закомментировал автозапуск для тестирования
// cron.schedule("0 3 * * *", fullSync);
// cron.schedule("*/30 * * * *", priceSync);

// ================= API =================

// Убрал автозапуск при старте
// fullSync();

app.post("/sync/full", async (_, res) => {
  await fullSync();
  res.json({ ok: true });
});

app.post("/sync/price", async (_, res) => {
  await priceSync();
  res.json({ ok: true });
});

app.listen(3000, () => console.log("🔥 Sync service running on :3000"));

// Initialize admin token on startup
getAdminToken().catch(console.error);
