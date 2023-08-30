#!/usr/bin/env node
/** @format */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecomerceApi-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: '946974073227',
  region: 'us-east-2',
};

const tags = {
  const: 'ECommerce',
  team: 'dev',
};

const productsAppLayersStack = new ProductsAppLayersStack(app, 'ProductsAppLayersStack', { env, tags });

const productsAppStack = new ProductAppStack(app, 'ProductAppStack', { env, tags });

productsAppStack.addDependency(productsAppLayersStack);

const eCommerceApiStack = new ECommerceApiStack(app, 'ECommerceApiStack', {
  env,
  tags,
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
});

eCommerceApiStack.addDependency(productsAppStack);
