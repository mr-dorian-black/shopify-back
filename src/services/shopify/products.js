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

/**
 * Get all existing products with their SKU and Shopify ID
 * Returns Map: SKU -> Product ID
 */
export async function getAllProductsMap() {
  const productMap = new Map(); // SKU -> {id, handle, title}
  let hasNextPage = true;
  let cursor = null;
  let totalFetched = 0;

  console.log("📥 Fetching existing products from Shopify...");

  while (hasNextPage) {
    const query = `
      query {
        products(first: 250${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            node {
              id
              title
              handle
              variants(first: 1) {
                edges {
                  node {
                    sku
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await shopifyGraphQL.post("", { query });
    const edges = response.data.data.products.edges;

    edges.forEach((edge) => {
      const product = edge.node;
      const sku = product.variants.edges[0]?.node?.sku;

      if (sku) {
        productMap.set(sku, {
          id: product.id,
          handle: product.handle,
          title: product.title,
        });
      }
    });

    hasNextPage = response.data.data.products.pageInfo.hasNextPage;
    cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    totalFetched += edges.length;

    if (hasNextPage) {
      console.log(`  Fetched ${totalFetched} products, continuing...`);
    }
  }

  console.log(`✅ Fetched ${totalFetched} existing products`);
  return productMap;
}

/**
 * Update single product price and quantity in Shopify
 * @param {string} sku - Product SKU
 * @param {number} newPrice - New price from Kinguin (optional, null to skip)
 * @param {number} newQty - New quantity from Kinguin (optional, null to skip)
 */
export async function updateProductBySKU(sku, newPrice = null, newQty = null) {
  try {
    // First, find the product by SKU
    const query = `
      query {
        products(first: 1, query: "sku:${sku}") {
          edges {
            node {
              id
              title
              variants(first: 1) {
                edges {
                  node {
                    id
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const searchResponse = await shopifyGraphQL.post("", { query });

    // Check if response is valid
    if (!searchResponse.data) {
      console.error("❌ Empty response from Shopify API");
      return false;
    }

    // Check for GraphQL errors
    if (searchResponse.data.errors) {
      console.error("❌ GraphQL errors:");
      console.error(JSON.stringify(searchResponse.data.errors, null, 2));
      return false;
    }

    if (!searchResponse.data.data) {
      console.error("❌ Invalid response structure from Shopify API");
      return false;
    }

    const productEdges = searchResponse.data.data.products.edges;

    if (productEdges.length === 0) {
      console.warn(`⚠️ Product with SKU ${sku} not found in Shopify`);
      return false;
    }

    const product = productEdges[0].node;
    const variant = product.variants.edges[0].node;
    const inventoryItemId = variant.inventoryItem.id;

    console.log(`🔄 Auto-updating ${product.title}...`);

    // Build input for productSet mutation
    const updateInput = {
      id: product.id,
      productOptions: [
        {
          name: "Title",
          position: 1,
          values: [
            {
              name: "Default Title",
            },
          ],
        },
      ],
    };

    // Add variants array with price/qty updates
    const variantInput = {
      id: variant.id,
      optionValues: [
        {
          optionName: "Title",
          name: "Default Title",
        },
      ],
    };

    if (newPrice !== null) {
      console.log(`   Price: → ${newPrice}€`);
      variantInput.price = String(newPrice);
    }

    updateInput.variants = [variantInput];

    // Update product using productSet (same as bulk sync)
    const updateMutation = `
      mutation($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productResponse = await shopifyGraphQL.post("", {
      query: updateMutation,
      variables: { input: updateInput },
    });

    // Check if response is valid
    if (!productResponse.data) {
      console.error("❌ Empty response from Shopify API");
      return false;
    }

    // Check for GraphQL errors
    if (productResponse.data.errors) {
      console.error("❌ GraphQL errors:");
      console.error(JSON.stringify(productResponse.data.errors, null, 2));
      return false;
    }

    if (!productResponse.data.data) {
      console.error("❌ Invalid response structure from Shopify API:");
      console.error(JSON.stringify(productResponse.data, null, 2));
      return false;
    }

    if (productResponse.data.data.productSet?.userErrors?.length > 0) {
      console.error(
        "❌ Failed to update product:",
        productResponse.data.data.productSet.userErrors,
      );
      return false;
    }

    // Update inventory quantity if provided
    if (newQty !== null) {
      console.log(`   Qty: → ${newQty}`);

      const updateInventoryMutation = `
        mutation {
          inventorySetQuantities(input: {
            reason: "correction",
            name: "available",
            ignoreCompareQuantity: true,
            quantities: [{
              inventoryItemId: "${inventoryItemId}",
              locationId: "${process.env.SHOPIFY_LOCATION_ID}",
              quantity: ${newQty}
            }]
          }) {
            inventoryAdjustmentGroup {
              reason
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const inventoryResponse = await shopifyGraphQL.post("", {
        query: updateInventoryMutation,
      });

      // Check if response is valid
      if (!inventoryResponse.data) {
        console.error("❌ Empty response from Shopify API");
        return false;
      }

      // Check for GraphQL errors
      if (inventoryResponse.data.errors) {
        console.error("❌ GraphQL errors:");
        console.error(JSON.stringify(inventoryResponse.data.errors, null, 2));
        return false;
      }

      if (!inventoryResponse.data.data) {
        console.error("❌ Invalid response structure from Shopify API:");
        console.error(JSON.stringify(inventoryResponse.data, null, 2));
        return false;
      }

      if (
        inventoryResponse.data.data.inventorySetQuantities?.userErrors?.length >
        0
      ) {
        console.error(
          "❌ Failed to update inventory:",
          inventoryResponse.data.data.inventorySetQuantities.userErrors,
        );
        return false;
      }
    }

    console.log(`✅ Auto-updated ${product.title} successfully`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to update product ${sku}:`, error.message);
    return false;
  }
}
