/** @format */

import { DynamoDBStreamEvent, Context } from 'aws-lambda';
import { DynamoDB, ApiGatewayManagementApi } from 'aws-sdk';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';
import * as AWSXRay from 'aws-xray-sdk';

AWSXRay.captureAWS(require('aws-sdk'));

const eventDdb = process.env.EVENT_DDB!;
const invoiceWSApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);

const ddbClient = new DynamoDB.DocumentClient();
const apiGatewayManagementApi = new ApiGatewayManagementApi({
  endpoint: invoiceWSApiEndpoint,
});

const invoiceWSService = new InvoiceWSService(apiGatewayManagementApi);

export const handler = async (event: DynamoDBStreamEvent, context: Context): Promise<void> => {
  const promises: Promise<void>[] = [];

  event.Records.forEach(record => {
    if (record.eventName === 'INSERT') {
    } else if (record.eventName === 'MODIFY') {
    } else if (record.eventName === 'REMOVE') {
    }
  });

  await Promise.all(promises);

  return;
};
