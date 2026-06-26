// Minimal type stubs for Novu packages.
// These allow TypeScript to compile when @novu/framework / @novu/node are not yet installed.
// Run `npm install` in the backend directory to get the real types from npm.
// eslint-disable-next-line @typescript-eslint/no-explicit-any

declare module '@novu/framework' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRecord = Record<string, any>;

  interface StepOptions {
    controlSchema?: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skip?: (controls: any) => boolean | Promise<boolean>;
  }

  interface Step {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    email(id: string, handler: (controls: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sms(id: string, handler: (controls?: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chat(id: string, handler: (controls?: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inApp(id: string, handler: (controls?: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delay(id: string, handler: (controls?: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    push(id: string, handler: (controls?: any) => Promise<AnyRecord>, options?: StepOptions): Promise<void>;
  }

  interface WorkflowOptions {
    payloadSchema?: unknown;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type WorkflowHandler = (ctx: { step: Step; payload: any; subscriber: AnyRecord }) => Promise<void>;

  export function workflow(
    id: string,
    handler: WorkflowHandler,
    options?: WorkflowOptions
  ): WorkflowDefinition;

  export interface WorkflowDefinition {
    id: string;
  }
}

declare module '@novu/framework/express' {
  import type { RequestHandler } from 'express';
  import type { WorkflowDefinition } from '@novu/framework';

  export function serve(options: { workflows: WorkflowDefinition[] }): RequestHandler;
}

declare module '@novu/node' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRecord = Record<string, any>;

  interface SubscriberPayload {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    data?: AnyRecord;
  }

  interface TriggerPayload {
    to: { subscriberId: string; email?: string; phone?: string };
    payload: AnyRecord;
    overrides?: AnyRecord;
  }

  interface Subscribers {
    identify(subscriberId: string, data: SubscriberPayload): Promise<unknown>;
  }

  export class Novu {
    subscribers: Subscribers;
    constructor(apiKey: string);
    trigger(workflowId: string, payload: TriggerPayload): Promise<unknown>;
  }
}
