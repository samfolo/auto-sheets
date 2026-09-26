/**
 * The three controls beside the grid: the Name Box, the formula bar and the readout. They
 * only display what the server returned and report what a person types into them.
 */
import * as React from 'react';
import { useState, type JSX } from 'react';
import styles from './controls.module.css';

/** The Name Box shows the active cell's address and selects a cell or range on Enter. */
export const NameBox = ({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (address: string) => void;
}): JSX.Element => {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  return (
    <input
      id="name-box"
      aria-label="Name Box"
      className={styles.nameBox}
      value={focused ? draft : value}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSelect(draft.trim());
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') setDraft(value);
      }}
    />
  );
};

/** The formula bar shows the active cell's raw content. */
export const FormulaBar = ({ text }: { text: string }): JSX.Element => (
  <div id="formula-bar" className={styles.formulaBar}>
    {text}
  </div>
);

/** The readout is Excel's screen-reader description of the selection. */
export const Readout = ({ text }: { text: string }): JSX.Element => (
  <output id="readout" className={styles.readout} aria-label={text}>
    {text}
  </output>
);
