import {
  DuplicateProviderError,
  type LLMProvider,
  type LLMProviderRegistry,
  type ProviderMetadata,
  ProviderNotFoundError,
} from "@agentforge/provider-sdk";
import type { RegisteredLLMProvider } from "./RegisteredLLMProvider.js";
import { snapshotProviderMetadata } from "./validateProviderMetadata.js";

export class LLMProviderRegistryImpl {
  private readonly providers: RegisteredLLMProvider[] = [];
  private readonly providersByName = new Map<string, RegisteredLLMProvider>();
  private defaultProviderName: string | undefined;
  private readonly view: LLMProviderRegistry;

  constructor() {
    this.view = Object.freeze({
      has: (name: string) => this.has(name),
      get: (name: string) => this.get(name),
      getMetadata: (name: string) => this.getMetadata(name),
      list: () => this.list(),
      getDefault: () => this.getDefault(),
      getDefaultMetadata: () => this.getDefaultMetadata(),
    });
  }

  register(provider: LLMProvider, isDefault: boolean): RegisteredLLMProvider {
    const metadata = snapshotProviderMetadata(provider);

    if (this.providersByName.has(metadata.name)) {
      throw new DuplicateProviderError(metadata.name);
    }

    const registeredProvider = { provider, metadata };
    this.providers.push(registeredProvider);
    this.providersByName.set(metadata.name, registeredProvider);

    if (isDefault) {
      this.defaultProviderName = metadata.name;
    }

    return registeredProvider;
  }

  setDefault(name: string): RegisteredLLMProvider {
    const registeredProvider = this.find(name);

    if (!registeredProvider) {
      throw new ProviderNotFoundError(name);
    }

    this.defaultProviderName = registeredProvider.metadata.name;
    return registeredProvider;
  }

  has(name: string): boolean {
    return typeof name === "string" && this.providersByName.has(name);
  }

  get(name: string): LLMProvider | undefined {
    return this.find(name)?.provider;
  }

  getMetadata(name: string): Readonly<ProviderMetadata> | undefined {
    return this.find(name)?.metadata;
  }

  list(): readonly Readonly<ProviderMetadata>[] {
    return Object.freeze(this.providers.map(({ metadata }) => metadata));
  }

  getDefault(): LLMProvider | undefined {
    return this.getDefaultRegistration()?.provider;
  }

  getDefaultMetadata(): Readonly<ProviderMetadata> | undefined {
    return this.getDefaultRegistration()?.metadata;
  }

  getView(): LLMProviderRegistry {
    return this.view;
  }

  private find(name: string): RegisteredLLMProvider | undefined {
    if (typeof name !== "string") {
      return undefined;
    }

    return this.providersByName.get(name);
  }

  private getDefaultRegistration(): RegisteredLLMProvider | undefined {
    return this.defaultProviderName === undefined
      ? undefined
      : this.providersByName.get(this.defaultProviderName);
  }
}
