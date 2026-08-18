/// <reference types="svelte" />


declare module "rollup-plugin-css-only" {
  interface CssOnlyOptions {
    output?: string | ((styles: string) => void);
  }
  const cssOnly: (options?: CssOnlyOptions) => import("rollup").Plugin;
  export default cssOnly;
}
