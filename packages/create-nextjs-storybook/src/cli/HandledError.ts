export class HandledError extends Error {
  public handled = true;

  constructor(messageOrError: string | Error) {
    super(typeof messageOrError === 'string' ? messageOrError : messageOrError.message);

    if (typeof messageOrError !== 'string') this.cause = messageOrError;
  }
}
