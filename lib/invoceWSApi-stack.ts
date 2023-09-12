/** @format */

import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integration from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';

interface InvoiceWSApiStackProps extends cdk.StackProps {
  eventDdb: dynamodb.Table;
  auditBus: events.EventBus;
}

export class InvoiceWSApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InvoiceWSApiStackProps) {
    super(scope, id, props);

    const invoiceTransactionLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      'InvoiceTransactionLayerVersionArn'
    );
    const invoiceTransactionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'InvoiceTransactionLayer',
      invoiceTransactionLayerArn
    );

    const invoiceLayerArn = ssm.StringParameter.valueForStringParameter(this, 'InvoiceRepositoryLayerVersionArn');
    const invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'InvoiceRepositoryLayer', invoiceLayerArn);

    const invoiceWsConnectionLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      'InvoiceWSConnectionLayerVersionArn'
    );
    const invoiceWsConnectionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'InvoiceWSConnectionLayer',
      invoiceWsConnectionLayerArn
    );

    const invoicesDdb = new dynamodb.Table(this, 'InvoicesDdb', {
      tableName: 'Invoices',
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    const bucket = new s3.Bucket(this, 'InvoiceBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    const connectionHandler = new lambdaNodejs.NodejsFunction(this, 'InvoiceConnectionFunction', {
      entry: './lambda/invoices/invoiceConnectionFunction.ts',
      functionName: 'InvoiceConnectionFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    const disconnectionHandler = new lambdaNodejs.NodejsFunction(this, 'InvoiceDisconnectionFunction', {
      entry: './lambda/invoices/invoiceDisconnectionFunction.ts',
      functionName: 'InvoiceDisconnectionFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'InvoiceWSApi', {
      apiName: 'InvoiceWSApi',
      connectRouteOptions: {
        integration: new apigatewayv2_integration.WebSocketLambdaIntegration('ConnectionHandler', connectionHandler),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2_integration.WebSocketLambdaIntegration(
          'DisconnectionHandler',
          disconnectionHandler
        ),
      },
    });

    const stage = 'prod';
    const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;

    new apigatewayv2.WebSocketStage(this, 'InvoiceWSApiStage', {
      webSocketApi: webSocketApi,
      stageName: stage,
      autoDeploy: true,
    });

    const getUrlHandler = new lambdaNodejs.NodejsFunction(this, 'InvoiceGetUrlFunction', {
      entry: './lambda/invoices/invoiceGetUrlFunction.ts',
      functionName: 'InvoiceGetUrlFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        INVOICE_DDB: invoicesDdb.tableName,
        BUCKET_NAME: bucket.bucketName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      },
      layers: [invoiceTransactionLayer, invoiceWsConnectionLayer],
      tracing: lambda.Tracing.ACTIVE,
    });

    const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKey': ['$transaction'],
        },
      },
    });

    const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject'],
      resources: [`arn:aws:s3:::${bucket.bucketName}/*`],
    });

    getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
    getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy);
    webSocketApi.grantManageConnections(getUrlHandler);

    const invoiceImportHandler = new lambdaNodejs.NodejsFunction(this, 'InvoiceImportFunction', {
      entry: './lambda/invoices/invoiceImportFunction.ts',
      functionName: 'InvoiceImportFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        INVOICE_DDB: invoicesDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        AUDIT_BUS_NAME: props.auditBus.eventBusName,
      },
      layers: [invoiceTransactionLayer, invoiceWsConnectionLayer, invoiceLayer],
      tracing: lambda.Tracing.ACTIVE,
    });
    props.auditBus.grantPutEventsTo(invoiceImportHandler);

    invoicesDdb.grantReadWriteData(invoiceImportHandler);

    bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(invoiceImportHandler));

    const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:DeleteObject', 's3:GetObject'],
      resources: [`arn:aws:s3:::${bucket.bucketName}/*`],
    });

    invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);

    const cancelImportHandler = new lambdaNodejs.NodejsFunction(this, 'CancelImportFunction', {
      entry: './lambda/invoices/cancelImportFunction.ts',
      functionName: 'CancelImportFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        INVOICE_DDB: invoicesDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
      },
      layers: [invoiceTransactionLayer, invoiceWsConnectionLayer],
      tracing: lambda.Tracing.ACTIVE,
    });
    const invoicesDdbReadWriteTransactionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem', 'dynamodb:GetItem'],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKey': ['$transaction'],
        },
      },
    });

    cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionPolicy);
    webSocketApi.grantManageConnections(cancelImportHandler);

    webSocketApi.addRoute('getImportUrl', {
      integration: new apigatewayv2_integration.WebSocketLambdaIntegration('GetUrlHandler', getUrlHandler),
    });

    webSocketApi.addRoute('cancelImport', {
      integration: new apigatewayv2_integration.WebSocketLambdaIntegration('CancelImportHandler', cancelImportHandler),
    });

    const invoiceEventsHandler = new lambdaNodejs.NodejsFunction(this, 'InvoiceEventsFunction', {
      entry: './lambda/invoices/invoiceEventsFunction.ts',
      functionName: 'InvoiceEventsFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        EVENT_DDB: props.eventDdb.tableName,
        INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        AUDIT_BUS_NAME: props.auditBus.eventBusName,
      },
      layers: [invoiceWsConnectionLayer],
    });
    props.auditBus.grantPutEventsTo(invoiceEventsHandler);

    webSocketApi.grantManageConnections(invoiceEventsHandler);

    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.eventDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#invoice_*'],
        },
      },
    });
    invoiceEventsHandler.addToRolePolicy(eventsDdbPolicy);

    const invoiceEventsDlq = new sqs.Queue(this, 'InvoiceEventsDlq', {
      queueName: 'InvoiceEventsDlq',
    });

    invoiceEventsHandler.addEventSource(
      new lambdaEventSources.DynamoEventSource(invoicesDdb, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        bisectBatchOnError: true,
        onFailure: new lambdaEventSources.SqsDlq(invoiceEventsDlq),
        retryAttempts: 3,
      })
    );
  }
}
