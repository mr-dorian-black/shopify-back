import "dotenv/config";

const requiredEnvVars = [
  "KINGUIN_API_KEY",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_SECRET_KEY",
  "SHOPIFY_STORE",
  "SHOPIFY_LOCATION_ID",
];

// Validate required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const {
  KINGUIN_API_KEY,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_SECRET_KEY,
  SHOPIFY_STORE,
  SHOPIFY_LOCATION_ID,
  SHOPIFY_CURRENCY = "EUR",
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;
