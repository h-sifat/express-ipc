interface SplitDataIntoChunks_Output {
  chunks: string[];
  residue: string;
}
interface SplitDataIntoChunks_Argument {
  data: string;
  delimiter: string;
}

export type SplitDataIntoChunks = (
  arg: SplitDataIntoChunks_Argument
) => SplitDataIntoChunks_Output;

export type FlattenAndValidateChannelArgs = (
  arg: (string | string[])[]
) => string[];
