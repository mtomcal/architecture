export interface Product {
  id: string;
  name: string;
  priceCents: number;
  inventory: number;
}

export interface ProductStore {
  getProduct(productId: string): Promise<Product | undefined>;
  purchaseOne(productId: string): Product;
}

export class UnknownProductError extends Error {
  constructor(readonly productId: string) {
    super(`Product ${productId} was not found`);
    this.name = "UnknownProductError";
  }
}

export class InsufficientInventoryError extends Error {
  constructor(readonly productId: string) {
    super(`Product ${productId} has no inventory available`);
    this.name = "InsufficientInventoryError";
  }
}

export class FakeProductStore implements ProductStore {
  readonly #products: Map<string, Product>;
  readonly #readDelayMs: number;

  constructor(
    products: readonly Product[],
    options: { readDelayMs?: number } = {},
  ) {
    this.#products = new Map(
      products.map((product) => [product.id, { ...product }]),
    );
    this.#readDelayMs = options.readDelayMs ?? 80;
  }

  async getProduct(productId: string): Promise<Product | undefined> {
    if (this.#readDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.#readDelayMs));
    }
    return this.#copy(this.#products.get(productId));
  }

  purchaseOne(productId: string): Product {
    const product = this.#products.get(productId);
    if (product === undefined) {
      throw new UnknownProductError(productId);
    }
    if (product.inventory < 1) {
      throw new InsufficientInventoryError(productId);
    }

    product.inventory -= 1;
    return { ...product };
  }

  #copy(product: Product | undefined): Product | undefined {
    return product === undefined ? undefined : { ...product };
  }
}
