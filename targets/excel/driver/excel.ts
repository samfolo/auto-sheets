/**
 * Where Excel for the web keeps what the driver uses, and how long to wait for it. Every value
 * here was observed, not documented: see ../knowledge/observability.md. If Excel changes, this
 * is the file to update.
 */
import type { SheetSelectors, SheetTiming } from '../../../src/sheet/surface.ts';

export const EXCEL = {
  homeUrl: 'https://excel.cloud.microsoft/',
  /** Observed 26 September 2026: the account reads `1/2` as 2 January, so month first. */
  environment: 'Excel for the web (en-US regional format)',
  /** Where a workbook lives once Excel has saved it to OneDrive, as `?docId=…`. */
  savedWorkbookPath: '/open/onedrive/',
  /** A helper frame the editor loads last; its arrival is the best sign the editor is ready. */
  clipboardFrameUrl: 'https://shared.officeapps.live.com/clipboard/',
  /** The workbook editor runs inside this iframe. */
  editorFrame: 'iframe[name^="WacFrame_Excel"]',
  /** The four controls the sheet driver uses, inside the editor iframe. */
  sheet: {
    nameBox: '#FormulaBar-NameBox-input',
    formulaBar: '#formulaBarTextDivId_textElement',
    cellEditor: '#gridKeyboardContentEditable_textElement',
    readout: '#m_excelWebRenderer_ewaCtl_readoutElement1',
  } satisfies SheetSelectors,
  /** Buttons on the Excel home page, by accessible name. */
  home: {
    createBlank: 'Create blank workbook',
    upload: 'Upload a file',
  },
  signIn: {
    welcomeHeading: /^Welcome, /,
    emailBox: /email, phone/i,
    codeDigit: (position: number) => `Enter code digit ${position}`,
  },
  timing: {
    actionMs: 10_000,
    pollMs: 100,
    settleMs: 600,
    keystrokeMs: 30,
    selectTries: 2,
    typingTries: 2,
    commitTries: 2,
  } satisfies SheetTiming,
  timeouts: {
    /** Creating or uploading a workbook and loading the editor. */
    openWorkbookMs: 60_000,
    /** Waiting for the clipboard frame, after which the editor is taken to be ready anyway. */
    clipboardFrameMs: 15_000,
    /** A pause once the editor has loaded, before the first entry. */
    editorRestartMs: 2_000,
  },
} as const;
