import type { Request, Response } from 'express';
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from '@yuva/shared';
import { created, ok, paginated, xlsx } from '../../utils/api-response.js';
import {
  buildReport,
  describe as describeFilters,
  EXPORT_LIMIT,
  reportFilename,
} from '../../lib/report-workbook.js';
import * as customerService from './customer.service.js';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as ListCustomersQuery;
  const { items, total } = await customerService.listCustomers(query);
  paginated(res, items, query.page, query.pageSize, total);
}

export async function getById(req: Request, res: Response) {
  const customer = await customerService.getCustomerById(req.params.id as string);
  ok(res, customer);
}

export async function create(req: Request, res: Response) {
  const customer = await customerService.createCustomer(req.body as CreateCustomerInput);
  created(res, customer);
}

export async function update(req: Request, res: Response) {
  const customer = await customerService.updateCustomer(
    req.params.id as string,
    req.body as UpdateCustomerInput,
  );
  ok(res, customer);
}

export async function remove(req: Request, res: Response) {
  const result = await customerService.deleteCustomer(req.params.id as string);
  ok(res, result);
}

/** The customer book, with the gaps visible. */
export async function exportList(req: Request, res: Response) {
  const query = req.query as unknown as ListCustomersQuery;
  const { items } = await customerService.listCustomers({
    ...query,
    page: 1,
    pageSize: EXPORT_LIMIT,
  });

  /* 'NA' is how the import wrote "the sheet did not say". It is not a value,
     and a column of it in a spreadsheet reads as one. */
  const said = (value: string) => (value && value.trim().toUpperCase() !== 'NA' ? value : null);

  const file = await buildReport({
    title: 'Customers',
    filters: describeFilters(req.query as Record<string, unknown>),
    rows: items,
    columns: [
      { header: 'Company', width: 36, value: (c) => c.companyName },
      { header: 'Contact', width: 22, value: (c) => said(c.contactPerson) },
      { header: 'Mobile', width: 14, value: (c) => said(c.mobile) },
      { header: 'Alt phone', width: 18, value: (c) => said(c.altPhone) },
      { header: 'Email', width: 26, value: (c) => said(c.email) },
      { header: 'GSTIN', width: 18, value: (c) => said(c.gstNumber) },
      { header: 'Address', width: 42, value: (c) => said(c.address) },
      { header: 'City', width: 16, value: (c) => said(c.city) },
      { header: 'District', width: 16, value: (c) => said(c.district) },
      { header: 'Pincode', width: 10, value: (c) => said(c.pincode) },
      { header: 'Jobs', width: 8, format: 'int', value: (c) => c.jobCount },
      { header: 'Confirmed', width: 11, value: (c) => (c.isVerified ? 'Yes' : 'No') },
      {
        header: 'Where the name came from',
        width: 26,
        value: (c) => (c.source === 'BRAND_INFERRED' ? 'Taken from a job name' : 'The old sheet'),
      },
    ],
  });
  res.setHeader('Cache-Control', 'no-store');
  xlsx(res, file, reportFilename('Customers'));
}
