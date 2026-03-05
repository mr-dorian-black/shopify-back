import axios from "axios";
import {
  SHOPIFY_CLIENT_ID,
  SHOPIFY_SECRET_KEY,
  SHOPIFY_STORE,
} from "../../config/env.js";

let SHOPIFY_ADMIN_TOKEN = null;

export async function getAdminToken(forceRefresh = false) {
  if (SHOPIFY_ADMIN_TOKEN && !forceRefresh) {
    return SHOPIFY_ADMIN_TOKEN;
  }

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
  console.log("✅ SHOPIFY_ADMIN_TOKEN refreshed");
  return SHOPIFY_ADMIN_TOKEN;
}

export function getCurrentToken() {
  return SHOPIFY_ADMIN_TOKEN;
}
