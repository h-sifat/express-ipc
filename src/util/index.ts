export class EPP extends Error {
  code: string;

  constructor(arg: { code: string; message: string }) {
    const { code, message } = arg;
    super(message);

    this.code = code;
  }
}
