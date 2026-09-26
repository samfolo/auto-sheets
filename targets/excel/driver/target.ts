import type { BrowserContext } from 'playwright';
import type { SheetTarget } from '../../../src/sheet/index.ts';
import { EXCEL } from './excel.ts';
import { findOpenWorkbook, openWorkbook } from './workbook.ts';

/** Excel for the web, in the browser session's context, as a target for the sheet driver. */
export const excelTarget = (context: BrowserContext): SheetTarget => ({
  name: 'excel',
  environment: EXCEL.environment,
  open: (seed) => openWorkbook(context, seed),
  findOpen: () => findOpenWorkbook(context),
});
