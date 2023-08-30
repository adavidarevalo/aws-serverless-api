/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ProductRepository } from '/opt/nodejs/productsLayer';
import { DynamoDB } from 'aws-sdk';

const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  if (event.resource === '/products' && event.httpMethod === 'GET') {
    console.log(`GET /products`);

    const products = await productRepository.getAllProducts();

    return {
      statusCode: 200,
      body: JSON.stringify(products),
    };
  }

  if (event.resource === '/products/{id}' && event.httpMethod === 'GET') {
    const productId = event.pathParameters!.id as string;

    try {
      const product = await productRepository.getProductById(productId);

      return {
        statusCode: 200,
        body: JSON.stringify(product),
      };
    } catch (error) {
      console.error((<Error>error).message);
      return {
        statusCode: 404,
        body: (<Error>error).message,
      };
    }
  }

  return {
    statusCode: 404,
    body: JSON.stringify({
      message: 'Not found',
    }),
  };
};
