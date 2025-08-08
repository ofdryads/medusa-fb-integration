/*

import {
  createStep, createWorkflow, StepResponse,
  transform, WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  useQueryGraphStep
} from "@medusajs/medusa/core-flows"
import { getVariantAvailability } from "@medusajs/framework/utils" // to get quantity in Medusa for inventory item
import ErpModuleService from "../modules/erp/service" // this is where the fishbowl request and auth functions are

//this Inventory workflow should be invoked whenever the product workflow runs - right AFTER product runs

const getInvCountsFromErpStep = createStep(
  "get-inventory-from-erp",
  async (_, { container }) => {
    const erpModuleService = container.resolve("erp") as ErpModuleService
    const quantities = await erpModuleService.getInventoryQuantities()

    return new StepResponse(quantities)
  }
)

const getInvCountsFromMedusaStep = createStep(
  "get-inventory-from-medusa",
  async (_, { container }) => {
    const query = container.resolve("query")
    const availability = await getVariantAvailability(query, {

      variant_ids: [],
      sales_channel_id: data.stores[0].default_sales_channel_id || "",

    })
  }
)

export const syncInvFromErpWorkflow = createWorkflow(
  "sync-inventory-from-fishbowl",
  () => {
    const inventoryQtiesFB = getInvCountsFromErpStep()

    // get the sales channel id (will be at index 0, there's just one)
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })

    /* will get the inventory-linked variant ID (these are linked to inventory)
      am deeming SKU to be a more reliable identifier than title, which might be modified after sync*/
/*    const { data: variants } = useQueryGraphStep({
      entity: "variant",
      fields: ["id", "sku"],
    })

    const currentQtiesMedusa = getInvCountsFromMedusaStep()

    inventoryQtiesFB.forEach((invItem) => {
      // if 

    }) 
  }
)
*/


// need to know: does the inventory item already exist in medusa?
// is it linked to a product whose name correlates with that of the inventory quantity being synced?
// has the quantity changed? DO NOT write the quantity if it has not changed
// if the name of the inventory is not the product title, change this so it is not "Default"

/*const prodToInvMapping = new Map( // map the products to their current inventory quantities
    data.inventoryQuantities.map(prod => [prod.num, prod.total_qty])
) */
//look up this product number in the mapped getInventory response 
//const quantity = prodToInvMapping.get(erpProduct.num) */