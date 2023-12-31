/** @format */

import { Callback, Context } from 'aws-lambda';
import { ProductEvent } from '/opt/nodejs/productEventsLayer';
import { DynamoDB } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';

AWSXRay.captureAWS(require('aws-sdk'));

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

export const handler = async (event: ProductEvent, context: Context, callback: Callback): Promise<void> => {
  await createEvent(event);
  callback(
    null,
    JSON.stringify({
      productEventCreated: true,
    })
  );
};

const createEvent = (event: ProductEvent) => {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000) + 5 * 60;

  return ddbClient
    .put({
      TableName: eventsDdb,
      Item: {
        pk: `#product_${event.productCode}`,
        sk: `${event.eventType}#${timestamp}`,
        email: event.email,
        createdAt: timestamp,
        ttl: ttl,
        requestId: event.requestId,
        eventType: event.eventType,
        info: {
          productId: event.productId,
          productPrice: event.productPrice,
        },
      },
    })
    .promise();
};
