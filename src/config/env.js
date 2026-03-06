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
  BREVO_API_KEY,
  BREVO_SENDER_EMAIL,
  BREVO_SENDER_NAME,
  LOGO_URL, // Optional: Public URL to your logo (e.g., https://your-cdn.com/logo.png)
} = process.env;
