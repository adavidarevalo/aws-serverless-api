/** @format */

import { DynamoDBStreamEvent, Context, AttributeValue } from 'aws-lambda';
import { DynamoDB, ApiGatewayManagementApi, EventBridge } from 'aws-sdk';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';
import * as AWSXRay from 'aws-xray-sdk';

AWSXRay.captureAWS(require('aws-sdk'));

const eventDdb = process.env.EVENT_DDB!;
const invoiceWSApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);
const auditBusEvent = process.env.AUDIT_BUS_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const apiGatewayManagementApi = new ApiGatewayManagementApi({
  endpoint: invoiceWSApiEndpoint,
});

const invoiceWSService = new InvoiceWSService(apiGatewayManagementApi);
const eventBridgeClient = new EventBridge();

export const handler = async (event: DynamoDBStreamEvent, context: Context): Promise<void> => {
  const promises: Promise<void>[] = [];

  event.Records.forEach(record => {
    if (record.eventName === 'INSERT') {
      if (record.dynamodb!.NewImage!.pk.S?.startsWith('#transaction')) {
        console.log('Invoice transaction event');
      } else {
        promises.push(createEvent(record.dynamodb!.NewImage!, 'INVOICE_CREATED'));
      }
    } else if (record.eventName === 'MODIFY') {
    } else if (record.eventName === 'REMOVE') {
      if (record.dynamodb!.OldImage!.pk.S?.startsWith('#transaction')) {
        promises.push(processExpiredTransaction(record.dynamodb!.OldImage!));
      }
    }
  });

  await Promise.all(promises);

  return;
};

const createEvent = async (
  invoiceImage: {
    [key: string]: AttributeValue;
  },
  eventType: string
): Promise<void> => {
  const timestamp = Date.now();

  const ttl = ~~(timestamp / 1000 + 60 * 60);

  await ddbClient
    .put({
      TableName: eventDdb,
      Item: {
        pk: `#invoice_${invoiceImage.sk.S}`,
        sk: `${eventType}#${timestamp}`,
        ttl,
        email: invoiceImage.email.S!.split('_')[1],
        createdAt: timestamp,
        info: {
          transaction: invoiceImage.transactionId.S,
          productId: invoiceImage.productId.N,
          quantity: invoiceImage.quantity.N,
        },
      },
    })
    .promise();

  return;
};

export const processExpiredTransaction = async (invoiceTransactionImage: {
  [key: string]: AttributeValue;
}): Promise<void> => {
  const transactionId = invoiceTransactionImage.sk.S!;
  const connectionId = invoiceTransactionImage.connectionId.S!;

  console.log(`Transaction Id ${transactionId} - Connection Id ${connectionId}`);

  if (invoiceTransactionImage.transactionStatus.S === 'INVOICE_PROCESSED') {
    console.log('Invoice processed');
  } else {
    console.log('Invoice import failed - status: ' + invoiceTransactionImage.transactionStatus.S);

    const putEventPromise = eventBridgeClient
      .putEvents({
        Entries: [
          {
            Source: 'app.invoice',
            EventBusName: auditBusEvent,
            DetailType: 'invoice',
            Time: new Date(),
            Detail: JSON.stringify({
              errorDetail: 'TIMEOUT',
              transactionId,
            }),
          },
        ],
      })
      .promise();

    const sendStatusPromise = invoiceWSService.sendInvoiceStatus(transactionId, connectionId, 'TIMEOUT');
    await Promise.all([putEventPromise, sendStatusPromise]);
    await invoiceWSService.disconnectClient(connectionId);
  }
};
