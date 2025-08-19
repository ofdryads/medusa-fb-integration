# Medusa.js + Fishbowl ERP E-commerce integration
API integration between Medusa.js and Fishbowl ERP software

## It syncs:
- Product info (FB -> Medusa)
- Inventory count (FB -> Medusa)
- Orders (Medusa -> FB) (work in progress)

### Soon to be added
- Product categories that have been added as custom fields in the ERP automatically sync and map to Medusa/website categories. Product categories are not natively supported by this ERP.

## Dependencies/prerequisites:
- Full Medusa.js app
- Axios installed as a dependency in the Medusa project
- Fishbowl license and server install, server URL, login credentials, Medusa app manually approved in Fishbowl

## API Reference

Fishbowl API docs example they have online: https://help.fishbowlinventory.com/advanced/s/apidocs/introduction.html

More up to date Fishbowl API docs: `{SERVER_URL}:2456/apidocs`

## Jobs/Tasks
- Website Order-to-ERP task is a "subscriber" - it listens for the "order placed" event then runs
- ERP Inventory Counts-to-Website and ERP Products-to-Website are scheduled jobs: 
  - Product runs every 24 hours
  - Inventory runs every 3 hours

## Auth
- Fishbowl does API auth as if it were a user logging into their client software
- Token is granted in exchange for valid user login using /api/login endpoint
- Must provide a username, password, the name of the app using the API, and the app's assigned ID number that's registered in Fishbowl. These values should be environment variables.

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

## Notes on constraints
- None of the api/sales-orders endpoints actually allow you to create an order in FB that does not yet exist (i.e. one just placed on the website)
    - So as of right now summer 2025, have to use POST /api/import/Sales-Order (the CSV method) for this
- The api/export CSV endpoints do not accept query parameters - it's just a CSV dump that would need to be converted to actual JSON from a 2d array and then filtered/transformed extensively after payload is received, using our compute not FB server's. # of rows for product/part are in the tens of thousands.
- I am begrudgingly using their endpoint that takes raw SQL as a query parameter for product/inventory sync to circumvent that. The queries are hardcoded on the Medusa backend & no user input which minimizes risk
- Fishbowl licensing comes with a concurrent user login limit per license - any API call made when the logged-in user limit is already at max will fail (see below section)
- Related to above, a task using the API must log out promptly after its job has completed (or failed) so that actual people working will not be blocked from logging into the client software (see below section)
- For those reasons, if any other scheduled tasks are added, they should run outside 9-5 hours if possible