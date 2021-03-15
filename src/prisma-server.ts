import express from "express";
const app = express();
const port = 4437;
import { default as StudioHandler } from "@prisma/studio-vercel";
import path from "path";
app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.use(express.json());
app.use(
  "/api",
  StudioHandler({
    schemaPath: path.resolve(__dirname, "../prisma/schema.prisma")
  })
);
app.use(express.static("node_modules/@prisma/studio/build"));
app.listen(port, () => {});
