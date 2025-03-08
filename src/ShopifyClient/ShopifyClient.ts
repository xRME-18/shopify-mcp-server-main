import {
  CompleteDraftOrderResponse,
  CreateBasicDiscountCodeInput,
  CreateBasicDiscountCodeResponse,
  BasicDiscountCodeResponse,
  CreateDiscountCodeResponse,
  CreateDraftOrderPayload,
  CreatePriceRuleInput,
  CreatePriceRuleResponse,
  DraftOrderResponse,
  GeneralShopifyClientError,
  GetPriceRuleInput,
  GetPriceRuleResponse,
  LoadCollectionsResponse,
  LoadCustomersResponse,
  LoadProductsResponse,
  LoadStorefrontsResponse,
  LoadVariantsByIdResponse,
  ProductNode,
  ProductVariantWithProductDetails,
  ShopResponse,
  ShopifyAuthorizationError,
  ShopifyClientErrorBase,
  ShopifyCollection,
  ShopifyCollectionsQueryParams,
  ShopifyCustomCollectionsResponse,
  ShopifyInputError,
  ShopifyLoadOrderQueryParams,
  ShopifyOrder,
  ShopifyPaymentError,
  ShopifyProductVariantNotAvailableForSaleError,
  ShopifyProductVariantNotFoundError,
  ShopifyRequestError,
  ShopifySmartCollectionsResponse,
  ShopifyWebhook,
  getGraphqlShopifyError,
  getGraphqlShopifyUserError,
  getHttpShopifyError,
  ShopifyWebhookTopic,
  ShopifyWebhookTopicGraphql,
  ShopifyClientPort,
  CustomError,
  Maybe,
  ShopifyOrdersGraphqlQueryParams,
  ShopifyOrdersGraphqlResponse,
  ShopifyOrderGraphql,
} from "./ShopifyClientPort.js";
import { gql } from "graphql-request";

const productImagesFragment = gql`
  fragment ProductImages on Image {
    src
    height
    width
  }
`;

const productVariantsFragment = gql`
  fragment ProductVariants on ProductVariant {
    id
    title
    price
    sku
    image {
      ...ProductImages
    }
    availableForSale
    inventoryPolicy
    selectedOptions {
      name
      value
    }
  }
`;

const productFragment = gql`
  fragment Product on Product {
    id
    handle
    title
    description
    publishedAt
    updatedAt
    options {
      id
      name
      values
    }
    images(first: 20) {
      edges {
        node {
          ...ProductImages
        }
      }
    }
    variants(first: 250) {
      edges {
        node {
          ...ProductVariants
        }
      }
    }
  }
  ${productImagesFragment}
  ${productVariantsFragment}
`;

export class ShopifyClient implements ShopifyClientPort {
  private readonly logger = console;
  private SHOPIFY_API_VERSION = "2024-04";

  async manageInventory(
    accessToken: string,
    shop: string,
    data: {
      variantId: string;
      action: "SET" | "ADJUST";
      quantity: number;
      locationId?: string;
      reason?: string;
    }
  ): Promise<{
    newQuantity: number;
    previousQuantity: number;
  }> {
    const mutation = `
      mutation inventoryAdjustQuantity(
        $input: InventoryAdjustQuantityInput!
      ) {
        inventoryAdjustQuantity(input: $input) {
          inventoryLevel {
            available
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const { variantId, action, quantity, locationId } = data;
    const variables = {
      input: {
        inventoryItemId: variantId,
        availableDelta: action === "ADJUST" ? quantity : undefined,
        availableQuantity: action === "SET" ? quantity : undefined,
        locationId: locationId,
      },
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.inventoryAdjustQuantity.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.inventoryAdjustQuantity.userErrors,
        { variantId, action, quantity }
      );
    }

    return {
      newQuantity: response.data.inventoryAdjustQuantity.inventoryLevel.available,
      previousQuantity: response.data.inventoryAdjustQuantity.inventoryLevel.available - quantity,
    };
  }

  async bulkVariantOperations(
    accessToken: string,
    shop: string,
    operations: Array<{
      action: "CREATE" | "UPDATE" | "DELETE";
      productId: string;
      variantData: {
        id?: string;
        title?: string;
        price?: number;
        sku?: string;
        inventory?: number;
        requiresShipping?: boolean;
        taxable?: boolean;
        barcode?: string;
        weight?: number;
        weightUnit?: "KILOGRAMS" | "GRAMS" | "POUNDS" | "OUNCES";
      };
    }>
  ): Promise<void> {
    const mutation = `
      mutation productVariantBulkUpdate($input: ProductVariantsBulkInput!) {
        productVariantsBulkUpdate(input: $input) {
          variants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const variables = {
      input: {
        operations: operations.map(op => ({
          id: op.variantData.id,
          productId: op.productId,
          ...op.variantData,
        })),
      },
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.productVariantsBulkUpdate.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.productVariantsBulkUpdate.userErrors,
        { operations }
      );
    }
  }

  async manageProductMetafields(
    accessToken: string,
    shop: string,
    params: {
      productId: string;
      operations: Array<{
        action: "SET" | "DELETE";
        key: string;
        namespace: string;
        value?: string;
        type?: string;
      }>;
    }
  ): Promise<void> {
    const mutation = `
      mutation metafieldBulkOperation($input: [MetafieldInput!]!) {
        bulkOperationRunMutation(
          mutation: "mutation metafieldSet($input: MetafieldInput!) { metafieldSet(input: $input) { metafield { id } userErrors { field message } } }"
          stagedUploadPath: null
          inputs: $input
        ) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const variables = {
      input: params.operations.map(op => ({
        id: op.action === "DELETE" ? undefined : `gid://shopify/Product/${params.productId}`,
        key: op.key,
        namespace: op.namespace,
        value: op.value,
        type: op.type,
      })),
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.bulkOperationRunMutation.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.bulkOperationRunMutation.userErrors,
        params
      );
    }
  }

  async manageProductCollections(
    accessToken: string,
    shop: string,
    params: {
      action: "ADD" | "REMOVE";
      productIds: string[];
      collectionIds: string[];
    }
  ): Promise<void> {
    const mutation = `
      mutation collectionAddProducts($input: CollectionAddProductsInput!) {
        collectionAddProducts(input: $input) {
          job {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`;

    for (const collectionId of params.collectionIds) {
      const variables = {
        input: {
          id: `gid://shopify/Collection/${collectionId}`,
          productIds: params.productIds.map(id => `gid://shopify/Product/${id}`),
        },
      };

      const response = await this.graphqlRequest(accessToken, shop, {
        query: mutation,
        variables,
      });

      if (response.data.collectionAddProducts.userErrors?.length > 0) {
        throw getGraphqlShopifyUserError(
          response.data.collectionAddProducts.userErrors,
          { collectionId, ...params }
        );
      }
    }
  }

  async manageProductImages(
    accessToken: string,
    shop: string,
    params: {
      productId: string;
      action: "ADD" | "UPDATE" | "REMOVE";
      images: Array<{
        id?: string;
        url?: string;
        altText?: string;
        position?: number;
      }>;
    }
  ): Promise<void> {
    const mutation = `
      mutation productImageUpdate($input: ProductImageUpdateInput!) {
        productImageUpdate(input: $input) {
          image {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`;

    for (const image of params.images) {
      const variables = {
        input: {
          id: image.id ? `gid://shopify/ProductImage/${image.id}` : undefined,
          productId: `gid://shopify/Product/${params.productId}`,
          src: image.url,
          altText: image.altText,
          position: image.position,
        },
      };

      const response = await this.graphqlRequest(accessToken, shop, {
        query: mutation,
        variables,
      });

      if (response.data.productImageUpdate.userErrors?.length > 0) {
        throw getGraphqlShopifyUserError(
          response.data.productImageUpdate.userErrors,
          { image, ...params }
        );
      }
    }
  }

  async bulkUpdateVariantPrices(
    accessToken: string,
    shop: string,
    updates: Array<{
      variantId: string;
      newPrice: number;
    }>
  ): Promise<Array<{
    variantId: string;
    newPrice: number;
  }>> {
    const mutation = `
      mutation productVariantPriceUpdate($input: ProductVariantPriceUpdateInput!) {
        productVariantPriceUpdate(input: $input) {
          variant {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const results = [];
    for (const update of updates) {
      const variables = {
        input: {
          id: `gid://shopify/ProductVariant/${update.variantId}`,
          price: update.newPrice.toString(),
        },
      };

      const response = await this.graphqlRequest(accessToken, shop, {
        query: mutation,
        variables,
      });

      if (response.data.productVariantPriceUpdate.userErrors?.length > 0) {
        throw getGraphqlShopifyUserError(
          response.data.productVariantPriceUpdate.userErrors,
          update
        );
      }

      results.push({
        variantId: update.variantId,
        newPrice: parseFloat(response.data.productVariantPriceUpdate.variant.price),
      });
    }

    return results;
  }

  async createProduct(
    accessToken: string,
    shop: string,
    productData: {
      title: string;
      description: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      variants: Array<{
        title: string;
        price: number;
        sku?: string;
        inventory: number;
        requiresShipping?: boolean;
        taxable?: boolean;
      }>;
    }
  ): Promise<ProductNode> {
    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            handle
            title
            description
            publishedAt
            updatedAt
            options {
              id
              name
              values
            }
            images(first: 10) {
              edges {
                node {
                  src
                  height
                  width
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  availableForSale
                  inventoryPolicy
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const variables = {
      input: {
        title: productData.title,
        descriptionHtml: productData.description,
        vendor: productData.vendor,
        productType: productData.productType,
        tags: productData.tags,
        variants: productData.variants.map(v => ({
          title: v.title,
          price: v.price.toString(),
          sku: v.sku,
          inventoryQuantity: v.inventory,
          requiresShipping: v.requiresShipping,
          taxable: v.taxable,
        })),
      },
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.productCreate.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.productCreate.userErrors,
        productData
      );
    }

    return response.data.productCreate.product;
  }

  async updateProduct(
    accessToken: string,
    shop: string,
    productId: string,
    updateData: {
      title?: string;
      description?: string;
      status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
      vendor?: string;
      productType?: string;
      tags?: string[];
    }
  ): Promise<ProductNode> {
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            handle
            title
            description
            publishedAt
            updatedAt
            options {
              id
              name
              values
            }
            images(first: 10) {
              edges {
                node {
                  src
                  height
                  width
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  availableForSale
                  inventoryPolicy
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const variables = {
      input: {
        id: `gid://shopify/Product/${productId}`,
        title: updateData.title,
        descriptionHtml: updateData.description,
        status: updateData.status,
        vendor: updateData.vendor,
        productType: updateData.productType,
        tags: updateData.tags,
      },
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.productUpdate.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.productUpdate.userErrors,
        { productId, ...updateData }
      );
    }

    return response.data.productUpdate.product;
  }

  async bulkUpdateProducts(
    accessToken: string,
    shop: string,
    updates: Array<{
      productId: string;
      title?: string;
      description?: string;
      status?: "ACTIVE" | "ARCHIVED" | "DRAFT";
      vendor?: string;
      productType?: string;
      tags?: string[];
    }>
  ): Promise<ProductNode[]> {
    const mutation = `
      mutation productBulkUpdate($input: [ProductInput!]!) {
        productBulkUpdate(input: $input) {
          products {
            id
            handle
            title
            description
            publishedAt
            updatedAt
            options {
              id
              name
              values
            }
            images(first: 10) {
              edges {
                node {
                  src
                  height
                  width
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  availableForSale
                  inventoryPolicy
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`;

    const variables = {
      input: updates.map(update => ({
        id: `gid://shopify/Product/${update.productId}`,
        title: update.title,
        descriptionHtml: update.description,
        status: update.status,
        vendor: update.vendor,
        productType: update.productType,
        tags: update.tags,
      })),
    };

    const response = await this.graphqlRequest(accessToken, shop, {
      query: mutation,
      variables,
    });

    if (response.data.productBulkUpdate.userErrors?.length > 0) {
      throw getGraphqlShopifyUserError(
        response.data.productBulkUpdate.userErrors,
        updates
      );
    }

    return response.data.productBulkUpdate.products;
  }
}
