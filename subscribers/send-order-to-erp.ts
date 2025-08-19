import type {
    SubscriberArgs,
    SubscriberConfig,
} from "@medusajs/framework"
import { syncOrderToErpWorkflow } from "../workflows/sync-orders"

export default async function productCreateHandler({
    event: { data },
    container,
}: SubscriberArgs<{ id: string }>) {
    const { result } = await syncOrderToErpWorkflow(container)
        .run({
            input: { order_id: data.id, },
        })
    console.log(`Order synced to ERP with id: ${result}`)
}

export const config: SubscriberConfig = {
    event: "order.placed",
}