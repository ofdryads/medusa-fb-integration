# Medusa.js + Fishbowl ERP E-commerce integration
API integration between Medusa.js and the Fishbowl Inventory ERP software

## It syncs:
- Product info (FB -> Medusa)
- Inventory count (FB -> Medusa)
- Orders (Medusa -> FB)
- Product categories added as custom fields in the ERP

## Dependencies/prerequisites:
- Full Medusa.js app
- Axios installed as a dependency in the Medusa project
- Fishbowl license and server install, server URL, login credentials, Medusa app manually approved in Fishbowl

### Example of how environment variables for Fishbowl go in medusa-config.ts
```
module.exports = defineConfig({
  projectConfig: {
    // general Medusa project configuration here
  },
  modules: [
    // other modules here
    {
      resolve: "./src/modules/erp", // ERP/Fishbowl module
      options: {
        username: process.env.FB_USERNAME,
        password: process.env.FB_PASSWORD,
        fbUrl: process.env.FB_BASE_URL,
        appId: process.env.FB_APP_ID,
        appName: process.env.FB_APP_NAME,
      },
    },
  ],
})
```
```