/**
 * General-purpose decorators for the entire project
 */

import { Logger } from './logger';

/**
 * Catch and log errors from method execution
 * @param context - Context string to include in error message (e.g., class name)
 */
export function CatchErrors(context: string) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function wrappedCatchErrorsMethod(this: unknown, ...args: unknown[]): Promise<unknown> {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        Logger.error(`${context}.${propertyKey}: Operation failed`, error as Error);
      }
    };

    return descriptor;
  };
}
