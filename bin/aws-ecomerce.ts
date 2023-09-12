#!/usr/bin/env node
/** @format */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecomerceApi-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';
import { EventsDdbStack } from '../lib/evenetDdb-stack';
import { OrdersAppLayersStack } from '../lib/ordersAppLayers-stack';
import { OrdersAppStack } from '../lib/ordersApp-stack';
import { InvoiceWSApiStack } from '../lib/invoceWSApi-stack';
import { InvoiceAppLayersStack } from '../lib/invoiceAppLayers-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: '946974073227',
  region: 'us-east-2',
};

const tags = {
  cost: 'ECommerce',
  team: 'dev',
};

const productsAppLayersStack = new ProductsAppLayersStack(app, 'ProductsAppLayersStack', { env, tags });

const eventsDdb = new EventsDdbStack(app, 'EventsDdb', { env, tags });

const productsAppStack = new ProductAppStack(app, 'ProductAppStack', {
  env,
  tags,
  eventsDdb: eventsDdb.table,
});

productsAppStack.addDependency(productsAppLayersStack);
productsAppStack.addDependency(eventsDdb);

const ordersAppLayersStack = new OrdersAppLayersStack(app, 'OrdersAppLayersStack', { env, tags });
const ordersAppStack = new OrdersAppStack(app, 'OrdersAppStack', {
  env,
  tags,
  productsDdb: productsAppStack.productsDdb,
  eventsDdb: eventsDdb.table,
});

ordersAppStack.addDependency(productsAppLayersStack);
ordersAppStack.addDependency(ordersAppLayersStack);
ordersAppStack.addDependency(eventsDdb);

const eCommerceApiStack = new ECommerceApiStack(app, 'ECommerceApiStack', {
  env,
  tags,
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  orderEventsFetchFunction: ordersAppStack.orderEventsFetchHandler,
});

eCommerceApiStack.addDependency(productsAppStack);

const invoiceAppLayersStack = new InvoiceAppLayersStack(app, 'InvoiceAppLayersStack', { env, tags });

const invoiceWSApiStack = new InvoiceWSApiStack(app, 'InvoiceWSApiStack', {
  eventDdb: eventsDdb.table,
  env,
  tags,
});

invoiceWSApiStack.addDependency(invoiceAppLayersStack);
