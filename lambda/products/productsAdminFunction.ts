/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB, Lambda } from 'aws-sdk';
import { Product, ProductRepository } from '/opt/nodejs/productsLayer';
import * as AWSXRay from 'aws-xray-sdk';
import { ProductEvent, ProductEventType } from '/opt/nodejs/productEventsLayer';

AWSXRay.captureAWS(require('aws-sdk'));

const productsDdb = process.env.PRODUCTS_DDB!;
const lambdaName = process.env.PRODUCT_EVENT_FUNCTION_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const product = JSON.parse(event.body!) as Product;
  const lambdaRequestId = context.awsRequestId;

  if (event.resource === '/products' && event.httpMethod === 'POST') {
    const productCreated = await productRepository.createProduct(product);

    const response = await sendProductEvent(
      productCreated,
      ProductEventType.CREATED,
      'david@gmail.com',
      lambdaRequestId
    );

    console.log(response);
    return {
      statusCode: 201,
      body: JSON.stringify(productCreated),
    };
  }
  if (event.resource === '/products/{id}') {
    const productId = event.pathParameters!.id as string;
    if (event.httpMethod === 'PUT') {
      try {
        const product = JSON.parse(event.body!) as Product;
        const productUpdated = await productRepository.updateProduct(productId, product);

        const response = await sendProductEvent(
          productUpdated,
          ProductEventType.UPDATED,
          'david2@gmail.com',
          lambdaRequestId
        );

        console.log(response);
        return {
          statusCode: 200,
          body: JSON.stringify(productUpdated),
        };
      } catch (error) {
        console.error((<Error>error).message);
        return {
          statusCode: 404,
          body: 'Product not Found',
        };
      }
    }
    if (event.httpMethod === 'DELETE') {
      const productId = event.pathParameters!.id as string;

      try {
        const productDeleted = await productRepository.deleteProduct(productId);

        const response = await sendProductEvent(
          productDeleted,
          ProductEventType.DELETED,
          'david3@gmail.com',
          lambdaRequestId
        );

        console.log(response);

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: productDeleted,
          }),
        };
      } catch (error) {
        console.error((<Error>error).message);
        return {
          statusCode: 404,
          body: 'Product not Found',
        };
      }
    }
  }

  return {
    statusCode: 404,
    body: JSON.stringify({
      message: 'Not found',
    }),
  };
};

const sendProductEvent = (product: Product, eventType: ProductEventType, email: string, lambdaRequestId: string) => {
  const event: ProductEvent = {
    email,
    eventType,
    productCode: product.code,
    productId: product.id,
    productPrice: product.price,
    requestId: lambdaRequestId,
  };

  return lambdaClient
    .invoke({
      FunctionName: lambdaName,
      InvocationType: 'Event',
      Payload: JSON.stringify(event),
    })
    .promise();
};
