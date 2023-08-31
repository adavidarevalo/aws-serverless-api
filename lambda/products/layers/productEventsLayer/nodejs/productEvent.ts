/** @format */

export enum ProductEventType {
  CREATED = 'PRODUCT_CREATE',
  UPDATED = 'PRODUCT_UPDATE',
  DELETED = 'PRODUCT_DELETE',
}

export interface ProductEvent {
  requestId: string;
  eventType: ProductEventType;
  productId: string;
  productCode: string;
  productPrice: number;
  email: string;
}
