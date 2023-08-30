/** @format */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { Product, ProductRepository } from '/opt/nodejs/productsLayer';

const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  if (event.resource === '/products' && event.httpMethod === 'POST') {
    const product = JSON.parse(event.body!) as Product;

    const productCreated = await productRepository.createProduct(product);

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
