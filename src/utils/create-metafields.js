import { shopifyGraphQL } from "../config/axios.js";

export async function createMetafieldDefinitions() {
  const definitions = [
    {
      name: "Kinguin Product ID",
      namespace: "kinguin",
      key: "product_id",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Kinguin ID",
      namespace: "kinguin",
      key: "kinguin_id",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Languages",
      namespace: "kinguin",
      key: "languages",
      type: "list.single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Platform",
      namespace: "kinguin",
      key: "platform",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Is Premium",
      namespace: "kinguin",
      key: "is_premium",
      type: "boolean",
      ownerType: "PRODUCT",
    },
    {
      name: "Genres",
      namespace: "kinguin",
      key: "genres",
      type: "list.single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Tags",
      namespace: "kinguin",
      key: "tags",
      type: "list.single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Is Preorder",
      namespace: "kinguin",
      key: "is_preorder",
      type: "boolean",
      ownerType: "PRODUCT",
    },
    {
      name: "Release Date",
      namespace: "kinguin",
      key: "release_date",
      type: "date",
      ownerType: "PRODUCT",
    },
    {
      name: "Steam App ID",
      namespace: "kinguin",
      key: "steam_app_id",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "Region",
      namespace: "kinguin",
      key: "region",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
    {
      name: "System Requirements",
      namespace: "kinguin",
      key: "system_requirements",
      type: "json",
      ownerType: "PRODUCT",
    },
    {
      name: "Delivered Keys",
      namespace: "game_keys",
      key: "delivered_keys",
      type: "json",
      ownerType: "ORDER",
    },
    {
      name: "Game Key",
      namespace: "licenses",
      key: "game_key",
      type: "single_line_text_field",
      ownerType: "ORDER",
      visibleToStorefrontApi: true,
    },
  ];

  for (const def of definitions) {
    try {
      // Build visibleToStorefrontApi section if specified
      const storefrontVisibility = def.visibleToStorefrontApi
        ? `, visibleToStorefrontApi: ${def.visibleToStorefrontApi}`
        : "";

      const mutation = `
        mutation {
          metafieldDefinitionCreate(definition: {
            name: "${def.name}",
            namespace: "${def.namespace}",
            key: "${def.key}",
            type: "${def.type}",
            ownerType: ${def.ownerType}${storefrontVisibility}
          }) {
            createdDefinition {
              id
              name
              namespace
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await shopifyGraphQL.post("", { query: mutation });

      if (response.data.data?.metafieldDefinitionCreate?.userErrors?.length) {
        console.log(
          `⚠️ ${def.key}:`,
          response.data.data.metafieldDefinitionCreate.userErrors,
        );
      } else {
        console.log(`✅ Created metafield definition: ${def.key}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create ${def.key}:`, error.message);
    }
  }
}
