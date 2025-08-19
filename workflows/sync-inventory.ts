import {
  createStep, createWorkflow, StepResponse,
  transform, WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep, updateInventoryLevelsStep, updateInventoryItemsStep, createInventoryLevelsStep } from "@medusajs/medusa/core-flows"
import { getVariantAvailability } from "@medusajs/framework/utils" // to get quantity in Medusa for inventory item
import ErpModuleService from "../modules/erp/service" // fishbowl class 

// Get product numbers and their inventory quantities from ERP
const getInvQtiesFromErpStep = createStep(
  "get-inventory-from-erp",
  async (_, { container }) => {
    const erpModuleService = container.resolve("erp") as ErpModuleService
    const quantities = await erpModuleService.getInventoryQuantities()
    return new StepResponse(quantities)
  }
)

type VariantInfo = {
  variant_ids: string[]
  sales_channel_id: string
}

type FieldsNeedChange = {
  id: string
  sku?: string
  title?: string
}

// Get the current inventory counts for product variants in Medusa before updating them
const getInvQtiesFromMedusaStep = createStep(
  "get-inventory-from-medusa",
  async (input: VariantInfo, { container }) => {
    const query = container.resolve("query")
    const availability = await getVariantAvailability(query, {
      variant_ids: input.variant_ids,
      sales_channel_id: input.sales_channel_id,
    })
    return new StepResponse(availability)
  }
)

export const syncInvFromErpWorkflow = createWorkflow(
  "sync-inventory-from-fishbowl",
  () => {
    const inventoryQtiesFB = getInvQtiesFromErpStep()

    // "stores" and "variants" are needed only to get the current variant quantities in Medusa
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    }).config({ name: "get-sales-channel" })

    const { data: variants } = useQueryGraphStep({
      entity: "variant",
      fields: ["id", "sku", "inventory_items.inventory_item_id", "inventory_items.sku"],
    }).config({ name: "get-variants" })

    const { data: invLocations } = useQueryGraphStep({
      entity: "stock_location",
      fields: ["id"],
      filters: {
        name: "Warehouse",
      },
    }).config({ name: "get-warehouse-id" })

    const { data: inventoryItems } = useQueryGraphStep({
      entity: "inventory_item",
      fields: ["id", "sku", "title", "location_levels"],
    }).config({ name: "get-inv-items" })

    const { data: inventoryLevels } = useQueryGraphStep({
      entity: "inventory_level",
      fields: ["id", "inventory_item_id", "location_id", "stocked_quantity"],
    }).config({ name: "get-inv-levels" })

    const medusaInvData = transform(
      { stores, variants },
      (data) => ({
        variant_ids: data.variants.map(v => v.id),
        sales_channel_id: data.stores[0]?.default_sales_channel_id || "",
      })
    )

    const currentQtiesMedusa = getInvQtiesFromMedusaStep(medusaInvData) // note this has product variant data not inv

    // inventory items created automatically by the product sync may not have title or sku - this remedies that
    // updateInventoryItemsStep does not govern inventory location nor quantity
    const missingInvItemData = transform(
      { variants, inventoryItems, inventoryQtiesFB },
      (data) => {
        return data.inventoryQtiesFB
          .map(erpItem => {
            const variant = data.variants.find(v => v.sku === erpItem.num)
            if (!variant) return null

            const invId = variant.inventory_items[0]?.inventory_item_id
            if (!invId) return null

            const needChange: Partial<FieldsNeedChange> & { id: string } = { id: invId }
            needChange.id = invId // all inventory items have ID and need this identifier to update

            const inventoryItem = data.inventoryItems.find(i => i.id === invId)
            if (!inventoryItem) return null

            if (inventoryItem.sku !== erpItem.num) {
              needChange.sku = erpItem.num
            }

            if (inventoryItem.title !== erpItem.num) {
              needChange.title = erpItem.num
            }
            // return needChange if contains values for fields needing to be changed or populated
            return Object.keys(needChange).length > 1 ? needChange : null
          })
          .filter(Boolean)
      })
    updateInventoryItemsStep(missingInvItemData)

    // updateInventoryLevelsStep cannot work unless products have a defined "location level" already
    // give them the warehouse ID as their "location level" here if they don't have one
    const missingLocation = transform(
      { variants, inventoryItems, inventoryQtiesFB, invLocations, inventoryLevels },
      (data) => {
        return data.inventoryQtiesFB
          .map(erpItem => {
            const variant = data.variants.find(v => v.sku === erpItem.num)
            if (!variant) return null

            const invId = variant.inventory_items[0]?.inventory_item_id
            if (!invId) return null

            // check if inventory level/location already exists
            const locationLevelAlready = data.inventoryLevels.find(
              level => level.inventory_item_id === invId && level.location_id === data.invLocations[0]?.id
            )
            if (locationLevelAlready) return null

            return {
              inventory_item_id: invId,
              location_id: data.invLocations[0]?.id
            }
          })
          .filter(Boolean)
      })
    createInventoryLevelsStep(missingLocation)

    const { data: updatedInventoryItems } = useQueryGraphStep({
      entity: "inventory_item",
      fields: ["id", "sku", "location_levels"],
    }).config({ name: "get-updated-inv-items" })

    const invQties = transform(
      { inventoryQtiesFB, currentQtiesMedusa, variants, updatedInventoryItems, inventoryLevels, invLocations },
      (data) => {
        if (!data.inventoryQtiesFB?.length) {
          throw new Error("No ERP inventory data received")
        }

        const updates: any = []
        const skipped: any = []

        data.inventoryQtiesFB.forEach(erpItem => {
          const variant = data.variants.find(v => v.sku === erpItem.num)
          if (!variant) {
            skipped.push(`No variant: ${erpItem.num}`)
            return
          }

          const inventoryItem = data.updatedInventoryItems.find(i => i.sku === erpItem.num)
          if (!inventoryItem) {
            skipped.push(`No inventory item: ${erpItem.num}`)
            return
          }

          const invLevelMedusa = data.inventoryLevels.find(
            level => level.inventory_item_id === inventoryItem.id
          )
          if (!invLevelMedusa) {
            skipped.push(`No inventory level: ${erpItem.num}`)
            return
          }

          const medusaQty = data.currentQtiesMedusa[variant.id]?.availability

          if (medusaQty !== erpItem.quantity) {
            updates.push({
              inventory_item_id: inventoryItem.id,
              location_id: invLevelMedusa.location_id,
              stocked_quantity: erpItem.quantity,
            })
          }
        })

        console.log(`Updates to make: ${updates.length}`)
        console.log(`Items skipped: ${skipped.length}`, skipped) // if it does not have a product/variant, it should not have inventory
        return updates
      })

    const qtyUpdate = updateInventoryLevelsStep(invQties)
    return new WorkflowResponse({
      qtyUpdate,
      summary: transform(
        { invQties },
        (data) => {
          console.info(`Inventory sync completed: ${data.invQties.length} inventory items updated`)
          return { updatedCount: data.invQties.length }
        })
    })
  })
