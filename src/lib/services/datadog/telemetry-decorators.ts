/**
 * Datadog-specific telemetry decorators
 */

interface HasTransport {
  transport: { isEnabled(): boolean };
}

/**
 * Skip method execution if telemetry is disabled
 * Expects the class to have a transport.isEnabled() method
 */
export function RequiresTelemetry() {
  return function <T extends HasTransport>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function wrappedRequiresTelemetryMethod(
      this: HasTransport,
      ...args: unknown[]
    ): Promise<unknown> {
      if (!this.transport?.isEnabled()) {
        return;
      }
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
