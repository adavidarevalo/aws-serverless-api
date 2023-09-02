/** @format */
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { v4 as uuid } from 'uuid';

export interface Product {
  id: string;
  productName: string;
  code: string;
  price: number;
  model: string;
  productUrl: string;
}

export class ProductRepository {
  private ddbClient: DocumentClient;
  private productDdb: string;
  constructor(ddbClient: DocumentClient, productDdb: string) {
    this.ddbClient = ddbClient;
    this.productDdb = productDdb;
  }

  getAllProducts = async (): Promise<Product[]> => {
    const params = {
      TableName: this.productDdb,
    };

    const data = await this.ddbClient.scan(params).promise();

    return data.Items as Product[];
  };

  getProductById = async (id: string): Promise<Product> => {
    const params = {
      TableName: this.productDdb,
      Key: {
        id,
      },
    };
    const data = await this.ddbClient.get(params).promise();

    if (data.Item) return data.Item as Product;

    throw new Error('Product not found');
  };

  createProduct = async (product: Product): Promise<Product> => {
    product.id = uuid();

    const params = {
      TableName: this.productDdb,
      Item: product,
    };

    await this.ddbClient.put(params).promise();

    return product;
  };

  deleteProduct = async (id: string): Promise<Product> => {
    const params = {
      TableName: this.productDdb,
      Key: {
        id,
      },
      ReturnValues: 'ALL_OLD',
    };
    const data = await this.ddbClient.delete(params).promise();

    if (data.Attributes) return data.Attributes as Product;

    throw new Error('Product not found');
  };

  updateProduct = async (id: string, product: Product): Promise<Product> => {
    const params = {
      TableName: this.productDdb,
      Key: {
        id,
      },
      ConditionExpression: 'attribute_exists (id)',
      ReturnValues: 'UPDATE_NEW',
      UpdateExpression:
        'set productName = :productName, code = :code, price = :price, model = :model, productUrl = :productUrl',
      ExpressionAttributeValues: {
        ':productName': product.productName,
        ':code': product.code,
        ':price': product.price,
        ':model': product.model,
        ':productUrl': product.productUrl,
      },
    };
    const data = await this.ddbClient.update(params).promise();

    data.Attributes!.id = id;

    return data.Attributes as Product;
  };

  getProductsByIds = async (ids: string[]): Promise<Product[]> => {
    const data = await this.ddbClient
      .batchGet({
        RequestItems: {
          [this.productDdb]: {
            Keys: ids.map(id => ({ id })),
          },
        },
      })
      .promise();

    return data.Responses![this.productDdb] as Product[];
  };
}
