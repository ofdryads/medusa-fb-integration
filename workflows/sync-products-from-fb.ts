import {
  createStep, createWorkflow, StepResponse,
  transform, WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow, updateProductsWorkflow, useQueryGraphStep
} from "@medusajs/medusa/core-flows"
import {
  CreateProductWorkflowInputDTO, UpdateProductWorkflowInputDTO,
} from "@medusajs/framework/types"
import ErpModuleService, { ErpProduct } from "../modules/erp/service" // this is where the fishbowl request and auth functions are
import CoreModuleService from "@modules/core-products/service" // for handling core products

type CustomFieldMapBefore = Record<string, {
  name: string
  type: string
  value?: string
}>
type CustomFieldMapAfter = Record<string, {
  type: string
  value?: string
}>

// step calls getProducts() from erp module which makes a request to fb's product export endpoint
const getProductsFromErpStep = createStep(
  "get-products-from-erp",
  async (_, { container }) => {
    const erpModuleService = container.resolve("erp") as ErpModuleService
    const products = await erpModuleService.getProducts()

    return new StepResponse(products)
  }
)

// make sure core charges do not end up as published products by filtering them out of the API response
export const filterCoreChargesStep = createStep(
  "filter-core-charges",
  async ( products: ErpProduct [] , { container }) => {
    const coreProductService = container.resolve("core") as CoreModuleService
    const filtered = products.filter(
      (p) => !coreProductService.isCoreCharge(p.num)
    );
    return new StepResponse(filtered)
  }
)

//makes it so you can work with the custom fields using field name as the key, not an arbitrary number like default
//only pass the customFields and num properties of the product object to it - it doesnt need others
function reformatCustomFields(erpProduct: { num: string, customFields: string }): CustomFieldMapAfter {
  let fbCustomFields: CustomFieldMapBefore = {}
  try {
    fbCustomFields = JSON.parse(erpProduct.customFields) || "{}"
  } catch (error) {
    console.warn("Couldn't parse customFields for ", erpProduct.num, error)
    return {}
  }

  const customFieldsByName = Object.values(fbCustomFields).reduce((newFieldObj, field) => {
    //don't need to have 'name' as a property if it is a key - it is removed here
    if (field && field.name) { 
      const { name, ...rest } = field
      newFieldObj[name] = rest
    }

    return newFieldObj
  }, {} as CustomFieldMapAfter)

  return customFieldsByName
}

// use for product handle to make an acceptable URL from the product name
function urlSafe(productName: string): string {
  return productName.toLowerCase()   // no uppercase letters
  .replace(/\s/g, '')                // remove spaces within strings
  .replace(/[^a-z0-9]/g, '-')        // replace non-alphanumeric chars with hyphens
  .replace(/-+/g, '-')              // change multiple hyphens to one hyphen
  .replace(/^-|-$/g, '');           // remove leading/trailing hyphens
}

export const syncFromErpWorkflow = createWorkflow(
  "sync-products-from-fishbowl",
  () => {
    // the products returned by fishbowl, minus core charges
    const erpProducts = filterCoreChargesStep(getProductsFromErpStep())

    // this is to help check for existing products later
    //product numbers from FB to be used as product external IDs in Medusa
    const externalIdsFilters = transform({ erpProducts, }, (data) => {
      return data.erpProducts.map((product) => `${product.num}`)
    })

    // get the id of the default sales channel
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })

    // get the shipping profile ID
    const { data: shippingProfiles } = useQueryGraphStep({
      entity: "shipping_profile",
      fields: ["id"],
      pagination: { take: 1 },
    }).config({ name: "shipping-profile" })

    // get the products already in Medusa using external id as a filter
    const { data: existingProducts } = useQueryGraphStep({
      entity: "product",
      fields: ["id", "external_id", "variants.*"],
      filters: { external_id: externalIdsFilters },
    }).config({ name: "existing-products" })

    //transform/mapping of data
    const { productsToCreate, productsToUpdate } = transform({
      existingProducts,
      erpProducts,
      shippingProfiles,
      stores //just the one sales channel
    }, (data) => {
      const productsToCreate: CreateProductWorkflowInputDTO[] = []
      const productsToUpdate: UpdateProductWorkflowInputDTO[] = []

      data.erpProducts.forEach((erpProduct) => {

        //make the custom fields accessible by their name
        const customFields = reformatCustomFields({
          num: erpProduct.num,
          customFields: erpProduct.customFields
        })

        // need category logic to be called here
        // need "allow backorder" logic to be called here

        const product: CreateProductWorkflowInputDTO | UpdateProductWorkflowInputDTO = {
          external_id: `${erpProduct.num}`,
          title: erpProduct.num,
          description: erpProduct.description,
          handle: urlSafe(erpProduct.num), // to handle weirdly named things in fishbowl
          //ask: what things should not be published? -$$$, some cores?
          status: "published",
          discountable: true,
          /* options: { COME BACK and deal with things like cores and merch}, */
          
          options: [
            {
              title: "Default",
              values: ["Default"],
            },
          ],
          variants: [],
          shipping_profile_id: data.shippingProfiles[0].id,
          sales_channels: [
            {
              id: data.stores[0].default_sales_channel_id || "",
            },
          ],
        }
        //look in the product object just created and cross reference its external ID with products already in medusa
        const existingProduct = data.existingProducts.find((p) => p.external_id === product.external_id)
        if (existingProduct) product.id = existingProduct.id

        /* HERE handle variants - these will be cores and merch, maybe other things
        Merch will need a flag or something containing the variations
        
        if (*logic for product having variants*) {
          //////stuff 
          return {
            id: existingProduct ? existingProduct.variants.find((v) => v.sku === variant.code)?.id : undefined,
            title: variant.display_name.replace(`[${variant.code}] `, ""),
            sku: variant.code || undefined,
            options,
            prices: [
              {
                amount: variant.list_price,
                currency_code: "usd",
              },
            ],
            manage_inventory: true,
            metadata: {
              external_id: `${variant.id}`,
            },
          }
        } */
        //if the product has no variants (most products)
        // else { 
        product.variants?.push({
          id: existingProduct ? existingProduct.variants[0].id : undefined,
          title: erpProduct.num,
          sku: erpProduct.num,
          prices: [
            {
              amount: erpProduct.price,
              currency_code: "usd",
            },
          ],
          metadata: {
            external_id: `${erpProduct.num}`,
          },
          manage_inventory: true,
        })
        // }

        if (existingProduct) {
          productsToUpdate.push(product as UpdateProductWorkflowInputDTO)
        } else {
          productsToCreate.push(product as CreateProductWorkflowInputDTO)
        }
      })

      return { productsToCreate, productsToUpdate }
    })

    createProductsWorkflow.runAsStep({
      input: {
        products: productsToCreate,
      },
    })
    updateProductsWorkflow.runAsStep({
      input: {
        products: productsToUpdate,
      },
    })

    return new WorkflowResponse({
      erpProducts
    })
  }
)

/*These will be conditional:
allow_backorder
status: published - only if it has an attached inventory item
*/