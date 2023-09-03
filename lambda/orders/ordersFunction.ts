/** @format */
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, SNS } from 'aws-sdk';
import { Product, ProductRepository } from '/opt/nodejs/productsLayer';
import { Order, OrderRepository } from '/opt/nodejs/ordersLayer';
import * as AWSXRay from 'aws-xray-sdk';
import {
  CarrierType,
  OrderProductResponse,
  OrderRequest,
  OrderResponse,
  PaymentType,
  ShippingType,
} from '/opt/nodejs/ordersApiLayer';
import { Envelope, OrderEvent, OrderEventType } from '/opt/nodejs/ordersEventsLayer';
import { v4 as uuid } from 'uuid';

AWSXRay.captureAWS(require('aws-sdk'));

const productsDdb = process.env.PRODUCTS_DDB!;
const ordersDdb = process.env.ORDERS_DDB!;
const orderEventsTopic = process.env.ORDER_EVENT_TOPIC_ARN!;

const snsClient = new SNS();

const ddbClient = new DynamoDB.DocumentClient();

const orderRepository = new OrderRepository(ddbClient, ordersDdb);
const productRepository = new ProductRepository(ddbClient, productsDdb);

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const method = event.httpMethod;

  const apiRequestId = event.requestContext.requestId;
  const lambdaRequestId = context.awsRequestId;

  console.log(`API Gateway Request ID: ${apiRequestId} Lambda Request ID: ${lambdaRequestId}`);

  if (method === 'GET' && !!event.queryStringParameters) {
    const { email, orderId } = event.queryStringParameters!;
    if (email && orderId) {
      try {
        const order = await orderRepository.getOrder(email, orderId);

        return {
          statusCode: 200,
          body: JSON.stringify(covertToOrderResponse(order)),
        };
      } catch (error) {
        console.log((<Error>error).message);

        return {
          statusCode: 404,
          body: (<Error>error).message,
        };
      }
    }
    const orders = await orderRepository.getOrdersByEmail(email as string);
    return {
      statusCode: 200,
      body: JSON.stringify(orders.map(order => covertToOrderResponse(order))),
    };
  }

  if (method === 'GET' && !!event.queryStringParameters === false) {
    const orders = await orderRepository.getAllOrders();
    return {
      statusCode: 200,
      body: JSON.stringify(orders.map(order => covertToOrderResponse(order))),
    };
  }
  if (method === 'POST') {
    const orderRequest = JSON.parse(event.body!) as OrderRequest;
    const products = await productRepository.getProductsByIds(orderRequest.productIds);
    if (products.length !== orderRequest.productIds.length) {
      return {
        statusCode: 400,
        body: 'Some products are not found',
      };
    }

    const order = buildOrder(orderRequest, products);

    const orderCreatedPromise = orderRepository.createOrder(order);

    const evesResultPromise = sendOrderEvents(order, OrderEventType.CREATED, lambdaRequestId);

    const result = await Promise.all([orderCreatedPromise, evesResultPromise]);

    console.log(`Order created - OrderId: ${order.sk} - MessageId: ${result[1].MessageId}`);

    return {
      statusCode: 201,
      body: JSON.stringify(covertToOrderResponse(order)),
    };
  }

  if (method === 'DELETE') {
    try {
      const { email, orderId } = event.queryStringParameters!;

      const order = await orderRepository.deleteOrder(email as string, orderId as string);
      const evesResult = await sendOrderEvents(order, OrderEventType.DELETED, lambdaRequestId);
      console.log(`Order deleted - OrderId: ${order.sk} - MessageId: ${evesResult.MessageId}`);
      return {
        statusCode: 200,
        body: JSON.stringify(covertToOrderResponse(order)),
      };
    } catch (error) {
      console.log((<Error>error).message);
      return {
        statusCode: 404,
        body: (<Error>error).message,
      };
    }
  }

  return {
    statusCode: 404,
    body: JSON.stringify({
      message: 'Not found',
    }),
  };
};

const sendOrderEvents = (order: Order, eventType: OrderEventType, lambdaRequestId: string) => {
  const productCodes: string[] = [];

  order.products.forEach(product => {
    productCodes.push(product.code);
  });

  const orderEvent: OrderEvent = {
    productCodes,
    email: order.pk,
    orderId: order.sk as string,
    billing: {
      payment: order.billing.payment,
      totalPrice: order.billing.totalPrice,
    },
    shipping: {
      type: order.shipping.type,
      carrier: order.shipping.carrier,
    },
    requestId: lambdaRequestId,
  };

  const envelope: Envelope = {
    eventType,
    data: JSON.stringify(orderEvent),
  };

  return snsClient
    .publish({
      TopicArn: orderEventsTopic,
      Message: JSON.stringify({ ...envelope }),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: eventType,
        },
      },
    })
    .promise();
};

const covertToOrderResponse = (order: Order): OrderResponse => {
  const orderProducts: OrderProductResponse[] = [];

  order.products.forEach(product => {
    orderProducts.push({
      price: product.price,
      code: product.code,
    });
  });
  const orderResponse: OrderResponse = {
    email: order.pk,
    id: order.sk!,
    createAt: order.createAt!,
    products: orderProducts,
    billing: {
      payment: order.billing.payment as PaymentType,
      totalPrice: order.billing.totalPrice,
    },
    shipping: {
      carrier: order.shipping.carrier as CarrierType,
      type: order.shipping.type as ShippingType,
    },
  };

  return orderResponse;
};

const buildOrder = (orderRequest: OrderRequest, products: Product[]): Order => {
  const orderProducts: OrderProductResponse[] = [];
  let totalPrice = 0;

  products.forEach(product => {
    totalPrice += product.price;
    orderProducts.push({
      price: product.price,
      code: product.code,
    });
  });
  const order: Order = {
    pk: orderRequest.email,
    sk: uuid(),
    createAt: Date.now(),
    billing: {
      payment: orderRequest.payment,
      totalPrice,
    },
    shipping: {
      type: orderRequest.shipping.type,
      carrier: orderRequest.shipping.carrier,
    },

    products: orderProducts,
  };

  return order;
};
