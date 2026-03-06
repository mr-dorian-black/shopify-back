import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directories exist
const logsDir = path.join(__dirname, "../../logs");
const ordersDir = path.join(logsDir, "orders");
const keysDir = path.join(logsDir, "keys");

[logsDir, ordersDir, keysDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Log order processing details to file
 * @param {string} orderId - Shopify order ID
 * @param {string} orderName - Order number like #1001
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
export function logOrderProcessing(orderId, orderName, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    orderId,
    orderName,
    message,
    ...(data && { data }),
  };

  // Create filename: order_12345_2024-03-06.log
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `order_${orderId}_${dateStr}.log`;
  const filepath = path.join(ordersDir, filename);

  const logLine = `[${timestamp}] ${message}\n${data ? JSON.stringify(data, null, 2) + "\n" : ""}\n`;

  fs.appendFileSync(filepath, logLine, "utf8");
}

/**
 * Save delivered keys record for audit/backup
 * @param {object} deliveryRecord - Keys delivery information
 */
export function saveKeysDeliveryRecord(deliveryRecord) {
  const {
    orderId,
    orderName,
    customerId,
    customerEmail,
    customerName,
    keys,
    timestamp,
  } = deliveryRecord;

  // Create CSV entry for easy parsing
  const dateStr = new Date().toISOString().split("T")[0];
  const csvFilename = `keys_delivered_${dateStr}.csv`;
  const csvFilepath = path.join(keysDir, csvFilename);

  // Check if file exists to write header
  const fileExists = fs.existsSync(csvFilepath);

  if (!fileExists) {
    // Write CSV header
    const header =
      "Timestamp,OrderID,OrderName,CustomerID,CustomerEmail,CustomerName,ProductName,Key,KinguinOrderID\n";
    fs.writeFileSync(csvFilepath, header, "utf8");
  }

  // Write each key as separate CSV row
  keys.forEach((keyInfo) => {
    const csvRow = [
      timestamp || new Date().toISOString(),
      orderId,
      orderName,
      customerId,
      customerEmail,
      customerName,
      `"${keyInfo.productName.replace(/"/g, '""')}"`, // Escape quotes
      keyInfo.key,
      keyInfo.kinguinOrderId || "",
    ].join(",");

    fs.appendFileSync(csvFilepath, csvRow + "\n", "utf8");
  });

  // Also save full JSON record for complete data
  const jsonFilename = `order_${orderId}_keys.json`;
  const jsonFilepath = path.join(keysDir, jsonFilename);

  fs.writeFileSync(
    jsonFilepath,
    JSON.stringify(deliveryRecord, null, 2),
    "utf8",
  );

  console.log(
    `✅ Keys delivery record saved: ${csvFilename} and ${jsonFilename}`,
  );
}

/**
 * Log order cancellation/failure
 */
export function logOrderFailure(orderId, orderName, reason, errors = []) {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split("T")[0];
  const filename = `order_${orderId}_${dateStr}_FAILED.log`;
  const filepath = path.join(ordersDir, filename);

  const logContent = {
    timestamp,
    orderId,
    orderName,
    status: "FAILED",
    reason,
    errors,
  };

  fs.writeFileSync(filepath, JSON.stringify(logContent, null, 2), "utf8");

  console.error(`❌ Order failure logged: ${filename}`);
}
