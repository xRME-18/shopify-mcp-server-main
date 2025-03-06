/**
 * Product-related tools for the Shopify MCP Server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShopifyClient } from "../ShopifyClient/ShopifyClient.js";
import { config } from "../config/index.js";
import { handleError } from "../utils/errorHandler.js";
import { formatProduct, formatVariant } from "../utils/formatters.js";

// Define input types for better type safety
interface GetProductsInput {
  searchTitle?: string;
  limit: number;
}

interface GetProductsByCollectionInput {
  collectionId: string;
  limit?: number;
}

interface GetProductsByIdsInput {
  productIds: string[];
}

interface GetVariantsByIdsInput {
  variantIds: string[];
}

/**
 * Registers product-related tools with the MCP server
 * @param server The MCP server instance
 */
export function registerProductTools(server: McpServer): void {
  // Get Products Tool
  server.tool(
    "get-products",
    "Get all products or search by title",
    {
      searchTitle: z.string().optional().describe("Filter products by title"),
      limit: z.number().describe("Maximum number of products to return"),
    },
    async ({ searchTitle, limit }: GetProductsInput) => {
      const client = new ShopifyClient();
      try {
        const products = await client.loadProducts(
          config.accessToken,
          config.shopDomain,
          searchTitle || "*",
          limit
        );
        
        const formattedProducts = products.products.map(formatProduct).join("\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${products.products.length} products with currency ${products.currencyCode}:\n${formattedProducts}`,
            },
          ],
        };
      } catch (error) {
        return handleError("Failed to retrieve products", error);
      }
    }
  );

  // Get Products by Collection Tool
  server.tool(
    "get-products-by-collection",
    "Get products from a specific collection",
    {
      collectionId: z.string().describe("ID of the collection to get products from"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of products to return"),
    },
    async ({ collectionId, limit }: GetProductsByCollectionInput) => {
      const client = new ShopifyClient();
      try {
        const products = await client.loadProductsByCollectionId(
          config.accessToken,
          config.shopDomain,
          collectionId,
          limit
        );
        
        const formattedProducts = products.products.map(formatProduct).join("\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${products.products.length} products in collection ${collectionId} with currency ${products.currencyCode}:\n${formattedProducts}`,
            },
          ],
        };
      } catch (error) {
        return handleError("Failed to retrieve products from collection", error);
      }
    }
  );

  // Get Products by IDs Tool
  server.tool(
    "get-products-by-ids",
    "Get products by their IDs",
    {
      productIds: z
        .array(z.string())
        .describe("Array of product IDs to retrieve"),
    },
    async ({ productIds }: GetProductsByIdsInput) => {
      const client = new ShopifyClient();
      try {
        const products = await client.loadProductsByIds(
          config.accessToken,
          config.shopDomain,
          productIds
        );
        
        const formattedProducts = products.products.map(formatProduct).join("\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${products.products.length} products with currency ${products.currencyCode}:\n${formattedProducts}`,
            },
          ],
        };
      } catch (error) {
        return handleError("Failed to retrieve products by IDs", error);
      }
    }
  );

  // Get Variants by IDs Tool
  server.tool(
    "get-variants-by-ids",
    "Get product variants by their IDs",
    {
      variantIds: z
        .array(z.string())
        .describe("Array of variant IDs to retrieve"),
    },
    async ({ variantIds }: GetVariantsByIdsInput) => {
      const client = new ShopifyClient();
      try {
        const variants = await client.loadVariantsByIds(
          config.accessToken,
          config.shopDomain,
          variantIds
        );
        
        const formattedVariants = variants.variants.map((variant) => {
          return `
          Variant: ${variant.title}
          Product: ${variant.product.title}
          ID: ${variant.id}
          Price: ${variant.price}
          SKU: ${variant.sku || "N/A"}
          Available for sale: ${variant.availableForSale ? "Yes" : "No"}
          `;
        }).join("\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${variants.variants.length} variants with currency ${variants.currencyCode}:\n${formattedVariants}`,
            },
          ],
        };
      } catch (error) {
        return handleError("Failed to retrieve variants by IDs", error);
      }
    }
  );
} 