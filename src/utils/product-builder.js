import { SHOPIFY_LOCATION_ID } from "../config/env.js";

/**
 * Extract platform from Kinguin product data
 */
export function extractPlatform(kinguinProduct) {
  return kinguinProduct.platform || "Unknown";
}

/**
 * Build product files (images) array
 */
export function buildProductFiles(kinguinProduct) {
  const files = [];

  // Cover image
  if (kinguinProduct.images?.cover?.url) {
    files.push({
      originalSource: kinguinProduct.images.cover.url,
      alt: kinguinProduct.name,
      contentType: "IMAGE",
    });
  }

  // Screenshots
  if (kinguinProduct.images?.screenshots) {
    kinguinProduct.images.screenshots.forEach((screenshot) => {
      files.push({
        originalSource: screenshot.url,
        alt: kinguinProduct.name,
        contentType: "IMAGE",
      });
    });
  }

  return files;
}

/**
 * Build product metafields
 */
export function buildProductMetafields(kinguinProduct, platformName) {
  const metafields = [
    {
      namespace: "kinguin",
      key: "platform",
      type: "single_line_text_field",
      value: platformName,
    },
  ];

  // System Requirements - це масив об'єктів
  if (kinguinProduct.systemRequirements?.length > 0) {
    const sysReqValue = JSON.stringify(
      kinguinProduct.systemRequirements.map((req) => ({
        system: req.system || "Unknown",
        requirements: req.requirement || [],
      })),
    );

    metafields.push({
      namespace: "kinguin",
      key: "system_requirements",
      type: "json",
      value: sysReqValue,
    });
  }

  if (kinguinProduct.productId) {
    metafields.push({
      namespace: "kinguin",
      key: "product_id",
      type: "single_line_text_field",
      value: String(kinguinProduct.productId),
    });
  }

  if (kinguinProduct.kinguinId) {
    metafields.push({
      namespace: "kinguin",
      key: "kinguin_id",
      type: "single_line_text_field",
      value: String(kinguinProduct.kinguinId),
    });
  }

  if (kinguinProduct.languages?.length) {
    metafields.push({
      namespace: "kinguin",
      key: "languages",
      type: "list.single_line_text_field",
      value: JSON.stringify(kinguinProduct.languages),
    });
  }

  // Add only if exists
  if (kinguinProduct.isPremium) {
    metafields.push({
      namespace: "kinguin",
      key: "is_premium",
      type: "boolean",
      value: "true",
    });
  }

  if (kinguinProduct.genres?.length) {
    metafields.push({
      namespace: "kinguin",
      key: "genres",
      type: "list.single_line_text_field",
      value: JSON.stringify(kinguinProduct.genres),
    });
  }

  if (kinguinProduct.tags?.length) {
    metafields.push({
      namespace: "kinguin",
      key: "tags",
      type: "list.single_line_text_field",
      value: JSON.stringify(kinguinProduct.tags),
    });
  }

  metafields.push({
    namespace: "kinguin",
    key: "is_preorder",
    type: "boolean",
    value: String(Boolean(kinguinProduct.isPreorder)),
  });

  if (kinguinProduct.releaseDate) {
    metafields.push({
      namespace: "kinguin",
      key: "release_date",
      type: "date",
      value: String(kinguinProduct.releaseDate).slice(0, 10),
    });
  }

  if (kinguinProduct.steam) {
    metafields.push({
      namespace: "kinguin",
      key: "steam_app_id",
      type: "single_line_text_field",
      value: String(kinguinProduct.steam),
    });
  }

  if (kinguinProduct.regionalLimitations) {
    metafields.push({
      namespace: "kinguin",
      key: "region",
      type: "single_line_text_field",
      value: kinguinProduct.regionalLimitations,
    });
  }

  return metafields; // Все элементы уже без null
}

/**
 * Build product tags
 */
export function buildProductTags(kinguinProduct) {
  return [
    ...(kinguinProduct.genres || []),
    ...(kinguinProduct.tags || []),
    kinguinProduct.isPreorder ? "Preorder" : null,
    kinguinProduct.regionalLimitations === "REGION FREE" ? "Region Free" : null,
  ].filter(Boolean);
}

/**
 * Build product variants
 */
export function buildProductVariants(kinguinProduct) {
  return [
    {
      price: String(kinguinProduct.price),
      sku: String(kinguinProduct.kinguinId || kinguinProduct.productId),
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
          quantity: kinguinProduct.qty || 999,
          locationId: SHOPIFY_LOCATION_ID,
        },
      ],
    },
  ];
}

/**
 * Build complete product input for Shopify
 */
export function buildProductInput(kinguinProduct) {
  const platformName = extractPlatform(kinguinProduct);
  const files = buildProductFiles(kinguinProduct);
  const metafields = buildProductMetafields(kinguinProduct, platformName);
  const tags = buildProductTags(kinguinProduct);
  const variants = buildProductVariants(kinguinProduct);

  return {
    title: kinguinProduct.name,
    descriptionHtml: kinguinProduct.description || "No description available.",
    handle: `kinguin-${String(kinguinProduct.kinguinId || kinguinProduct.productId).toLowerCase()}`,
    vendor: platformName,
    productType: "Game",
    tags,
    status: kinguinProduct.qty > 0 ? "ACTIVE" : "DRAFT",
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
    variants,
  };
}

/**
 * Validate product data before syncing
 */
export function validateProductData(kinguinProduct) {
  const errors = [];

  if (!kinguinProduct.productId && !kinguinProduct.kinguinId) {
    errors.push("Missing productId/kinguinId");
  }

  if (!kinguinProduct.name) {
    errors.push("Missing name");
  }

  if (!kinguinProduct.price || kinguinProduct.price <= 0) {
    errors.push("Invalid price");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
