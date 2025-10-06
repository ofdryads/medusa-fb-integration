import axios, { AxiosInstance } from "axios";

type Options = {
  username: string;
  password: string;
  appName: string;
  appId: number;
  fbUrl: string;
};

export type ErpProduct = {
  customFields: string;
  price: number;
  num: string;
  description: string;
  weight: number;
};

export type ErpQuantity = {
  num: string;
  total_qty: number;
};

type InjectedDependencies = {};

export default class ErpModuleService {
  private options: Options;
  private fbClient: AxiosInstance;
  private token: string | null = null;

  constructor(_: InjectedDependencies, options: Options) {
    this.options = options;
    // initialize client that connects to ERP
    this.fbClient = axios.create({
      baseURL: options.fbUrl,
      timeout: 10_000,
    });
  }

  private async auth(): Promise<void> {
    try {
      const res = await this.fbClient.post("/api/login", {
        //auth details for user
        username: this.options.username,
        password: this.options.password,

        //auth details for app (Medusa)
        appId: this.options.appId,
        appName: this.options.appName,
      });

      if (!res.data?.token) {
        throw new Error("Authentication failed: No token returned");
      }

      this.token = res.data.token;
    } catch (error) {
      console.error("Authentication error:", error);
      throw error;
    }
  }

  private getToken(): string {
    if (!this.token) {
      throw new Error("Token not available");
    }
    return this.token;
  }

  async logOutFb() {
    try {
      if (!this.token) return;
      await this.fbClient.post("/api/logout", null, {
        headers: { Authorization: `Bearer ${this.getToken()}` },
      });
    } catch (error) {
      //don't throw, this is not a fatal error
      console.error("Failed to log out of Fishbowl:", error);
    } finally {
      this.token = null;
    }
  }

  //get fishbowl product listings
  async getProducts() {
    try {
      if (!this.token) await this.auth();

      /* adjust SELECT fields as more info is added to website and fishbowl
       * filters for only products with non-zero quantity and price
       */
      const query = `
        SELECT num, description, weight, price, customFields
        FROM product pr
        WHERE pr.activeFlag = TRUE
          AND pr.price > 0
          AND EXISTS (
            SELECT 1
            FROM part pt
            JOIN partcost pc ON pt.id = pc.partId
            WHERE pt.num = pr.num
            AND pc.qty > 0
          );
        `;
      const encodedQuery = encodeURIComponent(query);
      const res = await this.fbClient.get(
        `/api/data-query?query=${encodedQuery}`,
        {
          headers: {
            Authorization: `Bearer ${this.getToken()}`,
            Accept: "application/json",
          },
        }
      );

      return res.data;
    } catch (error) {
      console.error("Error getting product data:", error);
      throw error;
    }
  }

  // get part/product number and its quantity
  async getInventoryQuantities() {
    try {
      if (!this.token) await this.auth();

      /* this links Fishbowl's part ID to the part number, then links part # to product #
        Only retrieve inventory w/ non-zero quantities. If inventory currently listed on the website as in-stock is not returned by this query, it is assumed to have gone out of stock
        In a later step, the website quantity for those items will be set to zero */
      const query = `
        SELECT pr.num, pc.qty AS quantity
        FROM part p 
        JOIN partcost pc ON p.id = pc.partId
        JOIN product pr ON pr.num = p.num
        WHERE pc.qty > 0
        GROUP BY pr.num, pc.partId;
      `;
      const encodedQuery = encodeURIComponent(query);
      const res = await this.fbClient.get(
        `/api/data-query?query=${encodedQuery}`,
        {
          headers: {
            Authorization: `Bearer ${this.getToken()}`,
            Accept: "application/json",
          },
        }
      );

      return res.data;
    } catch (error) {
      console.error("Error getting inventory quantities:", error);
      throw error;
    }
  }

  async sendOrderToErp(order) {
    try {
      if (!this.token) await this.auth();

      const res = await this.fbClient.post("/api/import/Sales-Order", {
        // order
      });
    } catch (error) {
      console.error("Error sending order to Fishbowl: ", error);
      throw error;
    }
  }
}
