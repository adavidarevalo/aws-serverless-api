/** @format */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

interface OrdersAppLayersStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;
}

export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodejs.NodejsFunction;
  readonly orderEventsFetchHandler: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: OrdersAppLayersStackProps) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, 'OrdersDdb', {
      tableName: 'Orders',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'ProductsLayerVersionArn');
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'ProductsLayerVersionArn', productsLayerArn);

    const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersLayerVersionArn');
    const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersLayerVersionArn', ordersLayerArn);

    const ordersLayerApiArn = ssm.StringParameter.valueForStringParameter(this, 'OrdersApiLayerArn');
    const ordersLayerApi = lambda.LayerVersion.fromLayerVersionArn(this, 'OrdersApiLayerArn', ordersLayerApiArn);

    const ordersEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, 'OrderEventsLayerArn');
    const ordersEventsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'OrderEventsLayerArn',
      ordersEventsLayerArn
    );

    const ordersEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      'OrderEventsRepositoryLayerArn'
    );
    const ordersEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'OrderEventsRepositoryLayerArn',
      ordersEventsRepositoryLayerArn
    );

    const ordersTopic = new sns.Topic(this, 'OrderEventsTopic', {
      displayName: 'OrderEventsTopic',
      topicName: 'order-events',
    });

    this.ordersHandler = new lambdaNodejs.NodejsFunction(this, 'OrdersFunction', {
      entry: './lambda/orders/ordersFunction.ts',
      functionName: 'OrdersFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        PRODUCTS_DDB: props.productsDdb.tableName,
        ORDERS_DDB: ordersDdb.tableName,
        ORDER_EVENT_TOPIC_ARN: ordersTopic.topicArn,
      },
      layers: [productsLayer, ordersLayer, ordersLayerApi, ordersEventsLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    ordersDdb.grantReadWriteData(this.ordersHandler);
    props.productsDdb.grantReadData(this.ordersHandler);
    ordersTopic.grantPublish(this.ordersHandler);

    const orderEventsHandler = new lambdaNodejs.NodejsFunction(this, 'OrderEventsFunction', {
      entry: './lambda/orders/orderEventsFunction.ts',
      functionName: 'OrderEventsFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        EVENTS_DDB: props.eventsDdb.tableName,
      },
      layers: [ordersEventsLayer, ordersEventsRepositoryLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler));

    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ['ForAllValues:StringLike']: {
          'dynamodb:LeadingKeys': ['#order_*'],
        },
      },
    });

    orderEventsHandler.addToRolePolicy(eventsDdbPolicy);

    const billingHandler = new lambdaNodejs.NodejsFunction(this, 'BillingFunction', {
      entry: './lambda/orders/billingFunction.ts',
      functionName: 'BillingFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    ordersTopic.addSubscription(
      new subs.LambdaSubscription(billingHandler, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_CREATED'],
          }),
        },
      })
    );

    const orderEventsDlq = new sqs.Queue(this, 'orderEventsDlq', {
      queueName: 'order-events-dlq',
      retentionPeriod: cdk.Duration.days(10),
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
    });

    const orderEventsQueue = new sqs.Queue(this, 'OrderEventsQueue', {
      queueName: 'order-events',
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: orderEventsDlq,
      },
    });
    ordersTopic.addSubscription(
      new subs.SqsSubscription(orderEventsQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['ORDER_CREATED'],
          }),
        },
      })
    );

    const orderEmailsHandler = new lambdaNodejs.NodejsFunction(this, 'OrderEmailsFunction', {
      entry: './lambda/orders/orderEmailsFunction.ts',
      functionName: 'OrderEmailsFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      layers: [ordersEventsLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    orderEmailsHandler.addEventSource(
      new lambdaEventSources.SqsEventSource(orderEventsQueue, {
        batchSize: 5,
        enabled: true,
        maxBatchingWindow: cdk.Duration.minutes(1),
      })
    );

    orderEventsQueue.grantConsumeMessages(orderEmailsHandler);

    const readScale = ordersDdb.autoScaleReadCapacity({
      maxCapacity: 2,
      minCapacity: 1,
    });

    readScale.scaleOnUtilization({
      targetUtilizationPercent: 75,
      scaleInCooldown: cdk.Duration.minutes(1),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });
    ordersDdb.autoScaleWriteCapacity({
      maxCapacity: 4,
      minCapacity: 1,
    });

    const orderEmailSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });

    orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy);

    this.orderEventsFetchHandler = new lambdaNodejs.NodejsFunction(this, 'OrderEventsFetchFunction', {
      entry: './lambda/orders/orderEventsFetchFunction.ts',
      functionName: 'OrderEventsFetchFunction',
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(2),
      bundling: {
        minify: true,
        sourceMap: false,
      },
      environment: {
        EVENT_DDB: props.eventsDdb.tableName,
      },
      layers: [ordersEventsRepositoryLayer],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    const eventsFetchDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Query'],
      resources: [`${props.eventsDdb.tableArn}/index/emailIndex`],
    });

    this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy);
  }
}
