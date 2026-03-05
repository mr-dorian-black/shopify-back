import { kinguin } from "../../config/axios.js";

export async function getKinguinProducts({ platform, page = 1 } = {}) {
  const params = { page, limit: 100 };
  if (platform) params.platform = platform;
  const res = await kinguin.get("/v1/products", { params });
  return res.data;
}

export async function getProductDetails(id) {
  const res = await kinguin.get(`/v2/products/${id}`);
  return res.data;
}
