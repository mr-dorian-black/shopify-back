import "dotenv/config";
import app from "./src/app.js";
import { getAdminToken } from "./src/services/shopify/auth.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🔥 Server running on port ${PORT}`);

  // Initialize Shopify token on startup
  try {
    await getAdminToken();
    console.log("✅ Shopify authentication initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Shopify auth:", error.message);
  }
});
