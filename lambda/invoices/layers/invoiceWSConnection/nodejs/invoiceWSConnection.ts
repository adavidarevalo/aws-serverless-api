/** @format */

import { ApiGatewayManagementApi } from 'aws-sdk';

/** @format */
export class InvoiceWSService {
  private apigwManagmentApi: ApiGatewayManagementApi;

  constructor(apigwManagmentApi: ApiGatewayManagementApi) {
    this.apigwManagmentApi = apigwManagmentApi;
  }

  async sendData(connectionId: string, data: string): Promise<boolean> {
    try {
      await this.apigwManagmentApi
        .getConnection({
          ConnectionId: connectionId,
        })
        .promise();

      await this.apigwManagmentApi.postToConnection({
        ConnectionId: connectionId,
        Data: data,
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  sendInvoiceStatus(transactionId: string, connectionId: string, status: string) {
    const postData = JSON.stringify({
      transactionId: transactionId,
      status: status,
    });

    return this.sendData(connectionId, postData);
  }

  async disconnectClient(connectionId: string): Promise<boolean> {
    try {
      await this.apigwManagmentApi
        .getConnection({
          ConnectionId: connectionId,
        })
        .promise();

      this.apigwManagmentApi
        .deleteConnection({
          ConnectionId: connectionId,
        })
        .promise();

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
