export class UnimplementedProcessorError extends Error {
  constructor(queue: string) {
    super(`${queue} processor is not implemented`);
    this.name = 'UnimplementedProcessorError';
  }
}
