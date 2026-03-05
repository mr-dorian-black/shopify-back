import express from "express";
import routes from "./routes/index.js";

const app = express();

// Add raw body for webhook verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);

// Mount all routes
app.use("/", routes);

export default app;
