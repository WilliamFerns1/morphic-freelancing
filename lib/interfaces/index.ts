interface ShopifyProduct {
  id: number,
  title: string,
  handle: string,
  body_html: string,
  published_at: string,
  created_at: string,
  updated_at: string,
  vendor: string,
  product_type: string, 
  tags: string[],
  variants: Object[],
  images: Object[],
  optons: Object[],
}

interface ShopifyProducts {
  products: Array<ShopifyProduct>;
}

export type {
  ShopifyProduct,
  ShopifyProducts,
}

