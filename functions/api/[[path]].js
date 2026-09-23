import { createApp } from '../../server/worker/app.js';

const app = createApp();

export const onRequest = (context) => app.fetch(context.request, context.env, context);
