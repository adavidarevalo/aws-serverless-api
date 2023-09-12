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
  orderEventsFetchFunction: lambdaNodejs.NodejsFunction;
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

    const productRequestValidator = new apigateway.RequestValidator(this, 'ProductRequestValidator', {
      restApi: api,
      requestValidatorName: 'ProductRequestValidatorService',
      validateRequestBody: true,
    });

    const productModel = new apigateway.Model(this, 'CreateProductValidator', {
      modelName: 'CreateProductValidator',
      restApi: api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          productName: {
            type: apigateway.JsonSchemaType.STRING,
          },
          code: {
            type: apigateway.JsonSchemaType.STRING,
          },
          model: {
            type: apigateway.JsonSchemaType.STRING,
          },
          productUrl: {
            type: apigateway.JsonSchemaType.STRING,
          },
          price: {
            type: apigateway.JsonSchemaType.NUMBER,
          },
        },
        required: ['productName', 'code'],
      },
    });
    productsResource.addMethod('POST', productsAdminIntegration, {
      requestValidator: productRequestValidator,
      requestModels: {
        'application/json': productModel,
      },
    });
    productIdResource.addMethod('PUT', productsAdminIntegration, {
      requestValidator: productRequestValidator,
      requestModels: {
        'application/json': productModel,
      },
    });
    productIdResource.addMethod('DELETE', productsAdminIntegration);
  }

  private createOrdersService(props: ApiGatewayStackProps, api: apigateway.RestApi) {
    const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler);

    const orderResource = api.root.addResource('orders');

    orderResource.addMethod('GET', ordersIntegration);

    const orderRequestValidator = new apigateway.RequestValidator(this, 'OrderRequestValidator', {
      restApi: api,
      requestValidatorName: 'OrderRequestValidator',
      validateRequestBody: true,
    });

    const orderModel = new apigateway.Model(this, 'OrderModel', {
      modelName: 'OrderModel',
      restApi: api,
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          email: {
            type: apigateway.JsonSchemaType.STRING,
          },
          productIds: {
            type: apigateway.JsonSchemaType.ARRAY,
            minItems: 1,
            items: {
              type: apigateway.JsonSchemaType.STRING,
            },
          },
          payment: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ['CASH', 'DEBIT_CARD', 'CREDIT_CARD'],
          },
        },
        required: ['email', 'productIds', 'payment'],
      },
    });

    orderResource.addMethod('POST', ordersIntegration, {
      requestValidator: orderRequestValidator,
      requestModels: {
        'application/json': orderModel,
      },
    });

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

    const orderEventsResource = orderResource.addResource('events');

    const orderEventsFetchValidator = new apigateway.RequestValidator(this, 'OrderEventsFetchValidator', {
      restApi: api,
      requestValidatorName: 'OrderEventsFetchValidator',
      validateRequestParameters: true,
    });

    const orderEventsFunctionIntegration = new apigateway.LambdaIntegration(props.orderEventsFetchFunction);

    orderEventsResource.addMethod('GET', orderEventsFunctionIntegration, {
      requestParameters: {
        'method.request.querystring.email': true,
        'method.request.querystring.eventType': false,
      },
      requestValidator: orderEventsFetchValidator,
    });
  }
}
