import { shopifyGraphQL } from "../../config/axios.js";
import { buildProductInput } from "../../utils/product-builder.js";

// Re-export buildProductInput for backward compatibility
export { buildProductInput };

export async function checkProducts(limit = 10) {
  const query = `
    query {
      products(first: ${limit}, query: "vendor:Steam OR vendor:Unknown") {
        edges {
          node {
            id
            title
            handle
            vendor
            status
            createdAt
            variants(first: 1) {
              edges {
                node {
                  id
                  sku
                  price
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query });
  const products = response.data.data.products.edges.map((e) => e.node);

  return {
    count: products.length,
    hasMore: response.data.data.products.pageInfo.hasNextPage,
    products,
  };
}

export async function getProductsCount() {
  const query = `
    query {
      productsCount {
        count
      }
    }
  `;

  const response = await shopifyGraphQL.post("", { query });
  return response.data.data.productsCount.count;
}
