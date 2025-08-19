import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateOrderWorkflow, useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { OrderDTO } from "@medusajs/framework/types"

type StepInput = { order: OrderDTO }

const sendOrderToErpStep = createStep(
  "send-order-to-erp",
  async ({ order }: StepInput, { container }) => {
    const erpModuleService = container.resolve("erp")
    const erpOrderId = await erpModuleService.sendOrderToErp(order)

    return new StepResponse(erpOrderId, erpOrderId)
  },
  async (erpOrderId, { container }) => {
    if (!erpOrderId) return

    const erpModuleService = container.resolve("erp")
    await erpModuleService.deleteOrder(erpOrderId)
  }
)

type WorkflowInput = { order_id: string }

export const syncOrderToErpWorkflow = createWorkflow(
  "sync-order-to-erp",
  ({ order_id }: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "*",
        "shipping_address.*",
        "billing_address.*",
        "items.*"
      ],
      filters: { id: order_id },
      options: { throwIfKeyNotFound: true },
    })

    const erpOrderId = sendOrderToErpStep({
      order: orders[0] as unknown as OrderDTO,
    })

    updateOrderWorkflow.runAsStep({
      input: {
        id: order_id,
        user_id: "",
        metadata: {
          external_id: erpOrderId,
        },
      },
    })
  }
)