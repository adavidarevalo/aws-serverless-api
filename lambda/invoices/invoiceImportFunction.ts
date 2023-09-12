/** @format */

import { Context, S3Event, S3EventRecord } from 'aws-lambda';
import { ApiGatewayManagementApi, DynamoDB, EventBridge, S3 } from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from '/opt/nodejs/invoiceTransaction';
import { InvoiceWSService } from '/opt/nodejs/invoiceWSConnection';
import { InvoiceFile, InvoiceRepository } from '/opt/nodejs/invoiceRepository';

AWSXRay.captureAWS(require('aws-sdk'));

const invoiceDdb = process.env.INVOICE_DDB!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!;
const auditBusEvent = process.env.AUDIT_BUS_NAME!;

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagmentApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoiceDdb);
const invoiceWSService = new InvoiceWSService(apigwManagmentApi);
const invoiceRepository = new InvoiceRepository(ddbClient, invoiceDdb);

const eventBridgeClient = new EventBridge();

export async function handler(event: S3Event, context: Context): Promise<void> {
  console.log(event);

  const promises: Promise<void>[] = [];
  event.Records.forEach(record => {
    promises.push(processRecord(record));
  });

  await Promise.all(promises);
}

export const processRecord = async (record: S3EventRecord): Promise<void> => {
  const key = record.s3.object.key;

  try {
    const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(key);
    if (invoiceTransaction.transactionStatus !== InvoiceTransactionStatus.GENERATED) {
      await invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        invoiceTransaction.transactionStatus
      );
      console.error(`Not Valid transaction status`);
      return;
    }

    await Promise.all([
      invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.RECEIVED),
      invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.RECEIVED),
    ]);

    const object = await s3Client
      .getObject({
        Key: key,
        Bucket: record.s3.bucket.name,
      })
      .promise();

    const invoice = JSON.parse(object.Body!.toString('utf-8')) as InvoiceFile;

    console.log(invoice);
    if (invoice.invoiceNumber.length >= 5) {
      const createInvoicePromise = invoiceRepository.create({
        pk: `#invoice_${invoice.customerName}`,
        sk: invoice.invoiceNumber,
        ttl: 0,
        totalValue: invoice.totalValue,
        productId: invoice.productId,
        quantity: invoice.quantity,
        transactionId: key,
        createdAt: Date.now(),
      });

      const deleteObjectPolicy = s3Client
        .deleteObject({
          Key: key,
          Bucket: record.s3.bucket.name,
        })
        .promise();

      const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(
        key,
        InvoiceTransactionStatus.PROCESSED
      );

      const sendStatusPromise = invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        InvoiceTransactionStatus.PROCESSED
      );

      await Promise.all([createInvoicePromise, deleteObjectPolicy, updateInvoicePromise, sendStatusPromise]);
    } else {
      console.log(`Invoice import failed - non valid invoice number - TransactionId: ${key}`);

      const putEventPromise = eventBridgeClient
        .putEvents({
          Entries: [
            {
              Source: 'app.invoice',
              EventBusName: auditBusEvent,
              DetailType: 'invoice',
              Time: new Date(),
              Detail: JSON.stringify({
                errorDetail: 'FAIL_NO_INVOICE_NUMBER',
                info: {
                  invoiceKey: key,
                  customerName: invoice.customerName,
                },
              }),
            },
          ],
        })
        .promise();

      const sendStatusPromise = invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
      );
      const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(
        key,
        InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
      );

      await Promise.all([sendStatusPromise, updateInvoicePromise, putEventPromise]);
    }
  } catch (error) {
    console.log((<Error>error).message);
  }
};
