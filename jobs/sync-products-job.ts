import {
  MedusaContainer,
} from "@medusajs/framework/types"
import { syncFromErpWorkflow } from "../workflows/sync-products"
import ErpModuleService from "../modules/erp/service"

export default async function syncProductsJob(container: MedusaContainer) {
  console.log("Syncing products...")
  try {
    const erpProducts = (await syncFromErpWorkflow(container).run({})).result.erpProducts
    console.log(`Synced ${erpProducts.length} products`)
  } finally {
    const erpModuleService = container.resolve("erp") as ErpModuleService
    await erpModuleService.logOutFb()
  }
}

export const config = {
  name: "daily-product-sync",
  schedule: "0 0 * * *", // Every day at midnight
  //schedule: "* * * * *", // Every minute (for testing)
}
