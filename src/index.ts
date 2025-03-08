#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config/index.js";
import { registerProductTools } from "./tools/productTools.js";
import { registerCustomerTools } from "./tools/customerTools.js";
import { registerOrderTools } from "./tools/orderTools.js";
import { registerShopTools } from "./tools/shopTools.js";
import { registerDiscountTools } from "./tools/discountTools.js";
import { registerWebhookTools } from "./tools/webhookTools.js";

/**
 * Main entry point for the Shopify MCP Server
 * Initializes the server and registers all tools
 */
async function main() {
  // Create the MCP server
const server = new McpServer({
  name: "shopify-tools",
    version: "1.0.1",
  });

  // Register all tools
  registerProductTools(server);
  registerCustomerTools(server);
  registerOrderTools(server);
  registerShopTools(server);
  registerDiscountTools(server);
  registerWebhookTools(server);

  // Connect to the transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Shopify MCP Server running on stdio");
}

// Start the server
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
