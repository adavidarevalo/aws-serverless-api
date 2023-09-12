/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';
import { InvoiceRepository } from '/opt/nodejs/invoiceRepository';

AWSXRay.captureAWS(require('aws-sdk'));

const invoiceDdb = process.env.INVOICE_DDB!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!;

const ddbClient = new DynamoDB.DocumentClient();
const apigwManagmentApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceDdb);
const invoiceWSService = new InvoiceWSService(apigwManagmentApi);
const invoiceRepository = new InvoiceRepository(ddbClient, invoiceDdb);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  console.log(event);

  const transactionId = JSON.parse(event.body!).transactionId as string;
  const lambdaRequestId = context.awsRequestId;
  const connectionId = event.requestContext.connectionId!;

  console.log(`Connection ID: ${connectionId} - Lambda Request Id: ${lambdaRequestId}`);

  try {
    const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(transactionId);
    if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
      await Promise.all([
        invoiceWSService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.CANCELED),
        invoiceTransactionRepository.updateInvoiceTransaction(transactionId, InvoiceTransactionStatus.CANCELED),
      ]);
    } else {
      await invoiceWSService.sendInvoiceStatus(transactionId, connectionId, invoiceTransaction.transactionStatus);
      console.error(`Can't cancel an ongoing invoice transaction`);
    }
  } catch (error) {
    console.error((<Error>error).message);
    console.error(`Invoice transaction not found: ${transactionId}`);
    await invoiceWSService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.NOT_FOUND);
  }
  return {
    statusCode: 200,
    body: 'OK',
  };
}
