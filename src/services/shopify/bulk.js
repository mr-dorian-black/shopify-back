import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { shopifyGraphQL } from "../../config/axios.js";

export async function writeJSONL(file, rows) {
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(file);
    stream.on("error", reject);
    stream.on("finish", resolve);
    rows.forEach((r) => stream.write(JSON.stringify(r) + "\n"));
    stream.end();
  });
}

export async function stagedUpload(filename) {
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
    }
  `;

  const res = await shopifyGraphQL.post("", { query });
  return res.data.data.stagedUploadsCreate.stagedTargets[0];
}

export async function uploadFile(target, file, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📤 Upload attempt ${attempt}/${retries}...`);

      const form = new FormData();
      target.parameters.forEach((p) => form.append(p.name, p.value));
      form.append("file", fs.createReadStream(file));

      await axios.post(target.url, form, {
        headers: form.getHeaders(),
        timeout: 600000, // 10 minutes for large files
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      console.log("✅ File uploaded successfully");
      return target.parameters.find((p) => p.name === "key").value;
    } catch (error) {
      console.error(`❌ Upload attempt ${attempt} failed:`, error.message);

      if (attempt === retries) {
        throw error;
      }

      // Ждем перед повтором (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Waiting ${delay / 1000}s before retry...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function runBulk(mutation, path) {
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
    }
  `;

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

export async function pollBulkOperation(
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
    }
  `;

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
      const analysis = await downloadAndAnalyzeBulkResult(op.url);
      return { url: op.url, analysis };
    }

    if (op.status === "FAILED" || op.status === "CANCELED") {
      console.error("❌ Operation failed!");
      console.error("Error code:", op.errorCode);
      console.error("Partial data URL:", op.partialDataUrl);

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

        if (result.userErrors && result.userErrors.length > 0) {
          errors.push(result);
          console.log("❌ USER ERROR:");
          console.log(`  Product: ${result.product?.title || "Unknown"}`);
          console.log(
            `  Errors: ${JSON.stringify(result.userErrors, null, 2)}`,
          );
        } else if (result.product && result.product.id) {
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
        } else {
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
