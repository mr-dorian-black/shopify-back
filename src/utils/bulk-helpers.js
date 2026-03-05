import fs from "fs";

/**
 * Write array of objects to JSONL file
 */
export async function writeJSONL(filepath, rows) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filepath);

    stream.on("error", reject);
    stream.on("finish", resolve);

    rows.forEach((row) => {
      stream.write(JSON.stringify(row) + "\n");
    });

    stream.end();
  });
}

/**
 * Read JSONL file and parse to array
 */
export async function readJSONL(filepath) {
  const content = fs.readFileSync(filepath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/**
 * Delete file if exists
 */
export function deleteFile(filepath) {
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`🗑️  Deleted: ${filepath}`);
  }
}

/**
 * Split array into chunks
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep/delay function
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry = () => {},
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);

        onRetry({
          attempt: attempt + 1,
          maxRetries,
          delay,
          error,
        });

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Calculate percentage
 */
export function percentage(current, total) {
  if (total === 0) return 0;
  return ((current / total) * 100).toFixed(2);
}

/**
 * Progress bar for console
 */
export function progressBar(current, total, width = 40) {
  const percentage = (current / total) * 100;
  const filled = Math.round((width * current) / total);
  const empty = width - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);
  const percent = percentage.toFixed(1).padStart(5);

  return `[${bar}] ${percent}% (${current}/${total})`;
}
