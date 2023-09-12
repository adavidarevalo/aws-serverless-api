/** @format */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class InvoiceAppLayersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const invoiceTransactionLayer = new lambda.LayerVersion(this, 'InvoiceTransactionLayer', {
      code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceTransaction'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      layerVersionName: 'InvoiceTransactionLayer',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new ssm.StringParameter(this, 'InvoiceTransactionLayerVersionArn', {
      parameterName: 'InvoiceTransactionLayerVersionArn',
      stringValue: invoiceTransactionLayer.layerVersionArn,
    });

    const invoiceRepositoryLayer = new lambda.LayerVersion(this, 'InvoiceRepositoryLayer', {
      code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceRepository'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      layerVersionName: 'InvoiceRepositoryLayer',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new ssm.StringParameter(this, 'InvoiceRepositoryLayerVersionArn', {
      parameterName: 'InvoiceRepositoryLayerVersionArn',
      stringValue: invoiceRepositoryLayer.layerVersionArn,
    });

    const invoiceWSConnectionLayer = new lambda.LayerVersion(this, 'InvoiceWSConnectionLayer', {
      code: lambda.Code.fromAsset('lambda/invoices/layers/invoiceWSConnection'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      layerVersionName: 'InvoiceWSConnectionLayer',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new ssm.StringParameter(this, 'InvoiceWSConnectionLayerVersionArn', {
      parameterName: 'InvoiceWSConnectionLayerVersionArn',
      stringValue: invoiceWSConnectionLayer.layerVersionArn,
    });
  }
}
