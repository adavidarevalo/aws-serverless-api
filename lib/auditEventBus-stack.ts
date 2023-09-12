/** @format */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export class AuditEventsBusStack extends cdk.Stack {
  readonly bus: events.EventBus;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.bus = new events.EventBus(this, 'AuditEventsBus', {
      eventBusName: 'AuditEventsBus',
    });

    this.bus.archive('BusArchive', {
      eventPattern: {
        source: ['app.order'],
      },
      archiveName: 'auditEvents',
      retention: cdk.Duration.days(10),
    });

    const nonValidOrderRule = new events.Rule(this, 'NonValidOrderRule', {
      ruleName: 'NonValidOrderRule',
      description: 'Rule match non valid order',
      eventBus: this.bus,
      eventPattern: {
        source: ['app.order'],
        detailType: ['order'],
        detail: {
          status: ['PRODUCT_NOT_FOUND'],
        },
      },
    });

    const ordersErrorsFunctions = new lambdaNodejs.NodejsFunction(this, 'OrdersErrorsFunctions', {
      entry: './lambda/audit/ordersErrorsFunctions.ts',
      functionName: 'OrdersErrorsFunctions',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
    });

    nonValidOrderRule.addTarget(new targets.LambdaFunction(ordersErrorsFunctions));

    const nonValidInvoiceRule = new events.Rule(this, 'NonValidInvoiceRule', {
      ruleName: 'NonValidInvoiceRule',
      description: 'Rule match non valid invoice',
      eventBus: this.bus,
      eventPattern: {
        source: ['app.invoice'],
        detailType: ['invoice'],
        detail: {
          status: ['FAIL_NO_INVOICE_NUMBER'],
        },
      },
    });

    const invoiceErrorsFunctions = new lambdaNodejs.NodejsFunction(this, 'InvoiceErrorsFunctions', {
      entry: './lambda/audit/invoiceErrorsFunctions.ts',
      functionName: 'InvoiceErrorsFunctions',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
    });

    nonValidInvoiceRule.addTarget(new targets.LambdaFunction(invoiceErrorsFunctions));

    const timeoutImportInvoiceRule = new events.Rule(this, 'TimeoutImportInvoiceRule', {
      ruleName: 'TimeoutImportInvoiceRule',
      description: 'Rule match timeout import invoice',
      eventBus: this.bus,
      eventPattern: {
        source: ['app.invoice'],
        detailType: ['invoice'],
        detail: {
          status: ['TIMEOUT'],
        },
      },
    });

    const invoiceImportTimeoutQueue = new sqs.Queue(this, 'InvoiceImportTimeoutQueue', {
      queueName: 'InvoiceImportTimeoutQueue',
    });

    timeoutImportInvoiceRule.addTarget(new targets.SqsQueue(invoiceImportTimeoutQueue));
  }
}
