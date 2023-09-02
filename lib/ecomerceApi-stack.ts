/** @format */

import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cwlogs from 'aws-cdk-lib/aws-logs';

interface ApiGatewayStackProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodejs.NodejsFunction;
  productsAdminHandler: lambdaNodejs.NodejsFunction;
  ordersHandler: lambdaNodejs.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const logGroup = new cwlogs.LogGroup(this, 'ECommerceApiLogs');

    const api = new apigateway.RestApi(this, 'ECommerceApi', {
      restApiName: 'ECommerceApi',
      description: 'ECommerce API',
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          caller: true,
          user: true,
        }),
      },
    });

    this.createProductsService(props, api);
    this.createOrdersService(props, api);
  }

  private createProductsService(props: ApiGatewayStackProps, api: apigateway.RestApi) {
    const productFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler);

    const productsResource = api.root.addResource('products');

    productsResource.addMethod('GET', productFetchIntegration);

    const productIdResource = productsResource.addResource('{id}');
    productIdResource.addMethod('GET', productFetchIntegration);

    const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler);

    productsResource.addMethod('POST', productsAdminIntegration);
    productIdResource.addMethod('PUT', productsAdminIntegration);
    productIdResource.addMethod('DELETE', productsAdminIntegration);
  }

  private createOrdersService(props: ApiGatewayStackProps, api: apigateway.RestApi) {
    const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler);

    const orderResource = api.root.addResource('orders');

    orderResource.addMethod('GET', ordersIntegration);
    orderResource.addMethod('POST', ordersIntegration);

    const orderDeletionValidator = new apigateway.RequestValidator(this, 'OrderDeletionValidator', {
      restApi: api,
      requestValidatorName: 'OrderDeletionValidator',
      validateRequestParameters: true,
    });

    orderResource.addMethod('DELETE', ordersIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
        'method.request.querystring.orderId': true,
      },
      requestValidator: orderDeletionValidator,
    });
  }
}
