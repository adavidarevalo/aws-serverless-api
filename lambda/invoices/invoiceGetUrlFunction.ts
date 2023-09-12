/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB, S3 } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { v4 as uuid } from 'uuid';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';

AWSXRay.captureAWS(require('aws-sdk'));

const invoiceDdb = process.env.INVOICE_DDB!;
const bucketName = process.env.BUCKET_NAME!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!;

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagmentApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceDdb);
const invoiceWSService = new InvoiceWSService(apigwManagmentApi);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  console.log(event);

  const lambdaRequestId = context.awsRequestId;
  const connectionId = event.requestContext.connectionId!;

  console.log(`Connection ID: ${connectionId} - Lambda Request Id: ${lambdaRequestId}`);

  const key = uuid();
  const expires = 300;

  const singUrlPut = await s3Client.getSignedUrlPromise('putObject', {
    bucketName,
    Key: key,
    Expires: expires,
  });

  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 2);

  await invoiceTransactionRepository.createInvoiceTransaction({
    pk: '#transaction',
    sk: key,
    ttl,
    requestId: lambdaRequestId,
    transactionStatus: InvoiceTransactionStatus.GENERATED,
    timestamp: timestamp,
    expiresIn: expires,
    connectionId: connectionId,
    endpoint: invoiceWsApiEndpoint,
  });

  const postData = JSON.stringify({
    url: singUrlPut,
    expires,
    transactionId: key,
  });

  await invoiceWSService.sendData(connectionId, postData);

  return {
    statusCode: 200,
    body: 'OK',
  };
}
