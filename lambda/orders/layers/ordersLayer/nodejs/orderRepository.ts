/** @format */
import { DocumentClient } from 'aws-sdk/clients/dynamodb';

export interface OrderProduct {
  code: string;
  price: number;
}

export interface Order {
  pk: string;
  sk: string;
  shipping: {
    type: 'URGENT' | 'ECONOMIC';
    carrier: 'CORREOS' | 'FEDEX';
  };
  createAt: number;
  products: OrderProduct[];
  billing: {
    totalPrice: number;
    payment: 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD';
  };
}

export class OrderRepository {
  private ddbClient: DocumentClient;
  private ordersDdb: string;
  constructor(ddbClient: DocumentClient, ordersDdb: string) {
    this.ddbClient = ddbClient;
    this.ordersDdb = ordersDdb;
  }

  async createOrder(order: Order): Promise<Order> {
    await this.ddbClient
      .put({
        TableName: this.ordersDdb,
        Item: order,
      })
      .promise();

    return order;
  }

  async getAllOrders(): Promise<Order[]> {
    const result = await this.ddbClient
      .scan({
        TableName: this.ordersDdb,
      })
      .promise();

    return result.Items as Order[];
  }

  async getOrdersByEmail(email: string): Promise<Order[]> {
    const result = await this.ddbClient
      .query({
        TableName: this.ordersDdb,
        KeyConditionExpression: 'pk = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      })
      .promise();

    return result.Items as Order[];
  }

  async getOrder(email: string, orderId: string): Promise<Order> {
    const result = await this.ddbClient
      .get({
        TableName: this.ordersDdb,
        Key: {
          pk: email,
          sk: orderId,
        },
      })
      .promise();

    if (result.Item) return result.Item as Order;

    throw new Error('Order Not Found');
  }

  async deleteOrder(email: string, orderId: string): Promise<Order> {
    const data = await this.ddbClient
      .delete({
        TableName: this.ordersDdb,
        Key: {
          pk: email,
          sk: orderId,
        },
        ReturnValues: 'ALL_OLD',
      })
      .promise();

    if (data.Attributes) return data.Attributes as Order;

    throw new Error('Order Not Found');
  }
}
