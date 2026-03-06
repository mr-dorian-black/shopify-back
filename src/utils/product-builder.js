import { SHOPIFY_LOCATION_ID } from "../config/env.js";

/**
 * Extract platform from Kinguin product data
 */
export function extractPlatform(kinguinProduct) {
  return kinguinProduct.platform || "Unknown";
}

/**
 * Validate YouTube URL
 */
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== "string") return false;

  try {
    const urlObj = new URL(url);
    // Check if it's a YouTube domain
    if (
      !urlObj.hostname.includes("youtube.com") &&
      !urlObj.hostname.includes("youtu.be")
    ) {
      return false;
    }

    // For youtube.com/watch?v= format
    if (urlObj.hostname.includes("youtube.com")) {
      const videoId = urlObj.searchParams.get("v");
      // YouTube video IDs must be exactly 11 characters
      return videoId && videoId.length === 11;
    }

    // For youtu.be/ format
    if (urlObj.hostname.includes("youtu.be")) {
      const videoId = urlObj.pathname.slice(1);
      return videoId && videoId.length === 11;
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Build product files (images and videos) array
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

  // YouTube Videos - with validation
  if (kinguinProduct.videos?.length > 0) {
    kinguinProduct.videos.forEach((video, index) => {
      if (video.video_url && isValidYouTubeUrl(video.video_url)) {
        files.push({
          originalSource: video.video_url,
          alt: `${kinguinProduct.name} - Video ${index + 1}`,
          contentType: "EXTERNAL_VIDEO",
        });
      } else if (video.video_url) {
        console.warn(
          `⚠️ Skipping invalid YouTube URL for ${kinguinProduct.name}: ${video.video_url}`,
        );
      }
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

  // Videos - filter only valid YouTube URLs
  if (kinguinProduct.videos?.length > 0) {
    const validVideos = kinguinProduct.videos.filter((video) =>
      isValidYouTubeUrl(video.video_url),
    );

    if (validVideos.length > 0) {
      metafields.push({
        namespace: "kinguin",
        key: "videos",
        type: "json",
        value: JSON.stringify(validVideos),
      });
    }
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
      sku: String(kinguinProduct.productId || kinguinProduct.kinguinId),
      optionValues: [
        {
          optionName: "Title",
          name: "Default Title",
        },
      ],
      inventoryPolicy: "DENY", // Block sales when out of stock
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
 * @param {object} kinguinProduct - Kinguin product data
 * @param {string} existingProductId - Optional Shopify product ID for updates (for bulk operations)
 *                                     If not provided, relies on handle-based lookup with retry
 */
export function buildProductInput(kinguinProduct, existingProductId = null) {
  // Validate product data first
  const validation = validateProductData(kinguinProduct);
  if (!validation.valid) {
    throw new Error(`Invalid product data: ${validation.errors.join(", ")}`);
  }

  const platformName = extractPlatform(kinguinProduct);
  const files = buildProductFiles(kinguinProduct);
  const metafields = buildProductMetafields(kinguinProduct, platformName);
  const tags = buildProductTags(kinguinProduct);
  const variants = buildProductVariants(kinguinProduct);

  // Ensure product has valid quantity
  const qty = typeof kinguinProduct.qty === "number" ? kinguinProduct.qty : 999;
  const status = qty > 0 ? "ACTIVE" : "DRAFT";

  // Handle is the unique identifier - Shopify will upsert based on this
  const handle = `kinguin-${String(kinguinProduct.productId || kinguinProduct.kinguinId).toLowerCase()}`;

  const input = {
    title: kinguinProduct.name,
    descriptionHtml: kinguinProduct.description || "No description available.",
    handle,
    vendor: platformName,
    productType: "Game",
    tags,
    status,
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

  // Add product ID if provided (for bulk operations with pre-fetched map)
  if (existingProductId) {
    input.id = existingProductId;
  }

  return input;
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
