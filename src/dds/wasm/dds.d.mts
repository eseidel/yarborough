// Type surface of the Emscripten module built by native/dds/build.sh.

export interface DdsModule {
  ccall(
    name: "dds_version" | "dds_calc_table",
    returnType: "string",
    argumentTypes: string[],
    arguments_: unknown[],
  ): string;
  ccall(
    name: "dds_solve_after_lead",
    returnType: "number",
    argumentTypes: string[],
    arguments_: unknown[],
  ): number;
}

export default function createDdsModule(
  options?: Record<string, unknown>,
): Promise<DdsModule>;
