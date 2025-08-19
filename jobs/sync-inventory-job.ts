import {
  MedusaContainer,
} from "@medusajs/framework/types"
import { syncInvFromErpWorkflow } from "../workflows/sync-inventory"
import ErpModuleService from "../modules/erp/service"

export default async function syncInventoryJob(container: MedusaContainer) {
  console.log("Syncing inventory quantities...")
  try {
    const updatedQuantities = (await syncInvFromErpWorkflow(container).run({})).result.qtyUpdate
    console.log(`Job: Synced latest inventory quantities`)
  } finally {
    const erpModuleService = container.resolve("erp") as ErpModuleService
    await erpModuleService.logOutFb()
  }
}

export const config = {
  name: "inventory-sync",
  schedule: "0 */3 * * *", // Every 3 hours
  //schedule: "* * * * *", // Every minute (for testing)
}