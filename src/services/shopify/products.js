import { shopifyGraphQL } from "../../config/axios.js";
import { SHOPIFY_LOCATION_ID } from "../../config/env.js";

export function buildProductInput(d) {
  const files = [];
  if (d.images?.cover?.url) {
    files.push({
      originalSource: d.images.cover.url,
      alt: d.name,
      contentType: "IMAGE",
    });
  }
  if (d.images?.screenshots) {
    d.images.screenshots.forEach((screenshot) => {
      files.push({
        originalSource: screenshot.url,
        alt: d.name,
        contentType: "IMAGE",
      });
    });
  }

  const platformName = extractPlatform(d);
  const platforms =
    Array.isArray(d.platforms) && d.platforms.length
      ? d.platforms.filter(Boolean)
      : platformName
        ? [platformName]
        : [];

  const metafields = [
    {
      namespace: "kinguin",
      key: "product_id",
      type: "single_line_text_field",
      value: String(d.productId),
    },
    {
      namespace: "kinguin",
      key: "platform",
      type: "single_line_text_field",
      value: platformName,
    },
    platforms.length
      ? {
          namespace: "kinguin",
          key: "platforms",
          type: "list.single_line_text_field",
          value: JSON.stringify(platforms),
        }
      : null,
    d.genres?.length
      ? {
          namespace: "kinguin",
          key: "genres",
          type: "list.single_line_text_field",
          value: JSON.stringify(d.genres),
        }
      : null,
    d.tags?.length
      ? {
          namespace: "kinguin",
          key: "tags",
          type: "list.single_line_text_field",
          value: JSON.stringify(d.tags),
        }
      : null,
    {
      namespace: "kinguin",
      key: "is_dlc",
      type: "boolean",
      value: String(Boolean(d.isDLC)),
    },
    {
      namespace: "kinguin",
      key: "is_preorder",
      type: "boolean",
      value: String(Boolean(d.isPreorder)),
    },
    d.releaseDate
      ? {
          namespace: "kinguin",
          key: "release_date",
          type: "date",
          value: String(d.releaseDate).slice(0, 10),
        }
      : null,
  ].filter(Boolean);

  return {
    title: d.name,
    descriptionHtml: d.description || "No description available.",
    handle: `kinguin-${String(d.productId).toLowerCase()}`,
    vendor: platformName,
    productType: "Game",
    tags: [
      ...(d.genres || []),
      ...(d.tags || []),
      d.isPreorder ? "Preorder" : null,
      d.isDLC ? "DLC" : null,
    ].filter(Boolean),
    status: "ACTIVE",
    metafields,
    files,
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
    variants: [
      {
        price: String(d.price),
        sku: String(d.productId),
        optionValues: [
          {
            optionName: "Title",
            name: "Default Title",
          },
        ],
        inventoryPolicy: "CONTINUE",
        inventoryQuantities: [
          {
            name: "available",
            quantity: 999,
            locationId: SHOPIFY_LOCATION_ID,
          },
        ],
      },
    ],
  };
}

function extractPlatform(d) {
  const list = Array.isArray(d.platforms) ? d.platforms.filter(Boolean) : [];
  return (
    d.platform ||
    d.drm ||
    d?.activation?.platform ||
    (list.length ? list[0] : null) ||
    "Unknown"
  );
}

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
