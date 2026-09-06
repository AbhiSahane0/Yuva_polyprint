import { z } from 'zod';
import {
  changePasswordSchema,
  createCustomerSchema,
  createMaterialSchema,
  createQuotationSchema,
  createUserSchema,
  listCustomersQuerySchema,
  adjustStockSchema,
  closePurchaseLineSchema,
  listArtworkQuerySchema,
  listCylindersQuerySchema,
  recordCylinderEventSchema,
  registerCylindersSchema,
  requestArtworkUploadSchema,
  updateArtworkSchema,
  updateCylinderSchema,
  createPurchaseOrderSchema,
  issueStockSchema,
  listStockQuerySchema,
  listPurchaseOrdersQuerySchema,
  listSuppliersQuerySchema,
  receivePurchaseLineSchema,
  supplierSchema,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
  receiveStockSchema,
  setReorderLevelSchema,
  transferStockSchema,
  listQuotationsQuerySchema,
  loginSchema,
  recordOutcomeSchema,
  resetPasswordSchema,
  saveQuotationJobSchema,
  saveRatesSchema,
  sendQuotationSchema,
  updateCustomerSchema,
  updateMaterialSchema,
  updateQuotationSchema,
  updateSettingsSchema,
  updateUserSchema,
} from '@yuva/shared';

/**
 * The API, described from the schemas it actually validates with.
 *
 * Every request body and query string here is the same Zod schema the route
 * rejects malformed requests with — converted by Zod 4's own
 * `z.toJSONSchema`, not written out a second time by hand. Documentation that
 * is maintained separately from validation drifts, and the drift is invisible
 * until somebody builds against the wrong contract. This cannot: change a
 * schema and the page changes with it.
 *
 * What is still written by hand is the *surface* — which paths exist, what each
 * one is for, what it answers. Express does not expose that in a form worth
 * introspecting, and a route's purpose is not something a type can state.
 */

/** Zod 4 emits JSON Schema natively; OpenAPI 3.1 is a superset of it. */
function body(schema: z.ZodType, description = 'The request body.') {
  return {
    required: true,
    description,
    content: {
      'application/json': {
        schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
      },
    },
  };
}

/** Query strings arrive as text, so the input side of the schema is the truth. */
function query(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'query' as const,
    required: (json.required ?? []).includes(name),
    schema: property,
  }));
}

const ID_PARAM = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string', minLength: 1 },
  description: 'The record’s cuid.',
};

/*
 * The envelope every handler answers in. Documented once and referenced, so a
 * reader learns the shape here rather than inferring it from thirty examples.
 */
const ENVELOPE = {
  Success: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: { description: 'The payload. Its shape depends on the endpoint.' },
    },
    required: ['success', 'data'],
  },
  Paginated: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          items: { type: 'array', items: {} },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
              hasNextPage: { type: 'boolean' },
              hasPreviousPage: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [false] },
      error: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            enum: [
              'VALIDATION_ERROR',
              'UNAUTHENTICATED',
              'FORBIDDEN',
              'NOT_FOUND',
              'CONFLICT',
              'RATE_LIMITED',
              'SERVICE_UNAVAILABLE',
              'INTERNAL_ERROR',
            ],
          },
          message: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
        required: ['code', 'message'],
      },
    },
  },
} as const;

const json = (ref: string) => ({
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
});

/** Attached to everything that needs a session, which is everything but login. */
const AUTH_FAILURES = {
  401: { description: 'No session, or a token that has expired.', ...json('Error') },
  403: { description: 'Signed in, but without access to this module.', ...json('Error') },
};

const COMMON = {
  400: { description: 'The request was malformed.', ...json('Error') },
  404: { description: 'No such record.', ...json('Error') },
  ...AUTH_FAILURES,
};

const ok = (description: string) => ({ description, ...json('Success') });
const page = (description: string) => ({ description, ...json('Paginated') });

export function buildOpenApiDocument(serverUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Yuva Polyprint ERP API',
      version: '1.0.0',
      description: [
        'The API behind Yuva Polyprint & Packaging Industries’ production system —',
        'customers and their jobs, rates, and quotations with their costing.',
        '',
        '### Signing in',
        '',
        'Everything except `POST /api/auth/login` needs a session. Call login, take',
        '`data.accessToken` from the response, and press **Authorize** above to use it',
        'on every request from then on.',
        '',
        '### This is the live system',
        '',
        'There is no sandbox. Anything you create here is created for real, against a',
        'working business — read freely, and think before you POST.',
        '',
        '### Shapes',
        '',
        'Every response is wrapped: `{ success, data }` when it worked and',
        '`{ success: false, error: { code, message } }` when it did not. Request bodies',
        'below are generated from the same schemas the server validates with, so they',
        'are exact rather than illustrative.',
      ].join('\n'),
    },
    servers: [{ url: serverUrl, description: 'This server' }],
    tags: [
      { name: 'Auth', description: 'Signing in, and the session that follows.' },
      { name: 'Customers', description: 'Companies, and the designs each one has on record.' },
      { name: 'Jobs', description: 'One design at a time.' },
      { name: 'Quotations', description: 'Quoting, pricing, sending, and the outcome.' },
      { name: 'Materials', description: 'Films, inks and adhesives, and the day’s rates.' },
      {
        name: 'Cylinders',
        description:
          'The design register. A design is a job; this adds the engraved cylinders, each ' +
          'identifiable, so a set is not re-cut because nobody could find the old one. Status ' +
          'follows the events, like stock quantity follows movements.',
      },
      {
        name: 'Artwork',
        description:
          'The files a design prints from. The bytes never pass through this API: an upload is ' +
          'a signed URL the browser PUTs to Cloudflare R2 itself, and every read is a signed URL ' +
          'that expires in minutes. A revision supersedes rather than overwrites, because a ' +
          'cylinder was engraved from one particular version. A file can be erased outright, ' +
          'but its row never is.',
      },
      {
        name: 'Purchase',
        description:
          'Suppliers and orders. Receiving a delivery is where buying becomes holding: the ' +
          'accepted quantity opens a stock batch, and rejected material is recorded but never ' +
          'stocked.',
      },
      {
        name: 'Inventory',
        description:
          'What the works holds. A ledger: every change is a movement, and what is on hand ' +
          'is the sum of them. Movements are never edited or deleted — a mistake is corrected ' +
          'by an adjustment that says so.',
      },
      { name: 'GSTIN', description: 'Verifying a customer’s GST registration.' },
      { name: 'Settings', description: 'The rates and percentages costing depends on.' },
      { name: 'Users', description: 'Accounts and module access. Administrators only.' },
      { name: 'Monitor', description: 'Who signed in, and when. Administrators only.' },
      { name: 'Health', description: 'Liveness and readiness probes. No session needed.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'The `accessToken` returned by `POST /api/auth/login`.',
        },
      },
      schemas: ENVELOPE,
    },
    // Applied to every operation; login and the probes opt out with `security: []`.
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness',
          description: 'Answers as soon as the process is up. Does not touch the database.',
          security: [],
          responses: { 200: ok('The process is running.') },
        },
      },

      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in',
          description:
            'Returns a session token. Rate limited more tightly than the rest of the API.',
          security: [],
          requestBody: body(loginSchema),
          responses: {
            200: ok('Signed in. `data.accessToken` is what Authorize wants.'),
            401: { description: 'Wrong username or password.', ...json('Error') },
            429: { description: 'Too many attempts.', ...json('Error') },
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'The signed-in user',
          description: 'Who the token belongs to, and which modules they may reach.',
          responses: { 200: ok('The current user.'), ...AUTH_FAILURES },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Sign out',
          description: 'Revokes this session. The token stops working immediately.',
          responses: { 200: ok('Signed out.'), ...AUTH_FAILURES },
        },
      },
      '/api/auth/change-password': {
        post: {
          tags: ['Auth'],
          summary: 'Change your own password',
          requestBody: body(changePasswordSchema),
          responses: { 200: ok('Changed.'), ...COMMON },
        },
      },

      '/api/customers': {
        get: {
          tags: ['Customers'],
          summary: 'List customers',
          description:
            'Searches company name **and** brand, so an enquiry naming a brand finds the firm behind it.',
          parameters: query(listCustomersQuerySchema),
          responses: { 200: page('A page of customers.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Customers'],
          summary: 'Add a customer',
          description: 'Jobs may be created alongside them in the same request.',
          requestBody: body(createCustomerSchema),
          responses: {
            201: ok('Created, with their jobs.'),
            409: { description: 'A customer of that name already exists.', ...json('Error') },
            ...COMMON,
          },
        },
      },
      '/api/customers/{id}': {
        get: {
          tags: ['Customers'],
          summary: 'One customer, with every job they hold',
          parameters: [ID_PARAM],
          responses: { 200: ok('The customer and their jobs.'), ...COMMON },
        },
        patch: {
          tags: ['Customers'],
          summary: 'Update a customer',
          description:
            'Omitting `jobs` leaves their jobs alone; sending an empty array removes them all.',
          parameters: [ID_PARAM],
          requestBody: body(updateCustomerSchema),
          responses: { 200: ok('The updated customer.'), ...COMMON },
        },
        delete: {
          tags: ['Customers'],
          summary: 'Delete a customer',
          parameters: [ID_PARAM],
          responses: { 200: ok('Deleted.'), ...COMMON },
        },
      },
      '/api/customers/{id}/jobs': {
        post: {
          tags: ['Jobs'],
          summary: 'Record a design against this customer',
          description:
            'The owner comes from the path, never the body, so a job cannot be attached to the ' +
            'wrong customer. **Idempotent by job name** — saving the same design twice updates ' +
            'one row rather than making a second.',
          parameters: [ID_PARAM],
          requestBody: body(saveQuotationJobSchema),
          responses: { 200: ok('The job, created or updated.'), ...COMMON },
        },
      },
      '/api/jobs/{id}': {
        patch: {
          tags: ['Jobs'],
          summary: 'Update one design',
          parameters: [ID_PARAM],
          requestBody: body(saveQuotationJobSchema),
          responses: { 200: ok('The updated job.'), ...COMMON },
        },
      },

      '/api/cylinders': {
        get: {
          tags: ['Cylinders'],
          summary: 'Designs with a registered set',
          description:
            'A design **is** a job — the customer, product, colours and expected cylinder count ' +
            'already live there. Only jobs with cylinders registered appear: 382 record a count, ' +
            'and a count is not a set. Totals are over every cylinder, not over the rows shown, ' +
            'so a filter cannot move the damaged figure.',
          parameters: query(listCylindersQuerySchema),
          responses: { 200: ok('Designs and the totals.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Cylinders'],
          summary: 'Register a set against a design',
          description:
            'Each cylinder gets an ENGRAVED event as it is created, so its history starts where ' +
            'it actually started. A register whose earliest entry is "returned to store" cannot ' +
            'say where the cylinder came from.',
          requestBody: body(registerCylindersSchema),
          responses: { 201: ok('The design, with its set.'), ...COMMON },
        },
      },
      '/api/cylinders/unregistered': {
        get: {
          tags: ['Cylinders'],
          summary: 'Designs that need a set but have none',
          description: 'The register’s own worklist, largest sets first — those cost most to lose.',
          responses: { 200: ok('Designs awaiting registration.'), ...AUTH_FAILURES },
        },
      },
      '/api/cylinders/out': {
        get: {
          tags: ['Cylinders'],
          summary: 'Every cylinder off the shelf',
          description: 'Allocated or in use, whatever design it belongs to.',
          responses: { 200: ok('Cylinders out of the store.'), ...AUTH_FAILURES },
        },
      },
      '/api/cylinders/{id}/deletion': {
        get: {
          tags: ['Cylinders'],
          summary: 'What deleting this design would destroy',
          description:
            'Read before the confirmation is offered, so the office decides against counts ' +
            'rather than against "are you sure?". Says what goes (cylinders, their history, ' +
            'the files) and what stays (the customer, and any quotation, which carries its own ' +
            'copy of everything it was priced from). `canDelete` is false with a reason when ' +
            'material has been issued against the design.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The impact, counted.'), ...COMMON },
        },
      },
      '/api/cylinders/{id}': {
        get: {
          tags: ['Cylinders'],
          summary: 'One design: its cylinders and their history',
          description: 'The id is the **job** id, because a design is a job.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The design in full.'), ...COMMON },
        },
        delete: {
          tags: ['Cylinders'],
          summary: 'Delete a design, its cylinders and its files',
          description:
            '**The customer stays**, and so does every quotation the design was priced on — a ' +
            'quotation snapshots the name, the geometry and every rate it was costed against, ' +
            'so the document keeps saying what it said. Only the live link goes.\n\n' +
            'Refused, 409, when material has been issued against the design: a quotation holds ' +
            'its own copy, but a stock movement holds only the link, so "what were these 200 kg ' +
            'issued for" would have no answer.\n\nFiles are erased from R2 before the rows ' +
            'cascade away — an object missed at that point is one nothing will ever point at ' +
            'again. A failure there aborts the deletion, which is recoverable; the reverse is ' +
            'not.\n\nNeeds **both** the cylinders and the customers module: the screen belongs ' +
            'to one, the record being destroyed belongs to the other.',
          parameters: [ID_PARAM],
          responses: { 200: ok('What the deletion did.'), ...COMMON },
        },
        patch: {
          tags: ['Cylinders'],
          summary: 'Correct a cylinder’s details',
          description:
            'Neither its status nor its number can be changed here. Status follows the events — ' +
            'typing it separately is what lets a cylinder claim to be in store while the history ' +
            'says it went out. The number is painted on the cylinder.',
          parameters: [ID_PARAM],
          requestBody: body(updateCylinderSchema),
          responses: { 200: ok('The cylinder.'), ...COMMON },
        },
      },
      '/api/artwork/job/{jobId}': {
        get: {
          tags: ['Artwork'],
          summary: 'The files on one design',
          description:
            'The id is the **job** id, because a design is a job. Superseded and removed files ' +
            'are behind `includeArchived`. Thumbnail URLs come signed with this response rather ' +
            'than one request per file, and expire with it — refetch inside five minutes.',
          parameters: [
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'The job (design) id.',
            },
            ...query(listArtworkQuerySchema),
          ],
          responses: { 200: ok('The files, newest first.'), ...COMMON },
        },
      },
      '/api/artwork/uploads': {
        post: {
          tags: ['Artwork'],
          summary: 'Sign an upload',
          description:
            'Books a PENDING row and returns a presigned PUT. The browser sends the file to the ' +
            'returned URL with exactly the headers given — the signature covers Content-Type — ' +
            'then calls confirm. Naming `replacesId` makes this a revision of that file rather ' +
            'than a second one; nothing is superseded unless somebody says so, because a design ' +
            'legitimately carries a front and a back panel.',
          requestBody: body(requestArtworkUploadSchema),
          responses: { 201: ok('The row, the URL and its headers.'), ...COMMON },
        },
      },
      '/api/artwork/{id}/confirm': {
        post: {
          tags: ['Artwork'],
          summary: 'Confirm the file reached storage',
          description:
            'Asks R2 what actually arrived and stores the size **it** reports. A browser saying ' +
            'the PUT succeeded is not evidence. Calling this twice is not an error.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The file, now current.'), ...COMMON },
        },
      },
      '/api/artwork/{id}/link': {
        get: {
          tags: ['Artwork'],
          summary: 'A signed URL to view or download one file',
          description:
            'Minted per request and short-lived, so a link that ends up in a chat message stops ' +
            'working rather than standing as a public link to a customer’s unreleased packaging. ' +
            '`?download=1` saves the file; without it a PDF or image opens in a tab.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The URL and its life in seconds.'), ...COMMON },
        },
      },
      '/api/artwork/{id}': {
        patch: {
          tags: ['Artwork'],
          summary: 'Refile a document',
          description: 'Its kind and its note. The file itself never changes.',
          parameters: [ID_PARAM],
          requestBody: body(updateArtworkSchema),
          responses: { 200: ok('The file.'), ...COMMON },
        },
        delete: {
          tags: ['Artwork'],
          summary: 'Take a file off the design screen',
          description:
            'Marks it REMOVED and leaves the object in the bucket — removing is a filing ' +
            'decision, and the cylinders engraved from it are still on the shelf. Only an ' +
            'upload that never completed is deleted outright. To erase the file itself, see ' +
            '`DELETE /artwork/{id}/file`.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The file, removed.'), ...COMMON },
        },
      },
      '/api/artwork/{id}/file': {
        delete: {
          tags: ['Artwork'],
          summary: 'Erase the file for good',
          description:
            'The bytes go and the **row stays**, marked DELETED with who erased it and when. ' +
            'Those answer different questions: the bytes are what the engraver needs, and the ' +
            'row is what the office needs when it asks where the artwork went — "there were ' +
            'three files and now there are two" is not something anybody can act on.\n\n' +
            'The object is erased before the row records it. The other order could leave the ' +
            'register saying a customer’s artwork had been destroyed while it sat in the ' +
            'bucket.\n\nIts own path rather than a flag on the line above: a query parameter ' +
            'that turns "hide it" into "erase it" is one typo away from a file nobody can get ' +
            'back. Afterwards the file cannot be opened, restored or deleted again, and each ' +
            'refusal names who deleted it.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The record of the file that was erased.'), ...COMMON },
        },
      },
      '/api/artwork/{id}/restore': {
        post: {
          tags: ['Artwork'],
          summary: 'Put a removed file back',
          description:
            'Current again, unless something replaced it while it was off the screen — then it ' +
            'is history, because a design cannot have two current files claiming to be the same ' +
            'artwork.',
          parameters: [ID_PARAM],
          responses: { 200: ok('The file.'), ...COMMON },
        },
      },
      '/api/cylinders/events': {
        post: {
          tags: ['Cylinders'],
          summary: 'Record what happened to one or more cylinders',
          description:
            'A set moves together, so this takes a list — recording four separately means four ' +
            'requests for one job starting, and the fourth is the one that gets forgotten. The ' +
            'resulting status is derived from the kind, never sent. A retired cylinder refuses ' +
            'everything but re-engraving: it is not there to be mounted.',
          requestBody: body(recordCylinderEventSchema),
          responses: { 201: ok('The events recorded.'), ...COMMON },
        },
      },
      '/api/purchase/suppliers': {
        get: {
          tags: ['Purchase'],
          summary: 'Suppliers, with what the orders say about them',
          description:
            'What each supplies and what they last charged are derived from the orders placed ' +
            'with them, never stored — a second copy is a list nobody maintains.',
          parameters: query(listSuppliersQuerySchema),
          responses: { 200: ok('Suppliers.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Purchase'],
          summary: 'Add a supplier',
          requestBody: body(supplierSchema),
          responses: { 201: ok('The supplier.'), ...COMMON },
        },
      },
      '/api/purchase/suppliers/{id}': {
        patch: {
          tags: ['Purchase'],
          summary: 'Edit a supplier, or retire one',
          description: 'Retired rather than deleted — orders already placed still name them.',
          parameters: [ID_PARAM],
          requestBody: body(updateSupplierSchema),
          responses: { 200: ok('The supplier.'), ...COMMON },
        },
      },
      '/api/purchase/orders': {
        get: {
          tags: ['Purchase'],
          summary: 'Purchase orders, open first',
          description:
            'Ordered by status then number, so what still needs chasing is at the top. ' +
            '`isDelayed` is computed against today, never stored.',
          parameters: query(listPurchaseOrdersQuerySchema),
          responses: { 200: ok('Orders and the totals.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Purchase'],
          summary: 'Raise an order',
          description:
            'Several lines, each with its own unit — film is ordered by the tonne. That unit ' +
            'is the one deliveries are entered in.',
          requestBody: body(createPurchaseOrderSchema),
          responses: { 201: ok('The order.'), ...COMMON },
        },
      },
      '/api/purchase/orders/next-number': {
        get: {
          tags: ['Purchase'],
          summary: 'The number the next order will take',
          description: 'A peek, not a reservation — it is allocated on create.',
          responses: { 200: ok('`{ number }`.'), ...AUTH_FAILURES },
        },
      },
      '/api/purchase/orders/{id}': {
        get: {
          tags: ['Purchase'],
          summary: 'One order, its lines and its deliveries',
          parameters: [ID_PARAM],
          responses: { 200: ok('The order.'), ...COMMON },
        },
        patch: {
          tags: ['Purchase'],
          summary: 'Change the expected date, notes, or status',
          description:
            'Only ORDERED, IN_TRANSIT and CANCELLED may be set. Part-received and received are ' +
            'facts about what has arrived, and an order with deliveries against it refuses a ' +
            'status change — stock exists, and relabelling would not undo it.',
          parameters: [ID_PARAM],
          requestBody: body(updatePurchaseOrderSchema),
          responses: { 200: ok('The order.'), ...COMMON },
        },
      },
      '/api/purchase/receipts': {
        post: {
          tags: ['Purchase'],
          summary: 'Record a delivery against a line',
          description:
            '**The join to inventory.** The accepted quantity opens a stock batch through the ' +
            'same path a manual receipt takes — one way stock comes into existence, one ledger ' +
            'recording it. Rejected material is recorded and never reaches stock: faulty goods ' +
            'are not inventory. Needs the inventory module as well as purchase.',
          requestBody: body(receivePurchaseLineSchema),
          responses: { 201: ok('The order, restated from its receipts.'), ...COMMON },
        },
      },
      '/api/purchase/lines/close': {
        post: {
          tags: ['Purchase'],
          summary: 'Give up on the balance of a line',
          description:
            'A supplier who sends 380 of 400 and will not send the rest leaves a line that is ' +
            'neither open nor complete, and it would sit on the pending list forever.',
          requestBody: body(closePurchaseLineSchema),
          responses: { 200: ok('The order.'), ...COMMON },
        },
      },
      '/api/inventory': {
        get: {
          tags: ['Inventory'],
          summary: 'Stock, by material',
          description:
            'Every active material, including ones with no stock — a material missing from ' +
            'the list because it is empty is exactly the one that needs ordering. Totals are ' +
            'over everything the filters matched, not over one page.',
          parameters: query(listStockQuerySchema),
          responses: { 200: ok('Materials with their stock, and the totals.'), ...AUTH_FAILURES },
        },
      },
      '/api/inventory/reconcile': {
        get: {
          tags: ['Inventory'],
          summary: 'Prove the cached quantities agree with the ledger',
          description:
            'Administrators only. Recomputes every batch from its own movements and reports ' +
            'what does not match. Answers “the system says 2,450 and the shelf says 2,410” ' +
            'with something other than “trust it”.',
          responses: { 200: ok('`{ balanced, mismatches }`.'), ...AUTH_FAILURES },
        },
      },
      '/api/inventory/{id}': {
        get: {
          tags: ['Inventory'],
          summary: 'One material’s stock in full',
          description: 'Its batches, oldest first, and the last 200 movements, newest first.',
          parameters: [ID_PARAM],
          responses: { 200: ok('Summary, batches and history.'), ...COMMON },
        },
      },
      '/api/inventory/receive': {
        post: {
          tags: ['Inventory'],
          summary: 'Record a delivery',
          description:
            'The only action that opens a batch. The batch code must be new for this ' +
            'material — two deliveries sharing one would be indistinguishable on a count.',
          requestBody: body(receiveStockSchema),
          responses: { 201: ok('The batch that was opened.'), ...COMMON },
        },
      },
      '/api/inventory/issue': {
        post: {
          tags: ['Inventory'],
          summary: 'Issue material, or record waste',
          description:
            'Refused when the batch holds less than is being issued: negative stock is ' +
            'always wrong, and allowing it hides whichever earlier movement was mistaken. ' +
            'Waste is a separate kind because it answers a different question from ' +
            'consumption.',
          requestBody: body(issueStockSchema),
          responses: { 201: ok('The movement that was recorded.'), ...COMMON },
        },
      },
      '/api/inventory/adjust': {
        post: {
          tags: ['Inventory'],
          summary: 'Record a cycle count',
          description:
            'Takes what was counted, not the difference — the server works out the ' +
            'correction, which is the arithmetic a count exists to check. A count that ' +
            'agrees with the books is still recorded, as evidence the shelf was checked.',
          requestBody: body(adjustStockSchema),
          responses: { 201: ok('The correction that was recorded.'), ...COMMON },
        },
      },
      '/api/inventory/transfer': {
        post: {
          tags: ['Inventory'],
          summary: 'Move a batch to another location',
          description: 'Changes where stock is, never how much. Recorded with quantity zero.',
          requestBody: body(transferStockSchema),
          responses: { 201: ok('The movement that was recorded.'), ...COMMON },
        },
      },
      '/api/inventory/{id}/reorder-level': {
        patch: {
          tags: ['Inventory'],
          summary: 'Set the level below which stock reads as low',
          description:
            'Null clears it. Cleared is not the same as zero: a material with no level never ' +
            'raises an alarm, where a level of zero means “shout only when we have run out”.',
          parameters: [ID_PARAM],
          requestBody: body(setReorderLevelSchema),
          responses: { 200: ok('The material’s stock summary.'), ...COMMON },
        },
      },
      '/api/quotations': {
        get: {
          tags: ['Quotations'],
          summary: 'List quotations',
          description: 'Only the current version of each number.',
          parameters: query(listQuotationsQuerySchema),
          responses: { 200: page('A page of quotations.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Quotations'],
          summary: 'Create a quotation',
          description:
            'Priced on the server from the day’s rates — the totals in the response are ' +
            'authoritative. With `saveAsCustomer`, a new company and its designs are created ' +
            'in the same transaction.',
          requestBody: body(createQuotationSchema),
          responses: { 201: ok('The priced quotation.'), ...COMMON },
        },
      },
      '/api/quotations/next-number': {
        get: {
          tags: ['Quotations'],
          summary: 'The number the next quotation will take',
          description: 'A peek, not a reservation — it is allocated on create.',
          responses: { 200: ok('`{ number }`.'), ...AUTH_FAILURES },
        },
      },
      '/api/quotations/{id}': {
        get: {
          tags: ['Quotations'],
          summary: 'One quotation',
          parameters: [ID_PARAM],
          responses: { 200: ok('The quotation, priced.'), ...COMMON },
        },
        patch: {
          tags: ['Quotations'],
          summary: 'Update a quotation',
          description: 'Repriced on save. Omitting `items` reprices the stored lines.',
          parameters: [ID_PARAM],
          requestBody: body(updateQuotationSchema),
          responses: { 200: ok('The repriced quotation.'), ...COMMON },
        },
        delete: {
          tags: ['Quotations'],
          summary: 'Delete a quotation',
          description: 'Deleting the current version promotes the highest remaining one.',
          parameters: [ID_PARAM],
          responses: { 200: ok('Deleted.'), ...COMMON },
        },
      },
      '/api/quotations/{id}/pdf': {
        get: {
          tags: ['Quotations'],
          summary: 'The quotation as a PDF',
          description:
            'Rendered with Chromium, so it takes a few seconds. `?inline=1` serves it for ' +
            'display rather than download.',
          parameters: [
            ID_PARAM,
            {
              name: 'inline',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['1'] },
            },
          ],
          responses: {
            200: {
              description: 'The document.',
              content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
            },
            ...COMMON,
          },
        },
      },
      '/api/quotations/{id}/send': {
        post: {
          tags: ['Quotations'],
          summary: 'Email the quotation, with the PDF attached',
          description:
            'Costs money per message and renders a PDF first, so this is rate limited far ' +
            'more tightly than the rest of the API. A draft becomes Sent.',
          parameters: [ID_PARAM],
          requestBody: body(sendQuotationSchema),
          responses: {
            200: ok('Sent.'),
            429: { description: 'Too many messages this hour.', ...json('Error') },
            ...COMMON,
          },
        },
      },
      '/api/quotations/{id}/emails': {
        get: {
          tags: ['Quotations'],
          summary: 'Every recorded send for this quotation',
          parameters: [ID_PARAM],
          responses: { 200: ok('The send history.'), ...COMMON },
        },
      },
      '/api/quotations/{id}/versions': {
        get: {
          tags: ['Quotations'],
          summary: 'Every version of this number, newest first',
          parameters: [ID_PARAM],
          responses: { 200: ok('The versions.'), ...COMMON },
        },
        post: {
          tags: ['Quotations'],
          summary: 'Create a revision',
          description:
            'Same number, next version, starting as a draft. The version the customer already ' +
            'has stays exactly as they received it.',
          parameters: [ID_PARAM],
          responses: { 201: ok('The new version.'), ...COMMON },
        },
      },
      '/api/quotations/{id}/outcome': {
        post: {
          tags: ['Quotations'],
          summary: 'Record whether it was won or lost',
          description:
            'Winning creates the customer if they were new, and any design not already on ' +
            'record. Its own endpoint rather than a status change, because it has consequences.',
          parameters: [ID_PARAM],
          requestBody: body(recordOutcomeSchema),
          responses: { 200: ok('The outcome, and what it created.'), ...COMMON },
        },
      },

      '/api/materials': {
        get: {
          tags: ['Materials'],
          summary: 'Every material, with its current rate',
          description: 'Readable by anyone signed in — quotation costing depends on it.',
          responses: { 200: ok('The materials.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Materials'],
          summary: 'Add a material',
          requestBody: body(createMaterialSchema),
          responses: { 201: ok('Created.'), ...COMMON },
        },
      },
      '/api/materials/{id}': {
        patch: {
          tags: ['Materials'],
          summary: 'Update a material',
          parameters: [ID_PARAM],
          requestBody: body(updateMaterialSchema),
          responses: { 200: ok('Updated.'), ...COMMON },
        },
      },
      '/api/materials/{id}/history': {
        get: {
          tags: ['Materials'],
          summary: 'This material’s rate history',
          parameters: [ID_PARAM],
          responses: { 200: ok('Rates by date.'), ...COMMON },
        },
      },
      '/api/materials/rates': {
        put: {
          tags: ['Materials'],
          summary: 'Save the day’s rates',
          description:
            'The whole screen in one request. The office keys the morning’s rates in as a ' +
            'batch, and a partial save would leave the day half-recorded.',
          requestBody: body(saveRatesSchema),
          responses: { 200: ok('What was created, updated and left alone.'), ...COMMON },
        },
      },

      '/api/gstin/{gstin}': {
        get: {
          tags: ['GSTIN'],
          summary: 'Look a GSTIN up in the registry',
          description:
            'The check digit is verified first, so a GSTIN that cannot exist never costs a ' +
            'lookup. Answers are cached permanently — `?refresh=1` re-asks, which is for ' +
            '"is this registration still live" rather than ordinary use.',
          parameters: [
            {
              name: 'gstin',
              in: 'path',
              required: true,
              schema: { type: 'string', minLength: 15, maxLength: 15 },
              example: '27AIGPH5992Q1ZD',
            },
            {
              name: 'refresh',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['0', '1'], default: '0' },
            },
          ],
          responses: {
            200: ok('The registration, and whether it came from cache.'),
            503: { description: 'The registry is unreachable or out of credit.', ...json('Error') },
            ...COMMON,
          },
        },
      },

      '/api/settings': {
        get: {
          tags: ['Settings'],
          summary: 'The costing settings',
          description: 'Cylinder rate, GST, advance percentages, default ink and adhesive.',
          responses: { 200: ok('The settings.'), ...AUTH_FAILURES },
        },
        patch: {
          tags: ['Settings'],
          summary: 'Update the costing settings',
          requestBody: body(updateSettingsSchema),
          responses: { 200: ok('The updated settings.'), ...COMMON },
        },
      },

      '/api/users': {
        get: {
          tags: ['Users'],
          summary: 'List users',
          responses: { 200: ok('The users.'), ...AUTH_FAILURES },
        },
        post: {
          tags: ['Users'],
          summary: 'Create a user',
          requestBody: body(createUserSchema),
          responses: { 201: ok('Created.'), ...COMMON },
        },
      },
      '/api/users/{id}': {
        patch: {
          tags: ['Users'],
          summary: 'Update a user’s details or module access',
          parameters: [ID_PARAM],
          requestBody: body(updateUserSchema),
          responses: { 200: ok('Updated.'), ...COMMON },
        },
        delete: {
          tags: ['Users'],
          summary: 'Delete a user',
          parameters: [ID_PARAM],
          responses: { 200: ok('Deleted.'), ...COMMON },
        },
      },
      '/api/users/{id}/password': {
        post: {
          tags: ['Users'],
          summary: 'Reset another user’s password',
          parameters: [ID_PARAM],
          requestBody: body(resetPasswordSchema),
          responses: { 200: ok('Reset.'), ...COMMON },
        },
      },

      '/api/monitor': {
        get: {
          tags: ['Monitor'],
          summary: 'Sign-in history, in IST',
          responses: { 200: ok('Every recorded sign-in.'), ...AUTH_FAILURES },
        },
      },
    },
  };
}
