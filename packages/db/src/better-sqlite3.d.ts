/**
 * Deklarasi TypeScript minimal untuk better-sqlite3 — hanya API yang dipakai
 * @nusaquant/db (konstruktor, pragma, exec, prepare, transaction).
 * Disengaja lokal supaya tidak bergantung pada @types/* eksternal.
 */
declare module 'better-sqlite3' {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement<BindParams extends unknown[] | Record<string, unknown> = unknown[] | Record<string, unknown>> {
    run(...params: BindParams extends unknown[] ? BindParams : [BindParams]): RunResult;
    get(...params: BindParams extends unknown[] ? BindParams : [BindParams]): unknown;
    all(...params: BindParams extends unknown[] ? BindParams : [BindParams]): unknown[];
  }

  export interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (...args: unknown[]) => void;
  }

  export default class Database {
    constructor(path: string, options?: DatabaseOptions);
    pragma(source: string, options?: { simple?: boolean }): unknown;
    exec(source: string): this;
    prepare<BindParams extends unknown[] | Record<string, unknown> = unknown[] | Record<string, unknown>>(
      source: string,
    ): Statement<BindParams>;
    transaction<T extends unknown[], R>(fn: (...params: T) => R): (...params: T) => R;
    close(): void;
  }
}
