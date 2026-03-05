import axios from "axios";
import {
  SHOPIFY_CLIENT_ID,
  SHOPIFY_SECRET_KEY,
  SHOPIFY_STORE,
} from "../../config/env.js";

let SHOPIFY_ADMIN_TOKEN = null;
let TOKEN_EXPIRES_AT = null;
const TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // 23 hours (tokens last 24h, refresh early)

export async function getAdminToken(forceRefresh = false) {
  // Check if token exists and is still valid
  if (
    SHOPIFY_ADMIN_TOKEN &&
    !forceRefresh &&
    TOKEN_EXPIRES_AT &&
    Date.now() < TOKEN_EXPIRES_AT
  ) {
    return SHOPIFY_ADMIN_TOKEN;
  }

  if (TOKEN_EXPIRES_AT && Date.now() >= TOKEN_EXPIRES_AT) {
    console.log("⚠️ Token expired, refreshing...");
  }

  try {
    const res = await axios.post(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
      null,
      {
        params: {
          grant_type: "client_credentials",
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_SECRET_KEY,
        },
        timeout: 10000,
      },
    );

    SHOPIFY_ADMIN_TOKEN = res.data.access_token;
    TOKEN_EXPIRES_AT = Date.now() + TOKEN_LIFETIME_MS;

    const expiresIn = Math.floor(TOKEN_LIFETIME_MS / 1000 / 60 / 60);
    console.log(`✅ SHOPIFY_ADMIN_TOKEN refreshed (expires in ~${expiresIn}h)`);

    return SHOPIFY_ADMIN_TOKEN;
  } catch (error) {
    console.error("❌ Failed to get Shopify admin token:", error.message);
    throw new Error(`Shopify authentication failed: ${error.message}`);
  }
}

export function getCurrentToken() {
  return SHOPIFY_ADMIN_TOKEN;
}

export function getTokenExpiresAt() {
  return TOKEN_EXPIRES_AT;
}
