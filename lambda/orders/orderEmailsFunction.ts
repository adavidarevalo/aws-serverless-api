/** @format */

import { Context, SNSMessage, SQSEvent } from 'aws-lambda';
import * as AWSXRay from 'aws-xray-sdk';
import { Envelope, OrderEvent } from '/opt/nodejs/ordersEventsLayer';
import { AWSError, SES } from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';

AWSXRay.captureAWS(require('aws-sdk'));
const sesClient = new SES();

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  const promise: Promise<PromiseResult<SES.SendEmailResponse, AWSError>>[] = [];
  event.Records.forEach(record => {
    console.log(record);
    const body = JSON.parse(record.body);
    console.log(body);
    promise.push(sendOrderEmail(body));
  });

  await Promise.all(promise);
  return;
};

const sendOrderEmail = (body: SNSMessage) => {
  const envelope = JSON.parse(body.Message) as Envelope;
  const event = JSON.parse(envelope.data) as OrderEvent;

  return sesClient
    .sendEmail({
      Destination: {
        ToAddresses: [event.email],
      },
      Message: {
        Body: {
          Text: {
            Charset: 'UTF-8',
            Data: `Your order ${event.orderId} has been ${event.shipping.type} by ${event.shipping.carrier}`,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: `Your order ${event.orderId} has been ${event.shipping.type} by ${event.shipping.carrier}`,
        },
      },
      Source: 'davidarevaloc20@gmail.com',
      ReplyToAddresses: ['davidarevaloc20@gmail.com'],
    })
    .promise();
};
