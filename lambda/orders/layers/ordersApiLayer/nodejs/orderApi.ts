/** @format */

export enum PaymentType {
  CASH = 'CASH',
  DEBIT_CARD = 'DEBIT_CARD',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum ShippingType {
  ECONOMIC = 'ECONOMIC',
  URGENT = 'URGENT',
}

export enum CarrierType {
  CORREOS = 'CORREOS',
  FEDEX = 'FEDEX',
}

export interface OrderRequest {
  email: string;
  productIds: string[];
  payment: PaymentType;
  shipping: {
    type: ShippingType;
    carrier: CarrierType;
  };
}

export interface OrderProductResponse {
  price: number;
  code: string;
}

export interface OrderResponse {
  email: string;
  id: string;
  createAt: number;
  billing: {
    totalPrice: number;
    payment: PaymentType;
  };
  shipping: {
    type: ShippingType;
    carrier: CarrierType;
  };
  products?: OrderProductResponse[];
}
