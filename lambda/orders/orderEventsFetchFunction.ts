/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk';
import { DynamoDB, SNS } from 'aws-sdk';
import { OrderEventDdb, OrderEventRepository } from '/opt/nodejs/orderEventsRepositoryLayer';

AWSXRay.captureAWS(require('aws-sdk'));

const eventDdb = process.env.EVENT_DDB!;

const ddbClient = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(ddbClient, eventDdb);

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const email = event.queryStringParameters!.email as string;
  const eventType = event.queryStringParameters!.eventType;

  let orderEvents = [];

  if (eventType) {
    orderEvents = await orderEventsRepository.getOrderEventsByEmailAndEventType(email, eventType);
  } else {
    orderEvents = await orderEventsRepository.getOrderEventsByEmail(email);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(convertOrderEvents(orderEvents)),
  };
};

const convertOrderEvents = (orderEvents: OrderEventDdb[]) => {
  return orderEvents.map(orderEvent => {
    return {
      email: orderEvent.email,
      createdAt: orderEvent.createdAt,
      eventType: orderEvent.eventType,
      requestId: orderEvent.requestId,
      orderId: orderEvent.info.orderId,
      productCodes: orderEvent.info.productCodes,
    };
  });
};
