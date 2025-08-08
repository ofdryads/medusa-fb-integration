import ErpModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const ERP_MODULE = "erp"
export default Module(ERP_MODULE, {
  service: ErpModuleService,
})