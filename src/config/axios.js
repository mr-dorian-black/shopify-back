import axios from "axios";
import { KINGUIN_API_KEY, SHOPIFY_STORE } from "./env.js";
import { getAdminToken } from "../services/shopify/auth.js";

export const kinguin = axios.create({
  baseURL: "https://gateway.kinguin.net/esa/api",
  headers: { "X-Api-Key": KINGUIN_API_KEY },
});

export const shopifyGraphQL = axios.create({
  baseURL: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-01/graphql.json`,
  headers: { "Content-Type": "application/json" },
});

shopifyGraphQL.interceptors.request.use(async (config) => {
  const token = await getAdminToken();
  config.headers["X-Shopify-Access-Token"] = token;
  return config;
});

shopifyGraphQL.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.log("⚠️ 401 detected, refreshing token...");

      try {
        const token = await getAdminToken(true);
        originalRequest.headers["X-Shopify-Access-Token"] = token;
        return shopifyGraphQL(originalRequest);
      } catch (refreshError) {
        console.error("❌ Failed to refresh token:", refreshError);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
