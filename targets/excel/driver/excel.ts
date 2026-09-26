/**
 * Where Excel for the web keeps the controls the driver uses, and how long to wait for them.
 * Every value here was observed, not documented: see ../knowledge/observability.md. If Excel
 * changes, this is the file to update.
 */
export const EXCEL = {
  homeUrl: 'https://excel.cloud.microsoft/',
  /** Where a workbook lives once Excel has saved it to OneDrive, as `?docId=…`. */
  savedWorkbookPath: '/open/onedrive/',
  /** A helper frame the editor loads last; its arrival is the best sign the editor is ready. */
  clipboardFrameUrl: 'https://shared.officeapps.live.com/clipboard/',
  /** Observed 26 September 2026: the account reads `1/2` as 2 January, so month first. */
  environment: 'Excel for the web (en-US regional format)',
  selectors: {
    /** The workbook editor runs inside this iframe. */
    editorFrame: 'iframe[name^="WacFrame_Excel"]',
    /** Shows the active cell's address, and moves the selection when one is typed in. */
    nameBox: '#FormulaBar-NameBox-input',
    /** Shows and edits the active cell's raw content. */
    formulaBar: '#formulaBarTextDivId_textElement',
    /** Receives keystrokes aimed at the grid, and holds the text while a cell is edited. */
    grid: '#gridKeyboardContentEditable_textElement',
    /** Its aria-label is the screen-reader description of the active cell. */
    readout: '#m_excelWebRenderer_ewaCtl_readoutElement1',
  },
  signIn: {
    welcomeHeading: /^Welcome, /,
    emailBox: /email, phone/i,
    codeDigit: (position: number) => `Enter code digit ${position}`,
  },
  timeouts: {
    /** Creating a blank workbook and loading the editor. */
    openWorkbookMs: 60_000,
    /** A pause once the replacement editor has loaded, before the first entry. */
    editorRestartMs: 2_000,
    /** Any single action, such as the selection moving after Enter. */
    actionMs: 10_000,
    /** A pause after undo and redo, which give no signal when they finish. */
    settleMs: 600,
    /** How long typed text has to appear in the cell editor, and how many times to retype it. */
    typingMs: 2_000,
    typingTries: 2,
    /** How many times to try an entry that Excel didn't commit. */
    commitTries: 2,
  },
} as const;
