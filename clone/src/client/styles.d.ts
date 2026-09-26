/** Style-module declarations so TypeScript accepts the CSS imports. */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css';
