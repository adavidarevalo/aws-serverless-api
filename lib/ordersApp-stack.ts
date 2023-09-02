/** @format */

import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface OrdersAppLayersStackProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
}

export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodejs.NodejsFunction;

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
      },
      layers: [productsLayer, ordersLayer, ordersLayerApi],
      tracing: lambda.Tracing.ACTIVE,
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
    });

    ordersDdb.grantReadWriteData(this.ordersHandler);
    props.productsDdb.grantReadData(this.ordersHandler);
  }
}
