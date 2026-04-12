declare module "compression" {
  import { RequestHandler } from "express";

  interface CompressionOptions {
    threshold?: number | string;
  }

  const compression: (options?: CompressionOptions) => RequestHandler;
  export default compression;
}
