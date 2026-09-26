/**
 * The screen: the Name Box, formula bar and readout over the grid. All behaviour comes from
 * the controller in `use-sheet`, which talks to the server's API.
 */
import * as React from 'react';
import type { JSX } from 'react';
import { CellEditor } from './cell-editor';
import { FormulaBar, NameBox, Readout } from './controls';
import { Grid } from './grid';
import { useSheet } from './use-sheet';
import styles from './app.module.css';

/** The application shell. */
export const App = (): JSX.Element => {
  const sheet = useSheet();
  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <NameBox value={sheet.nameBox} onSelect={sheet.select} />
        <FormulaBar text={sheet.formulaBar} />
      </div>
      <Readout text={sheet.readout} />
      <Grid
        state={sheet.state}
        call={sheet.run}
        onEditStart={sheet.onEditStart}
        onGesture={sheet.onGesture}
      />
      <CellEditor
        editing={sheet.editing}
        text={sheet.editorText}
        inputRef={sheet.editorRef}
        onKeyDown={sheet.onKeyDown}
        onInput={sheet.onInput}
      />
    </div>
  );
};
